/**
 * Typing indicator — envia "digitando..." pro lead durante processamento.
 *
 * Por canal:
 *  - whatsapp (Cloud API): envia POST /messages com typing=true (não suportado oficialmente
 *    pelo Cloud API ainda — placeholder; fica como no-op até que implementemos
 *    via marca de "lida" + presença).
 *  - telegram: chama https://api.telegram.org/bot<token>/sendChatAction action=typing
 *  - outros: no-op
 *
 * Sempre fire-and-forget (não bloqueia se falhar).
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

export interface TypingContext {
  channel: string;
  deployment_config?: Record<string, unknown> | null;
  recipient: {
    telegram_chat_id?: string | number;
    whatsapp_phone?: string;
    whatsapp_message_id?: string;
  };
}

export async function sendTypingIndicator(ctx: TypingContext): Promise<void> {
  try {
    if (ctx.channel === "telegram") return await sendTelegramTyping(ctx);
    if (ctx.channel === "whatsapp") return await sendWhatsAppTyping(ctx);
    // outros canais: no-op
  } catch (e) {
    console.warn("[typing] failed (non-blocking):", (e as Error).message);
  }
}

async function sendTelegramTyping(ctx: TypingContext): Promise<void> {
  const botToken = (ctx.deployment_config as { bot_token?: string } | null)?.bot_token;
  const chatId = ctx.recipient.telegram_chat_id;
  if (!botToken || !chatId) return;

  await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, action: "typing" }),
  }).catch(() => {});
}

async function sendWhatsAppTyping(ctx: TypingContext): Promise<void> {
  // Cloud API agora suporta typing indicator via PUT messages (Beta).
  // Implementação: marca a msg do lead como lida + envia typing.
  const msgId = ctx.recipient.whatsapp_message_id;
  if (!msgId || !SUPABASE_URL || !SERVICE_KEY) return;

  // Reusa edge function send-whatsapp-cloud com action="typing"
  await fetch(`${SUPABASE_URL}/functions/v1/send-whatsapp-cloud`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({ action: "typing", message_id: msgId }),
  }).catch(() => {});
}
