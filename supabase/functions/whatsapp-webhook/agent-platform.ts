/**
 * agent-platform.ts — roteia mensagens UAZAPI pra Plataforma de Agentes V2.
 *
 * Espelha o telegram-webhook: lookup deployment (instância + palavra-chave) → autorização
 * (access_mode + whitelist) → chama agent-runner (lê o SSE) → envia resposta via UAZAPI.
 *
 * Retorna true se a mensagem FOI tratada pela V2 (o caller NÃO segue o fluxo legado).
 * Retorna false se não tratou (segue legado ai-sales-agent intacto).
 *
 * GATED pela flag config.agent_platform_v2_enabled — off = sempre false = legado.
 * Instâncias SEM deployment V2 ativo nunca casam → legado intacto.
 *
 * [Otten] config.value é TEXT (não jsonb): a flag é lida como value === 'true'.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

interface InstanceLike {
  id: string;
  api_url?: string | null;
  api_key?: string | null;
}

export async function tryHandleViaAgentPlatform(args: {
  supabase: any;
  instance: InstanceLike;
  senderPhone: string;
  text: string;
  messageId: string | null;
  leadId?: string | null;
}): Promise<boolean> {
  const { supabase, instance, senderPhone, text, messageId, leadId } = args;
  if (!text || !text.trim()) return false;
  // Ignora placeholders de mídia que não viraram texto/transcrição
  if (text === "[Mídia]") return false;

  // 1. Flag global — off = legado. [Otten] value é TEXT: 'true' liga.
  const { data: cfgRow } = await supabase
    .from("config").select("value").eq("key", "agent_platform_v2_enabled").maybeSingle();
  if (String(cfgRow?.value).trim() !== "true") return false;

  // 2. Lookup deployment (instância + palavra-chave via agent_route_lookup)
  const { data: routeRows, error: routeErr } = await supabase.rpc("agent_route_lookup", {
    p_channel: "whatsapp",
    p_instance_id: instance.id,
    p_ctx: { text },
  });
  if (routeErr) { console.error("[wpp-v2] route err:", routeErr.message); return false; }
  const match = Array.isArray(routeRows) ? routeRows[0] : routeRows;
  if (!match || !match.agent_slug) return false; // nenhum agente V2 nessa instância → legado

  // 3. Config do deployment → autorização
  const { data: dep } = await supabase
    .from("agents_deployments").select("config").eq("id", match.deployment_id).maybeSingle();
  const cfg = (dep?.config || {}) as Record<string, any>;
  const accessMode: string = cfg.access_mode || "open";
  const senderDigits = onlyDigits(senderPhone);

  // Resolve host (api_url) + token da instância pra enviar via UAZAPI (genérico: qualquer host)
  let inst = instance;
  if (!inst.api_url || !inst.api_key) {
    const { data: row } = await supabase
      .from("whatsapp_instances").select("api_url, api_key").eq("id", instance.id).maybeSingle();
    inst = { id: instance.id, api_url: instance.api_url || row?.api_url, api_key: instance.api_key || row?.api_key };
  }

  if (accessMode === "private") {
    const authorized: string[] = (cfg.authorized_numbers || []).map((n: string) => onlyDigits(String(n))).filter(Boolean);
    const ok = authorized.some((a) => a && (senderDigits.endsWith(a) || a.endsWith(senderDigits)));
    if (!ok) {
      // Não autorizado: manda msg padrão (se configurada) e marca como TRATADO (não cai no legado)
      if (cfg.unauthorized_message) await sendUazapi(inst, senderDigits, String(cfg.unauthorized_message));
      console.log(`[wpp-v2] número ${senderDigits} não autorizado (agente ${match.agent_slug}, modo private)`);
      return true;
    }
  }

  // 4. Sessão (1 por número + agente)
  const sessionKey = `whatsapp:${senderDigits}`;
  let sessionId: string | undefined;
  const { data: existing } = await supabase
    .from("agents_sessions").select("id")
    .eq("agent_id", match.agent_id).eq("channel", "whatsapp")
    .contains("provider_state", { external_session_key: sessionKey })
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  sessionId = existing?.id;
  if (!sessionId) {
    const { data: ns } = await supabase
      .from("agents_sessions").insert({
        agent_id: match.agent_id, channel: "whatsapp",
        title: `WhatsApp ${senderDigits}`,
        provider_state: { external_session_key: sessionKey, whatsapp_phone: senderDigits },
      }).select("id").single();
    sessionId = ns?.id;
  }

  // 5. Chama agent-runner e lê o SSE (igual telegram-webhook)
  let fullText = "";
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/agent-runner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}`, "apikey": SERVICE_KEY },
      body: JSON.stringify({
        agent_slug: match.agent_slug,
        channel: "whatsapp",
        session_id: sessionId,
        message: text,
        user_id: null,
        context: {
          instance_id: instance.id,
          whatsapp_phone: senderDigits,
          recipient: senderDigits,
          message_id: messageId,
          lead_id: leadId || null,  // lead já criado pelo webhook — agente usa pra agendar/qualificar
        },
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
      const evs = buf.split("\n\n");
      buf = evs.pop() || "";
      for (const ev of evs) {
        const dl = ev.split("\n").find((l) => l.startsWith("data:"));
        if (!dl) continue;
        try { const d = JSON.parse(dl.slice(5).trim()); if (d.type === "text.delta") fullText += d.delta; } catch { /* ignore */ }
      }
    }
  } catch (e) {
    console.error("[wpp-v2] agent-runner err:", (e as Error).message);
    await sendUazapi(inst, senderDigits, "⚠️ Tive um problema técnico. Tenta de novo daqui a pouco?");
    return true;
  }

  // 6. Envia resposta via UAZAPI (split em ~4000 chars respeitando parágrafos)
  const finalText = fullText.trim() || "Desculpa, não consegui processar agora.";
  for (const chunk of splitText(finalText, 4000)) {
    await sendUazapi(inst, senderDigits, chunk);
  }
  return true;
}

function onlyDigits(s: string): string { return String(s).replace(/\D/g, ""); }

async function sendUazapi(instance: InstanceLike, number: string, text: string): Promise<void> {
  // api_url vem da tabela de instâncias — NUNCA hardcode de URL UAZAPI (regra do projeto)
  const base = (instance.api_url || "").replace(/\/$/, "");
  if (!base) {
    console.error("[wpp-v2] sendUazapi: instance.api_url vazio — configure a URL da instância");
    return;
  }
  try {
    await fetch(`${base}/send/text`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "token": instance.api_key || "" },
      body: JSON.stringify({ number: onlyDigits(number), text }),
    });
  } catch (e) { console.error("[wpp-v2] sendUazapi err:", (e as Error).message); }
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
