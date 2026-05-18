import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey, requireIntegrationKey } from "../_shared/config.ts";

/**
 * WhatsApp Cloud API — Envio de mensagens
 *
 * Suporta 2 modos:
 * 1. Template (primeiro contato) — action: "send_template"
 * 2. Texto livre (session, após lead responder) — action: "send_text"
 *
 * Uso pelo ai-sales-agent:
 * - Step 0 (primeiro contato): send_template
 * - Conversação normal: send_text
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// Config lida do banco (tabela `config`, via UI /configuracoes > Integrações).
// NUNCA hardcode valores — use getIntegrationKey.
interface CloudApiCfg {
  token: string;
  phoneNumberId: string;
  geminiKey: string | null;
  graphUrl: string;
}

async function loadCfg(supabase: any): Promise<CloudApiCfg> {
  const token = await requireIntegrationKey(supabase, "WHATSAPP_CLOUD_TOKEN");
  const phoneNumberId = await requireIntegrationKey(supabase, "WHATSAPP_PHONE_NUMBER_ID");
  const geminiKey = await getIntegrationKey(supabase, "GEMINI_API_KEY");
  return {
    token,
    phoneNumberId,
    geminiKey,
    graphUrl: `https://graph.facebook.com/v22.0/${phoneNumberId}/messages`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const cfg = await loadCfg(supabase);
    const body = await req.json();
    const { action, phone, lead_id, sent_by, sent_by_name } = body;

    if (!phone) {
      return jsonRes({ error: "phone required" }, 400);
    }

    // Normalizar telefone
    const cleanPhone = phone.replace(/\D/g, "");
    const formattedPhone = cleanPhone.startsWith("55") ? cleanPhone : `55${cleanPhone}`;

    // Buscar instância oficial
    const instanceId = await getOfficialInstanceId(supabase);

    let result;

    switch (action) {
      case "send_template":
        result = await sendTemplate(body, formattedPhone, cfg, supabase);
        break;

      case "send_text":
        result = await sendText(body, formattedPhone, cfg);
        break;

      case "send_image":
        result = await sendMedia(body, formattedPhone, "image", cfg);
        break;

      case "send_document":
        result = await sendMedia(body, formattedPhone, "document", cfg);
        break;

      case "send_audio":
        result = await sendMedia(body, formattedPhone, "audio", cfg);
        break;

      case "send_video":
        result = await sendMedia(body, formattedPhone, "video", cfg);
        break;

      default:
        // Default: se tem template_name → template, senão → text
        if (body.template_name) {
          result = await sendTemplate(body, formattedPhone, cfg, supabase);
        } else if (body.text || body.message) {
          result = await sendText(body, formattedPhone, cfg);
        } else {
          return jsonRes({ error: "action required (send_template, send_text)" }, 400);
        }
    }

    if (!result.ok) {
      console.error("[Cloud API] Error:", JSON.stringify(result.data));
      return jsonRes({ error: result.data.error?.message || "Failed to send", details: result.data }, 500);
    }

    const messageId = result.data.messages?.[0]?.id;
    console.log(`[Cloud API] Sent! Message ID: ${messageId}`);

    // Salvar mensagem no banco
    if (lead_id && instanceId) {
      await supabase.from("whatsapp_messages").insert({
        instance_id: instanceId,
        remote_jid: `${formattedPhone}@s.whatsapp.net`,
        message_id: messageId || `cloud_${Date.now()}`,
        message_type: result.messageType || "Conversation",
        content: result.content,
        media_url: result.extraMeta?.media_url || null,
        is_from_me: true,
        sent_at: new Date().toISOString(),
        lead_id,
        metadata: { sent_by: sent_by || "ai_agent", sent_by_name: sent_by_name || null, cloud_api: true, ...(result.extraMeta || {}) },
      });
    }

    return jsonRes({ success: true, message_id: messageId });
  } catch (err: any) {
    console.error("[Cloud API] Error:", err.message);
    return jsonRes({ error: err.message }, 500);
  }
});

// ==================== SMART NAME NORMALIZATION ====================

async function smartNormalizeName(name: string, cfg: CloudApiCfg, leadId?: string): Promise<string> {
  if (!name || name.trim().length < 2) return '';
  if (!cfg.geminiKey) return name.split(' ')[0]; // Sem API key, pega primeiro trecho

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${cfg.geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Extraia o primeiro nome REAL de uma pessoa a partir deste texto: "${name}".
Regras:
- Se parece um username de rede social (ex: "eliasrafaelrocha"), separe as palavras e retorne só o primeiro nome capitalizado (ex: "Elias")
- Se é um número de telefone ou texto sem nome, retorne exatamente: INVALIDO
- Se tem nome e sobrenome grudado (ex: "joaosilva"), separe e retorne só o primeiro nome capitalizado (ex: "João")
- Se contém "|" ou bio de rede social (ex: "Frank Costa | IA para Negócios"), extraia só o primeiro nome (ex: "Frank")
- Se o texto é um placeholder genérico como "Visitante", "Usuário", "Lead", "Cliente", "Teste", "Test", "Admin", retorne: INVALIDO
- Retorne APENAS o primeiro nome, nada mais. Sem explicação.` }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 20 },
        }),
      }
    );
    const data = await res.json();
    const result = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';

    // Rejeitar variações de INVALIDO (com/sem acento, maiúsculo/minúsculo)
    const resultUpper = result.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (resultUpper === 'INVALIDO' || result.length < 2 || result.length > 30) return '';

    const cleanName = result.replace(/[^a-zA-ZÀ-ÿ\s]/g, '').trim();
    if (!cleanName || cleanName.length < 2) return '';

    // Rejeitar placeholders que passaram pelo Gemini
    const blacklist = ['invalido', 'visitante', 'teste', 'test', 'admin', 'usuario', 'lead', 'cliente', 'unknown', 'undefined', 'null'];
    if (blacklist.includes(cleanName.toLowerCase())) return '';

    console.log(`[Cloud API] Name normalized: "${name}" → "${cleanName}"`);

    // Atualizar o lead no banco com o nome limpo (se tiver leadId)
    if (leadId && cleanName) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase.from('leads').update({ name: cleanName }).eq('id', leadId);
      console.log(`[Cloud API] Lead ${leadId} name updated to "${cleanName}"`);
    }

    return cleanName;
  } catch (err: any) {
    console.error("[Cloud API] Name normalization error:", err.message);
    return '';
  }
}

// ==================== SEND TEMPLATE ====================

async function sendTemplate(body: any, phone: string, cfg: CloudApiCfg, supabase?: any) {
  const { template_name, template_params, lead_id } = body;
  const templateName = template_name || "primeiro_contato_qualificacao";

  // Sempre normalizar nome via IA — extrai primeiro nome real de qualquer input
  if (template_params && template_params.length > 0) {
    const normalized = await smartNormalizeName(template_params[0], cfg, lead_id);
    template_params[0] = normalized || 'tudo bem';
    console.log(`[Cloud API] Template param[0]: "${template_params[0]}"`);
  }

  const payload: any = {
    messaging_product: "whatsapp",
    to: phone,
    type: "template",
    template: {
      name: templateName,
      language: { code: "pt_BR" },
    },
  };

  if (template_params && template_params.length > 0) {
    payload.template.components = [{
      type: "body",
      parameters: template_params.map((p: string) => ({ type: "text", text: p })),
    }];
  }

  const response = await callCloudAPI(payload, cfg);
  const content = supabase ? await buildTemplateText(supabase, templateName, template_params) : `[Template: ${templateName}]`;

  return {
    ok: response.ok,
    data: response.data,
    content,
    messageType: "template",
    extraMeta: { template_name: templateName },
  };
}

// ==================== SEND TEXT ====================

async function sendText(body: any, phone: string, cfg: CloudApiCfg) {
  const text = body.text || body.message;
  if (!text) throw new Error("text/message required");

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "text",
    text: { body: text },
  };

  const response = await callCloudAPI(payload, cfg);

  return {
    ok: response.ok,
    data: response.data,
    content: text,
    messageType: "Conversation",
  };
}

// ==================== SEND MEDIA ====================

async function sendMedia(body: any, phone: string, type: "image" | "document" | "audio" | "video", cfg: CloudApiCfg) {
  const { media_url, caption, filename } = body;
  if (!media_url) throw new Error("media_url required");

  // Áudio: upload via Media API pra garantir formato nativo WhatsApp
  if (type === "audio") {
    return await sendAudioViaUpload(media_url, phone, cfg, caption);
  }

  const mediaObj: any = { link: media_url };
  if (caption) mediaObj.caption = caption;
  if (filename && type === "document") mediaObj.filename = filename;

  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type,
    [type]: mediaObj,
  };

  const response = await callCloudAPI(payload, cfg);

  return {
    ok: response.ok,
    data: response.data,
    content: caption || `[${type === "image" ? "Imagem" : "Documento"}]`,
    messageType: type,
    extraMeta: { media_url },
  };
}

// ==================== SEND AUDIO VIA MEDIA UPLOAD ====================

async function sendAudioViaUpload(audioUrl: string, phone: string, cfg: CloudApiCfg, caption?: string) {
  // 1. Baixar o áudio do Storage
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) throw new Error("Falha ao baixar áudio do storage");
  const audioBuffer = await audioRes.arrayBuffer();
  const contentType = audioRes.headers.get("content-type") || "audio/ogg";

  // 2. Upload via Media API (multipart/form-data manual)
  const boundary = `----FormBoundary${Date.now()}`;
  const mimeType = contentType.includes("ogg") ? "audio/ogg; codecs=opus" : contentType;
  const filename = contentType.includes("ogg") ? "audio.ogg" : "audio.webm";

  // Construir body multipart manualmente (Deno edge runtime não suporta FormData com Blob)
  const header = [
    `--${boundary}`,
    `Content-Disposition: form-data; name="messaging_product"\r\n`,
    `whatsapp`,
    `--${boundary}`,
    `Content-Disposition: form-data; name="type"\r\n`,
    mimeType,
    `--${boundary}`,
    `Content-Disposition: form-data; name="file"; filename="${filename}"`,
    `Content-Type: ${mimeType}\r\n`,
  ].join("\r\n");

  const footer = `\r\n--${boundary}--\r\n`;
  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);
  const body = new Uint8Array(headerBytes.length + audioBuffer.byteLength + footerBytes.length);
  body.set(headerBytes, 0);
  body.set(new Uint8Array(audioBuffer), headerBytes.length);
  body.set(footerBytes, headerBytes.length + audioBuffer.byteLength);

  const uploadUrl = `https://graph.facebook.com/v22.0/${cfg.phoneNumberId}/media`;
  const uploadRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  const uploadData = await uploadRes.json();
  if (!uploadRes.ok || !uploadData.id) {
    console.error("[Cloud API] Media upload failed:", JSON.stringify(uploadData));
    // Fallback: tentar via link direto
    console.log("[Cloud API] Trying link fallback...");
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "audio",
      audio: { link: audioUrl },
    };
    const response = await callCloudAPI(payload, cfg);
    return {
      ok: response.ok,
      data: response.data,
      content: caption || "[Áudio]",
      messageType: "audio",
      extraMeta: { media_url: audioUrl },
    };
  }

  const mediaId = uploadData.id;
  console.log(`[Cloud API] Audio uploaded, media_id: ${mediaId}`);

  // 3. Enviar mensagem de áudio com media_id
  const payload = {
    messaging_product: "whatsapp",
    to: phone,
    type: "audio",
    audio: { id: mediaId },
  };

  const response = await callCloudAPI(payload, cfg);

  return {
    ok: response.ok,
    data: response.data,
    content: caption || "[Áudio]",
    messageType: "audio",
    extraMeta: { media_url: audioUrl, media_id: mediaId },
  };
}

// ==================== CALL CLOUD API ====================

async function callCloudAPI(payload: any, cfg: CloudApiCfg): Promise<{ ok: boolean; data: any }> {
  const response = await fetch(cfg.graphUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  return { ok: response.ok, data };
}

// ==================== HELPERS ====================

async function getOfficialInstanceId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id")
    .eq("name", "IAP - OFICIAL")
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}

async function buildTemplateText(supabase: any, templateName: string, params?: string[]): Promise<string> {
  // Buscar texto da tabela (fonte única de verdade)
  const { data: tpl } = await supabase
    .from('whatsapp_templates')
    .select('body_text')
    .eq('name', templateName)
    .maybeSingle();

  let text = tpl?.body_text || `[Template: ${templateName}]`;
  if (params) {
    params.forEach((p, i) => {
      text = text.replace(`{{${i + 1}}}`, p);
    });
  }
  return text;
}

function jsonRes(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
