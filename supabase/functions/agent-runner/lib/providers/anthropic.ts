/**
 * Provider: Anthropic (Claude).
 *
 * Implementa prompt caching com TTL split (1h system+tools, 5m user) seguindo
 * gotchas críticos descobertos na pesquisa (cs/AGENTS-PLATFORM.md § 8):
 *
 *  - Min 4096 tokens pra ativar cache (Sonnet 4.5+/Opus 4.5+/Haiku 4.5)
 *  - Exact match obrigatório (sem timestamp embarcado)
 *  - TTLs longos ANTES de curtos no array
 *  - Beta header: "prompt-caching-2024-07-31"
 *
 * Pricing 2026 (claude-opus-4-7, $/M tokens):
 *   input: $15  | output: $75
 *   cache write 5m: $18.75 (1.25×)  | cache write 1h: $30 (2×)
 *   cache read: $1.5 (0.1×)
 */

import type {
  AgentMessage,
  AgentRegistry,
  AgentTool,
  ProviderCallResult,
  ToolCall,
} from "../../_shared/types.ts";
import { cacheControl, estimateTokens, getCacheConfig, shouldCacheCumulative } from "../caching.ts";
import { sanitizeForJSON } from "../safety.ts";

const ANTHROPIC_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY") || "";
const ANTHROPIC_BETA = "prompt-caching-2024-07-31";

// USD por milhão de tokens (atualizar quando mudar tabela)
const PRICING: Record<string, { in: number; out: number; cache_read: number }> = {
  "claude-opus-4-7":   { in: 15,   out: 75,   cache_read: 1.5 },
  "claude-opus-4-6":   { in: 15,   out: 75,   cache_read: 1.5 },
  "claude-sonnet-4-6": { in: 3,    out: 15,   cache_read: 0.3 },
  "claude-sonnet-4-5": { in: 3,    out: 15,   cache_read: 0.3 },
  "claude-haiku-4-5":  { in: 1,    out: 5,    cache_read: 0.1 },
};

const USD_TO_BRL = parseFloat(Deno.env.get("USD_TO_BRL") || "5.5");

export interface AnthropicCallParams {
  agent: AgentRegistry;
  systemPrompt: string;
  tools: AgentTool[];
  history: AgentMessage[];
  newUserMessage: string;
  onTextDelta: (delta: string) => void;
}

export async function callAnthropic(
  params: AnthropicCallParams,
): Promise<ProviderCallResult> {
  if (!ANTHROPIC_KEY) {
    throw new Error("ANTHROPIC_API_KEY ausente nos secrets");
  }

  const cacheCfg = getCacheConfig(params.agent);

  // ────────── 1. System prompt blocks (cache 1h cumulativo) ──────────
  // FIX: Anthropic cacheia o PREFIXO ATÉ o breakpoint. O que importa é o
  // tamanho cumulativo (system + tools), não o de cada bloco isolado.
  // Estratégia: colocar 1 único breakpoint NO FIM do prefixo (tools[last] OU
  // system se não há tools), só se o ACUMULADO >= min_tokens.
  const systemBlocks: Array<Record<string, unknown>> = [];
  const systemContent = sanitizeForJSON(params.systemPrompt);
  systemBlocks.push({ type: "text", text: systemContent });

  // ────────── 2. Tools (Anthropic format) ──────────
  const anthropicTools: Array<Record<string, unknown>> = params.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: sanitizeForJSON(t.parameters_schema),
  }));

  // Ferramentas NATIVAS do Anthropic (server tools). Cada uma exige um beta flag próprio.
  const extraBetas: string[] = [];
  for (const nt of (params as { nativeTools?: string[] }).nativeTools || []) {
    if (nt === "web_search") {
      anthropicTools.push({ type: "web_search_20250305", name: "web_search", max_uses: 5 });
      // web_search é GA — não precisa de beta header.
    } else if (nt === "web_fetch") {
      anthropicTools.push({ type: "web_fetch_20250910", name: "web_fetch", max_uses: 5 });
      extraBetas.push("web-fetch-2025-09-10");
    } else if (nt === "code_interpreter") {
      anthropicTools.push({ type: "code_execution_20250522", name: "code_execution" });
      extraBetas.push("code-execution-2025-05-22");
    }
  }

  // Calcula tokens cumulativos (system + tools serializadas)
  const toolsText = anthropicTools.length > 0 ? JSON.stringify(anthropicTools) : "";
  const cumulativeText = systemContent + toolsText;

  if (shouldCacheCumulative(cumulativeText, cacheCfg)) {
    if (anthropicTools.length > 0) {
      // Breakpoint no último tool — cacheia system + tools juntos
      const last = anthropicTools[anthropicTools.length - 1] as Record<string, unknown>;
      last.cache_control = cacheControl(cacheCfg.systemTtl);
    } else {
      // Sem tools — breakpoint no system
      (systemBlocks[0] as Record<string, unknown>).cache_control = cacheControl(cacheCfg.systemTtl);
    }
  }

  // ────────── 3. Messages (history + new user msg) ──────────
  const messages = buildMessages(params.history, params.newUserMessage, params.newUserAttachments || []);

  // Cache historico recente com TTL curto (5m)
  if (cacheCfg.enabled && messages.length >= 4) {
    // Marca o último bloco do penúltimo turn pra cachear histórico
    const cacheTarget = messages[messages.length - 2];
    if (cacheTarget && Array.isArray(cacheTarget.content)) {
      const lastBlock = cacheTarget.content[cacheTarget.content.length - 1] as Record<string, unknown>;
      if (lastBlock && typeof lastBlock === "object") {
        lastBlock.cache_control = cacheControl(cacheCfg.userTtl);
      }
    }
  }

  // ────────── 4. POST ──────────
  const body = {
    model: params.agent.model,
    max_tokens: params.agent.settings?.max_tokens || 4000,
    temperature: params.agent.settings?.temperature ?? 0.7,
    system: systemBlocks,
    tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    messages,
    stream: true,
  };

  const res = await fetch(ANTHROPIC_BASE, {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": [ANTHROPIC_BETA, ...extraBetas].join(","),
      "content-type": "application/json",
    },
    body: JSON.stringify(sanitizeForJSON(body)),
  });

  if (!res.ok || !res.body) {
    const errTxt = await res.text().catch(() => "");
    throw new Error(`Anthropic ${res.status}: ${errTxt.slice(0, 500)}`);
  }

  // ────────── 5. Parse stream ──────────
  return await parseStream(res.body, params.onTextDelta, params.agent.model);
}

// ──────────────────────────────────────────────────────────────────

function buildMessages(
  history: AgentMessage[],
  newMsg: string,
  attachments: Array<{ url: string; type: 'image'; media_type?: string }> = [],
) {
  const msgs: Array<Record<string, unknown>> = [];

  for (const m of history) {
    if (m.role === "user") {
      msgs.push({ role: "user", content: [{ type: "text", text: m.content || "" }] });
    } else if (m.role === "assistant") {
      const content: Array<Record<string, unknown>> = [];
      if (m.content) content.push({ type: "text", text: m.content });
      if (m.tool_calls) {
        for (const tc of m.tool_calls) {
          content.push({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          });
        }
      }
      if (content.length > 0) msgs.push({ role: "assistant", content });
    } else if (m.role === "tool" && m.tool_call_id) {
      msgs.push({
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: m.tool_call_id,
          content: m.content || "",
        }],
      });
    }
  }

  // Só adiciona user message se tiver conteúdo
  // (após tool_result, newMsg vem vazia e Anthropic rejeita texto vazio)
  const hasText = !!(newMsg && newMsg.trim());
  const hasImages = attachments.length > 0;
  if (hasText || hasImages) {
    const content: Array<Record<string, unknown>> = [];
    for (const att of attachments) {
      if (att.type !== 'image' || !att.url) continue;
      const mediaType = att.media_type || inferMediaType(att.url) || 'image/png';
      // Anthropic suporta source.type='url' a partir do schema novo. Fallback base64 caso falhe.
      content.push({
        type: "image",
        source: { type: "url", url: att.url, media_type: mediaType },
      });
    }
    if (hasText) content.push({ type: "text", text: newMsg });
    msgs.push({ role: "user", content });
  }
  return msgs;
}

function inferMediaType(url: string): string | null {
  const m = url.toLowerCase().match(/\.(png|jpe?g|webp|gif)(?:\?|$)/);
  if (!m) return null;
  const ext = m[1];
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return `image/${ext}`;
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
  // FIX: mapeia índice → ToolCall (em vez de pegar `last`), pra suportar blocos
  // intercalados (text→tool@1→text→tool@3→stop@1→stop@3) sem associar errado.
  const toolByIndex: Record<string, ToolCall> = {};
  const currentToolInput: Record<string, string> = {};
  let inputTokens = 0;        // tokens não-cached (Anthropic já entrega assim)
  let outputTokens = 0;
  let cachedTokens = 0;       // cache_read_input_tokens (10% do preço)
  let cacheCreationTokens = 0; // cache_creation_input_tokens (125% do preço)
  let stopReason: string | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() || "";

    for (const block of blocks) {
      const lines = block.split("\n");
      let eventName = "";
      let dataStr = "";
      for (const line of lines) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataStr = line.slice(5).trim();
      }
      if (!dataStr) continue;

      let evt: Record<string, unknown>;
      try { evt = JSON.parse(dataStr); } catch { continue; }

      switch (eventName) {
        case "message_start": {
          const usage = ((evt.message as Record<string, unknown>)?.usage) as
            | Record<string, number> | undefined;
          if (usage) {
            // input_tokens = NÃO-cached (Anthropic separa cache_read em campo próprio)
            inputTokens = usage.input_tokens || 0;
            cachedTokens = usage.cache_read_input_tokens || 0;
            cacheCreationTokens = usage.cache_creation_input_tokens || 0;
          }
          break;
        }
        case "content_block_start": {
          const cb = evt.content_block as Record<string, unknown>;
          const idx = String(evt.index);
          if (cb?.type === "tool_use") {
            toolByIndex[idx] = {
              id: cb.id as string,
              name: cb.name as string,
              arguments: {},
            };
            currentToolInput[idx] = "";
          }
          break;
        }
        case "content_block_delta": {
          const delta = evt.delta as Record<string, unknown>;
          if (delta?.type === "text_delta") {
            const chunk = delta.text as string;
            text += chunk;
            onTextDelta(chunk);
          } else if (delta?.type === "input_json_delta") {
            const idx = String(evt.index);
            currentToolInput[idx] = (currentToolInput[idx] || "") + ((delta.partial_json as string) || "");
          }
          break;
        }
        case "content_block_stop": {
          const idx = String(evt.index);
          if (currentToolInput[idx] !== undefined && toolByIndex[idx]) {
            try {
              toolByIndex[idx].arguments = JSON.parse(currentToolInput[idx] || "{}");
            } catch {
              // Mantém args vazio — vai ser validado depois (max_tokens check)
              toolByIndex[idx].arguments = {};
            }
            delete currentToolInput[idx];
          }
          break;
        }
        case "message_delta": {
          const delta = evt.delta as Record<string, unknown>;
          if (delta?.stop_reason) stopReason = delta.stop_reason as string;
          const usage = evt.usage as Record<string, number> | undefined;
          if (usage?.output_tokens) outputTokens = usage.output_tokens;
          break;
        }
      }
    }
  }

  // Converte map → array ordenado por índice numérico
  const toolCalls: ToolCall[] = Object.keys(toolByIndex)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => toolByIndex[k]);

  // FIX: se LLM truncou no meio de tool_call (stop_reason='max_tokens' com tools),
  // detectar e falhar EXPLICITAMENTE em vez de rodar tool com args vazios.
  if (stopReason === "max_tokens" && toolCalls.length > 0) {
    // Detecta tools com input_json incompleto (parse falhou)
    const truncatedTools = toolCalls.filter(
      (tc) => Object.keys(tc.arguments).length === 0,
    );
    if (truncatedTools.length > 0) {
      throw new Error(
        `LLM truncou no meio de tool_use (max_tokens=${outputTokens}). ` +
        `Tools truncadas: ${truncatedTools.map((t) => t.name).join(", ")}. ` +
        `Aumente agent.settings.max_tokens.`,
      );
    }
  }

  // FIX: NÃO subtrai cached de input. Anthropic já entrega separado.
  // input_tokens = não-cached; cache_read = barato (10%); cache_creation = caro (125%).
  const cost = calculateCost(model, inputTokens, outputTokens, cachedTokens, cacheCreationTokens);

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

function calculateCost(
  model: string,
  inputNonCached: number,      // input_tokens (não inclui cached)
  outputTokens: number,
  cachedReadTokens: number,    // cache_read_input_tokens (10% preço)
  cacheCreationTokens: number, // cache_creation_input_tokens (125% preço)
): number {
  const p = PRICING[model] || PRICING["claude-sonnet-4-6"]!;
  const cacheReadPrice = p.cache_read ?? p.in * 0.1;
  const cacheWritePrice = p.in * 1.25;
  const usd =
    (inputNonCached / 1_000_000) * p.in +
    (outputTokens / 1_000_000) * p.out +
    (cachedReadTokens / 1_000_000) * cacheReadPrice +
    (cacheCreationTokens / 1_000_000) * cacheWritePrice;
  return Number((usd * USD_TO_BRL).toFixed(4));
}
