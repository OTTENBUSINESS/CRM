// Known Whisper hallucinations when audio is silent/empty/corrupted
const WHISPER_HALLUCINATIONS = [
  'inscreva-se no canal',
  'obrigado por assistir',
  'legendas pela comunidade',
  'se inscreva no canal',
  'curta e compartilhe',
  'like and subscribe',
  'subscribe to the channel',
  'thanks for watching',
  'não se esqueça de se inscrever',
  'ative o sininho',
  'veja como aumentar',
  'ganhar bumbum',
  'clique no link',
  'link na descrição',
  'subtítulos',
  'amara.org',
];

export function isWhisperHallucination(text: string): boolean {
  if (!text || text.trim().length === 0) return true;
  const lower = text.toLowerCase().trim();
  // Too short to be real speech (< 3 chars)
  if (lower.length < 3) return true;
  // Check against known hallucination patterns
  return WHISPER_HALLUCINATIONS.some(h => lower.includes(h));
}

export interface MediaData {
  url: string;
  mimetype: string;
  fileSHA256: string;
  fileLength: number;
  mediaKey: string;
  fileEncSHA256: string;
}

export function getExtensionFromMimetype(mimetype: string): string {
  const map: Record<string, string> = {
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
  };
  return map[mimetype] || mimetype.split('/').pop()?.replace('x-', '') || 'bin';
}

// Usa o endpoint /message/download da UAZAPI passando return_link=true.
// A UAZAPI baixa, descriptografa e retorna URL publica direto. Mais simples,
// sem precisar Storage Supabase. Retencao de 2 dias na UAZAPI; se expirar, basta
// chamar de novo o endpoint que ela rebaixa do CDN da Meta.
export async function downloadAndSaveMedia(
  _supabase: any,
  mediaData: MediaData,
  messageId: string,
  _messageType: string,
  instanceApiKey?: string,
  instanceWebhookUrl?: string,
  _originalFileName?: string
): Promise<{ publicUrl: string | null }> {
  try {
    if (!instanceApiKey || !instanceWebhookUrl) {
      console.warn('[Media] Sem instanceApiKey/instanceWebhookUrl, fallback URL direta');
      return { publicUrl: mediaData.url || null };
    }

    const uazapiResponse = await fetch(`${instanceWebhookUrl}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'token': instanceApiKey },
      body: JSON.stringify({ id: messageId, return_link: true, return_base64: false }),
    });

    if (!uazapiResponse.ok) {
      const errorText = await uazapiResponse.text();
      console.error('[Media] UAZAPI /message/download falhou:', uazapiResponse.status, errorText);
      return { publicUrl: null };
    }

    const data = await uazapiResponse.json();
    const fileURL = data.fileURL || data.FileURL || null;
    console.log('[Media] UAZAPI retornou fileURL:', fileURL);
    return { publicUrl: fileURL };
  } catch (error) {
    console.error('[Media] Download/save error:', error);
    return { publicUrl: null };
  }
}

// Descreve imagem via Gemini Vision (gratis ate certo limite/dia).
// Recebe URL publica da imagem. Retorna descricao curta em pt-BR.
export async function describeImageViaGemini(
  imageUrl: string,
  mimetype: string,
  geminiApiKey: string,
  caption?: string,
): Promise<string | null> {
  try {
    // Baixar imagem e converter pra base64
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) {
      console.error('[Vision Gemini] Falha ao baixar imagem:', imgRes.status);
      return null;
    }
    const buf = await imgRes.arrayBuffer();
    const u8 = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    const base64 = btoa(bin);

    const promptText = caption
      ? `Descreva o que esta nesta imagem em portugues brasileiro (max 2 linhas). O usuario tambem escreveu como caption: "${caption}". Retorne apenas a descricao, sem prefixos.`
      : `Descreva o que esta nesta imagem em portugues brasileiro (max 2 linhas). Retorne apenas a descricao, sem prefixos.`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: promptText },
          { inline_data: { mime_type: mimetype || 'image/jpeg', data: base64 } },
        ]}],
        generationConfig: { temperature: 0.2, maxOutputTokens: 256 },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('[Vision Gemini] Error:', response.status, err.slice(0, 200));
      return null;
    }
    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    return text?.trim() || null;
  } catch (err) {
    console.error('[Vision Gemini] Exception:', err);
    return null;
  }
}

// Transcreve audio via Gemini multimodal (gratuito ate certo limite/dia).
// Recebe base64 e mimetype. Retorna texto ou null.
export async function transcribeAudioViaGemini(
  base64: string,
  mimetype: string,
  geminiApiKey: string,
): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: 'Transcreva este audio para texto em portugues brasileiro. Retorne SOMENTE a transcricao, sem comentarios, sem aspas, sem prefixos.' },
            { inline_data: { mime_type: mimetype || 'audio/mpeg', data: base64 } },
          ],
        }],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.error('[Transcription Gemini] Error:', response.status, err.slice(0, 200));
      return null;
    }
    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || null;
    if (text && isWhisperHallucination(text)) {
      console.log('[Transcription Gemini] Descartada (alucinacao):', text);
      return null;
    }
    return text?.trim() || null;
  } catch (err) {
    console.error('[Transcription Gemini] Exception:', err);
    return null;
  }
}

export async function downloadAndDecryptAudio(
  _supabase: any,
  mediaData: MediaData,
  messageId: string,
  instanceApiKey?: string,
  instanceWebhookUrl?: string,
  openaiApiKey?: string | null,
  geminiApiKey?: string | null,
): Promise<{ publicUrl: string | null; base64: string | null; transcription: string | null }> {
  try {
    if (!instanceApiKey || !instanceWebhookUrl) {
      console.warn('[Media] Audio sem instanceApiKey/Url, sem transcricao');
      return { publicUrl: mediaData.url || null, base64: null, transcription: null };
    }

    // 1) Baixar audio via UAZAPI: pede fileURL + base64 + (se tiver OpenAI) transcricao automatica
    const downloadBody: Record<string, any> = {
      id: messageId,
      return_link: true,
      return_base64: !!geminiApiKey, // soh precisa do base64 se vamos transcrever via Gemini local
      generate_mp3: true,
      transcribe: !!openaiApiKey,    // UAZAPI usa Whisper internamente se tiver chave
    };
    if (openaiApiKey) downloadBody.openai_apikey = openaiApiKey;

    const uazapiResponse = await fetch(`${instanceWebhookUrl}/message/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'token': instanceApiKey },
      body: JSON.stringify(downloadBody),
    });

    if (!uazapiResponse.ok) {
      const errorText = await uazapiResponse.text();
      console.error('[Media] UAZAPI audio download falhou:', uazapiResponse.status, errorText);
      return { publicUrl: mediaData.url || null, base64: null, transcription: null };
    }

    const data = await uazapiResponse.json();
    const fileURL = data.fileURL || data.FileURL || mediaData.url || null;
    const base64 = data.base64Data || null;
    const mimetype = data.mimetype || 'audio/mpeg';
    let transcription: string | null = null;

    // 2) Transcricao: UAZAPI ja transcreveu via Whisper (se OpenAI configurada)
    if (data.transcription && !isWhisperHallucination(data.transcription)) {
      transcription = data.transcription.trim();
      console.log('[Media] Transcricao via UAZAPI/Whisper:', transcription!.substring(0, 60));
    }

    // 3) Fallback: se nao tem transcricao e tem chave Gemini + base64, usa Gemini
    if (!transcription && geminiApiKey && base64) {
      console.log('[Media] Fallback: transcrevendo via Gemini...');
      transcription = await transcribeAudioViaGemini(base64, mimetype, geminiApiKey);
      if (transcription) console.log('[Media] Transcricao via Gemini:', transcription.substring(0, 60));
    }

    return { publicUrl: fileURL, base64, transcription };
  } catch (error) {
    console.error('[Media] Audio download error:', error);
    return { publicUrl: mediaData.url || null, base64: null, transcription: null };
  }
}

export async function transcribeAudioFromBase64(
  base64: string,
  openaiApiKey: string
): Promise<string | null> {
  try {
    // Convert base64 to blob
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'audio/ogg' });

    // Create form data
    const formData = new FormData();
    formData.append('file', blob, 'audio.ogg');
    formData.append('model', 'whisper-1');
    formData.append('language', 'pt');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      console.error('[Transcription] OpenAI error:', response.status);
      return null;
    }

    const data = await response.json();
    const text = data.text || null;
    if (text && isWhisperHallucination(text)) {
      console.log('[Transcription] Descartada (alucinação Whisper):', text);
      return null;
    }
    return text;
  } catch (error) {
    console.error('[Transcription] Error:', error);
    return null;
  }
}
