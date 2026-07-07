/**
 * Tool type: Edge Function — chama outra Supabase Edge Function.
 *
 * Usa pra lógica complexa que vale isolar (qualify_lead, schedule_meeting, etc).
 *
 * action_config exemplo:
 *   {
 *     "name": "qualify-lead",
 *     "verify_jwt": false
 *   }
 *
 * O body enviado é { arguments, user_id, session_id }.
 */

import { SUPABASE_URL } from "../../_shared/supabase.ts";

const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const DEFAULT_TIMEOUT_MS = 120_000; // 2min — edge functions geralmente respondem em <60s

export async function execEdgeFunctionTool(params: {
  action_config: Record<string, unknown>;
  arguments: Record<string, unknown>;
  user_id: string | null;
  session_id: string | null;
}): Promise<unknown> {
  const cfg = params.action_config;
  const fnName = cfg.name as string;
  if (!fnName) {
    throw new Error("[tools/edge_function] action_config.name obrigatório");
  }

  const url = `${SUPABASE_URL}/functions/v1/${fnName}`;

  // FIX: adicionar timeout — sem AbortController, edge fn travada bloqueia agent-runner
  // até wall clock (400s) matar tudo.
  const timeout = Math.min((cfg.timeout_ms as number) || DEFAULT_TIMEOUT_MS, 300_000);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_KEY}`,
        "apikey": SERVICE_KEY,
      },
      body: JSON.stringify({
        arguments: params.arguments,
        user_id: params.user_id,
        session_id: params.session_id,
      }),
      signal: controller.signal,
    });

    const text = await res.text();
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { parsed = text; }

    if (!res.ok) {
      throw new Error(`[tools/edge_function] ${fnName} ${res.status}: ${String(parsed).slice(0, 500)}`);
    }
    return parsed;
  } finally {
    clearTimeout(timeoutId);
  }
}
