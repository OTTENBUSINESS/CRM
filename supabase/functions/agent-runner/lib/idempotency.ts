/**
 * Idempotency keys pra tools stateful (regra ouro da indústria — sobrevive a retries).
 *
 * Usa unique index parcial em agents_action_log(idempotency_key) WHERE NOT NULL.
 * Se mesma key for executada 2x, segundo INSERT viola constraint → retorna resultado original.
 */

import { db } from "../_shared/supabase.ts";

/**
 * Gera key determinística pra uma chamada de tool.
 * Mesma sessão + mesma tool + mesmos args + mesmo bucket de tempo (1min) = mesma key.
 */
export function generateIdempotencyKey(params: {
  session_id: string;
  tool_name: string;
  arguments: Record<string, unknown>;
}): string {
  const minuteBucket = Math.floor(Date.now() / 60_000);
  const argsJson = JSON.stringify(params.arguments, Object.keys(params.arguments).sort());
  const payload = `${params.session_id}|${params.tool_name}|${argsJson}|${minuteBucket}`;
  // Hash simples (não-crypto, suficiente pra idempotency)
  return djb2Hash(payload);
}

function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash >>> 0;
  }
  // FIX: removido Date.now() do sufixo — key tem que ser determinística pra
  // idempotency funcionar em retry. O bucket de tempo (1min) já está embutido
  // em `generateIdempotencyKey` via `minuteBucket` no payload.
  return `idem_${hash.toString(36)}`;
}

/**
 * Verifica se já existe execução com essa idempotency_key.
 * Se sim, retorna o output original.
 */
export async function checkIdempotency(
  idempotencyKey: string,
): Promise<{ exists: boolean; output?: unknown; status?: string }> {
  const { data } = await db
    .from("agents_action_log")
    .select("output, status")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (!data) return { exists: false };
  return { exists: true, output: data.output, status: data.status };
}
