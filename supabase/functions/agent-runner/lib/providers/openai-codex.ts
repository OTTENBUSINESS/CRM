/**
 * Provider OpenAI Codex (via ChatGPT subscription OAuth).
 *
 * Endpoint privado: chatgpt.com/backend-api/codex/responses
 * Auth: Bearer token OAuth do Codex CLI
 * Cost: R$ 0 por token (paga só a sub ChatGPT Plus/Pro)
 *
 * Refresh automático:
 *   - Se expires_at < now+60s OU 401 na chamada → chama auth.openai.com/oauth/token
 *     com grant_type=refresh_token, atualiza credencial no banco, retry uma vez.
 *
 * Modelos: gpt-5.5, gpt-5.4-mini
 */

import type { CallProviderParams, ProviderResponse, ToolCall } from "../../_shared/types.ts";
import { sanitizeForJSON } from "../safety.ts";
import { db } from "../../_shared/supabase.ts";

const CODEX_ENDPOINT = "https://chatgpt.com/backend-api/codex/responses";
const OPENAI_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";
// Client ID público do Codex CLI (visível em qualquer auth.json gerado por `codex login`)
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

interface CodexAuth {
  access_token: string;
  account_id: string;
  refresh_token?: string;
  expires_at?: number;          // unix seconds
  last_refresh_at?: string;     // ISO
}

/** Decodifica payload do JWT pra pegar `exp`. */
function decodeJwtExp(jwt: string): number | undefined {
  try {
    const [, payload] = jwt.split(".");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = JSON.parse(atob(padded.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.exp === "number" ? json.exp : undefined;
  } catch { return undefined; }
}

/**
 * Renova o access_token via refresh_token.
 * - Chama POST auth.openai.com/oauth/token
 * - Atualiza a row em agents_provider_credentials com tokens novos
 * - Retorna nova CodexAuth (já com expires_at atualizado)
 *
 * Throws se refresh_token ausente ou rejeitado (usuário precisa re-autenticar).
 */
async function refreshCodexToken(credentialId: string, currentAuth: CodexAuth): Promise<CodexAuth> {
  if (!currentAuth.refresh_token) {
    throw new Error("[openai-codex] refresh_token ausente — re-autentica no /agentes/credenciais");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentAuth.refresh_token,
    client_id: CODEX_CLIENT_ID,
    scope: "openid profile email offline_access",
  });

  const res = await fetch(OPENAI_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`[openai-codex] refresh ${res.status}: ${errBody.slice(0, 300)}`);
  }

  const data = await res.json() as Record<string, any>;
  const newAccessToken = data.access_token as string;
  const newRefreshToken = (data.refresh_token as string) || currentAuth.refresh_token;
  const expFromJwt = decodeJwtExp(newAccessToken);
  const expFromResponse = typeof data.expires_in === "number" ? Math.floor(Date.now() / 1000) + data.expires_in : undefined;
  const expires_at = expFromJwt ?? expFromResponse;

  const newAuth: CodexAuth = {
    access_token: newAccessToken,
    account_id: currentAuth.account_id,
    refresh_token: newRefreshToken,
    expires_at,
    last_refresh_at: new Date().toISOString(),
  };

  // Persiste no banco
  const { error } = await db
    .from("agents_provider_credentials")
    .update({
      auth_data: newAuth,
      last_refreshed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", credentialId);

  if (error) {
    console.error(`[openai-codex] erro persistindo refresh: ${error.message}`);
    // segue mesmo assim — token nova é válido em memória pra essa request
  }

  console.log(`[openai-codex] token refreshed (expires ${new Date((expires_at || 0) * 1000).toISOString()})`);
  return newAuth;
}

export async function callOpenAICodex(params: CallProviderParams): Promise<ProviderResponse> {
  const credential = params.credential;
  if (!credential || credential.provider_type !== "openai_codex") {
    throw new Error("[openai-codex] requires openai_codex credential");
  }

  let auth = (credential.auth_data || {}) as CodexAuth;
  if (!auth.access_token || !auth.account_id) {
    throw new Error("[openai-codex] credential missing access_token or account_id");
  }

  // PROACTIVE REFRESH: se expira em menos de 60s, refresh antes de chamar
  const nowS = Date.now() / 1000;
  if (auth.expires_at && auth.expires_at < nowS + 60 && auth.refresh_token) {
    try {
      auth = await refreshCodexToken(credential.id, auth);
    } catch (e: any) {
      console.warn(`[openai-codex] proactive refresh falhou: ${e.message} — tentando chamar mesmo assim`);
    }
  }

  const model = params.agent.model || "gpt-5.5";
  const settings = params.agent.settings || {};
  const reasoningEffort = (settings.reasoning_effort as string) || "low";

  // ────────── Monta input no formato Responses API ──────────
  const input: Array<Record<string, unknown>> = [];
  for (const m of params.history) {
    if (m.role === "user") {
      input.push({
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: m.content }],
      });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "output_text", text: m.content });
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          input.push({
            type: "function_call",
            call_id: tc.id,
            name: tc.name,
            arguments: JSON.stringify(tc.arguments || {}),
          });
        }
      }
      if (content.length > 0) {
        input.push({ type: "message", role: "assistant", content });
      }
    } else if (m.role === "tool" && m.tool_call_id) {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: m.content || "",
      });
    }
  }
  const newAttachments = params.newUserAttachments || [];
  const hasTextMsg = !!(params.newUserMessage && params.newUserMessage.trim());
  if (hasTextMsg || newAttachments.length > 0) {
    const content: Array<Record<string, unknown>> = [];
    for (const att of newAttachments) {
      if (att.type !== 'image' || !att.url) continue;
      // Responses API aceita input_image com image_url direto
      content.push({ type: "input_image", image_url: att.url });
    }
    if (hasTextMsg) content.push({ type: "input_text", text: params.newUserMessage });
    input.push({ type: "message", role: "user", content });
  }

  // ────────── Tools no formato Responses API ──────────
  const tools: Array<Record<string, unknown>> = params.tools.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: sanitizeForJSON(t.parameters_schema),
  }));
  for (const nt of params.nativeTools || []) {
    if (nt === "web_search") tools.push({ type: "web_search" });
  }

  const body: Record<string, unknown> = {
    model,
    instructions: sanitizeForJSON(params.systemPrompt),
    input,
    stream: true,
    store: false,
    reasoning: { effort: reasoningEffort },
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.parallel_tool_calls = true;
  }

  // ────────── Chamada com retry em 401 ──────────
  async function callOnce(authToUse: CodexAuth): Promise<Response> {
    return await fetch(CODEX_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${authToUse.access_token}`,
        "Content-Type": "application/json",
        "Accept": "text/event-stream",
        "chatgpt-account-id": authToUse.account_id,
        "originator": "codex_cli_rs",
      },
      body: JSON.stringify(body),
    });
  }

  let res = await callOnce(auth);

  // REACTIVE REFRESH: se 401, tenta refresh + retry uma vez
  if (res.status === 401 && auth.refresh_token) {
    console.warn("[openai-codex] 401 recebido → tentando refresh");
    try {
      auth = await refreshCodexToken(credential.id, auth);
      res = await callOnce(auth);
    } catch (e: any) {
      throw new Error(`[openai-codex] 401 + refresh falhou: ${e.message}`);
    }
  }

  if (!res.ok || !res.body) {
    const errText = await res.text();
    throw new Error(`OpenAI Codex ${res.status}: ${errText.slice(0, 500)}`);
  }

  return parseCodexStream(res.body, params.onTextDelta, model);
}

async function parseCodexStream(
  body: ReadableStream<Uint8Array>,
  onTextDelta: (delta: string) => void,
  model: string,
): Promise<ProviderResponse> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const toolCalls: ToolCall[] = [];
  const toolByCallId: Record<string, ToolCall> = {};
  const currentToolInput: Record<string, string> = {};
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let reasoningTokens = 0;
  let stopReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split("\n");
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("data:")) dataStr = line.slice(5).trim();
      }
      if (!dataStr) continue;

      let evt: Record<string, any>;
      try { evt = JSON.parse(dataStr); } catch { continue; }

      switch (evt.type) {
        case "response.output_text.delta": {
          const chunk = evt.delta as string;
          if (chunk) {
            text += chunk;
            onTextDelta(chunk);
          }
          break;
        }
        case "response.function_call_arguments.delta": {
          const callId = evt.item_id || evt.call_id;
          if (callId) {
            currentToolInput[callId] = (currentToolInput[callId] || "") + (evt.delta || "");
          }
          break;
        }
        case "response.output_item.added": {
          const item = evt.item as Record<string, any>;
          if (item?.type === "function_call") {
            const tc: ToolCall = {
              id: item.call_id || item.id,
              name: item.name,
              arguments: {},
            };
            toolByCallId[tc.id] = tc;
            toolCalls.push(tc);
            currentToolInput[tc.id] = "";
          }
          break;
        }
        case "response.output_item.done": {
          const item = evt.item as Record<string, any>;
          if (item?.type === "function_call" && item.call_id) {
            const tc = toolByCallId[item.call_id];
            if (tc) {
              try {
                tc.arguments = JSON.parse(item.arguments || currentToolInput[item.call_id] || "{}");
              } catch { tc.arguments = {}; }
            }
          }
          break;
        }
        case "response.completed": {
          const usage = evt.response?.usage as Record<string, any> | undefined;
          if (usage) {
            inputTokens = usage.input_tokens || 0;
            outputTokens = usage.output_tokens || 0;
            cachedTokens = usage.input_tokens_details?.cached_tokens || 0;
            reasoningTokens = usage.output_tokens_details?.reasoning_tokens || 0;
          }
          stopReason = evt.response?.status || "completed";
          break;
        }
        case "response.failed":
        case "response.incomplete": {
          stopReason = evt.response?.status;
          break;
        }
      }
    }
  }

  return {
    text,
    tool_calls: toolCalls,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
      reasoning_tokens: reasoningTokens,
    } as any,
    cost_brl: 0,
    stop_reason: stopReason,
    raw: { provider: "openai_codex", model },
  };
}
