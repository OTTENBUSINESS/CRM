// ============================================================================
// process-scheduled-messages
// Worker periódico (cron 1min) que envia mensagens da fila wa_scheduled_messages
// via UAZAPI. Lida com texto/imagem/video/audio/documento.
// ============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const BATCH_SIZE = 20;
const MAX_ATTEMPTS = 3;

interface Instance {
  id: string;
  api_key: string;
  api_url: string;
}

interface ScheduledMessage {
  id: string;
  instance_id: string;
  target_jid: string;
  message_type: string;
  content: string | null;
  media_url: string | null;
  attempts: number;
}

async function getInstance(instance_id: string): Promise<Instance | null> {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id, api_key, api_url")
    .eq("id", instance_id)
    .single();
  return (data as Instance) || null;
}

async function sendViaUAZAPI(instance: Instance, msg: ScheduledMessage) {
  const baseHeaders = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "token": instance.api_key,
  };

  let path = "";
  let body: Record<string, unknown> = { number: msg.target_jid };

  switch (msg.message_type) {
    case "text":
      path = "/send/text";
      body.text = msg.content || "";
      break;
    case "image":
      path = "/send/media";
      body.type = "image";
      body.file = msg.media_url;
      body.text = msg.content || "";
      break;
    case "video":
      path = "/send/media";
      body.type = "video";
      body.file = msg.media_url;
      body.text = msg.content || "";
      break;
    case "audio":
      path = "/send/media";
      body.type = "audio";
      body.file = msg.media_url;
      break;
    case "document":
      path = "/send/media";
      body.type = "document";
      body.file = msg.media_url;
      body.text = msg.content || "";
      break;
    default:
      throw new Error(`message_type inválido: ${msg.message_type}`);
  }

  const res = await fetch(`${instance.api_url}${path}`, {
    method: "POST",
    headers: baseHeaders,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`UAZAPI ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return json;
}

async function processOne(msg: ScheduledMessage): Promise<{ ok: boolean; error?: string }> {
  // Lock otimista — marca como sending
  const { data: locked, error: lockErr } = await supabase
    .from("wa_scheduled_messages")
    .update({ status: "sending", attempts: msg.attempts + 1 })
    .eq("id", msg.id)
    .eq("status", "pending")
    .select()
    .single();

  if (lockErr || !locked) {
    return { ok: false, error: "lock falhou" };
  }

  try {
    const instance = await getInstance(msg.instance_id);
    if (!instance) throw new Error("Instância não encontrada");

    const result = await sendViaUAZAPI(instance, msg);
    const messageId =
      result?.id || result?.messageID || result?.message?.id || null;

    await supabase
      .from("wa_scheduled_messages")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        whatsapp_message_id: messageId,
        error: null,
      })
      .eq("id", msg.id);

    return { ok: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    const newStatus =
      msg.attempts + 1 >= MAX_ATTEMPTS ? "failed" : "pending";
    await supabase
      .from("wa_scheduled_messages")
      .update({ status: newStatus, error: errorMsg })
      .eq("id", msg.id);
    return { ok: false, error: errorMsg };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const now = new Date().toISOString();
    const { data: pending, error } = await supabase
      .from("wa_scheduled_messages")
      .select("id, instance_id, target_jid, message_type, content, media_url, attempts")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(BATCH_SIZE);

    if (error) throw error;
    if (!pending || pending.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = await Promise.all(pending.map((m) => processOne(m as ScheduledMessage)));
    const ok = results.filter((r) => r.ok).length;
    const failed = results.length - ok;

    return new Response(
      JSON.stringify({ processed: results.length, ok, failed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[process-scheduled-messages] erro:", err);
    return new Response(
      JSON.stringify({ error: String(err instanceof Error ? err.message : err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
