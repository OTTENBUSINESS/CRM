/**
 * agent-jobs-poller — roda a cada 30s via pg_cron.
 *
 * Pra cada job 'processing':
 *   1. Faz status_check (GET na poll_config.url, resolvendo {{external_id}} + credencial)
 *   2. Avalia success_when / failed_when
 *   3. Se done → marca done + result → RESUME (re-dispara agent-runner)
 *   4. Se failed → marca failed → RESUME (com erro)
 *   5. Marca timeouts (jobs > 10min)
 *
 * RESUME: chama agent-runner com mensagem [SISTEMA] + channel + session.
 * O agente comunica o resultado no canal certo (Telegram/WhatsApp/chat).
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "content-type, authorization" };

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  // 1. Marca timeouts primeiro
  let timedOut = 0;
  try {
    const { data } = await supabase.rpc("agent_jobs_mark_timeouts");
    timedOut = (data as number) || 0;
  } catch (e) { console.error("[poller] timeout mark err", e); }

  // 2. Pega jobs processing (limite por ciclo)
  const { data: jobs, error } = await supabase
    .from("agent_jobs")
    .select("*")
    .eq("status", "processing")
    .order("created_at", { ascending: true })
    .limit(20);

  if (error) {
    return json({ error: error.message }, 500);
  }

  const results: any[] = [];

  for (const job of jobs || []) {
    try {
      const outcome = await checkJob(job);
      results.push({ job_id: job.id, ...outcome });
    } catch (e: any) {
      console.error(`[poller] job ${job.id} err:`, e?.message);
      results.push({ job_id: job.id, error: e?.message });
    }
  }

  // 3. Resume jobs já done/failed mas não resumidos (inclui timeouts)
  const { data: toResume } = await supabase
    .from("agent_jobs")
    .select("*")
    .in("status", ["done", "failed", "timeout"])
    .eq("resumed", false)
    .limit(20);

  let resumed = 0;
  for (const job of toResume || []) {
    try {
      await resumeAgent(job);
      await supabase.from("agent_jobs").update({ resumed: true }).eq("id", job.id);
      resumed++;
    } catch (e: any) {
      console.error(`[poller] resume ${job.id} err:`, e?.message);
    }
  }

  // 4. Lembretes proativos que venceram → dispara o agente no canal da conversa
  let reminded = 0;
  const { data: dueReminders } = await supabase.rpc("agent_reminders_due");
  for (const rem of (dueReminders as any[]) || []) {
    try {
      await fireReminder(rem);
      // Marca enviado E reagenda automaticamente se for recorrente (repeat_every_minutes).
      // Lembrete único → só marca sent. Recorrente → cria o próximo disparo sozinho.
      await supabase.rpc("agent_reminder_complete", { p_reminder_id: rem.id });
      reminded++;
    } catch (e: any) {
      console.error(`[poller] reminder ${rem.id} err:`, e?.message);
      await supabase.from("agent_reminders")
        .update({ status: "failed", error: String(e?.message || e) }).eq("id", rem.id);
    }
  }

  return json({ checked: (jobs || []).length, timedOut, resumed, reminded, results });
});

/** Dispara um lembrete: re-aciona o agente no canal da conversa pra entregar a msg. */
async function fireReminder(rem: any) {
  const ctx = rem.resume_context || {};
  const contextMsg =
    `[SISTEMA] Chegou a hora de um lembrete que VOCÊ agendou pra este usuário. ` +
    `Entregue AGORA esta mensagem de forma natural, na sua voz (pode adaptar levemente o tom, mas mantenha o conteúdo):\n\n"${rem.message}"\n\n` +
    `Não chame tools, só mande a mensagem do lembrete.`;

  await fetch(`${SUPABASE_URL}/functions/v1/agent-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({
      agent_slug: await slugFromId(rem.agent_id),
      channel: rem.channel,
      session_id: rem.session_id,
      message: contextMsg,
      user_id: ctx.user_id || null,
      context: {
        lead_id: ctx.lead_id, deal_id: ctx.deal_id, instance_id: ctx.instance_id,
        recipient: ctx.recipient, _system_resume: true,
      },
    }),
  }).then((r) => r.body?.cancel().catch(() => {}));
}

/** Checa status de 1 job via poll_config */
async function checkJob(job: any): Promise<{ status: string }> {
  const poll = job.poll_config || {};

  // ─── Modo 2 passos: descobre o id (se faltar) → checa status pelo id ───
  if (poll.status && typeof poll.status === "object") {
    return await checkJob2Step(job, poll);
  }

  if (!poll.url) {
    // Sem como checar — falha
    await markJob(job.id, "failed", null, "poll_config.url ausente");
    return { status: "failed" };
  }

  // Resolve {{external_id}} na url
  let url = String(poll.url).replace(/\{\{\s*external_id\s*\}\}/g, job.external_id || "");

  // Resolve credencial se job tem provider
  const headers: Record<string, string> = {};
  if (poll.headers) {
    const cred = job.provider ? await getCredential(job.provider) : null;
    for (const [k, v] of Object.entries(poll.headers as Record<string, string>)) {
      headers[k] = resolveCredTemplate(String(v), cred);
    }
  } else if (job.provider) {
    // Default: tenta X-API-Key
    const cred = await getCredential(job.provider);
    if (cred?.api_key) headers["X-API-Key"] = String(cred.api_key);
  }

  const method = (poll.method as string) || "GET";
  const resp = await fetch(url, { method, headers });
  const text = await resp.text();
  let body: any;
  try { body = JSON.parse(text); } catch { body = text; }

  // Incrementa attempts
  await supabase.from("agent_jobs").update({ attempts: (job.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);

  // Avalia condições
  const failedWhen = poll.failed_when as string | undefined;
  const successWhen = poll.success_when as string | undefined;

  if (failedWhen && evalCondition(failedWhen, body)) {
    await markJob(job.id, "failed", body, `Condição de falha: ${failedWhen}`);
    return { status: "failed" };
  }
  if (successWhen && evalCondition(successWhen, body)) {
    const resultField = poll.result_field as string | undefined;
    const result = resultField ? extractField(body, resultField) : body;
    await markJob(job.id, "done", { raw: body, extracted: result }, null);
    return { status: "done" };
  }

  return { status: "still_processing" };
}

/** Poll de 2 passos: descobre o id do recurso (se faltar) → checa status pelo id. */
async function checkJob2Step(job: any, poll: any): Promise<{ status: string }> {
  const discover = poll.discover;
  const status = poll.status;
  const cred = job.provider ? await getCredential(job.provider) : null;
  let externalId: string | null = job.external_id && String(job.external_id).trim() ? String(job.external_id) : null;

  await supabase.from("agent_jobs").update({ attempts: (job.attempts || 0) + 1, updated_at: new Date().toISOString() }).eq("id", job.id);

  // 1. Descobre o id pelo conteúdo (quando ainda não temos)
  if (!externalId && discover) {
    const dHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries((discover.headers as Record<string, string>) || {})) {
      dHeaders[k] = resolveCredTemplate(String(v), cred);
    }
    try {
      const r = await fetch(String(discover.url), { method: String(discover.method || "GET"), headers: dHeaders });
      const t = await r.text();
      let body: any; try { body = JSON.parse(t); } catch { body = t; }
      if (r.ok) {
        externalId = findMatchingId(body, String(discover.id_field || "id"), discover.match_field ? String(discover.match_field) : null, String(discover.match_value || ""));
        if (externalId) await supabase.from("agent_jobs").update({ external_id: externalId }).eq("id", job.id);
      }
    } catch { /* segue na próxima */ }
    if (!externalId) return { status: "still_processing" };
  }
  if (!externalId) return { status: "still_processing" };

  // 2. Checa o status pelo id
  const sUrl = String(status.url).replace(/\{\{\s*external_id\s*\}\}/g, externalId);
  const sHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries((status.headers as Record<string, string>) || {})) {
    sHeaders[k] = resolveCredTemplate(String(v), cred);
  }
  try {
    const r = await fetch(sUrl, { method: String(status.method || "GET"), headers: sHeaders });
    const t = await r.text();
    let body: any; try { body = JSON.parse(t); } catch { body = t; }
    if (!r.ok) return { status: "still_processing" };
    if (status.failed_when && evalCondition(String(status.failed_when), body)) {
      await markJob(job.id, "failed", body, `Condição de falha: ${status.failed_when}`);
      return { status: "failed" };
    }
    if (status.success_when && evalCondition(String(status.success_when), body)) {
      const result = poll.result_field ? extractField(body, String(poll.result_field)) : body;
      await markJob(job.id, "done", { raw: body, extracted: result }, null);
      return { status: "done" };
    }
  } catch { /* segue na próxima */ }
  return { status: "still_processing" };
}

/** Acha o id de um candidato que casa com o match (lida com vários formatos de resposta). */
function findMatchingId(body: unknown, idField: string, matchField: string | null, matchValue: string): string | null {
  const candidates = normalizeToArray(body);
  const mv = (matchValue || "").toLowerCase().trim();
  const fields = matchField ? matchField.split(",").map((s) => s.trim()).filter(Boolean) : [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const id = (c as Record<string, unknown>)[idField];
    if (!id) continue;
    if (fields.length === 0 || !mv) return String(id);
    for (const f of fields) {
      const fieldVal = String((c as Record<string, unknown>)[f] ?? "").toLowerCase();
      if (fieldVal && (fieldVal.includes(mv) || mv.includes(fieldVal.slice(0, 25)))) return String(id);
    }
  }
  return null;
}

function normalizeToArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const key of ["results", "data", "carousels", "items"]) {
      const arr = (body as Record<string, unknown>)[key];
      if (Array.isArray(arr)) return arr;
    }
    return [body];
  }
  return [];
}

async function markJob(id: string, status: string, result: unknown, error: string | null) {
  await supabase.from("agent_jobs").update({
    status, result, error, updated_at: new Date().toISOString(), completed_at: new Date().toISOString(),
  }).eq("id", id);
}

/** Re-dispara o agente com o resultado, no canal certo */
async function resumeAgent(job: any) {
  const ctx = job.resume_context || {};
  let contextMsg: string;

  if (job.status === "done") {
    const result = job.result?.extracted ?? job.result?.raw ?? {};
    contextMsg =
      `[SISTEMA] A tarefa assíncrona "${job.tool_name}" (que você iniciou) FOI CONCLUÍDA com sucesso. ` +
      `Resultado:\n${JSON.stringify(result).slice(0, 4000)}\n\n` +
      `Comunique o usuário com o resultado de forma natural. Se houver URLs de mídia (carrossel, imagem), ` +
      `mostre conforme suas regras (markdown pra imagem, code block carousel pra carrossel).`;
  } else {
    contextMsg =
      `[SISTEMA] A tarefa assíncrona "${job.tool_name}" FALHOU (${job.error || 'erro desconhecido'}). ` +
      `Avise o usuário com honestidade e sugira tentar de novo.`;
  }

  await fetch(`${SUPABASE_URL}/functions/v1/agent-runner`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({
      agent_slug: await slugFromId(job.agent_id),
      channel: job.channel,
      session_id: job.session_id,
      message: contextMsg,
      user_id: ctx.user_id || null,
      context: {
        lead_id: ctx.lead_id, deal_id: ctx.deal_id, instance_id: ctx.instance_id,
        recipient: ctx.recipient, _system_resume: true,
      },
    }),
  }).then((r) => r.body?.cancel().catch(() => {}));
}

// ─────── helpers ───────
async function slugFromId(agentId: string): Promise<string> {
  const { data } = await supabase.from("agents_registry").select("slug").eq("id", agentId).maybeSingle();
  return data?.slug || "";
}

async function getCredential(providerType: string): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.rpc("agent_get_credential_data", { p_provider_type: providerType, p_owner_user_id: null });
  if (!data || (data as any).found !== true) return null;
  return (data as any).data;
}

function resolveCredTemplate(template: string, cred: Record<string, unknown> | null): string {
  return template.replace(/\{\{\s*credential\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, f) => {
    if (!cred || cred[f] === undefined || cred[f] === null) return "";
    return String(cred[f]);
  });
}

/** Avalia condição simples "campo == valor" ou "campo != valor" */
function evalCondition(cond: string, body: any): boolean {
  const m = cond.match(/^\s*([a-zA-Z0-9_.]+)\s*(==|!=)\s*(.+?)\s*$/);
  if (!m) return false;
  const [, path, op, rawVal] = m;
  const actual = extractField(body, path);
  const expected = rawVal.replace(/^['"]|['"]$/g, "");
  if (op === "==") return String(actual) === expected;
  if (op === "!=") return String(actual) !== expected;
  return false;
}

function extractField(obj: unknown, field: string): unknown {
  if (obj === null || obj === undefined) return null;
  let cur: any = obj;
  for (const part of field.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else return null;
  }
  return cur;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
