/**
 * telegram-webhook — recebe updates do Telegram e roteia pro agente V2.
 *
 * URL: /functions/v1/telegram-webhook/{deploymentId}
 * O deploymentId vem no path (a UI registra essa URL no setWebhook do bot).
 *
 * Fluxo (espelha o agent-platform.ts do WhatsApp):
 *  1. Valida secret_token (header X-Telegram-Bot-Api-Secret-Token)
 *  2. Pega o deployment pelo id → bot_token, access_mode, authorized_users
 *  3. Autoriza o remetente (open / invite_only / private)
 *  4. Sessão por chat_id + agente
 *  5. Chama agent-runner (lê SSE) → envia resposta via Telegram sendMessage
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

serve(async (req) => {
  if (req.method !== "POST") return new Response("ok", { status: 200 });

  // deploymentId no fim do path
  const url = new URL(req.url);
  const deploymentId = url.pathname.split("/").filter(Boolean).pop();
  if (!deploymentId) return new Response("no deployment", { status: 200 });

  let update: any;
  try { update = await req.json(); } catch { return new Response("bad json", { status: 200 }); }

  const msg = update?.message;
  if (!msg || !msg.text) return new Response("no text", { status: 200 }); // ignora não-texto

  const chatId = String(msg.chat?.id);
  const fromId = String(msg.from?.id);
  const fromName = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username || "Telegram";
  const text = String(msg.text);

  try {
    // 1. Deployment + agente
    const { data: dep } = await db
      .from("agents_deployments")
      .select("id, agent_id, config, is_active, agents_registry(slug)")
      .eq("id", deploymentId)
      .maybeSingle();
    if (!dep || !dep.is_active) return ok();

    const cfg = (dep.config || {}) as Record<string, any>;
    const botToken: string = cfg.bot_token;
    if (!botToken) return ok();

    // 2. Valida secret (se configurado)
    if (cfg.webhook_secret) {
      const got = req.headers.get("x-telegram-bot-api-secret-token");
      if (got !== cfg.webhook_secret) return new Response("forbidden", { status: 403 });
    }

    const agentSlug = (dep as any).agents_registry?.slug;
    if (!agentSlug) return ok();

    // 3. Autorização
    const accessMode: string = cfg.access_mode || "open";
    if (accessMode !== "open") {
      const authorized: any[] = cfg.authorized_users || [];
      const isAuth = authorized.some((u) => String(u.telegram_user_id) === fromId);
      if (!isAuth) {
        if (accessMode === "invite_only") {
          // Registra como pendente (aparece na UI pra aprovar) + avisa o user
          const pending: any[] = cfg.pending_users || [];
          if (!pending.some((p) => String(p.telegram_user_id) === fromId)) {
            const newPending = [...pending, {
              telegram_user_id: fromId,
              first_name: fromName,
              username: msg.from?.username || null,
              requested_at: new Date().toISOString(),
            }];
            await db.from("agents_deployments").update({ config: { ...cfg, pending_users: newPending } }).eq("id", deploymentId);
          }
          await sendTelegram(botToken, chatId, "Recebi tua solicitação 👍 Assim que o responsável liberar teu acesso, te respondo.");
        }
        // private: silêncio total
        return ok();
      }
    }

    // 4. Sessão (1 por chat + agente)
    const sessionKey = `telegram:${chatId}`;
    let sessionId: string | undefined;
    const { data: existing } = await db
      .from("agents_sessions").select("id")
      .eq("agent_id", dep.agent_id).eq("channel", "telegram")
      .contains("provider_state", { external_session_key: sessionKey })
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    sessionId = existing?.id;
    if (!sessionId) {
      const { data: ns } = await db.from("agents_sessions").insert({
        agent_id: dep.agent_id, channel: "telegram",
        title: `Telegram ${fromName}`,
        provider_state: { external_session_key: sessionKey, telegram_chat_id: chatId },
      }).select("id").single();
      sessionId = ns?.id;
    }

    // 5. agent-runner → SSE
    let fullText = "";
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-runner`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
        body: JSON.stringify({
          agent_slug: agentSlug, channel: "telegram", session_id: sessionId, message: text, user_id: null,
          context: { telegram_chat_id: chatId, recipient: chatId, deployment_id: deploymentId },
        }),
      });
      if (!res.ok || !res.body) throw new Error(`agent-runner ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const evs = buf.split("\n\n"); buf = evs.pop() || "";
        for (const ev of evs) {
          const dl = ev.split("\n").find((l) => l.startsWith("data:"));
          if (!dl) continue;
          try { const d = JSON.parse(dl.slice(5).trim()); if (d.type === "text.delta") fullText += d.delta; } catch { /* */ }
        }
      }
    } catch (e) {
      console.error("[telegram] agent-runner err:", (e as Error).message);
      await sendTelegram(botToken, chatId, "⚠️ Tive um problema técnico. Tenta de novo daqui a pouco?");
      return ok();
    }

    const finalText = fullText.trim() || "Desculpa, não consegui processar agora.";
    for (const chunk of splitText(finalText, 4000)) {
      await sendTelegram(botToken, chatId, mdToTelegramHtml(chunk));
    }
    return ok();
  } catch (e) {
    console.error("[telegram] error:", (e as Error).message);
    return ok();
  }
});

function ok() { return new Response("ok", { status: 200 }); }

async function sendTelegram(botToken: string, chatId: string, html: string): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    // 1ª tentativa: com HTML (negrito, itálico, links renderizam)
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    if (res.ok) return;
    // Se o Telegram recusou o HTML (tag malformada), reenvia como texto cru (sem tags)
    const plain = html.replace(/<[^>]+>/g, "");
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: plain }),
    });
  } catch (e) { console.error("[telegram] send err:", (e as Error).message); }
}

/**
 * Converte markdown (que o agente escreve) pro HTML que o Telegram entende.
 * Telegram não renderiza markdown padrão (** , #, - ) — só um subconjunto de HTML.
 */
function mdToTelegramHtml(md: string): string {
  // 1. Escapa entidades HTML do texto original (antes de inserir nossas tags)
  let s = md.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  // 2. Blocos de código ```...```
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (_m, code) => `<pre>${code.trim()}</pre>`);
  // 3. Código inline `...`
  s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  // 4. Negrito **...** e __...__
  s = s.replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>");
  s = s.replace(/__([^_\n]+)__/g, "<b>$1</b>");
  // 5. Itálico *...* e _..._ (depois do negrito, evita conflito)
  s = s.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, "$1<i>$2</i>$3");
  s = s.replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, "$1<i>$2</i>$3");
  // 6. Links [texto](url)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  // 7. Cabeçalhos #..# → negrito
  s = s.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");
  // 8. Marcadores de lista - * + → • (mantém quebra de linha)
  s = s.replace(/^\s*[-*+]\s+/gm, "• ");
  // 9. Linha horizontal --- → vazio
  s = s.replace(/^\s*---+\s*$/gm, "");
  return s.trim();
}

function splitText(text: string, max: number): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split("\n\n")) {
    if (cur && (cur + "\n\n" + para).length > max) { out.push(cur); cur = para; }
    else cur = cur ? cur + "\n\n" + para : para;
  }
  if (cur) out.push(cur);
  return out;
}
