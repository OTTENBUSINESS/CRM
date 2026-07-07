/**
 * Prompt caching strategy (Anthropic-specific por enquanto; OpenAI/Gemini têm próprios).
 *
 * Gotchas críticos descobertos na pesquisa (cs/AGENTS-PLATFORM.md § 8):
 *
 * 1. TTL default mudou de 60min pra 5min em 2026 (custo subiu 30-60%).
 * 2. TTL 1h custa 2× write — vale só se idle > 5min entre msgs.
 * 3. Min tokens: Sonnet 4.5+ / Opus 4.5+ / Haiku 4.5 = 4096 (não 1024).
 *    Abaixo disso, NÃO ativa cache.
 * 4. Exact match obrigatório — qualquer mudança no prefix quebra cache.
 *    NUNCA embarcar timestamp/random ID no system prompt.
 * 5. TTLs longos devem aparecer ANTES dos curtos no array.
 *
 * Strategy: TTL 1h pra system + tools (raramente mudam), 5m pra histórico recente.
 */

import type { AgentRegistry } from "../_shared/types.ts";

export interface CacheConfig {
  enabled: boolean;
  systemTtl: "5m" | "1h";
  userTtl: "5m" | "1h";
  minTokens: number;
}

/**
 * Lê config de cache do agent.settings com defaults sensatos.
 */
export function getCacheConfig(agent: AgentRegistry): CacheConfig {
  const cfg = agent.settings?.caching ?? {};
  return {
    enabled: cfg.enabled !== false, // default: true
    systemTtl: cfg.system_ttl ?? "1h",
    userTtl: cfg.user_ttl ?? "5m",
    minTokens: cfg.min_tokens ?? 4096,
  };
}

/**
 * Estima tokens de uma string (heurística: ~4 chars/token).
 * Não é exato, mas suficiente pra decidir se cache vale.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Decide se cache deve ser aplicado a um bloco específico.
 * Cache só vale se o conteúdo é grande o bastante (>= min_tokens).
 *
 * IMPORTANTE: Anthropic cacheia o PREFIXO ATÉ o breakpoint — então quando há
 * blocos sequenciais (system + tools), o que importa é o tamanho ACUMULADO até
 * o breakpoint, não o tamanho de cada bloco isolado. Ver `shouldCacheCumulative`.
 */
export function shouldCache(
  content: string,
  config: CacheConfig,
): boolean {
  if (!config.enabled) return false;
  return estimateTokens(content) >= config.minTokens;
}

/**
 * Decide se cache deve ser aplicado no FIM de um prefixo de blocos.
 * Usa soma cumulativa de todos os tokens do prefixo até o breakpoint.
 *
 * Ex: system (1000 tokens) + tools (3500 tokens) = 4500 cumulativo → cacheia
 * Sem essa lógica, nem system (1000) nem tools (3500) cacheariam isoladamente.
 */
export function shouldCacheCumulative(
  cumulativeText: string,
  config: CacheConfig,
): boolean {
  if (!config.enabled) return false;
  return estimateTokens(cumulativeText) >= config.minTokens;
}

/**
 * Constrói o cache_control object pro Anthropic API.
 * Formato: { type: "ephemeral", ttl: "1h" | "5m" }
 */
export function cacheControl(ttl: "5m" | "1h") {
  return { type: "ephemeral" as const, ttl };
}
