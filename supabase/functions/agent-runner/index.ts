/**
 * agent-runner — orquestrador genérico de agentes da plataforma IAP.
 *
 * Handler:
 *  1. Carrega config do agente (agents_registry + agents_tools)
 *  2. Cria ou reusa sessão (agents_sessions)
 *  3. Constrói system prompt (agent + core memory + auto-context)
 *  4. Carrega histórico (recall memory, sliding window)
 *  5. Chama LLM via dispatcher de provider
 *  6. Loop: se LLM pediu tool, executa + alimenta resultado de volta
 *  7. Persiste msgs + atualiza session
 *  8. Loga em agents_logs (sampling)
 *
 * Body esperado:
 *   {
 *     agent_slug:  string,          // 'heitor', 'gestor-meta', etc
 *     channel:     string,          // 'whatsapp' | 'chat_web' | ...
 *     session_id?: string,          // null = nova sessão
 *     message:     string,
 *     user_id?:    string,
 *     context?:    Record<string, unknown>  // auto-context (route, etc)
 *   }
 *
 * Stream pro cliente: SSE com eventos session.info | text.delta | tool.start | tool.end | done | error
 *
 * Ver cs/AGENTS-PLATFORM.md pra arquitetura completa.
 */

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { db } from "./_shared/supabase.ts";
import { corsHeaders, corsResponse } from "./_shared/cors.ts";
import { makeSseWriter, sseResponseHeaders } from "./_shared/sse.ts";
import type {
  AgentMessage,
  AgentRegistry,
  AgentRunRequest,
  AgentTool,
  ToolCall,
} from "./_shared/types.ts";
import { loadCoreMemory, loadRecallMemory, renderCoreMemory } from "./lib/memory.ts";
import { callProvider } from "./lib/providers/index.ts";
import { executeTool } from "./lib/tools/executor.ts";
import { logAgentCall } from "./lib/logging.ts";
import { stripInternalThinking } from "./lib/safety.ts";
import { resolveHumanization, waitDebounce } from "./lib/humanization/index.ts";
import { buildAutoContext } from "./lib/auto-context.ts";

const DEFAULT_MAX_TOOL_ITERATIONS = 20; // safety net contra loop infinito (era 8, baixo demais pra agentes que exploram

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return corsResponse();

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  let payload: AgentRunRequest;
  try {
    payload = await req.json();
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  if (!payload.agent_slug || !payload.message) {
    return jsonError("agent_slug + message obrigatórios", 400);
  }

  // ────────── 1. Carrega agente ──────────
  const { data: agentRow, error: agentErr } = await db
    .from("agents_registry")
    .select("*")
    .eq("slug", payload.agent_slug)
    .eq("is_active", true)
    .maybeSingle();

  if (agentErr || !agentRow) {
    return jsonError(`Agente '${payload.agent_slug}' não encontrado`, 404);
  }
  const agent = agentRow as AgentRegistry;

  // Tools
  const { data: toolsData } = await db
    .from("agents_tools")
    .select("*")
    .eq("agent_id", agent.id)
    .eq("is_active", true);
  const tools = (toolsData as AgentTool[]) || [];

  // ────────── 2. Sessão ──────────
  let sessionId = payload.session_id || null;
  if (!sessionId) {
    const { data: newSession, error: sessErr } = await db
      .from("agents_sessions")
      .insert({
        agent_id: agent.id,
        user_id: payload.user_id || null,
        channel: payload.channel || "chat_web",
        title: payload.message.slice(0, 80),
        status: "active",
      })
      .select("id")
      .single();
    if (sessErr || !newSession) {
      return jsonError(`Erro criando sessão: ${sessErr?.message}`, 500);
    }
    sessionId = newSession.id;
  }

  // ────────── 2.5 Humanização: debounce ANTES do LLM (in-memory) ──────────
  // Se o canal tá humanizado, espera janela de N seg pra agrupar msgs do mesmo lead.
  // Quem chega DEPOIS do leader vira "follower" — só anexa e retorna 204.
  // Pra chat_web humanização é OFF por default — fluxo segue direto.
  const humanization = resolveHumanization(
    agent.settings as Record<string, unknown> | null,
    payload.channel || "chat_web",
  );

  if (humanization && humanization.debounce_seconds > 0 && sessionId) {
    const debounceKey = `${agent.id}:${sessionId}`;
    const { messages, isLeader } = await waitDebounce(
      debounceKey,
      payload.message,
      humanization.debounce_seconds,
    );

    if (!isLeader) {
      // Outra invocação leader já está processando — só anexamos e saímos
      return new Response(
        JSON.stringify({ debounced: true, role: "follower" }),
        { status: 204, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // Junta TODAS as msgs do lead recebidas na janela (1 ou mais)
    if (messages.length > 1) {
      payload.message = messages.join("\n");
    }
  }

  // ────────── 3. System prompt ──────────
  const coreMem = await loadCoreMemory(agent.id, payload.user_id || null);
  const coreMemText = renderCoreMemory(coreMem);
  const autoContext = renderAutoContext(payload.context);

  // FIX #38: interpola {{user_id}} no system_prompt antes de mandar pro LLM.
  // Quando canal externo (Telegram/WhatsApp), user_id=null → SQL viraria
  // "WHERE sales_rep_id = '{{user_id}}'" literal e quebraria.
  // Agora: se user_id existe → injeta o UUID; se null → instrução semântica.
  const userIdContext = payload.user_id
    ? payload.user_id
    : "NÃO_DISPONÍVEL (canal externo). Identifique o usuário pelo nome ou pergunte antes de filtrar por sales_rep_id";

  let interpolatedSystemPrompt = (agent.system_prompt || "").replace(
    /\{\{\s*user_id\s*\}\}/g,
    userIdContext,
  );

  // Interpola template_variables ({{tone_of_voice}}, {{brand_name}}, etc).
  // Valor: settings.template_values[var] (mentorado configurou) OU default da var.
  // Sem isso, o prompt fica com "{{tone_of_voice}}" literal e o agente não sabe tom/nicho.
  const templateVars = ((agent as { template_variables?: Array<{ name: string; default?: string }> }).template_variables) || [];
  const templateValues = ((agent.settings as { template_values?: Record<string, string> } | null)?.template_values) || {};
  for (const tv of templateVars) {
    if (!tv?.name) continue;
    const value = templateValues[tv.name] ?? tv.default ?? "";
    interpolatedSystemPrompt = interpolatedSystemPrompt.replace(
      new RegExp(`\\{\\{\\s*${tv.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"),
      value,
    );
  }

  // Auto-context derivado do agent.settings (closer_pool com UUIDs, ICP, working hours)
  // Crítico: sem isso o LLM não sabe os UUIDs dos closers e passa "frank" em vez do uuid
  // → tools como check_availability/schedule_meeting falham com invalid_uuid.
  const settingsAutoCtx = await buildAutoContext({
    settings: agent.settings as Record<string, unknown> | null,
    channel: payload.channel || "chat_web",
    context: payload.context as Record<string, unknown> | null | undefined,
    agent_id: agent.id,
  });

  // Filosofia agêntica — injetada AUTOMATICAMENTE em todo agente que tem tools.
  // Não é decoração de prompt: é o comportamento de auto-correção que diferencia
  // um agente que "decora receita" de um que "descobre o caminho". Vale pra
  // QUALQUER tool/API (Meta, Google, SQL, etc), por isso fica no runner, não no prompt.
  const AGENTIC_CORE = tools.length > 0
    ? `## Como você usa ferramentas (regra de comportamento)
- Erro de ferramenta é INFORMAÇÃO, não fim. Leia a mensagem de erro com atenção — APIs boas dizem no erro o que está errado, os valores válidos e como corrigir. Ajuste os parâmetros e tente de novo.
- NÃO desista na primeira falha. NÃO peça ajuda ao usuário por dificuldade técnica antes de tentar 2-3 abordagens diferentes. Só peça input humano para decisões de negócio (qual conta, aprovar gasto, escolher entre opções).
- Resultado vazio ([], 0 linhas) nem sempre significa "não existe" — pode ser filtro, período ou agregação errados. Reformule a consulta antes de concluir.
- Nunca afirme um número ou fato sem ter executado a ferramenta e visto o resultado real. Se não rodou ainda, diga que vai verificar e rode.
- A descrição de cada ferramenta traz como usá-la corretamente. Releia-a quando algo falhar.`
    : "";

  const systemPrompt = [
    interpolatedSystemPrompt,
    AGENTIC_CORE,
    coreMemText,
    settingsAutoCtx,
    autoContext,
  ].filter(Boolean).join("\n\n");

  // ────────── 4. Histórico (recall memory) ──────────
  const history = await loadRecallMemory(sessionId, agent);

  // ────────── 5. SSE stream pro cliente ──────────
  const t0 = Date.now();
  let ttftMs: number | undefined;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const writer = makeSseWriter(controller);

      // Avisa cliente do session_id
      writer.write({ type: "session.info", session_id: sessionId! });

      // Salva user message — EXCETO quando é resume interno do sistema
      // (lembrete agendado / job async). A instrução [SISTEMA] é só pro LLM
      // daquele turno; não deve virar mensagem visível no histórico.
      const isSystemResume = (payload.context as { _system_resume?: boolean } | null | undefined)?._system_resume === true;
      // Anexos da mensagem atual (imagens) — passados pro provider e salvos em raw
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      if (!isSystemResume) {
        // Anexa markdown da(s) imagem(ns) no content pra ficar visível no histórico ao recarregar
        const attachmentMd = attachments
          .filter((a) => a?.type === 'image' && a.url)
          .map((a) => `![${a.name || 'imagem'}](${a.url})`)
          .join('\n');
        const displayContent = [attachmentMd, payload.message].filter(Boolean).join('\n\n');
        await db.from("agents_messages").insert({
          session_id: sessionId,
          role: "user",
          content: displayContent,
          status: "completed",
          raw: attachments.length ? { attachments } : null,
        });
      }

      // Ferramentas nativas do provider ligadas no agente (web_search, etc)
      const nativeTools = Array.isArray((agent.settings as { native_tools?: string[] } | null)?.native_tools)
        ? (agent.settings as { native_tools: string[] }).native_tools
        : [];

      let currentHistory: AgentMessage[] = [...history];
      let userMsgForCall: string = payload.message;
      // Teto de iterações configurável por agente (settings.max_tool_iterations).
      // Agentes que exploram muito (gestor de tráfego diagnosticando N campanhas)
      // podem precisar de mais; agentes simples ficam no default. Clamp 1..40.
      const MAX_TOOL_ITERATIONS = Math.max(
        1,
        Math.min(40, Number((agent.settings as { max_tool_iterations?: number } | null)?.max_tool_iterations) || DEFAULT_MAX_TOOL_ITERATIONS),
      );
      let iteration = 0;
      let totalUsage = { input_tokens: 0, output_tokens: 0, cached_tokens: 0 };
      let totalCost = 0;
      let firstDelta = true;

      try {
        // Loop de tool calling
        while (iteration < MAX_TOOL_ITERATIONS) {
          iteration++;

          const result = await callProvider({
            agent,
            systemPrompt,
            tools,
            nativeTools,
            history: currentHistory,
            newUserMessage: userMsgForCall,
            // Só envia anexos NA PRIMEIRA iteração (depois é só tool result + texto)
            newUserAttachments: iteration === 1 ? attachments : [],
            onTextDelta: (delta) => {
              if (firstDelta) {
                ttftMs = Date.now() - t0;
                firstDelta = false;
              }
              writer.write({ type: "text.delta", delta });
            },
          });

          totalUsage.input_tokens += result.usage.input_tokens;
          totalUsage.output_tokens += result.usage.output_tokens;
          totalUsage.cached_tokens += result.usage.cached_tokens || 0;
          totalCost += result.cost_brl;

          // Persiste assistant message
          // FIX: cap em raw + redactPII pra não vazar dados sensíveis no banco
          const cleanedText = stripInternalThinking(result.text);
          const rawCapped = capRaw(result.raw);
          const { data: assistantMsg, error: insertErr } = await db
            .from("agents_messages")
            .insert({
              session_id: sessionId,
              role: "assistant",
              content: cleanedText,
              tool_calls: result.tool_calls.length > 0 ? result.tool_calls : null,
              token_count: result.usage.output_tokens,
              cost_brl: result.cost_brl,
              status: "completed",
              raw: rawCapped,
            })
            .select()
            .single();

          // FIX: throwOnError implícito — se insert falhar, não jogamos null no histórico
          if (insertErr || !assistantMsg) {
            throw new Error(`Falha ao persistir assistant message: ${insertErr?.message || "null returned"}`);
          }

          // Atualiza histórico in-memory
          currentHistory = [
            ...currentHistory,
            ...(userMsgForCall ? [{ role: "user", content: userMsgForCall } as AgentMessage] : []),
            assistantMsg as AgentMessage,
          ];

          // Se não pediu tool, terminou
          if (result.tool_calls.length === 0) break;

          // FIX: Promise.allSettled — falha de uma tool não derruba o batch
          const toolResults = await Promise.allSettled(
            result.tool_calls.map(async (call: ToolCall) => {
              const tool = tools.find((t) => t.name === call.name);
              if (!tool) {
                writer.write({
                  type: "tool.end",
                  tool: call.name,
                  error: `Tool '${call.name}' não encontrada`,
                });
                return { call, output: { error: `Tool '${call.name}' não encontrada` }, status: "failed" as const };
              }

              writer.write({ type: "tool.start", tool: call.name, arguments: call.arguments });

              const execResult = await executeTool({
                tool,
                call,
                agent_id: agent.id,
                session_id: sessionId!,
                user_id: payload.user_id || null,
                runtime_context: {
                  // Channel + tudo do payload.context (lead_id, deal_id, instance_id, message_id, etc)
                  channel: payload.channel || "chat_web",
                  ...(payload.context as Record<string, unknown> | null | undefined || {}),
                },
              });

              writer.write({
                type: "tool.end",
                tool: call.name,
                output: execResult.status === "success" ? execResult.output : undefined,
                error: execResult.error,
              });

              return { call, output: execResult.output, status: execResult.status };
            }),
          );

          // Persiste tool result messages
          for (const settled of toolResults) {
            // Promise.allSettled: cada item é { status: 'fulfilled' | 'rejected', value/reason }
            const tr = settled.status === "fulfilled"
              ? settled.value
              : { call: { id: "unknown", name: "unknown", arguments: {} }, output: { error: String(settled.reason) }, status: "failed" as const };

            // Trunca tool result grande (protege custo + janela de contexto).
            // 8000 chars ≈ 2000 tokens — suficiente pra interpretar, sem fritar fatura.
            // Aviso é instrução pro LLM refinar a query em vez de pedir tudo de novo.
            const contentStr = typeof tr.output === "string" ? tr.output : JSON.stringify(tr.output);
            const TOOL_RESULT_LIMIT = 8000;
            const cappedContent = contentStr.length > TOOL_RESULT_LIMIT
              ? contentStr.slice(0, TOOL_RESULT_LIMIT) +
                `\n\n…[resultado truncado: ${contentStr.length} chars, mostrando ${TOOL_RESULT_LIMIT}. ` +
                `Se precisar de mais, refine a query (filtros, LIMIT menor, menos campos) em vez de repetir.]`
              : contentStr;

            const { data: toolMsg, error: toolInsertErr } = await db
              .from("agents_messages")
              .insert({
                session_id: sessionId,
                role: "tool",
                content: cappedContent,
                tool_call_id: tr.call.id,
                status: "completed",
              })
              .select()
              .single();
            if (toolInsertErr || !toolMsg) {
              throw new Error(`Falha ao persistir tool message: ${toolInsertErr?.message || "null returned"}`);
            }
            currentHistory.push(toolMsg as AgentMessage);
          }

          // No próximo loop, LLM continua sem nova user msg
          userMsgForCall = "";
        }

        if (iteration >= MAX_TOOL_ITERATIONS) {
          // FIX: ao bater limit, fazer chamada FINAL sem tools — força LLM a
          // responder com o que conseguiu coletar até aqui, em vez de cortar feio.
          try {
            const finalResult = await callProvider({
              agent,
              systemPrompt: systemPrompt +
                "\n\n[SISTEMA: Você atingiu o limite de tool calls. Responda AGORA com o que coletou até aqui, sem chamar mais nenhuma tool. Resuma honestamente o que conseguiu E o que faltou.]",
              tools: [], // sem tools = força resposta final
              history: currentHistory,
              newUserMessage: "",
              onTextDelta: (delta) => writer.write({ type: "text.delta", delta }),
            });
            totalUsage.input_tokens += finalResult.usage.input_tokens;
            totalUsage.output_tokens += finalResult.usage.output_tokens;
            totalCost += finalResult.cost_brl;
            // Persiste essa resposta final
            await db.from("agents_messages").insert({
              session_id: sessionId,
              role: "assistant",
              content: stripInternalThinking(finalResult.text),
              token_count: finalResult.usage.output_tokens,
              cost_brl: finalResult.cost_brl,
              status: "completed",
            });
          } catch (e) {
            writer.write({
              type: "error",
              message: `Limite ${MAX_TOOL_ITERATIONS} iterações atingido — não consegui responder: ${String(e)}`,
            });
          }
        }

        writer.write({ type: "done", usage: totalUsage, cost_brl: totalCost });

        // Log de obs
        logAgentCall({
          agent: { id: agent.id, provider: agent.provider, model: agent.model, settings: agent.settings },
          session_id: sessionId,
          user_id: payload.user_id || null,
          usage: totalUsage,
          latency_ms: Date.now() - t0,
          ttft_ms: ttftMs,
          cost_brl: totalCost,
          status_code: 200,
        });

        // Atualiza session.updated_at
        await db
          .from("agents_sessions")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", sessionId);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[agent-runner] erro no loop:", msg);
        writer.write({ type: "error", message: msg });
        logAgentCall({
          agent: { id: agent.id, provider: agent.provider, model: agent.model, settings: agent.settings },
          session_id: sessionId,
          user_id: payload.user_id || null,
          latency_ms: Date.now() - t0,
          status_code: 500,
          error: msg,
        });
      } finally {
        writer.close();
      }
    },
  });

  return new Response(stream, { headers: sseResponseHeaders() });
});

// ──────────────────────────────────────────────────────────────────

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function renderAutoContext(ctx: Record<string, unknown> | undefined): string {
  if (!ctx || Object.keys(ctx).length === 0) return "";
  // FIX: cap por valor pra não estourar tamanho do system prompt nem invalidar cache
  const lines = Object.entries(ctx).map(([k, v]) => {
    const val = typeof v === "string" ? v : JSON.stringify(v);
    const capped = val.length > 500 ? val.slice(0, 500) + "…" : val;
    return `- ${k}: ${capped}`;
  });
  return `[CONTEXT]\n${lines.join("\n")}`;
}

/**
 * Cap em raw field — Anthropic responses podem ficar grandes (raw com tool_use longos).
 * Limita pra não inflar coluna jsonb indefinidamente.
 */
function capRaw(raw: unknown): unknown {
  if (!raw) return null;
  const str = typeof raw === "string" ? raw : JSON.stringify(raw);
  if (str.length <= 10_000) return raw;
  return { _truncated: true, _preview: str.slice(0, 5_000) };
}
