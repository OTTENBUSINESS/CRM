import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * WhatsApp Cloud API Webhook
 * Recebe mensagens e status updates da Meta Cloud API.
 *
 * Configurar na Meta:
 * - Webhook URL: https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-cloud-webhook
 * - Verify Token: YOUR_VERIFY_TOKEN
 * - Campos: messages, message_status
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_CLOUD_VERIFY_TOKEN") || "";
const WHATSAPP_TOKEN = Deno.env.get("WHATSAPP_CLOUD_API_TOKEN") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

Deno.serve(async (req) => {
  // CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // ========== WEBHOOK VERIFICATION (GET) ==========
  // Meta envia GET com hub.mode, hub.verify_token, hub.challenge pra validar o webhook
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[Cloud Webhook] Verification successful");
      return new Response(challenge, { status: 200 });
    }

    console.error("[Cloud Webhook] Verification failed — invalid token");
    return new Response("Forbidden", { status: 403 });
  }

  // ========== WEBHOOK EVENTS (POST) ==========
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json();

    // Meta envelopa em object.entry[].changes[].value
    const entries = body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;
        if (!value) continue;

        const metadata = value.metadata;
        const phoneNumberId = metadata?.phone_number_id;

        // Buscar instância oficial pelo phone_number_id
        const { data: instance } = await supabase
          .from("whatsapp_instances")
          .select("id, name")
          .eq("metadata->>phone_number_id", phoneNumberId)
          .maybeSingle();

        // Fallback: buscar por nome
        const instanceId = instance?.id || await getOfficialInstanceId(supabase);

        // ===== MENSAGENS RECEBIDAS =====
        if (value.messages) {
          for (const msg of value.messages) {
            await handleIncomingMessage(supabase, msg, value.contacts, instanceId);
          }
        }

        // ===== STATUS UPDATES (sent, delivered, read) =====
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(supabase, status, instanceId);
          }
        }
      }
    }

    // Meta espera 200 sempre — se retornar erro, reenvia
    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[Cloud Webhook] Error:", err.message);
    // Retornar 200 mesmo com erro pra Meta não reenviar infinitamente
    return new Response(JSON.stringify({ received: true, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ==================== HANDLE INCOMING MESSAGE ====================

async function handleIncomingMessage(supabase: any, msg: any, contacts: any[], instanceId: string | null) {
  const from = msg.from; // número do lead (ex: 5531999999999)
  const msgId = msg.id; // wamid.xxxxx
  const timestamp = msg.timestamp; // unix timestamp
  const msgType = msg.type; // text, image, audio, video, document, reaction, etc

  // Extrair conteúdo baseado no tipo
  let content = "";
  let mediaUrl = null;
  let messageType = "Conversation";

  switch (msgType) {
    case "text":
      content = msg.text?.body || "";
      break;
    case "image":
      content = msg.image?.caption || "[Imagem]";
      mediaUrl = msg.image?.id; // Media ID — precisa buscar URL depois
      messageType = "image";
      break;
    case "audio":
      content = "[Áudio]";
      mediaUrl = msg.audio?.id;
      messageType = "audio";
      break;
    case "video":
      content = msg.video?.caption || "[Vídeo]";
      mediaUrl = msg.video?.id;
      messageType = "video";
      break;
    case "document":
      content = msg.document?.caption || `[Documento: ${msg.document?.filename || ""}]`;
      mediaUrl = msg.document?.id;
      messageType = "document";
      break;
    case "sticker":
      content = "[Sticker]";
      messageType = "sticker";
      break;
    case "reaction":
      // Reações não são mensagens — tratar separadamente se necessário
      console.log(`[Cloud Webhook] Reaction from ${from}: ${msg.reaction?.emoji}`);
      return;
    case "button":
      content = msg.button?.text || "[Botão]";
      break;
    case "interactive":
      content = msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "[Interativo]";
      break;
    default:
      content = `[${msgType}]`;
  }

  // Nome do contato (Meta envia no array contacts)
  const contactName = contacts?.find((c: any) => c.wa_id === from)?.profile?.name || from;
  const cleanPhone = from.replace(/\D/g, "");

  // Se tem mídia, baixar e armazenar no Storage
  let storedMediaUrl: string | null = null;
  if (mediaUrl) {
    storedMediaUrl = await downloadAndStoreMedia(supabase, mediaUrl, msgType);
  }

  // Transcrever áudio com Whisper pra o agente poder ler
  if (msgType === "audio" && storedMediaUrl && OPENAI_API_KEY) {
    const transcription = await transcribeAudio(storedMediaUrl);
    if (transcription) {
      content = transcription;
      console.log(`[Cloud Webhook] Audio transcribed: "${transcription.substring(0, 80)}"`);
    }
  }

  console.log(`[Cloud Webhook] Message from ${contactName} (${cleanPhone}): "${content.substring(0, 50)}"${storedMediaUrl ? ` [media: ${storedMediaUrl}]` : ''}`);

  // Deduplicação: checar se já existe msg com esse message_id
  const { data: existing } = await supabase
    .from("whatsapp_messages")
    .select("id")
    .eq("message_id", msgId)
    .maybeSingle();

  if (existing) {
    console.log(`[Cloud Webhook] Duplicate message ${msgId} — skipping`);
    return;
  }

  // Buscar lead pelo telefone (últimos 8 dígitos)
  const last8 = cleanPhone.slice(-8);
  const { data: lead } = await supabase
    .from("leads")
    .select("id, name")
    .ilike("phone", `%${last8}`)
    .limit(1)
    .maybeSingle();

  const leadId = lead?.id || null;

  // Se não encontrou lead, criar um novo
  let finalLeadId = leadId;
  if (!finalLeadId) {
    const { data: newLead } = await supabase
      .from("leads")
      .insert({
        name: contactName !== cleanPhone ? contactName : cleanPhone,
        phone: cleanPhone,
      })
      .select("id")
      .single();
    finalLeadId = newLead?.id || null;
    console.log(`[Cloud Webhook] Created new lead: ${finalLeadId}`);
  }

  // Salvar mensagem
  const sentAt = timestamp ? new Date(parseInt(timestamp) * 1000).toISOString() : new Date().toISOString();

  const { error } = await supabase.from("whatsapp_messages").insert({
    instance_id: instanceId,
    remote_jid: `${cleanPhone}@s.whatsapp.net`,
    message_id: msgId,
    message_type: messageType,
    content,
    is_from_me: false,
    sent_at: sentAt,
    sender_name: contactName,
    sender_phone: cleanPhone,
    lead_id: finalLeadId,
    media_url: storedMediaUrl || null,
    metadata: { source: "cloud_api", original_type: msgType, cloud_media_id: mediaUrl || null },
  });

  if (error) {
    console.error(`[Cloud Webhook] Error saving message:`, error.message);
    return;
  }

  // Enqueue pra AI agent (mesmo mecanismo do webhook UAZAPI)
  if (finalLeadId && instanceId) {
    // Buscar agente que usa esta instância
    const { data: agent } = await supabase
      .from("ai_sales_agents")
      .select("id")
      .eq("instance_id", instanceId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (agent) {
      await supabase.from("ai_agent_message_queue").insert({
        lead_id: finalLeadId,
        agent_id: agent.id,
        status: "pending",
      });
      console.log(`[Cloud Webhook] Enqueued message for agent ${agent.id}`);
    }
  }
}

// ==================== HANDLE STATUS UPDATE ====================

async function handleStatusUpdate(supabase: any, status: any, instanceId: string | null) {
  const msgId = status.id;
  const statusValue = status.status; // sent, delivered, read, failed
  const recipientId = status.recipient_id;
  const timestamp = status.timestamp;

  // Atualizar status da mensagem no banco
  if (msgId && statusValue) {
    await supabase
      .from("whatsapp_messages")
      .update({
        status: statusValue,
        metadata: supabase.rpc ? undefined : undefined, // Não sobrescrever metadata
      })
      .eq("message_id", msgId);
  }

  // Se falhou, logar o erro
  if (statusValue === "failed" && status.errors) {
    const errorMsg = status.errors.map((e: any) => `${e.code}: ${e.title}`).join(", ");
    console.error(`[Cloud Webhook] Message ${msgId} failed: ${errorMsg}`);
  }
}

// ==================== HELPERS ====================

// Transcrever áudio com OpenAI Whisper
async function transcribeAudio(audioUrl: string): Promise<string | null> {
  try {
    // Baixar áudio do Storage
    const audioRes = await fetch(audioUrl);
    if (!audioRes.ok) return null;
    const audioBlob = await audioRes.blob();

    // Montar multipart form pra Whisper API
    const boundary = `----WhisperBoundary${Date.now()}`;
    const mimeType = audioRes.headers.get("content-type") || "audio/ogg";
    const ext = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";

    // Header parts
    const parts: Uint8Array[] = [];
    const enc = new TextEncoder();

    // model field
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n`));
    // language field
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="language"\r\n\r\npt\r\n`));
    // file field header
    parts.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="audio.${ext}"\r\nContent-Type: ${mimeType}\r\n\r\n`));
    // file content
    parts.push(new Uint8Array(await audioBlob.arrayBuffer()));
    // footer
    parts.push(enc.encode(`\r\n--${boundary}--\r\n`));

    // Concat all parts
    const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
    const body = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      body.set(part, offset);
      offset += part.length;
    }

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
      },
      body,
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[Cloud Webhook] Whisper error:", JSON.stringify(data));
      return null;
    }

    const text = data.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (err: any) {
    console.error("[Cloud Webhook] Transcription error:", err.message);
    return null;
  }
}

// Baixar mídia do Meta Cloud API e salvar no Supabase Storage
async function downloadAndStoreMedia(supabase: any, mediaId: string, msgType: string): Promise<string | null> {
  try {
    // 1. Obter URL de download do media
    const metaRes = await fetch(`https://graph.facebook.com/v22.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    const metaData = await metaRes.json();
    if (!metaData.url) {
      console.error(`[Cloud Webhook] No URL for media ${mediaId}`);
      return null;
    }

    // 2. Baixar o arquivo
    const fileRes = await fetch(metaData.url, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    });
    if (!fileRes.ok) {
      console.error(`[Cloud Webhook] Failed to download media: ${fileRes.status}`);
      return null;
    }
    const fileBlob = await fileRes.blob();
    const mimeType = metaData.mime_type || fileRes.headers.get("content-type") || "application/octet-stream";

    // 3. Determinar extensão
    const extMap: Record<string, string> = {
      "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/amr": "amr",
      "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
      "video/mp4": "mp4", "video/3gpp": "3gp",
      "application/pdf": "pdf",
    };
    const ext = extMap[mimeType] || mimeType.split("/")[1] || "bin";
    const path = `cloud_${Date.now()}_${mediaId.slice(-8)}.${ext}`;

    // 4. Upload pro Storage
    const { error } = await supabase.storage.from("whatsapp-media").upload(path, fileBlob, { contentType: mimeType });
    if (error) {
      console.error(`[Cloud Webhook] Storage upload failed:`, error.message);
      return null;
    }

    const { data: urlData } = supabase.storage.from("whatsapp-media").getPublicUrl(path);
    console.log(`[Cloud Webhook] Media stored: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (err: any) {
    console.error(`[Cloud Webhook] Error downloading media:`, err.message);
    return null;
  }
}

async function getOfficialInstanceId(supabase: any): Promise<string | null> {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id")
    .eq("name", "IAP - OFICIAL")
    .limit(1)
    .maybeSingle();
  return data?.id || null;
}
