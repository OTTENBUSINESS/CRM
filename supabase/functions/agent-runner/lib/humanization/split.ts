/**
 * Message split — quebra resposta longa em N mensagens menores.
 *
 * Heurística:
 *  1. Se tem \n\n → split por parágrafo (já dá quebras naturais)
 *  2. Senão, se passa de max_chars → split por sentença (. ! ? \n)
 *  3. Cada parte respeita max_chars × 1.5 (margem)
 *  4. Trim espaços, remove partes vazias
 *
 * NÃO splita: code blocks (``` ... ```), URLs, números longos.
 */

export function splitMessage(text: string, maxChars: number): string[] {
  if (!text || !text.trim()) return [];

  const trimmed = text.trim();

  // Não splita se cabe
  if (trimmed.length <= maxChars) return [trimmed];

  // Preserva code blocks
  if (trimmed.includes("```")) return [trimmed];

  // 1. Tenta por parágrafos (\n\n)
  if (trimmed.includes("\n\n")) {
    const parts = trimmed
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    if (parts.length > 1) {
      return mergeSmallChunks(parts, maxChars);
    }
  }

  // 2. Split por sentença respeitando max_chars
  return splitBySentence(trimmed, maxChars);
}

function mergeSmallChunks(chunks: string[], maxChars: number): string[] {
  const result: string[] = [];
  let buffer = "";

  for (const chunk of chunks) {
    if (!buffer) {
      buffer = chunk;
    } else if ((buffer + "\n\n" + chunk).length <= maxChars * 1.5) {
      buffer += "\n\n" + chunk;
    } else {
      result.push(buffer);
      buffer = chunk;
    }
  }
  if (buffer) result.push(buffer);
  return result;
}

function splitBySentence(text: string, maxChars: number): string[] {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (sentences.length === 1) return [text];

  const result: string[] = [];
  let buffer = "";

  for (const sentence of sentences) {
    if (!buffer) {
      buffer = sentence;
    } else if ((buffer + " " + sentence).length <= maxChars * 1.5) {
      buffer += " " + sentence;
    } else {
      result.push(buffer);
      buffer = sentence;
    }
  }
  if (buffer) result.push(buffer);

  return result.length > 0 ? result : [text];
}
