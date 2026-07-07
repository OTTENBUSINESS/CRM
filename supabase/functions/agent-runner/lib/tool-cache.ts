/**
 * Tool Result Cache — evita re-execução de tools idênticas dentro de uma sessão.
 *
 * Pattern TVCACHE (paper 2026): agentes frequentemente repetem mesma tool call
 * com mesmos args. Cache reduz tokens (mesmo result entra no contexto sem re-executar).
 *
 * REGRA DE OURO: só cacheia tools READ-ONLY (action_type = 'sql' com SELECT only,
 * 'http' GET, etc). NUNCA cacheia tools stateful (UPDATE, send_whatsapp, etc).
 *
 * TTL: 5 minutos.
 * Escopo: por sessão (não vaza entre sessões).
 */

import type { AgentTool, ToolCall } from "../_shared/types.ts";

const TTL_MS = 5 * 60 * 1000; // 5 minutos
const MAX_ENTRIES_PER_SESSION = 50;

interface CacheEntry {
  result: unknown;
  cachedAt: number;
}

// Cache em memória (compartilhado entre invocações da mesma edge function instance)
const cache = new Map<string, CacheEntry>();

/**
 * Determina se uma tool é READ-ONLY (cacheable).
 * Regras:
 *  - action_type 'sql' COM function que começa com agent_query_, agent_execute_readonly,
 *    agent_skill_, agent_describe_, agent_list_, search_, list_, get_
 *  - action_type 'http' COM method GET
 *  - tools com nome começando com get_, list_, search_, find_, describe_, query_
 */
export function isReadOnlyTool(tool: AgentTool): boolean {
  const name = tool.name.toLowerCase();
  if (name.startsWith("execute_sql")) return true;
  if (name.startsWith("get_") || name.startsWith("list_") || name.startsWith("search_") ||
      name.startsWith("find_") || name.startsWith("describe_") || name.startsWith("query_")) {
    return true;
  }
  if (tool.action_type === "sql") {
    const cfg = (tool.action_config as Record<string, unknown>) || {};
    const fnName = (cfg.function as string) || "";
    return /^(agent_(query_|execute_readonly|skill_my|skill_now|describe|list|search))/.test(fnName);
  }
  if (tool.action_type === "http") {
    const cfg = (tool.action_config as Record<string, unknown>) || {};
    const method = ((cfg.method as string) || "GET").toUpperCase();
    return method === "GET";
  }
  return false;
}

function makeKey(sessionId: string, toolName: string, args: Record<string, unknown>): string {
  // hash determinístico de args (ordem-independente)
  const sorted = JSON.stringify(args, Object.keys(args || {}).sort());
  return `${sessionId}::${toolName}::${sorted}`;
}

export function getCachedToolResult(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
): unknown | null {
  const key = makeKey(sessionId, toolName, args);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

export function setCachedToolResult(
  sessionId: string,
  toolName: string,
  args: Record<string, unknown>,
  result: unknown,
): void {
  const key = makeKey(sessionId, toolName, args);
  cache.set(key, { result, cachedAt: Date.now() });

  // Limita tamanho do cache (LRU básico)
  const sessionEntries = Array.from(cache.keys()).filter((k) => k.startsWith(`${sessionId}::`));
  if (sessionEntries.length > MAX_ENTRIES_PER_SESSION) {
    // Remove os mais antigos da sessão
    const sorted = sessionEntries
      .map((k) => ({ k, t: cache.get(k)?.cachedAt || 0 }))
      .sort((a, b) => a.t - b.t)
      .slice(0, sessionEntries.length - MAX_ENTRIES_PER_SESSION);
    for (const { k } of sorted) cache.delete(k);
  }
}

/** Limpa entradas expiradas (housekeeping ocasional) */
export function cleanupExpiredEntries(): number {
  const now = Date.now();
  let removed = 0;
  for (const [k, v] of cache.entries()) {
    if (now - v.cachedAt > TTL_MS) {
      cache.delete(k);
      removed++;
    }
  }
  return removed;
}
