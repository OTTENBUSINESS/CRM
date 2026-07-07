import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Detecta se um JID/número é provavelmente um LID (Linked Device ID) do WhatsApp
// LIDs são IDs internos que NÃO são telefones reais — podem aparecer com @s.whatsapp.net
function isLikelyLidNumber(jid: string | null | undefined): boolean {
  if (!jid) return false;
  if (jid.includes('@lid')) return true;
  const digits = jid.replace(/@.*/, '').replace(/\D/g, '');
  if (!digits || digits.length < 8) return false;
  // Números BR válidos: 55 + DDD(2) + num(8-9) = 12-13 dígitos
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) return false;
  // Local sem DDI: DDD(2) + num(8-9) = 10-11 dígitos
  if (digits.length >= 10 && digits.length <= 11) return false;
  // Internacionais comuns (US, PT, UK, etc) com 8-13 dígitos
  if (digits.length <= 13) return false;
  // 14+ dígitos sem padrão BR = provavelmente LID
  return true;
}

// Entre dois JIDs, escolhe o que parece ser um telefone real (não LID)
function pickRealJid(remoteJid: string | null, remoteJidAlt: string | null): string {
  if (remoteJidAlt && !isLikelyLidNumber(remoteJidAlt)) return remoteJidAlt;
  if (remoteJid && !isLikelyLidNumber(remoteJid)) return remoteJid;
  // Ambos LID ou ausentes — usar o que existir (logar warning no caller)
  return remoteJidAlt || remoteJid || '';
}

/**
 * Normaliza payload da Evolution API para o formato interno (UAZAPI-like).
 * Evolution API usa nomes de evento com ponto (messages.upsert, connection.update)
 * e estrutura aninhada com data.key.remoteJid.
 * Retorna payload com EventType='skip' para mensagens enviadas via API (ignorar eco).
 */
function normalizeWebhookPayload(raw: any): any {
  const rawEvent = raw.event;
  if (!rawEvent || typeof rawEvent !== 'string') return raw;

  // Normalizar para lowercase com pontos (ex: MESSAGES_UPSERT → messages.upsert)
  const normalizedEvent = rawEvent.toLowerCase().replace(/_/g, '.');

  // Não é Evolution API se não tiver evento com ponto E não for um evento conhecido
  const knownEvents = ['messages.upsert', 'messages.update', 'connection.update', 'send.message', 'messages.set'];
  if (!normalizedEvent.includes('.') && !knownEvents.includes(normalizedEvent)) {
    return raw;
  }

  console.log('[Webhook] Evolution API payload detectado, normalizando:', rawEvent, '→', normalizedEvent);

  // Evolution API v2 às vezes manda data como array, às vezes como objeto
  const rawData = raw.data || {};
  const data = Array.isArray(rawData) ? (rawData[0] || {}) : rawData;
  const key = data.key || {};
  const message = data.message || {};

  // WhatsApp LID (Linked Device ID): escolher o JID que é telefone real
  // LIDs podem vir tanto com @lid quanto com @s.whatsapp.net (14+ dígitos)
  const effectiveRemoteJid = pickRealJid(key.remoteJid, key.remoteJidAlt);
  if (isLikelyLidNumber(key.remoteJid) || isLikelyLidNumber(key.remoteJidAlt)) {
    console.log('[Webhook] LID detectado — remoteJid:', key.remoteJid, 'remoteJidAlt:', key.remoteJidAlt, '→ usando:', effectiveRemoteJid);
  }

  const evMap: Record<string, string> = {
    'messages.upsert': 'messages',
    'messages.update': 'messages_update',
    'connection.update': 'connection',
    'send.message': 'skip',   // eco de mensagem enviada via API — ignorar
    'messages.set': 'skip',   // histórico ao conectar — ignorar
  };

  const mapped = evMap[normalizedEvent];
  if (!mapped) return { ...raw, EventType: normalizedEvent };
  if (mapped === 'skip') return { EventType: 'skip' };

  if (normalizedEvent === 'messages.upsert') {
    // Ignorar mensagens enviadas pela própria API (source='api')
    // NÃO usar raw.destination pois esse campo existe em TODOS os payloads Evolution API
    if (key.fromMe && data.source === 'api') {
      return { EventType: 'skip' };
    }

    const text = message.conversation
      || message.extendedTextMessage?.text
      || message.imageMessage?.caption
      || message.videoMessage?.caption
      || message.documentMessage?.caption
      || '';

    const messageType = data.messageType || Object.keys(message)[0] || 'conversation';
    const mediaMsg: any = message.imageMessage || message.videoMessage
      || message.audioMessage || message.documentMessage || {};

    return {
      EventType: 'messages',
      instance: raw.instance,
      apikey: raw.apikey,
      // Preservar messageTimestamp (em segundos — multiplicar por 1000 ao salvar no sent_at)
      messageTimestamp: data.messageTimestamp || null,
      event: {
        message: {
          id: key.id,
          chatid: effectiveRemoteJid,
          fromMe: key.fromMe ?? false,
          isGroup: effectiveRemoteJid?.includes('@g.us') ?? false,
          sender: effectiveRemoteJid,
          senderName: data.pushName || '',
          messageType,
          content: {
            text,
            type: messageType,
            URL: mediaMsg.url || '',
            mimetype: mediaMsg.mimetype || '',
            mediaKey: mediaMsg.mediaKey || '',
            fileSHA256: mediaMsg.fileSHA256 || '',
            fileEncSHA256: mediaMsg.fileEncSHA256 || '',
            fileLength: Number(mediaMsg.fileLength || 0),
            PTT: !!message.audioMessage?.ptt,
          },
        }
      }
    };
  }

  if (normalizedEvent === 'connection.update') {
    const state = data.state || '';
    const stateMap: Record<string, string> = {
      'open': 'connected',
      'close': 'disconnected',
      'connecting': 'connecting',
    };
    return {
      EventType: 'connection',
      instance: raw.instance,
      apikey: raw.apikey,
      _evolutionState: state,  // preservado para handleConnectionChange
      event: {
        connection: stateMap[state] || state,
        status: stateMap[state] || state,
      }
    };
  }

  if (normalizedEvent === 'messages.update') {
    return {
      EventType: 'messages_update',
      instance: raw.instance,
      apikey: raw.apikey,
      event: data,
    };
  }

  return { ...raw, EventType: mapped };
}

import { MediaData, downloadAndSaveMedia, downloadAndDecryptAudio, transcribeAudioFromBase64, getExtensionFromMimetype, describeImageViaGemini } from "./media.ts";
import { callTicketRouterLLM, TicketDecisionAction } from "./llm.ts";
import { tryHandleViaAgentPlatform } from "./agent-platform.ts";
import { getOrCreateContactWithProfilePic } from "./contacts.ts";
import { getOrCreateGroup } from "./groups.ts";
import { getIntegrationKey } from "./config.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
// API keys hidratadas por request (regra: nada hardcoded, le da tabela config)
let OPENAI_API_KEY: string | null = null;
let GEMINI_API_KEY: string | null = null;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Hidratar API keys de transcricao da tabela config
    OPENAI_API_KEY = await getIntegrationKey(supabase, 'OPENAI_API_KEY'); // Whisper (preferido)
    GEMINI_API_KEY = await getIntegrationKey(supabase, 'GEMINI_API_KEY'); // Gemini multimodal (fallback)

    const rawPayload = await req.json();
    const payload = normalizeWebhookPayload(rawPayload);

    // Ignorar eventos marcados como skip (eco de API, histórico inicial, etc.)
    if (payload.EventType === 'skip') {
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // UAZAPI com addUrlEvents=true manda o tipo na URL (?event=connection)
    const url = new URL(req.url);
    const urlEvent = url.searchParams.get('event');
    const eventType = payload.EventType || payload.type || urlEvent || 'unknown';
    const eventData = payload.event || payload.message || payload;

    const instanceIdentifier = payload.instanceName || payload.instance || payload.instanceId;

    let instanceData = null;
    if (instanceIdentifier) {
      const { data } = await supabase
        .from('whatsapp_instances')
        .select('id, teams, api_key, api_url, name')
        .or(`name.eq.${instanceIdentifier},metadata->>uazapi_instance_id.eq.${instanceIdentifier}`)
        .single();
      instanceData = data;
    }

    if (!instanceData) {
      const token = payload.token || req.headers.get('token') || req.headers.get('authorization');
      if (token) {
        const cleanToken = token.replace('Bearer ', '');
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('id, teams, api_key, api_url, name')
          .eq('api_key', cleanToken)
          .single();
        instanceData = data;
      }
    }

    // Fallback: tentar token via URL query param (UAZAPI pode enviar assim)
    if (!instanceData) {
      const url = new URL(req.url);
      const queryToken = url.searchParams.get('token') || url.searchParams.get('apikey');
      if (queryToken) {
        const { data } = await supabase
          .from('whatsapp_instances')
          .select('id, teams, api_key, api_url, name')
          .eq('api_key', queryToken)
          .single();
        instanceData = data;
      }
    }

    if (!instanceData) {
      // Log detalhado pra debuggar eventos que nao casam com nenhuma instancia
      console.log('[Webhook] No instance found. EventType:', eventType, 'Keys:', JSON.stringify(Object.keys(payload)), 'Payload snippet:', JSON.stringify(payload).slice(0, 500));
      return new Response(JSON.stringify({ received: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const instanceId = instanceData.id;
    const instanceApiKey = instanceData.api_key;
    const instanceApiUrl = instanceData.api_url;
    console.log('[Webhook] Processing for instance:', instanceId, 'EventType:', eventType);

    switch (eventType) {
      case 'messages':
      case 'message': {
        const msgPayload = eventData.message || eventData;
        const msgType = msgPayload.messageType || msgPayload.content?.type || '';

        // Reações chegam como messageType "reactionMessage"
        if (msgType === 'reactionMessage' || msgType === 'ReactionMessage') {
          await handleReaction(supabase, instanceId, msgPayload);
        }
        // Edições chegam com flag editedMessage ou messageType editedMessage
        else if (msgPayload.editedMessage || msgPayload.protocolMessage?.type === 14 || msgType === 'editedMessage' || msgType === 'protocolMessage') {
          await handleEditedMessage(supabase, instanceId, msgPayload);
        }
        else {
          await handleIncomingMessage(supabase, instanceId, msgPayload, instanceData.teams, instanceApiKey, instanceApiUrl);
        }
        break;
      }
      case 'messages_update': {
        await handleMessageStatus(supabase, instanceId, eventData);
        break;
      }
      case 'connection': {
        await handleConnectionChange(supabase, instanceId, eventData);
        break;
      }
      default: {
        console.log('[Webhook] Unhandled EventType:', eventType);
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Webhook] Error processing:', errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function handleIncomingMessage(
  supabase: any,
  instanceId: string,
  payload: any,
  teams: string[],
  instanceApiKey: string | null,
  instanceApiUrl: string | null
) {
  const messageId = payload.id || payload.messageid || payload.MessageID;
  const remoteJid = payload.chatid || payload.wa_chatid || payload.Chat || payload.chatId;
  const fromMe = payload.fromMe ?? payload.IsFromMe ?? false;
  const isGroup = payload.isGroup ?? payload.IsGroup ?? (remoteJid?.includes('@g.us') ?? false);

  console.log('[Webhook] Processing message:', messageId, 'from:', remoteJid, 'fromMe:', fromMe);

  if (!remoteJid) {
    console.log('[Webhook] No remoteJid/chatid found, skipping');
    return;
  }

  let senderPhone;
  let actualContactPhone;

  if (fromMe) {
    actualContactPhone = String(remoteJid).replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
    senderPhone = payload.owner || '553123917958';
  } else {
    senderPhone = payload.sender_pn || payload.sender || payload.Sender || remoteJid;
    actualContactPhone = String(senderPhone).replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');
  }

  senderPhone = String(senderPhone).replace('@s.whatsapp.net', '').replace('@g.us', '').replace('@lid', '');

  // Detectar e logar se o telefone extraído é um LID disfarçado
  if (isLikelyLidNumber(actualContactPhone)) {
    console.warn('[Webhook] ⚠️ LID detectado como telefone do contato:', actualContactPhone, '— lead pode ficar com número errado');
  }
  const pushName = payload.senderName || payload.SenderName || payload.name || senderPhone;

  const contentObj = payload.content || {};
  let content = contentObj.text || payload.text || '';
  let messageType = payload.messageType || contentObj.type || 'text';
  
  let mediaUrl: string | null = null;
  const mediaData: MediaData | null = contentObj.URL ? {
    url: contentObj.URL,
    mimetype: contentObj.mimetype || 'audio/ogg',
    fileSHA256: contentObj.fileSHA256 || '',
    fileLength: contentObj.fileLength || 0,
    mediaKey: contentObj.mediaKey || '',
    fileEncSHA256: contentObj.fileEncSHA256 || '',
  } : null;

  if ((messageType === 'AudioMessage' || messageType === 'ptt' || contentObj.PTT) && mediaData) {
    console.log('[Webhook] Audio message detected, downloading via UAZAPI...');
    try {
      // URL base da UAZAPI
      const uazapiBaseUrl = instanceApiUrl || '';

      // UAZAPI /message/download tenta transcrever via Whisper (se OpenAI key) e
      // se nao tiver, fallback usa Gemini (multimodal).
      const { publicUrl, transcription } = await downloadAndDecryptAudio(
        supabase,
        mediaData,
        messageId,
        instanceApiKey || undefined,
        uazapiBaseUrl,
        OPENAI_API_KEY,
        GEMINI_API_KEY,
      );
      mediaUrl = publicUrl || mediaData.url;
      content = transcription ? `🎤 ${transcription}` : '🎤 [Áudio]';
    } catch (error) {
      console.error('[Webhook] Audio processing failed:', error);
      content = '🎤 [Áudio]';
      mediaUrl = mediaData.url;
    }
  } else if ((messageType === 'stickerMessage' || messageType === 'StickerMessage') && (contentObj.URL || mediaData)) {
    // Sticker message - download via UAZAPI and save as sticker
    console.log('[Webhook] Sticker message detected, downloading...');
    try {
      const uazapiBaseUrl = instanceApiUrl || '';

      // Tentar obter link via UAZAPI download
      if (instanceApiKey && messageId) {
        const downloadResp = await fetch(`${uazapiBaseUrl}/message/download`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'token': instanceApiKey },
          body: JSON.stringify({ id: messageId, return_link: true }),
        });
        if (downloadResp.ok) {
          const dlData = await downloadResp.json();
          mediaUrl = dlData.fileURL || dlData.FileURL || dlData.url || dlData.link || dlData.download_url || null;
          console.log('[Webhook] Sticker UAZAPI response:', JSON.stringify(dlData).slice(0, 200));
        } else {
          console.log('[Webhook] Sticker UAZAPI download failed:', downloadResp.status);
        }
      }

      // Fallback: usar URL direta se UAZAPI download falhar
      if (!mediaUrl && contentObj.URL) {
        mediaUrl = contentObj.URL;
      }

      messageType = 'stickerMessage';
      if (!content) content = '🏷️ [Sticker]';
    } catch (error) {
      console.error('[Webhook] Sticker download failed:', error);
      mediaUrl = contentObj.URL || null;
      messageType = 'stickerMessage';
      if (!content) content = '🏷️ [Sticker]';
    }
  } else if (contentObj.URL && (messageType === 'ImageMessage' || messageType === 'VideoMessage')) {
    console.log('[Webhook] Image/Video message detected, downloading...');
    try {
      const uazapiBaseUrl = instanceApiUrl || '';
      const imgMimetype = contentObj.mimetype || 'image/jpeg';

      const { publicUrl } = await downloadAndSaveMedia(supabase, {
        url: contentObj.URL,
        mimetype: imgMimetype,
        fileSHA256: contentObj.fileSHA256 || '',
        fileLength: contentObj.fileLength || 0,
        mediaKey: contentObj.mediaKey || '',
        fileEncSHA256: contentObj.fileEncSHA256 || '',
      }, messageId, messageType, instanceApiKey, uazapiBaseUrl);

      mediaUrl = publicUrl;
      const captionOriginal = content || '';

      // Se for imagem e tiver Gemini, descrever pra que o agente "veja" o que tem nela
      if (messageType === 'ImageMessage' && publicUrl && GEMINI_API_KEY) {
        try {
          const description = await describeImageViaGemini(publicUrl, imgMimetype, GEMINI_API_KEY, captionOriginal);
          if (description) {
            content = captionOriginal
              ? `📷 ${captionOriginal}\n[Imagem: ${description}]`
              : `📷 [Imagem: ${description}]`;
          } else if (!content) {
            content = '📷 [Imagem]';
          }
        } catch (visionErr) {
          console.error('[Webhook] Gemini vision falhou:', visionErr);
          if (!content) content = '📷 [Imagem]';
        }
      } else if (!content) {
        content = messageType === 'ImageMessage' ? '📷 [Imagem]' : '🎥 [Vídeo]';
      }
    } catch (error) {
      console.error('[Webhook] Media download failed:', error);
      mediaUrl = contentObj.URL;
      if (!content) content = '[Mídia]';
    }
  } else if (contentObj.URL && (messageType === 'DocumentMessage' || messageType === 'DocumentWithCaptionMessage' || messageType === 'documentMessage' || messageType === 'document')) {
    // Documentos precisam ser baixados via UAZAPI (URL direta é .enc criptografado)
    const docFileName = contentObj.fileName || contentObj.title || '';
    console.log('[Webhook] Document message detected:', docFileName, 'downloading...');
    try {
      const uazapiBaseUrl = instanceApiUrl || '';

      const { publicUrl } = await downloadAndSaveMedia(supabase, {
        url: contentObj.URL,
        mimetype: contentObj.mimetype || 'application/octet-stream',
        fileSHA256: contentObj.fileSHA256 || '',
        fileLength: contentObj.fileLength || 0,
        mediaKey: contentObj.mediaKey || '',
        fileEncSHA256: contentObj.fileEncSHA256 || '',
      }, messageId, messageType, instanceApiKey, uazapiBaseUrl, docFileName);

      mediaUrl = publicUrl;
      if (!content) {
        content = docFileName ? `📄 ${docFileName}` : '📄 [Documento]';
      }
    } catch (error) {
      console.error('[Webhook] Document download failed:', error);
      mediaUrl = contentObj.URL;
      if (!content) content = docFileName ? `📄 ${docFileName}` : '📄 [Documento]';
    }
  } else if (contentObj.URL) {
    // Qualquer outra mídia - tentar baixar via UAZAPI também
    console.log('[Webhook] Unknown media type, trying UAZAPI download...', messageType);
    try {
      const uazapiBaseUrl = instanceApiUrl || '';
      const { publicUrl } = await downloadAndSaveMedia(supabase, {
        url: contentObj.URL,
        mimetype: contentObj.mimetype || 'application/octet-stream',
        fileSHA256: contentObj.fileSHA256 || '',
        fileLength: contentObj.fileLength || 0,
        mediaKey: contentObj.mediaKey || '',
        fileEncSHA256: contentObj.fileEncSHA256 || '',
      }, messageId, messageType, instanceApiKey, uazapiBaseUrl);

      mediaUrl = publicUrl || contentObj.URL;
    } catch (error) {
      console.error('[Webhook] Generic media download failed:', error);
      mediaUrl = contentObj.URL;
    }
    if (!content) content = '[Mídia]';
  } else if (!content) {
    content = '[Mídia]';
  }

  let groupDbId: string | null = null;
  if (isGroup && remoteJid) {
    groupDbId = await getOrCreateGroup(supabase, instanceId, remoteJid, payload);
  }

  let groupTeam: string | null = null;
  if (isGroup && groupDbId) {
    const { data: groupRow } = await supabase
      .from('whatsapp_groups')
      .select('purposes')
      .eq('id', groupDbId)
      .single();

    const purposes = Array.isArray(groupRow?.purposes) ? groupRow.purposes : [];
    groupTeam = (purposes?.[0] as string) || null;
  }

  let shouldCreateTicket = true;
  if (isGroup && groupDbId && !groupTeam) {
    console.log('[Webhook] Group has no team assigned, skipping ticket creation');
    shouldCreateTicket = false;
  }

  // Buscar ou criar lead (usa tabela leads, não contacts)
  let leadId: string | null = null;
  leadId = await getOrCreateContactWithProfilePic(supabase, actualContactPhone, pushName, instanceApiKey, instanceApiUrl);

  // Dedup: skip if a message with the same message_id already exists (catches edit echoes and duplicate events)
  if (messageId) {
    const { data: existingMsg } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('message_id', messageId)
      .limit(1);

    if (existingMsg && existingMsg.length > 0) {
      console.log('[Webhook] Dedup: message_id already exists, skipping:', messageId);
      return;
    }
  }

  // Dedup: skip if an identical message (same content, same sender direction) was saved in the last 60s
  // This catches edit echo events from UAZAPI that arrive as new messages with different message_ids
  // If found, update message_id to the real one (webhook has the canonical ID) and preserve sent_by metadata
  if (fromMe && content && content !== '[Mídia]' && content !== '🎤 [Áudio]') {
    const sixtySecondsAgo = new Date(Date.now() - 60000).toISOString();
    const dedupQuery = supabase
      .from('whatsapp_messages')
      .select('id, metadata')
      .eq('instance_id', instanceId)
      .eq('is_from_me', true)
      .eq('content', content)
      .neq('message_id', messageId)
      .gte('sent_at', sixtySecondsAgo)
      .limit(1);

    if (leadId) dedupQuery.eq('lead_id', leadId);
    if (groupDbId) dedupQuery.eq('group_id', groupDbId);

    const { data: existingDup } = await dedupQuery;
    if (existingDup && existingDup.length > 0) {
      // Update message_id to canonical (webhook) ID, preserve sent_by metadata from frontend
      const existingMeta = existingDup[0].metadata || {};
      await supabase
        .from('whatsapp_messages')
        .update({ message_id: messageId, message_type: messageType })
        .eq('id', existingDup[0].id);
      console.log('[Webhook] Dedup: updated message_id to canonical:', messageId, '| preserved sent_by:', existingMeta.sent_by_name);
      return;
    }
  }

  const { data: savedMessage, error: msgError } = await supabase
    .from('whatsapp_messages')
    .insert({
      instance_id: instanceId,
      group_id: groupDbId,
      lead_id: leadId,
      message_id: messageId,
      remote_jid: remoteJid,
      content,
      message_type: messageType,
      sender_phone: senderPhone,
      sender_name: pushName,
      is_from_me: fromMe,
      media_url: mediaUrl,
      // messageTimestamp da Evolution API vem em SEGUNDOS — multiplicar por 1000 para ms
      sent_at: payload.messageTimestamp
        ? new Date(Number(payload.messageTimestamp) * 1000).toISOString()
        : new Date().toISOString(),
      metadata: payload,
    })
    .select()
    .single();

  if (msgError) {
    console.error('[Webhook] Error saving message:', msgError);
    return;
  }

  console.log('[Webhook] Message saved:', savedMessage.id);

  // === ROTEADOR V2 (Plataforma de Agentes) — PORTEIRO ===
  // Gated por config.agent_platform_v2_enabled (texto 'true'/'false').
  // Se um agente V2 da instância trata a mensagem, NÃO segue pro fluxo legado.
  if (!fromMe && !isGroup && content && content.trim()) {
    try {
      const handledByV2 = await tryHandleViaAgentPlatform({
        supabase,
        instance: { id: instanceId, api_url: instanceApiUrl, api_key: instanceApiKey },
        senderPhone,
        text: content,
        messageId,
        leadId,   // lead que o webhook criou/achou — agente usa pra agendar/qualificar
      });
      if (handledByV2) {
        console.log('[Webhook] V2 agent handled message — skipping legacy flow');
        return;
      }
    } catch (e) {
      console.error('[Webhook] V2 router error (caindo pro legado):', (e as Error).message);
    }
  }

  // === LEAD REPLIED — TRIGGER AUTOMATION RULES ===
  if (leadId && !fromMe && !isGroup) {
    try {
      console.log(`[Webhook] 🤖 Disparando automação lead_replied para lead ${leadId}`);
      fetch(`${SUPABASE_URL}/functions/v1/process-automation-rules`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          trigger_type: 'lead_replied',
          lead_id: leadId,
        }),
      }).catch(err => console.error('[Webhook] Automation rules dispatch error:', err));
    } catch (e) {
      console.error('[Webhook] lead_replied automation error:', e);
    }
  }
  // === FIM LEAD REPLIED ===

  // === NO-SHOW FOLLOW-UP REPLY DETECTION ===
  if (leadId && !fromMe && !isGroup) {
    try {
      const { data: lead } = await supabase
        .from('leads')
        .select('id, name, etapa_funil')
        .eq('id', leadId)
        .single();

      if (lead?.etapa_funil === 'no_show') {
        console.log(`[Webhook] 🔔 Lead no-show ${lead.name} respondeu!`);

        // Marcar último follow-up como replied
        const { data: lastFollowup } = await supabase
          .from('noshow_followups')
          .select('id')
          .eq('lead_id', leadId)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastFollowup) {
          await supabase.from('noshow_followups')
            .update({ status: 'replied' })
            .eq('id', lastFollowup.id);
        }

        // Criar alerta para o vendedor
        await supabase.from('sales_alerts').insert({
          lead_id: leadId,
          type: 'no_show_reply',
          title: `${lead.name} respondeu ao resgate de no-show!`,
          description: `Lead ${lead.name} respondeu após no-show. Reagendar call o mais rápido possível.`,
          priority: 'high',
          status: 'active',
        });
      }
    } catch (e) {
      console.error('[Webhook] No-show reply detection error:', e);
    }
  }
  // === FIM NO-SHOW REPLY DETECTION ===

  // ── Response Detection: Atualizar touchpoints "awaiting_response" ──
  if (!isGroup && !fromMe && leadId) {
    try {
      // Buscar org via primary_contact_id = lead_id
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('primary_contact_id', leadId)
        .maybeSingle();

      if (org) {
        // Buscar touchpoints awaiting_response para esta org
        const { data: awaitingTouchpoints } = await supabase
          .from('cs_touchpoints')
          .select('id')
          .eq('organization_id', org.id)
          .eq('status', 'awaiting_response')
          .order('created_at', { ascending: false });

        if (awaitingTouchpoints && awaitingTouchpoints.length > 0) {
          // Atualizar todos para client_replied
          const tpIds = awaitingTouchpoints.map((tp: any) => tp.id);
          await supabase
            .from('cs_touchpoints')
            .update({ status: 'client_replied', updated_at: new Date().toISOString() })
            .in('id', tpIds);

          console.log(`[Webhook] ${tpIds.length} touchpoint(s) atualizados para client_replied para org ${org.id}`);

          // Criar task de follow-up para o CSM
          await supabase
            .from('company_activities')
            .insert({
              name: `Cliente respondeu — completar touchpoint`,
              description: `O cliente respondeu via WhatsApp. Completar o registro do touchpoint.`,
              priority: 'high',
              task_type: 'cs_follow_up',
              team: 'cs',
              organization_id: org.id,
              status: 'not_started',
              scheduled_at: new Date().toISOString(),
              metadata: {
                source: 'whatsapp_response_detection',
                touchpoint_ids: tpIds,
                lead_id: leadId,
                message_content: content?.substring(0, 200),
              },
            });

          console.log(`[Webhook] Task de follow-up criada para org ${org.id}`);
        }
      }
    } catch (err) {
      console.error('[Webhook] Error in response detection:', err);
    }
  }

  // === AGENT ROUTING (CEO Bot + Content Agent) ===
  if (!isGroup && !fromMe) {
    try {
      const trimmedContent = (content || '').trim().toLowerCase();

      // Load both configs in parallel
      const [ceoResult, contentResult] = await Promise.all([
        supabase
          .from('ceo_bot_config')
          .select('id, instance_id, allowed_phones, is_active')
          .eq('is_active', true)
          .maybeSingle(),
        supabase
          .from('content_agent_config')
          .select('id, instance_id, allowed_phones, is_active')
          .eq('is_active', true)
          .maybeSingle(),
      ]);

      const ceoConfig = ceoResult.data;
      const contentConfig = contentResult.data;

      const isInCeoAllowlist = ceoConfig?.allowed_phones?.includes(senderPhone);
      const isInContentAllowlist = contentConfig?.allowed_phones?.includes(senderPhone);

      if (isInCeoAllowlist || isInContentAllowlist) {
        // Determine which agent to route to
        let targetAgent: 'ceo' | 'content' = 'ceo'; // default = CEO (preserves current behavior)

        if (trimmedContent.startsWith('/conteudo') && isInContentAllowlist) {
          // Explicit /conteudo command → content agent + update session
          targetAgent = 'content';
          await supabase.from('whatsapp_agent_sessions').upsert(
            { phone: senderPhone, active_agent: 'content', updated_at: new Date().toISOString() },
            { onConflict: 'phone' }
          );
        } else if (trimmedContent.startsWith('/ceo') && isInCeoAllowlist) {
          // Explicit /ceo command → CEO bot + update session
          targetAgent = 'ceo';
          await supabase.from('whatsapp_agent_sessions').upsert(
            { phone: senderPhone, active_agent: 'ceo', updated_at: new Date().toISOString() },
            { onConflict: 'phone' }
          );
        } else {
          // No command → check active session
          const { data: session } = await supabase
            .from('whatsapp_agent_sessions')
            .select('active_agent')
            .eq('phone', senderPhone)
            .maybeSingle();

          if (session?.active_agent === 'content' && isInContentAllowlist) {
            targetAgent = 'content';
          } else if (isInCeoAllowlist) {
            targetAgent = 'ceo';
          } else if (isInContentAllowlist) {
            targetAgent = 'content';
          }
        }

        const edgeFunctionName = targetAgent === 'content' ? 'content-whatsapp-bot' : 'ceo-whatsapp-bot';
        console.log(`[Webhook] Agent routing: ${targetAgent} for ${senderPhone}`);

        const agentPayload: any = {
            phone: senderPhone,
            message: content,
            sender_name: pushName,
            instance_id: instanceId,
            message_id: savedMessage.id,
          };
        // Pass media_url for image/video so agents can use Claude Vision
        if (mediaUrl && (messageType === 'ImageMessage' || messageType === 'VideoMessage')) {
          agentPayload.media_url = mediaUrl;
          agentPayload.media_type = messageType === 'ImageMessage' ? 'image' : 'video';
        }

        fetch(`${SUPABASE_URL}/functions/v1/${edgeFunctionName}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(agentPayload),
        }).catch(err => console.error(`[Webhook] ${edgeFunctionName} error:`, err));
        return;
      }
    } catch (e) {
      console.error('[Webhook] Agent routing error:', e);
    }
  }
  // === FIM AGENT ROUTING ===

  // Verificar se há menções e chamar task bot assistant se aplicável
  if (isGroup && !fromMe) {
    const mentionedJIDs = payload.content?.contextInfo?.mentionedJID || [];
    if (mentionedJIDs.length > 0) {
      console.log('[Webhook] Menções detectadas no grupo:', mentionedJIDs);
      // Chamar a função de task assistant de forma assíncrona (não bloqueia)
      try {
        const taskAssistantUrl = `${SUPABASE_URL}/functions/v1/whatsapp-task-assistant`;
        fetch(taskAssistantUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            data: {
              ...payload,
              id: savedMessage.id,
              remote_jid: remoteJid,
              content: content,
              sender_name: pushName,
              sender_phone: senderPhone,
              metadata: payload,
            },
          }),
        }).then(res => res.json()).then(result => {
          console.log('[Webhook] Task Assistant response:', result);
        }).catch(err => {
          console.error('[Webhook] Task Assistant error:', err);
        });
      } catch (taskError) {
        console.error('[Webhook] Erro ao chamar task assistant:', taskError);
      }
    }
  }

  // AI Sales Agent: NÃO enfileirar aqui.
  // O trigger de banco 'trg_enqueue_for_ai_agent' no INSERT de whatsapp_messages
  // já chama 'process_with_debounce' automaticamente. Esse caminho faz debounce + lock +
  // agrupamento de mensagens (lê TODAS as msgs pendentes do DB e consolida).
  // Enfileirar aqui pelo webhook causava processamento DUPLO.

  if (shouldCreateTicket) {
    await handleConversationMessage(
      supabase,
      instanceId,
      { ...payload, content, senderPhone: actualContactPhone, pushName, isGroup, mediaUrl, messageType, fromMe },
      savedMessage.id,
      isGroup,
      groupDbId,
      teams,
      leadId,
      groupTeam,
    );
  }
}

async function handleConversationMessage(
  supabase: any,
  instanceId: string,
  payload: any,
  messageDbId: string,
  isGroup: boolean,
  groupDbId: string | null,
  teams: string[],
  leadId: string | null,
  groupTeam: string | null,
) {
  const { content, senderPhone, pushName, mediaUrl, messageType, fromMe } = payload;

  // Determinar o team baseado no grupo ou instância
  const effectiveTeam = groupTeam || (teams?.[0] as string) || 'suporte';
  
  console.log('[Webhook] Handling conversation for team:', effectiveTeam, 'isGroup:', isGroup);

  // Ticket routing só faz sentido pro time de suporte.
  // CS e Comercial têm seus próprios sistemas (inbox, pipeline, deals).
  if (effectiveTeam === 'cs' || effectiveTeam === 'comercial') {
    return;
  }

  // Para suporte, continuar com a lógica de tickets
  const channel = isGroup ? 'whatsapp_grupo' : 'whatsapp_individual';
  const channelName = isGroup ? (payload.groupName || 'Grupo WhatsApp') : senderPhone;

  // Buscar ticket ativo para este contato/grupo
  let existingTicket = null;
  
  if (isGroup && groupDbId) {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('whatsapp_group_id', groupDbId)
      .in('status', ['novo', 'em_atendimento', 'aguardando_cliente'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    existingTicket = data;
  } else if (leadId) {
    const { data } = await supabase
      .from('tickets')
      .select('*')
      .eq('contact_id', leadId)
      .eq('channel', 'whatsapp_individual')
      .in('status', ['novo', 'em_atendimento', 'aguardando_cliente'])
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    existingTicket = data;
  }

  // Buscar mensagens recentes para contexto
  const recentMessagesQuery = supabase
    .from('whatsapp_messages')
    .select('content, sender_name, is_from_me, sent_at')
    .eq('instance_id', instanceId)
    .order('sent_at', { ascending: false })
    .limit(20);

  if (isGroup && groupDbId) {
    recentMessagesQuery.eq('group_id', groupDbId);
  } else if (leadId) {
    recentMessagesQuery.eq('lead_id', leadId).is('group_id', null);
  }

  const { data: recentMessages } = await recentMessagesQuery;

  // Chamar LLM para decidir ação
  const llmDecision = await callTicketRouterLLM({
    openaiApiKey: OPENAI_API_KEY!,
    channel,
    message: content,
    ticket: existingTicket,
    recentMessages: recentMessages?.reverse() || [],
    isGroup,
  });

  console.log('[Webhook] LLM Decision:', llmDecision);

  if (!llmDecision) {
    console.log('[Webhook] No LLM decision, skipping ticket handling');
    return;
  }

  const { action, subject, summary, status, category } = llmDecision;

  // Executar ação baseada na decisão
  switch (action) {
    case 'WAIT':
      console.log('[Webhook] LLM decided to WAIT');
      break;

    case 'NEW_TICKET': {
      const ticketData: any = {
        contact_id: leadId,
        channel,
        channel_name: channelName,
        whatsapp_group_id: groupDbId,
        status: status || 'novo',
        subject: subject || content.slice(0, 100),
        last_message: content,
        last_message_at: new Date().toISOString(),
        llm_summary: summary,
        team: effectiveTeam,
        opened_by_name: pushName,
        opened_by_phone: senderPhone,
      };

      if (category) {
        const { data: cat } = await supabase
          .from('ticket_categories')
          .select('id')
          .eq('slug', category)
          .single();
        if (cat) ticketData.category_id = cat.id;
      }

      const { data: newTicket, error } = await supabase
        .from('tickets')
        .insert(ticketData)
        .select()
        .single();

      if (error) {
        console.error('[Webhook] Error creating ticket:', error);
      } else {
        console.log('[Webhook] Created new ticket:', newTicket.id);
      }
      break;
    }

    case 'CONTINUE':
    case 'REOPEN':
    case 'APPEND_KEEP_RESOLVED': {
      if (existingTicket) {
        const updates: any = {
          last_message: content,
          last_message_at: new Date().toISOString(),
        };

        if (status) updates.status = status;
        if (summary) updates.llm_summary = summary;

        if (!fromMe) {
          updates.last_client_message_at = new Date().toISOString();
        } else {
          updates.last_agent_message_at = new Date().toISOString();
        }

        await supabase
          .from('tickets')
          .update(updates)
          .eq('id', existingTicket.id);

        console.log('[Webhook] Updated ticket:', existingTicket.id, 'action:', action);
      }
      break;
    }

    case 'RESOLVE': {
      if (existingTicket) {
        await supabase
          .from('tickets')
          .update({
            status: 'resolvido',
            resolved_at: new Date().toISOString(),
            last_message: content,
            last_message_at: new Date().toISOString(),
            llm_summary: summary || existingTicket.llm_summary,
          })
          .eq('id', existingTicket.id);

        console.log('[Webhook] Resolved ticket:', existingTicket.id);
      }
      break;
    }
  }
}

async function handleMessageStatus(supabase: any, instanceId: string, payload: any) {
  const eventType = payload.Type || payload.type || '';
  const status = payload.status || payload.ack;

  // FileDownloaded: UAZAPI terminou de baixar a mídia → atualizar media_url
  if (eventType === 'FileDownloaded' || eventType === 'fileDownloaded') {
    const fileUrl = payload.FileURL || payload.fileURL || payload.fileUrl;
    const messageIds = payload.MessageIDs || payload.messageIds || [];
    const rawId = messageIds[0] || payload.id || payload.messageid;

    if (!rawId || !fileUrl) {
      console.log('[Webhook] FileDownloaded: missing rawId or fileUrl');
      return;
    }

    console.log('[Webhook] FileDownloaded for message:', rawId, '→', fileUrl);

    // O message_id no banco pode ter prefixo (owner:id) ou ser apenas o raw id
    // Tentar match exato primeiro, depois com like
    const { data: exactMatch } = await supabase
      .from('whatsapp_messages')
      .update({ media_url: fileUrl })
      .eq('message_id', rawId)
      .eq('instance_id', instanceId)
      .select('id')
      .maybeSingle();

    if (!exactMatch) {
      // Tentar com sufixo (caso o banco tenha owner:rawId)
      const { data: likeMatch } = await supabase
        .from('whatsapp_messages')
        .update({ media_url: fileUrl })
        .like('message_id', `%${rawId}`)
        .eq('instance_id', instanceId)
        .select('id')
        .maybeSingle();

      if (likeMatch) {
        console.log('[Webhook] FileDownloaded: updated via like match:', likeMatch.id);
      } else {
        console.log('[Webhook] FileDownloaded: no matching message found for:', rawId);
      }
    } else {
      console.log('[Webhook] FileDownloaded: updated:', exactMatch.id);
    }
    return;
  }

  const messageId = payload.id || payload.messageid;
  if (!messageId) return;

  console.log('[Webhook] Updating message status:', messageId, status);

  // Detectar deleção
  if (status === 'Deleted' || status === 'REVOKE' || status === 'revoked') {
    console.log('[Webhook] Message deleted:', messageId);
    await supabase
      .from('whatsapp_messages')
      .update({ is_deleted: true })
      .eq('message_id', messageId);
    return;
  }

  const statusMap: Record<string, string> = {
    'DELIVERY_ACK': 'delivered',
    'READ': 'read',
    'PLAYED': 'read',
    '2': 'delivered',
    '3': 'read',
  };

  const mappedStatus = statusMap[status] || status;

  // Update the status column directly (don't overwrite metadata)
  await supabase
    .from('whatsapp_messages')
    .update({ status: mappedStatus })
    .eq('message_id', messageId);
}

async function handleReaction(supabase: any, instanceId: string, payload: any) {
  // Reaction payload: reaction.key.id = target message id, reaction.text = emoji
  const reaction = payload.content?.reaction || payload.reaction || {};
  const targetMessageId = reaction?.key?.id || payload.content?.contextInfo?.stanzaId;
  const emoji = reaction?.text || payload.content?.text || '';
  const senderPhone = payload.sender_pn || payload.sender || payload.chatid || '';
  const senderName = payload.senderName || payload.SenderName || senderPhone;

  if (!targetMessageId) {
    console.log('[Webhook] Reaction: no target message ID found');
    return;
  }

  console.log('[Webhook] Reaction:', emoji, 'on message:', targetMessageId, 'from:', senderName);

  // Se emoji é vazio, é uma remoção de reação
  if (!emoji) {
    console.log('[Webhook] Reaction removed for message:', targetMessageId);
    // Buscar reações atuais e remover a do sender
    const { data: msg } = await supabase
      .from('whatsapp_messages')
      .select('reactions')
      .eq('message_id', targetMessageId)
      .maybeSingle();

    if (msg) {
      const currentReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
      const cleanSender = String(senderPhone).replace('@s.whatsapp.net', '').replace('@g.us', '');
      const filtered = currentReactions.filter((r: any) => r.sender !== cleanSender);
      await supabase
        .from('whatsapp_messages')
        .update({ reactions: filtered })
        .eq('message_id', targetMessageId);
    }
    return;
  }

  // Buscar mensagem alvo e adicionar reação
  const { data: msg } = await supabase
    .from('whatsapp_messages')
    .select('reactions')
    .eq('message_id', targetMessageId)
    .maybeSingle();

  if (!msg) {
    console.log('[Webhook] Target message not found for reaction:', targetMessageId);
    return;
  }

  const currentReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
  const cleanSender = String(senderPhone).replace('@s.whatsapp.net', '').replace('@g.us', '');

  // Remover reação anterior do mesmo sender (se existir) antes de adicionar nova
  const filtered = currentReactions.filter((r: any) => r.sender !== cleanSender);

  const newReaction = {
    emoji,
    sender: cleanSender,
    sender_name: String(senderName).replace('@s.whatsapp.net', ''),
    timestamp: new Date().toISOString(),
  };

  await supabase
    .from('whatsapp_messages')
    .update({ reactions: [...filtered, newReaction] })
    .eq('message_id', targetMessageId);

  console.log('[Webhook] Reaction saved:', emoji, 'on:', targetMessageId);
}

async function handleEditedMessage(supabase: any, instanceId: string, payload: any) {
  // Edited message: protocolMessage with editedMessage or editedMessage field
  // Also handles UAZAPI format where content.text has the new text and id references the original
  const editedMsg = payload.editedMessage || payload.protocolMessage?.editedMessage || {};
  const targetMessageId = payload.protocolMessage?.key?.id || editedMsg?.key?.id || payload.id;
  const newContent = editedMsg?.message?.conversation
    || editedMsg?.message?.extendedTextMessage?.text
    || editedMsg?.text
    || payload.content?.text
    || payload.text
    || '';

  if (!targetMessageId) {
    console.log('[Webhook] Edit: no target message ID found, payload:', JSON.stringify(payload).slice(0, 300));
    return;
  }

  console.log('[Webhook] Message edited:', targetMessageId, 'new content:', newContent.slice(0, 50));

  if (newContent) {
    const { data, error } = await supabase
      .from('whatsapp_messages')
      .update({
        content: newContent,
        is_edited: true,
        edited_at: new Date().toISOString(),
      })
      .eq('message_id', targetMessageId);

    if (error) {
      console.error('[Webhook] Edit update error:', error);
    }
  }
}

const ALERT_GROUP_JID = '120363421838905056@g.us'; // TIME-IAP
const DISCONNECT_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 min
let lastDisconnectAlertAt = 0;

async function handleConnectionChange(supabase: any, instanceId: string, payload: any) {
  console.log('[Webhook] Connection event for instance:', instanceId, 'payload keys:', Object.keys(payload || {}));

  // Buscar instancia (precisa do api_url e api_key pra confirmar status)
  const { data: instance } = await supabase
    .from('whatsapp_instances')
    .select('name, status, phone_number, api_url, api_key')
    .eq('id', instanceId)
    .single();

  if (!instance) {
    console.error('[Webhook] Instance not found:', instanceId);
    return;
  }

  const previousStatus = instance.status;
  const instanceName = instance.name || instanceId;

  // Determinar status real da instância
  let mappedStatus: string = previousStatus;
  const isEvolutionApi = instance.api_url && !instance.api_url.includes('uazapi');

  if (isEvolutionApi && (payload as any)._evolutionState !== undefined) {
    // Evolution API: usa estado do payload diretamente (já normalizado)
    const stateMap: Record<string, string> = {
      'open': 'connected', 'close': 'disconnected', 'connecting': 'connecting',
    };
    mappedStatus = stateMap[(payload as any)._evolutionState] || previousStatus;
    console.log('[Webhook] Evolution API state:', (payload as any)._evolutionState, '→', mappedStatus);
  } else if (instance.api_url && instance.api_key) {
    // UAZAPI: consultar /instance/status como fonte da verdade
    try {
      const statusRes = await fetch(`${instance.api_url}/instance/status`, {
        headers: { token: instance.api_key },
      });
      if (statusRes.ok) {
        const statusJson = await statusRes.json();
        const isConnected = statusJson?.status?.connected === true || statusJson?.instance?.status === 'connected';
        const isConnecting = statusJson?.instance?.status === 'connecting';
        mappedStatus = isConnected ? 'connected' : isConnecting ? 'connecting' : 'disconnected';
        console.log('[Webhook] Real status from UAZAPI:', mappedStatus);
      } else {
        console.warn('[Webhook] /instance/status returned', statusRes.status);
      }
    } catch (err) {
      console.error('[Webhook] Failed to fetch real status:', err);
    }
  }

  // Atualizar status no banco
  await supabase
    .from('whatsapp_instances')
    .update({ status: mappedStatus, updated_at: new Date().toISOString() })
    .eq('id', instanceId);

  // Alerta se desconectou (status mudou pra disconnected)
  if (mappedStatus === 'disconnected' && previousStatus === 'connected') {
    const now = Date.now();
    if (now - lastDisconnectAlertAt < DISCONNECT_ALERT_COOLDOWN_MS) {
      console.log('[Webhook] Disconnect alert cooldown ativo, pulando');
      return;
    }
    lastDisconnectAlertAt = now;

    console.log(`[Webhook] ⚠️ Instância ${instanceName} DESCONECTOU! Enviando alerta...`);

    // Buscar outra instância CONECTADA pra enviar o alerta
    const { data: connectedInstances } = await supabase
      .from('whatsapp_instances')
      .select('id, name, api_key, api_url, metadata')
      .eq('status', 'connected')
      .neq('id', instanceId)
      .limit(3);

    if (!connectedInstances || connectedInstances.length === 0) {
      console.error('[Webhook] Nenhuma instância conectada pra enviar alerta!');
      return;
    }

    const alertInstance = connectedInstances[0];
    const baseUrl = alertInstance.api_url || alertInstance.metadata?.uazapi_url;
    if (!baseUrl) {
      console.error('[Webhook] No api_url configured on alert instance, skipping');
      return;
    }
    const alertMsg = `⚠️ *ALERTA: WhatsApp Desconectado*\n\nInstância *${instanceName}* acabou de desconectar.\n\n📱 Número: ${instance?.phone_number || 'N/A'}\n⏰ ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}\n\n_Reconecte em Configurações > WhatsApp_`;

    try {
      await fetch(`${baseUrl}/send/text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: alertInstance.api_key },
        body: JSON.stringify({ number: ALERT_GROUP_JID, text: alertMsg }),
      });
      console.log(`[Webhook] ✅ Alerta enviado via ${alertInstance.name}`);
    } catch (e) {
      console.error('[Webhook] Falha ao enviar alerta:', e);
    }
  }

  // Log quando reconecta
  if (mappedStatus === 'connected' && previousStatus === 'disconnected') {
    console.log(`[Webhook] ✅ Instância ${instanceName} RECONECTOU!`);
  }
}
