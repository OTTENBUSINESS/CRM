/**
 * Tool type: HTTP — chama API externa.
 *
 * action_config exemplo:
 *   {
 *     "url": "https://api.exemplo.com/{{path_var}}",
 *     "method": "POST",
 *     "headers": { "Authorization": "Bearer {{credential.api_key}}" },
 *     "body_template": "{ \"name\": \"{{name}}\" }"
 *   }
 *
 * Resolução de variáveis:
 *   {{arg_name}}            → params.arguments[arg_name]
 *   {{credential.field}}    → busca auth_data da credencial vinculada à skill (provider)
 *   {{secret:ENV_VAR}}      → Deno.env.get('ENV_VAR') (legado/fallback)
 *
 * Provider vem de `tool.provider` (skill_catalog.provider). RPC `agent_get_credential_data`
 * resolve qual credencial usar (preferência: owner_user_id > shared > qualquer ativa).
 */

import { db } from "../../_shared/supabase.ts";
import { interpolate, interpolateDeep } from "./template.ts";

const DEFAULT_TIMEOUT_MS = 60_000;

// Cache de credenciais por provider (5min) — evita N RPCs por inferência
const credCache = new Map<string, { data: Record<string, unknown>; cachedAt: number }>();
const CRED_TTL = 5 * 60_000;

export async function execHttpTool(params: {
  action_config: Record<string, unknown>;
  arguments: Record<string, unknown>;
  user_id: string | null;
  /** Slug do provider da skill (ex: 'borapostar') — resolve credencial automática */
  provider?: string | null;
}): Promise<unknown> {
  const cfg = params.action_config;

  // Monta scope completo: args do LLM + user_id + credencial (se aplicável)
  const scope: Record<string, unknown> = {
    ...params.arguments,
    user_id: params.user_id,
  };

  if (params.provider) {
    const credData = await resolveCredential(params.provider, params.user_id);
    if (credData) {
      scope.credential = credData;
    }
  }

  // Interpola URL + headers + body
  let url = interpolateWithSecrets(cfg.url as string, scope);
  const method = ((cfg.method as string) || (interpolateWithSecrets((cfg.method_template as string) || "", scope)) || "GET").toUpperCase();
  const headers = interpolateHeadersDeep((cfg.headers as Record<string, string>) || {}, scope);

  // Adiciona query params se vierem como objeto em scope.query (skill genérica tipo meta_api)
  // OU em cfg.query / cfg.query_template
  const queryFromScope = scope.query as Record<string, unknown> | undefined;
  const queryFromCfg = cfg.query ? interpolateDeep(cfg.query, scope) as Record<string, unknown> : undefined;
  const queryMerged = { ...(queryFromCfg || {}), ...(queryFromScope || {}) };
  if (Object.keys(queryMerged).length > 0) {
    const usp = new URLSearchParams();
    for (const [k, v] of Object.entries(queryMerged)) {
      if (v === undefined || v === null || v === '') continue;
      usp.set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const qs = usp.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE") {
    if (cfg.body_template) {
      body = interpolateWithSecrets(cfg.body_template as string, scope);
    } else if (cfg.body) {
      body = JSON.stringify(interpolateDeep(cfg.body, scope));
    } else if (scope.body && typeof scope.body === 'object') {
      // skill genérica tipo meta_api passa o body como argumento direto
      body = JSON.stringify(scope.body);
    }
    if (body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
  }

  const timeout = Math.min((cfg.timeout_ms as number) || DEFAULT_TIMEOUT_MS, 300_000);
  const initialResp = await doFetch(url, method, headers, body, timeout);

  // ─── Polling síncrono (padrão "dispara → espera ficar pronto") ───
  // Se cfg.poll existe, fica consultando poll.url até ready_when / error_when / timeout.
  // Genérico e config-driven: qualquer API "start + poll" funciona sem código novo.
  // Pra tarefa REALMENTE longa (> ~150s), usar o sistema de jobs assíncrono (cfg.async).
  if (cfg.poll && typeof cfg.poll === "object") {
    return await runPoll(cfg.poll as Record<string, unknown>, scope, initialResp);
  }

  return initialResp;
}

/** Faz 1 request e devolve o body parseado (lança erro se !ok). */
async function doFetch(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | undefined,
  timeout: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { method, headers, body, signal: controller.signal });
    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    if (!res.ok) {
      // Serializa o corpo do erro inteiro e devolve pro LLM com folga (1500 chars).
      // APIs boas (Meta, Stripe) colocam NO ERRO a causa + valores válidos + como corrigir.
      // O agente lê isso e se auto-corrige — por isso não pode cortar curto demais.
      const errBody = typeof parsed === 'string'
        ? parsed
        : (() => { try { return JSON.stringify(parsed); } catch { return String(parsed); } })();
      throw new Error(`HTTP ${res.status} em ${method} ${url}\n${errBody.slice(0, 1500)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Polling síncrono. Consulta poll.url a cada interval_ms até:
 *   - ready_when satisfeita → devolve result_field (ou body inteiro)
 *   - error_when satisfeita → devolve { ok:false, error }
 *   - max_wait_ms estourado → devolve { ok:false, pending:true } (graceful, não quebra)
 *
 * As condições e a URL interpolam {{var}} (args + credencial + campos da resposta inicial).
 * Condição suporta `&&` e operadores ==, !=, ~ (contém, case-insensitive).
 * Tolera erros transitórios do endpoint de status (ex: 500) — só continua tentando.
 */
async function runPoll(
  poll: Record<string, unknown>,
  scope: Record<string, unknown>,
  initialResp: unknown,
): Promise<unknown> {
  // Scope do poll inclui os campos da resposta inicial (ex: {{carousel_id}} se o POST devolveu)
  const pollScope: Record<string, unknown> = {
    ...scope,
    ...(initialResp && typeof initialResp === "object" ? (initialResp as Record<string, unknown>) : {}),
  };

  const interval = Math.max(Number(poll.interval_ms) || 5000, 1000);
  const maxWait = Math.min(Number(poll.max_wait_ms) || 110_000, 130_000);
  const resultField = poll.result_field ? String(poll.result_field) : null;

  // ─── Modo 2-passos: descobre o ID do recurso → checa status pelo ID ───
  // Pra APIs onde o POST nem sempre devolve o id (ex: BoraPostar 202 processing).
  // poll.status presente = modo 2-passos.
  if (poll.status && typeof poll.status === "object") {
    return await runDiscoverPoll(poll, pollScope, interval, maxWait, resultField);
  }

  // ─── Modo single-url (legado): pollar uma URL só até a condição ───
  const url = interpolateWithSecrets(String(poll.url || ""), pollScope);
  if (!url) return initialResp;
  const method = (String(poll.method || "GET")).toUpperCase();
  const headers = interpolateHeadersDeep((poll.headers as Record<string, string>) || {}, pollScope);
  const readyWhen = poll.ready_when ? interpolateWithSecrets(String(poll.ready_when), pollScope) : null;
  const errorWhen = poll.error_when ? interpolateWithSecrets(String(poll.error_when), pollScope) : null;

  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(interval);
    let pollBody: unknown;
    try {
      const r = await fetch(url, { method, headers });
      const t = await r.text();
      try { pollBody = JSON.parse(t); } catch { pollBody = t; }
      if (!r.ok) continue;
    } catch { continue; }
    if (errorWhen && evalPollCond(errorWhen, pollBody)) {
      return { ok: false, error: `[poll] condição de erro atingida: ${errorWhen}`, raw: pollBody };
    }
    if (readyWhen && evalPollCond(readyWhen, pollBody)) {
      return resultField ? extractField(pollBody, resultField) : pollBody;
    }
  }
  return pendingTimeout();
}

/**
 * Poll de 2 passos:
 *   1. id do recurso = poll.id_from_response (da resposta do POST) SE veio
 *   2. senão, descobre via poll.discover (busca + casa pelo hook/título) a cada ciclo
 *   3. com o id, checa poll.status (ready_when / error_when)
 * Nunca devolve dado de recurso que não casou — evita pegar o "errado".
 */
async function runDiscoverPoll(
  poll: Record<string, unknown>,
  pollScope: Record<string, unknown>,
  interval: number,
  maxWait: number,
  resultField: string | null,
): Promise<unknown> {
  const discover = poll.discover as Record<string, unknown> | undefined;
  const status = poll.status as Record<string, unknown>;

  // Tenta o id direto da resposta do POST (caminho rápido/confiável quando vem)
  let resourceId: string | null = null;
  if (poll.id_from_response) {
    const v = extractField(pollScope, String(poll.id_from_response));
    if (v !== null && v !== undefined && String(v).trim()) resourceId = String(v);
  }

  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await sleep(interval);

    // 1. Descobre o id pelo conteúdo (quando o POST não deu id)
    if (!resourceId && discover) {
      try {
        let dUrl = interpolateWithSecrets(String(discover.url || ""), pollScope);
        if (discover.query && typeof discover.query === "object") {
          const qs = new URLSearchParams();
          for (const [k, v] of Object.entries(discover.query as Record<string, unknown>)) {
            qs.set(k, interpolateWithSecrets(String(v), pollScope));
          }
          dUrl += (dUrl.includes("?") ? "&" : "?") + qs.toString();
        }
        const dHeaders = interpolateHeadersDeep((discover.headers as Record<string, string>) || {}, pollScope);
        const r = await fetch(dUrl, { method: String(discover.method || "GET").toUpperCase(), headers: dHeaders });
        const t = await r.text();
        let body: unknown; try { body = JSON.parse(t); } catch { body = t; }
        if (r.ok) {
          const matchVal = discover.match_value ? interpolateWithSecrets(String(discover.match_value), pollScope) : "";
          resourceId = findMatchingId(body, String(discover.id_field || "id"), discover.match_field ? String(discover.match_field) : null, matchVal);
        }
      } catch { /* segue tentando */ }
      if (!resourceId) continue; // ainda não achou o recurso certo
    }
    if (!resourceId) continue;

    // 2. Checa o status pelo id
    const statusScope = { ...pollScope, id: resourceId };
    try {
      const sUrl = interpolateWithSecrets(String(status.url || ""), statusScope);
      const sHeaders = interpolateHeadersDeep((status.headers as Record<string, string>) || {}, statusScope);
      const r = await fetch(sUrl, { method: String(status.method || "GET").toUpperCase(), headers: sHeaders });
      const t = await r.text();
      let body: unknown; try { body = JSON.parse(t); } catch { body = t; }
      if (r.ok) {
        const errW = status.error_when ? interpolateWithSecrets(String(status.error_when), statusScope) : null;
        const okW = status.ready_when ? interpolateWithSecrets(String(status.ready_when), statusScope) : null;
        if (errW && evalPollCond(errW, body)) return { ok: false, error: `[poll] ${errW}`, raw: body };
        if (okW && evalPollCond(okW, body)) return resultField ? extractField(body, resultField) : body;
      }
    } catch { /* segue tentando */ }
  }

  // Estourou o tempo do síncrono → HANDOFF pro job durável (híbrido).
  // Monta um poll_config concreto (hook já resolvido) pro cron continuar de onde paramos.
  // Mantém {{credential.api_key}} / {{external_id}} como template — o poller resolve.
  const handoffPoll: Record<string, unknown> = { result_field: resultField };
  if (discover) {
    let dUrl = interpolateWithSecrets(String(discover.url || ""), pollScope);
    if (discover.query && typeof discover.query === "object") {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(discover.query as Record<string, unknown>)) {
        qs.set(k, interpolateWithSecrets(String(v), pollScope));
      }
      dUrl += (dUrl.includes("?") ? "&" : "?") + qs.toString();
    }
    handoffPoll.discover = {
      url: dUrl,
      method: discover.method || "GET",
      headers: discover.headers || {},
      id_field: discover.id_field || "id",
      match_field: discover.match_field || null,
      match_value: discover.match_value ? interpolateWithSecrets(String(discover.match_value), pollScope) : "",
    };
  }
  handoffPoll.status = {
    url: String(status.url || "").replace(/\{\{\s*id\s*\}\}/g, "{{external_id}}"),
    method: status.method || "GET",
    headers: status.headers || {},
    success_when: status.ready_when || null,
    failed_when: status.error_when || null,
  };
  return {
    __job_handoff: true,
    external_id: resourceId || "",
    poll_config: handoffPoll,
    message:
      "Tá demorando mais que o normal pra renderizar, mas já deixei rodando — vou te avisar AQUI assim que ficar pronto. Pode seguir.",
  };
}

/** Acha o id de um candidato que casa com o match (lida com vários formatos de resposta).
 *  matchField pode ser lista separada por vírgula (ex: "hook_text,title") — casa em qualquer um. */
function findMatchingId(body: unknown, idField: string, matchField: string | null, matchValue: string): string | null {
  const candidates = normalizeToArray(body);
  const mv = (matchValue || "").toLowerCase().trim();
  const fields = matchField ? matchField.split(",").map((s) => s.trim()).filter(Boolean) : [];
  for (const c of candidates) {
    if (!c || typeof c !== "object") continue;
    const id = (c as Record<string, unknown>)[idField];
    if (!id) continue;
    if (fields.length === 0 || !mv) return String(id); // sem critério → primeiro com id
    for (const f of fields) {
      const fieldVal = String((c as Record<string, unknown>)[f] ?? "").toLowerCase();
      if (fieldVal && (fieldVal.includes(mv) || mv.includes(fieldVal.slice(0, 25)))) return String(id);
    }
  }
  return null;
}

/** Normaliza resposta em array de candidatos (lista direta / {results|data|carousels|items} / objeto único). */
function normalizeToArray(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (body && typeof body === "object") {
    for (const key of ["results", "data", "carousels", "items"]) {
      const arr = (body as Record<string, unknown>)[key];
      if (Array.isArray(arr)) return arr;
    }
    return [body]; // objeto único
  }
  return [];
}

/** Resposta padrão quando estoura o tempo — sem vazar dado de recurso que não casou. */
function pendingTimeout(): Record<string, unknown> {
  return {
    ok: false,
    pending: true,
    message:
      "A tarefa ainda não ficou pronta no tempo de espera. NÃO mostre nenhum resultado agora " +
      "(qualquer dado parcial pode ser de OUTRO conteúdo, não o que o usuário pediu). Apenas avise " +
      "com naturalidade que está demorando mais que o normal e que você avisa quando ficar pronto. " +
      "NÃO chame outras tools de status com id adivinhado.",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Avalia condição com suporte a `&&` (todas precisam passar). */
function evalPollCond(cond: string, body: unknown): boolean {
  const parts = cond.split("&&").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return false;
  return parts.every((p) => evalSingleCond(p, body));
}

/** Avalia 1 comparação: `campo OP valor`. OP ∈ {==, !=, ~ (contém)}. */
function evalSingleCond(expr: string, body: unknown): boolean {
  const m = expr.match(/^\s*([a-zA-Z0-9_.[\]]+)\s*(==|!=|~)\s*(.+?)\s*$/);
  if (!m) return false;
  const [, path, op, rawVal] = m;
  const actual = extractField(body, path);
  const expected = rawVal.replace(/^['"]|['"]$/g, "");
  if (op === "==") return String(actual) === expected;
  if (op === "!=") return String(actual) !== expected;
  if (op === "~") return String(actual ?? "").toLowerCase().includes(expected.toLowerCase());
  return false;
}

/** Extrai campo por dot-path (ex: "data.status", "rendered_slides.0"). */
function extractField(obj: unknown, field: string): unknown {
  if (obj === null || obj === undefined) return null;
  let cur: any = obj;
  for (const part of field.replace(/\[(\d+)\]/g, ".$1").split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else return null;
  }
  return cur;
}

/**
 * Resolve credencial de um provider via cache + RPC.
 * Retorna `auth_data` (ex: { api_key, base_url, ... }) ou null se não achar.
 */
async function resolveCredential(
  providerType: string,
  ownerUserId: string | null,
): Promise<Record<string, unknown> | null> {
  const cacheKey = `${providerType}::${ownerUserId || "_"}`;
  const cached = credCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < CRED_TTL) return cached.data;

  const { data, error } = await db.rpc("agent_get_credential_data", {
    p_provider_type: providerType,
    p_owner_user_id: ownerUserId,
  });

  if (error) {
    console.warn(`[tools/http] credencial ${providerType} err:`, error.message);
    return null;
  }
  if (!data || (data as any).found !== true) {
    return null;
  }

  const authData = (data as any).data as Record<string, unknown>;
  credCache.set(cacheKey, { data: authData, cachedAt: Date.now() });
  return authData;
}

/**
 * Interpola string suportando:
 *   {{var}}                → scope[var]
 *   {{credential.field}}   → scope.credential[field]
 *   {{secret:ENV_NAME}}    → Deno.env (legado)
 */
function interpolateWithSecrets(template: string, scope: Record<string, unknown>): string {
  if (!template) return "";

  let result = template;

  // {{secret:NAME}} → env (legado)
  result = result.replace(/\{\{\s*secret:([A-Z0-9_]+)\s*\}\}/g, (_, name) => {
    return Deno.env.get(name) || "";
  });

  // {{credential.field}} → scope.credential[field]
  result = result.replace(/\{\{\s*credential\.([a-zA-Z0-9_]+)\s*\}\}/g, (_, field) => {
    const cred = scope.credential as Record<string, unknown> | undefined;
    if (!cred || cred[field] === undefined || cred[field] === null) return "";
    return String(cred[field]);
  });

  // {{var}} normal via interpolate
  return interpolate(result, scope);
}

function interpolateHeadersDeep(
  headers: Record<string, string>,
  scope: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = interpolateWithSecrets(String(v), scope);
  }
  return out;
}
