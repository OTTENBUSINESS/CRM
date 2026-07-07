/**
 * Safety layer — remove "pensamento interno" do LLM antes de mandar ao usuário,
 * sanitiza JSON quebrado (lone surrogates), e redige PII em logs.
 *
 * Lição extraída de cs/supabase/functions/ai-sales-agent (10k linhas) +
 * pesquisa OWASP LLM Top 10 2026 (prompt leakage).
 */

// ────────── Strip internal thinking ──────────

/**
 * Remove prefixos de raciocínio que o LLM às vezes vaza:
 *   "Analisando o histórico... Vou responder.\n\nMensagem real"
 *
 * Heurística: se o texto tem 1+ parágrafo de raciocínio seguido de \n\n
 * E a mensagem real começa depois, corta o raciocínio.
 *
 * IMPORTANTE: NUNCA listar palavras proibidas no prompt do agente — isso vira
 * vocabulário ativo do LLM. Defesas vão no código, não no prompt.
 * Ref: memory/llm-narration-leak.md
 */
const THINKING_PREFIXES = [
  /^analisando[^\n]*\n\n/i,
  /^pensando[^\n]*\n\n/i,
  /^considerando[^\n]*\n\n/i,
  /^avaliando[^\n]*\n\n/i,
  /^vou (responder|analisar|verificar|checar)[^\n]*\n\n/i,
  /^preciso (responder|analisar|verificar|checar)[^\n]*\n\n/i,
  /^\[pensamento[^\]]*\]\s*/i,
  /^resposta:\s*/i,
  /^mensagem:\s*/i,
];

export function stripInternalThinking(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const re of THINKING_PREFIXES) {
    cleaned = cleaned.replace(re, "");
  }
  return cleaned.trim();
}

// ────────── Sanitize JSON ──────────

/**
 * Remove lone surrogates que quebram JSON serialization.
 * Erro típico: "no low surrogate in string" do Anthropic API.
 */
export function sanitizeForJSON<T>(obj: T): T {
  if (typeof obj === "string") {
    // deno-lint-ignore no-control-regex
    return obj.replace(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
      "�",
    ) as T;
  }
  if (Array.isArray(obj)) {
    return obj.map(sanitizeForJSON) as T;
  }
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      result[key] = sanitizeForJSON((obj as Record<string, unknown>)[key]);
    }
    return result as T;
  }
  return obj;
}

// ────────── PII Redaction (pra logs) ──────────

const PII_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, "[CPF]"],
  [/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, "[CNPJ]"],
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]"],
  [/\b(\+?55\s?)?(\(?\d{2}\)?\s?)?9?\d{4}-?\d{4}\b/g, "[PHONE]"],
  [/\b(sk-|pk-|api[-_]?key[-_=]?)[A-Za-z0-9_-]{20,}\b/g, "[API_KEY]"],
];

export function redactPII(text: string | null | undefined): string {
  if (!text) return "";
  let out = text;
  for (const [re, replacement] of PII_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
