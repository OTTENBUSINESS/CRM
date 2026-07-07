/**
 * Logging estruturado em agents_logs.
 * Sampling configurável (default 10% em prod via env).
 */

import { db } from "../_shared/supabase.ts";
import { redactPII } from "./safety.ts";
import type { AgentRegistry, AgentRunUsage } from "../_shared/types.ts";

const DEFAULT_SAMPLE_RATE = parseFloat(
  Deno.env.get("AGENT_LOG_SAMPLE_RATE") || "1.0",
);

export interface LogEntry {
  agent: Pick<AgentRegistry, "id" | "provider" | "model" | "settings">;
  session_id: string | null;
  user_id: string | null;
  usage?: AgentRunUsage;
  latency_ms: number;
  ttft_ms?: number;
  cost_brl?: number;
  status_code: number;
  error?: string;
}

/**
 * Decide se a chamada será gravada (sampling).
 * - Erros: sempre 100% (overrride sampling).
 * - Sucesso: sample_rate do agent.settings ou env.
 */
function shouldSample(entry: LogEntry): boolean {
  if (entry.status_code >= 400 || entry.error) return true;
  const rate = entry.agent.settings?.log_sample_rate ?? DEFAULT_SAMPLE_RATE;
  return Math.random() < rate;
}

/**
 * Grava log estruturado de uma chamada ao LLM.
 * Fire-and-forget — nunca bloqueia caller.
 */
export function logAgentCall(entry: LogEntry): void {
  const sampled = shouldSample(entry);
  if (!sampled) return;

  db.from("agents_logs")
    .insert({
      agent_id: entry.agent.id,
      session_id: entry.session_id,
      user_id: entry.user_id,
      provider: entry.agent.provider,
      model: entry.agent.model,
      input_tokens: entry.usage?.input_tokens ?? null,
      output_tokens: entry.usage?.output_tokens ?? null,
      cached_tokens: entry.usage?.cached_tokens ?? null,
      latency_ms: entry.latency_ms,
      ttft_ms: entry.ttft_ms ?? null,
      cost_brl: entry.cost_brl ?? null,
      status_code: entry.status_code,
      error: entry.error ? redactPII(entry.error).slice(0, 500) : null,
      sampled: true,
    })
    .then(({ error }) => {
      if (error) console.error("[agent-runner] log insert err", error);
    });
}
