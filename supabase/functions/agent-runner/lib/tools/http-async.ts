/**
 * execAsyncHttpTool — dispara tarefa longa e cria job (durable execution).
 *
 * action_config.async exemplo:
 *   {
 *     "url": ".../agent/gerar", "method": "POST", "body_template": "{...}",
 *     "async": {
 *       "external_id_field": "carousel_id",   // onde achar o id na resposta inicial
 *       "user_message": "tô gerando.. já te aviso quando ficar pronto 🎨",
 *       "status_check": {
 *         "url": ".../agent/status/{{external_id}}",
 *         "method": "GET",
 *         "success_when": "status == ready",   // expressão simples
 *         "failed_when": "status == error",
 *         "result_field": "slides"             // o que devolver quando pronto (null = objeto todo)
 *       }
 *     }
 *   }
 *
 * Fluxo:
 *   1. POST inicial → extrai external_id
 *   2. Cria agent_jobs (status=processing) com poll_config = status_check
 *   3. Retorna { async:true, job_id, message } → LLM avisa o usuário
 *   4. Cron poller assume daqui (checa status, resume quando pronto)
 */

import { db } from "../../_shared/supabase.ts";
import { execHttpTool } from "./http.ts";

export async function execAsyncHttpTool(params: {
  action_config: Record<string, unknown>;
  arguments: Record<string, unknown>;
  user_id: string | null;
  provider: string | null;
  agent_id: string;
  session_id: string;
  runtime_context: Record<string, unknown>;
  tool_name: string;
}): Promise<unknown> {
  const cfg = params.action_config;
  const asyncCfg = cfg.async as Record<string, unknown>;
  const statusCheck = asyncCfg.status_check as Record<string, unknown> | undefined;
  const externalIdField = (asyncCfg.external_id_field as string) || "id";
  const userMessage = (asyncCfg.user_message as string) || "tô processando.. já te aviso quando terminar";

  // 1. Dispara a tarefa (POST inicial) — reusa execHttpTool sem o bloco async
  const initialCfg = { ...cfg };
  delete (initialCfg as Record<string, unknown>).async;

  const initialResp = await execHttpTool({
    action_config: initialCfg,
    arguments: params.arguments,
    user_id: params.user_id,
    provider: params.provider,
  });

  // 2. Extrai external_id da resposta
  const externalId = extractField(initialResp, externalIdField);
  if (!externalId) {
    // Não conseguiu id — trata como erro (não vira job)
    return {
      ok: false,
      error: `[async] resposta não tem campo '${externalIdField}'. Resposta: ${JSON.stringify(initialResp).slice(0, 200)}`,
    };
  }

  // 3. Cria job
  const resumeContext = {
    lead_id: params.runtime_context.lead_id || null,
    deal_id: params.runtime_context.deal_id || null,
    instance_id: params.runtime_context.instance_id || null,
    recipient: params.runtime_context.recipient || params.runtime_context.telegram_chat_id || params.runtime_context.whatsapp_phone || null,
    user_id: params.user_id,
  };

  const { data: jobResult, error: jobErr } = await db.rpc("agent_create_job", {
    p_agent_id: params.agent_id,
    p_session_id: params.session_id,
    p_channel: (params.runtime_context.channel as string) || "chat_web",
    p_tool_name: params.tool_name,
    p_external_id: String(externalId),
    p_poll_config: statusCheck || {},
    p_provider: params.provider,
    p_resume_context: resumeContext,
  });

  if (jobErr) {
    console.error("[async] create_job err:", jobErr.message);
    return { ok: false, error: `[async] falha criando job: ${jobErr.message}` };
  }

  const jobId = (jobResult as { job_id?: string })?.job_id;

  // 4. Retorna pro LLM — ele avisa o usuário com user_message
  return {
    ok: true,
    async: true,
    job_id: jobId,
    external_id: externalId,
    status: "processing",
    message: userMessage,
    instruction_to_agent:
      `Tarefa assíncrona iniciada (job ${jobId}). Avise o usuário que está processando ` +
      `(algo como "${userMessage}") e NÃO chame mais nenhuma tool — o sistema vai te ` +
      `notificar automaticamente quando terminar e aí você comunica o resultado.`,
  };
}

/** Extrai campo de uma resposta (suporta dot-path simples: "data.id") */
function extractField(obj: unknown, field: string): string | null {
  if (obj === null || obj === undefined) return null;
  let cur: any = obj;
  for (const part of field.split(".")) {
    if (cur && typeof cur === "object" && part in cur) cur = cur[part];
    else return null;
  }
  if (cur === null || cur === undefined) return null;
  return String(cur);
}
