/**
 * Tool executor — dispatcher por action_type.
 * + Idempotency check (toda tool que muda estado).
 * + Audit log em agents_action_log.
 */

import { db } from "../../_shared/supabase.ts";
import type { AgentTool, ToolCall } from "../../_shared/types.ts";
import { checkIdempotency, generateIdempotencyKey } from "../idempotency.ts";
import { execSqlTool } from "./sql.ts";
import { execHttpTool } from "./http.ts";
import { execAsyncHttpTool } from "./http-async.ts";
import { execWebhookTool } from "./webhook.ts";
import { execEdgeFunctionTool } from "./edge-function.ts";
import { getCachedToolResult, setCachedToolResult, isReadOnlyTool } from "../tool-cache.ts";

export interface ExecuteToolParams {
  tool: AgentTool;
  call: ToolCall;
  agent_id: string;
  session_id: string;
  user_id: string | null;
  /**
   * Contexto runtime injetado pelo agent-runner — NUNCA visível ao LLM.
   * Tools usam via params_map ({{lead_id}}, {{deal_id}}, etc) pra montar a
   * chamada SQL/HTTP/etc sem o LLM precisar passar UUIDs nos args.
   *
   * Best practice: LLM passa dados de negócio, sistema injeta IDs.
   */
  runtime_context?: Record<string, unknown>;
}

export interface ExecuteToolResult {
  output: unknown;
  cached: boolean; // veio de idempotency cache
  duration_ms: number;
  status: "success" | "failed";
  error?: string;
}

const STATE_CHANGING = new Set(["http", "webhook", "edge_function"]); // SQL pode ser SELECT (read-only)

export async function executeTool(params: ExecuteToolParams): Promise<ExecuteToolResult> {
  const t0 = Date.now();
  const { tool, call, agent_id, session_id, user_id, runtime_context } = params;

  // Contexto runtime sempre disponível pras tools (mesmo se runtime_context vazio).
  // Inclui: agent_id, session_id, user_id, channel (sempre) + lead_id/deal_id/etc (quando webhook injeta)
  const ctx: Record<string, unknown> = {
    agent_id,
    session_id,
    user_id,
    ...(runtime_context || {}),
  };

  // ━━━ READ-ONLY CACHE (5min TTL por sessão) ━━━
  // Pattern TVCACHE — evita re-execução de SELECT/GET idênticos.
  // Economia massiva: vi 3× a mesma query no caso Netto = R$ 4 desperdiçados.
  if (isReadOnlyTool(tool)) {
    const cached = getCachedToolResult(session_id, tool.name, call.arguments);
    if (cached !== null) {
      return {
        output: cached,
        cached: true,
        duration_ms: Date.now() - t0,
        status: "success",
      };
    }
  }

  // Idempotency: se a tool muda estado, gera key e checa
  let idempotencyKey: string | undefined;
  if (STATE_CHANGING.has(tool.action_type)) {
    idempotencyKey = generateIdempotencyKey({
      session_id,
      tool_name: tool.name,
      arguments: call.arguments,
    });

    const cached = await checkIdempotency(idempotencyKey);
    if (cached.exists && cached.status === "success") {
      return {
        output: cached.output,
        cached: true,
        duration_ms: Date.now() - t0,
        status: "success",
      };
    }
  }

  let output: unknown;
  let status: "success" | "failed" = "success";
  let error: string | undefined;

  try {
    // ━━━ ASYNC TOOL (durable execution) ━━━
    // Se action_config tem bloco `async`, dispara + cria job + retorna "processing".
    // Cron poller checa status depois e re-dispara o agente quando pronto.
    const asyncCfg = (tool.action_config as Record<string, unknown>)?.async as Record<string, unknown> | undefined;
    if (asyncCfg && tool.action_type === "http") {
      output = await execAsyncHttpTool({
        action_config: tool.action_config,
        arguments: call.arguments,
        user_id,
        provider: (tool as any).provider || null,
        agent_id,
        session_id,
        runtime_context: ctx,
        tool_name: tool.name,
      });
      // async sempre "success" — o resultado real vem no resume
      const duration_ms = Date.now() - t0;
      db.from("agents_action_log").insert({
        agent_id, session_id, user_id,
        tool_name: tool.name, input: call.arguments, output, status: "success",
        idempotency_key: null, duration_ms,
      }).then(({ error: dbErr }) => { if (dbErr) console.error("[executor] audit err", dbErr); });
      return { output, cached: false, duration_ms, status: "success" };
    }

    switch (tool.action_type) {
      case "sql":
        output = await execSqlTool({
          action_config: tool.action_config,
          arguments: call.arguments,
          runtime_context: ctx,
        });
        break;
      case "http":
        output = await execHttpTool({
          action_config: tool.action_config,
          arguments: call.arguments,
          user_id,
          provider: (tool as any).provider || null,
        });
        // ─── HÍBRIDO: sync poll estourou → cria job durável que continua acompanhando ───
        if (output && typeof output === "object" && (output as Record<string, unknown>).__job_handoff) {
          const h = output as Record<string, unknown>;
          const resumeContext = {
            lead_id: ctx.lead_id ?? null,
            deal_id: ctx.deal_id ?? null,
            instance_id: ctx.instance_id ?? null,
            recipient: ctx.recipient ?? ctx.telegram_chat_id ?? ctx.whatsapp_phone ?? null,
            user_id,
          };
          const { data: jobRes, error: jobErr } = await db.rpc("agent_create_job", {
            p_agent_id: agent_id,
            p_session_id: session_id,
            p_channel: (ctx.channel as string) || "chat_web",
            p_tool_name: tool.name,
            p_external_id: String(h.external_id || ""),
            p_poll_config: h.poll_config || {},
            p_provider: (tool as any).provider || null,
            p_resume_context: resumeContext,
          });
          output = jobErr
            ? { ok: false, error: `Falha criando job de acompanhamento: ${jobErr.message}` }
            : {
                ok: true,
                async: true,
                processing: true,
                job_id: (jobRes as { job_id?: string })?.job_id,
                message: h.message,
                instruction_to_agent:
                  "Avise o usuário que está gerando e que você avisa quando ficar pronto. " +
                  "NÃO mostre nenhum carrossel agora. NÃO chame mais tools.",
              };
        }
        break;
      case "webhook":
        output = await execWebhookTool({
          action_config: tool.action_config,
          arguments: call.arguments,
          user_id,
        });
        break;
      case "edge_function":
        output = await execEdgeFunctionTool({
          action_config: tool.action_config,
          arguments: call.arguments,
          user_id,
          session_id,
        });
        break;
      default:
        throw new Error(`Unknown action_type: ${tool.action_type}`);
    }
  } catch (e) {
    status = "failed";
    error = e instanceof Error ? e.message : String(e);
    output = { error };
  }

  const duration_ms = Date.now() - t0;

  // Salva no read-only cache (se aplicável e success)
  if (status === "success" && isReadOnlyTool(tool)) {
    setCachedToolResult(session_id, tool.name, call.arguments, output);
  }

  // Audit log (fire-and-forget)
  db.from("agents_action_log")
    .insert({
      agent_id,
      session_id,
      user_id,
      tool_name: tool.name,
      input: call.arguments,
      output: output,
      status,
      error: error || null,
      idempotency_key: idempotencyKey || null,
      duration_ms,
    })
    .then(({ error: dbErr }) => {
      if (dbErr) console.error("[executor] audit log err", dbErr);
    });

  return { output, cached: false, duration_ms, status, error };
}
