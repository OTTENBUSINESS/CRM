/**
 * Provider: OpenAI (Chat Completions API com tools).
 *
 * OpenAI tem prompt caching AUTOMÁTICO (prompts >1024 tokens são cacheados sem flag).
 * Não precisa setar nada — só não embarcar timestamp/random.
 *
 * Pricing 2026 ($/M tokens, sujeito a mudança):
 *   gpt-5:        $5 in  / $15 out  | cached $0.5
 *   gpt-5-mini:   $0.15  / $0.6     | cached $0.075
 *   o3:           $10    / $40      | cached $1
 */

import type {
  AgentMessage,
  AgentRegistry,
  AgentTool,
  ProviderCallResult,
  ToolCall,
} from "../../_shared/types.ts";
import { sanitizeForJSON } from "../safety.ts";

const OPENAI_BASE = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY") || "";

const PRICING: Record<string, { in: number; out: number; cached: number }> = {
  "gpt-5":      { in: 5,    out: 15,  cached: 0.5 },
  "gpt-5-mini": { in: 0.15, out: 0.6, cached: 0.075 },
  "o3":         { in: 10,   out: 40,  cached: 1 },
};

const USD_TO_BRL = parseFloat(Deno.env.get("USD_TO_BRL") || "5.5");

export interface OpenAICallParams {
  agent: AgentRegistry;
  systemPrompt: string;
  tools: AgentTool[];
  history: AgentMessage[];
  newUserMessage: string;
  onTextDelta: (delta: string) => void;
}

export async function callOpenAI(params: OpenAICallParams): Promise<ProviderCallResult> {
  if (!OPENAI_KEY) {
    throw new Error("OPENAI_API_KEY ausente nos secrets");
  }

  // ────────── Messages ──────────
  const messages: Array<Record<string, unknown>> = [
    { role: "system", content: params.systemPrompt },
  ];

  for (const m of params.history) {
    if (m.role === "user") {
      messages.push({ role: "user", content: m.content || "" });
    } else if (m.role === "assistant") {
      const msg: Record<string, unknown> = { role: "assistant", content: m.content || "" };
      if (m.tool_calls && m.tool_calls.length > 0) {
        msg.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      messages.push(msg);
    } else if (m.role === "tool" && m.tool_call_id) {
      messages.push({
        role: "tool",
        tool_call_id: m.tool_call_id,
        content: m.content || "",
      });
    }
  }
  // Só adiciona user message se tiver conteúdo (loop de tool calling passa vazio)
  if (params.newUserMessage && params.newUserMessage.trim()) {
    messages.push({ role: "user", content: params.newUserMessage });
  }

  // ────────── Tools (OpenAI format) ──────────
  const openaiTools = params.tools.length > 0
    ? params.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: sanitizeForJSON(t.parameters_schema),
      },
    }))
    : undefined;

  const body = {
    model: params.agent.model,
    max_tokens: params.agent.settings?.max_tokens || 4000,
    temperature: params.agent.settings?.temperature ?? 0.7,
    messages,
    tools: openaiTools,
    stream: true,
    stream_options: { include_usage: true },
  };

  const res = await fetch(OPENAI_BASE, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(sanitizeForJSON(body)),
  });

  if (!res.ok || !res.body) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`OpenAI ${res.status}: ${errTxt.slice(0, 500)}`);
  }

  return await parseStream(res.body, params.onTextDelta, params.agent.model);
}

async function parseStream(
  body: ReadableStream<Uint8Array>,
  onTextDelta: (delta: string) => void,
  model: string,
): Promise<ProviderCallResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  let text = "";
  const toolCalls: ToolCall[] = [];
  const currentTools: Record<number, { id?: string; name?: string; arguments: string }> = {};

  let inputTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let stopReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") continue;

      let evt: Record<string, unknown>;
      try { evt = JSON.parse(data); } catch { continue; }

      const choice = (evt.choices as Array<Record<string, unknown>>)?.[0];
      if (choice) {
        const delta = choice.delta as Record<string, unknown>;
        if (delta?.content) {
          const chunk = delta.content as string;
          text += chunk;
          onTextDelta(chunk);
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls as Array<Record<string, unknown>>) {
            const index = tc.index as number;
            if (!currentTools[index]) currentTools[index] = { arguments: "" };
            if (tc.id) currentTools[index].id = tc.id as string;
            const fn = tc.function as Record<string, string> | undefined;
            if (fn?.name) currentTools[index].name = fn.name;
            if (fn?.arguments) currentTools[index].arguments += fn.arguments;
          }
        }
        if (choice.finish_reason) stopReason = choice.finish_reason as string;
      }

      const usage = evt.usage as Record<string, number> | undefined;
      if (usage) {
        inputTokens = usage.prompt_tokens || 0;
        outputTokens = usage.completion_tokens || 0;
        cachedTokens = (usage as Record<string, Record<string, number>>).prompt_tokens_details?.cached_tokens || 0;
      }
    }
  }

  // Finalize tool calls
  for (const ct of Object.values(currentTools)) {
    if (!ct.id || !ct.name) {
      console.warn("[openai] tool_call incomplete (id/name missing) — skipping", ct);
      continue;
    }
    let args: Record<string, unknown> = {};
    let parseOk = true;
    try { args = JSON.parse(ct.arguments || "{}"); } catch { parseOk = false; args = {}; }
    toolCalls.push({ id: ct.id, name: ct.name, arguments: args });

    // FIX: detectar tool truncado por max_tokens (stop_reason='length')
    if (!parseOk && stopReason === "length") {
      throw new Error(
        `LLM truncou no meio de tool_call '${ct.name}' (stop=length, output_tokens=${outputTokens}). ` +
        `Aumente agent.settings.max_tokens.`,
      );
    }
  }

  const cost = calculateCost(model, inputTokens - cachedTokens, outputTokens, cachedTokens);

  return {
    text,
    tool_calls: toolCalls,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      cached_tokens: cachedTokens,
    },
    cost_brl: cost,
    stop_reason: stopReason,
  };
}

function calculateCost(model: string, inTokens: number, outTokens: number, cachedTokens: number): number {
  const p = PRICING[model] || PRICING["gpt-5-mini"]!;
  const usd = (inTokens / 1_000_000) * p.in +
              (outTokens / 1_000_000) * p.out +
              (cachedTokens / 1_000_000) * p.cached;
  return Number((usd * USD_TO_BRL).toFixed(4));
}
