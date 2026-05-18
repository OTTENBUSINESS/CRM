import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
// Carregadas no handler via loadUazapiConfig() — nada hardcoded.
let UAZAPI_URL = "";
let GROUP_JID = "";

interface HealthCheck {
  name: string;
  url: string;
  method: "POST" | "GET";
  body?: any;
  headers?: Record<string, string>;
  expectNotContain?: string;
}

const CHECKS: HealthCheck[] = [
  {
    name: "quiz-api: find_lead",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "find_lead", phone: "5500000000000" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  {
    name: "quiz-api: save_lead",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "save_lead", phone: "5500000000001", name: "__healthcheck__" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  {
    name: "quiz-api: pain_save_registration",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "pain_save_registration", phone: "5500000000002" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  {
    name: "quiz-api: pain_find_registration",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "pain_find_registration", phone: "5500000000002" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  {
    name: "quiz-api: hr_find_candidate",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "hr_find_candidate", email: "healthcheck@test.com" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  {
    name: "quiz-api: onboarding_find",
    url: `${SUPABASE_URL}/functions/v1/quiz-api`,
    method: "POST",
    body: { action: "onboarding_find", form_token: "__healthcheck__" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "Unknown action",
  },
  // AI Sales Agent — verificar se não está com BOOT_ERROR
  {
    name: "ai-sales-agent: process_queue",
    url: `${SUPABASE_URL}/functions/v1/ai-sales-agent`,
    method: "POST",
    body: { action: "process_queue" },
    headers: { "Content-Type": "application/json" },
    expectNotContain: "BOOT_ERROR",
  },
];

// ==================== WHATSAPP INSTANCE MONITORING ====================

// Cooldown: só alerta 1x quando desconecta. Depois lembra a cada 2h.
const ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 horas

async function checkWhatsAppInstances(supabase: any): Promise<string[]> {
  const failures: string[] = [];

  // Buscar todas as instâncias que deveriam estar conectadas
  const { data: instances } = await supabase
    .from("whatsapp_instances")
    .select("id, name, api_key, status, teams, metadata")
    .not("teams", "eq", "{}"); // Só instâncias com team atribuído (ativas)

  if (!instances || instances.length === 0) return failures;

  for (const inst of instances) {
    try {
      // Consultar status REAL na UAZAPI
      const res = await fetch(`${UAZAPI_URL}/instance/status`, {
        method: "GET",
        headers: { Accept: "application/json", token: inst.api_key },
      });
      const data = await res.json();
      const realStatus = data?.instance?.status;

      if (realStatus === "disconnected" || realStatus === "close") {
        const reason = data?.instance?.lastDisconnectReason || "desconhecido";
        const lastDisconnect = data?.instance?.lastDisconnect || "";
        const meta = inst.metadata || {};
        const lastAlertedAt = meta.last_disconnect_alert ? new Date(meta.last_disconnect_alert).getTime() : 0;
        const now = Date.now();

        // Atualizar banco se estava como connected
        if (inst.status === "connected") {
          await supabase
            .from("whatsapp_instances")
            .update({
              status: "disconnected",
              metadata: { ...meta, last_disconnect_alert: new Date().toISOString() },
              updated_at: new Date().toISOString(),
            })
            .eq("id", inst.id);

          // Primeira vez desconectando — alertar
          failures.push(
            `📱 *${inst.name}*: DESCONECTOU AGORA\n   Motivo: ${reason}\n   Desde: ${lastDisconnect ? new Date(lastDisconnect).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "?"}`
          );
        } else if (now - lastAlertedAt > ALERT_COOLDOWN_MS) {
          // Já estava desconectada — lembrete a cada 2h
          await supabase
            .from("whatsapp_instances")
            .update({
              metadata: { ...meta, last_disconnect_alert: new Date().toISOString() },
            })
            .eq("id", inst.id);

          const hoursDown = lastDisconnect
            ? Math.round((now - new Date(lastDisconnect).getTime()) / 3600000)
            : "?";

          failures.push(
            `⚠️ *${inst.name}*: ainda desconectada há ${hoursDown}h\n   Reconectar na UAZAPI`
          );
        }
        // Se cooldown não expirou, não alerta (silêncio)
      } else if (realStatus === "connected" || realStatus === "open") {
        // Reconectou — atualizar banco e limpar alerta
        if (inst.status !== "connected") {
          const meta = inst.metadata || {};
          delete meta.last_disconnect_alert;
          await supabase
            .from("whatsapp_instances")
            .update({
              status: "connected",
              metadata: meta,
              updated_at: new Date().toISOString(),
            })
            .eq("id", inst.id);
        }
      }
    } catch (e: any) {
      console.error(`Erro ao checar instância ${inst.name}:`, e.message);
    }
  }

  return failures;
}

// ==================== SEND ALERT ====================

async function sendWhatsAppAlert(message: string, instances: any[]) {
  // Tentar enviar por qualquer instância conectada (fallback se CAROL estiver offline)
  for (const inst of instances) {
    try {
      const res = await fetch(`${UAZAPI_URL}/send/text`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: inst.api_key },
        body: JSON.stringify({ number: GROUP_JID, text: message }),
      });
      const data = await res.json();
      if (!data.error) {
        console.log(`Alert sent via ${inst.name}`);
        return true;
      }
    } catch {}
  }
  console.error("Failed to send alert via any instance");
  return false;
}

// ==================== RUN CHECKS ====================

async function runCheck(check: HealthCheck): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(check.url, {
      method: check.method,
      headers: check.headers,
      body: check.body ? JSON.stringify(check.body) : undefined,
    });

    const text = await res.text();

    if (check.expectNotContain && text.includes(check.expectNotContain)) {
      return { ok: false, error: `Resposta contém "${check.expectNotContain}" — function quebrada` };
    }

    if (res.status >= 502) {
      return { ok: false, error: `HTTP ${res.status} — function offline` };
    }

    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e.message || "Network error" };
  }
}

// ==================== MAIN ====================

Deno.serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Carregar config do banco (nada hardcoded)
  const { data: cfgData } = await supabase
    .from("config")
    .select("key, value")
    .in("key", ["UAZAPI_ADMIN_URL", "HEALTH_CHECK_GROUP_JID"]);
  const cfg = Object.fromEntries((cfgData || []).map((r: any) => [r.key, r.value]));
  UAZAPI_URL = cfg["UAZAPI_ADMIN_URL"] || "";
  GROUP_JID = cfg["HEALTH_CHECK_GROUP_JID"] || "";

  // 1. Checar edge functions
  const results: { name: string; ok: boolean; error?: string }[] = [];
  const failures: string[] = [];

  for (const check of CHECKS) {
    const result = await runCheck(check);
    results.push({ name: check.name, ...result });
    if (!result.ok) {
      failures.push(`❌ ${check.name}: ${result.error}`);
    }
  }

  // 2. Checar instâncias WhatsApp (status real na UAZAPI)
  const instanceFailures = await checkWhatsAppInstances(supabase);
  failures.push(...instanceFailures);

  // 3. Alertar se houver falhas
  if (failures.length > 0) {
    // Buscar instâncias conectadas pra enviar o alerta (fallback)
    const { data: connectedInstances } = await supabase
      .from("whatsapp_instances")
      .select("name, api_key")
      .eq("status", "connected")
      .not("teams", "eq", "{}");

    const alert = `🚨 *ALERTA SISTEMA*\n\n${failures.join("\n\n")}\n\n⏰ ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
    await sendWhatsAppAlert(alert, connectedInstances || []);
    console.error("Health check failures:", failures);
  } else {
    console.log("✅ All checks passed (functions + WhatsApp instances)");
  }

  // 4. Cleanup test data
  try {
    await supabase.from("leads").delete().eq("name", "__healthcheck__");
    await supabase.from("pain_registrations").delete().eq("phone", "5500000000002");
  } catch {}

  return new Response(JSON.stringify({
    status: failures.length === 0 ? "healthy" : "unhealthy",
    checks: results,
    whatsapp_instances: instanceFailures.length === 0 ? "all connected" : instanceFailures,
    timestamp: new Date().toISOString(),
  }), {
    headers: { "Content-Type": "application/json" },
  });
});
