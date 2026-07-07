/**
 * Memory layer — híbrida 3 tiers inspirada em Letta (cs/AGENTS-PLATFORM.md § 6).
 *
 *  1. Core memory     — blocos sempre no system prompt (per-user OU global)
 *  2. Recall memory   — últimas N mensagens (sliding window)
 *  3. Archival memory — busca semântica via pgvector (tool search_memory)
 *  4. Working memory  — rascunho ativo (jsonb em agents_sessions)
 */

import { db } from "../_shared/supabase.ts";
import type { AgentMessage, AgentRegistry, CoreMemoryBlock } from "../_shared/types.ts";

const DEFAULT_SLIDING_WINDOW = 20;

/**
 * Carrega blocos de core memory do agente pro user.
 * Inclui blocos globais (user_id IS NULL) + blocos do user específico.
 */
export async function loadCoreMemory(
  agentId: string,
  userId: string | null,
): Promise<CoreMemoryBlock[]> {
  const query = db
    .from("agents_core_memory")
    .select("block_key, content")
    .eq("agent_id", agentId);

  // Blocos globais (user_id NULL) OU do user específico.
  // Valida UUID antes de interpolar no .or() — userId malformado quebraria
  // o filtro PostgREST silenciosamente (retornaria vazio ou erro).
  const isValidUuid = typeof userId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId);
  const { data } = isValidUuid
    ? await query.or(`user_id.is.null,user_id.eq.${userId}`)
    : await query.is("user_id", null);

  return (data as CoreMemoryBlock[]) || [];
}

/**
 * Renderiza core memory pro system prompt.
 */
export function renderCoreMemory(blocks: CoreMemoryBlock[]): string {
  if (blocks.length === 0) return "";
  return blocks
    .map((b) => `[CORE MEMORY: ${b.block_key}]\n${b.content}`)
    .join("\n\n");
}

/**
 * Carrega últimas N mensagens da sessão (recall memory + sliding window).
 * Ordem cronológica (mais antiga primeiro).
 *
 * FIX: sanitiza histórico se cortar entre tool_use/tool_result órfãos
 * (Anthropic rejeita histórico que começa com tool_result sem assistente anterior
 *  OU termina com assistant tool_use sem tool_result subsequente).
 */
export async function loadRecallMemory(
  sessionId: string,
  agent: AgentRegistry,
): Promise<AgentMessage[]> {
  const limit = agent.settings?.sliding_window ?? DEFAULT_SLIDING_WINDOW;

  const { data } = await db
    .from("agents_messages")
    .select("id, session_id, role, content, tool_calls, tool_call_id, status")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(limit);

  const msgs = ((data as AgentMessage[]) || []).reverse();
  return sanitizeOrphans(msgs);
}

/**
 * Remove tool_results órfãos (sem assistant tool_use anterior) do INÍCIO
 * e assistant tool_use órfãos (sem tool_result subsequente) do FIM.
 *
 * Anthropic rejeita ambos com erro "messages.X: tool_use_id not found in
 * preceding message" ou "preceding tool_use must be followed by tool_result".
 */
function sanitizeOrphans(msgs: AgentMessage[]): AgentMessage[] {
  if (msgs.length === 0) return msgs;

  let start = 0;
  let end = msgs.length;

  // 1) Pula tool_results órfãos do início (sem assistant tool_use precedente)
  while (start < end && msgs[start].role === "tool") {
    start++;
  }

  // 2) Pula assistant com tool_calls órfãos do fim (sem tool_result subsequente)
  //    O último assistant não pode ter tool_calls sem o tool_result vir depois
  while (end > start) {
    const last = msgs[end - 1];
    if (last.role === "assistant" && last.tool_calls && last.tool_calls.length > 0) {
      // verifica se todos os tool_call_ids têm tool_result subsequente
      const callIds = new Set(last.tool_calls.map((tc) => tc.id));
      const followingTools = msgs.slice(end);
      const respondedIds = new Set(
        followingTools.filter((m) => m.role === "tool" && m.tool_call_id)
                      .map((m) => m.tool_call_id),
      );
      const allResponded = [...callIds].every((id) => respondedIds.has(id));
      if (!allResponded) {
        end--;
        continue;
      }
    }
    break;
  }

  return msgs.slice(start, end);
}

/**
 * Busca semântica em archival memory (pgvector).
 * Retorna top-N facts mais similares à query.
 *
 * Pode ser chamada como TOOL pelo LLM (search_memory(query, k)).
 */
export async function searchArchivalMemory(params: {
  agent_id: string;
  user_id: string | null;
  query_embedding: number[];
  k?: number;
}): Promise<Array<{ fact: string; fact_type: string | null; distance: number }>> {
  const k = params.k ?? 5;

  const { data, error } = await db.rpc("agents_search_archival", {
    p_agent_id: params.agent_id,
    p_user_id: params.user_id,
    p_query_embedding: params.query_embedding,
    p_k: k,
  });

  if (error) {
    // Função RPC ainda não existe — gracefully degrade
    console.warn("[memory] agents_search_archival RPC ausente:", error.message);
    return [];
  }
  return data || [];
}

/**
 * Atualiza working memory da sessão (rascunho ativo).
 * Usado por agentes executores (Gestor de Campanhas etc).
 *
 * FIX: usa RPC `agents_working_memory_merge` com `working_memory || patch` atômico
 * em vez de read-then-write (que perdia dados em invocações concorrentes da mesma
 * sessão — caso burst de mensagens WhatsApp).
 */
export async function updateWorkingMemory(
  sessionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.rpc("agents_working_memory_merge", {
    p_session_id: sessionId,
    p_patch: patch,
  });
  if (error) console.error("[memory] working_memory merge err", error);
}

/**
 * Lê working memory atual.
 */
export async function getWorkingMemory(
  sessionId: string,
): Promise<Record<string, unknown>> {
  const { data } = await db
    .from("agents_sessions")
    .select("working_memory")
    .eq("id", sessionId)
    .single();
  return (data?.working_memory as Record<string, unknown>) || {};
}
