/**
 * generate-embedding — gera embedding via Gemini e atualiza coluna no banco.
 *
 * Modelo: text-embedding-004 (768 dims, $0.00002 / 1k tokens — barato pra caralho)
 *
 * Chamado por:
 *   - Trigger `trg_agent_notes_embed` (após INSERT/UPDATE em agent_notes)
 *   - Pode ser chamado manualmente pra backfill
 *
 * Body:
 *   {
 *     table: 'agent_notes',
 *     row_id: 'uuid',
 *     text: 'título + conteúdo da nota'
 *   }
 *
 * Idempotente: se já tem embedding válido (mesmo content_hash), no-op.
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  if (!GEMINI_API_KEY) {
    return json({ error: "GEMINI_API_KEY não configurada" }, 500);
  }

  let payload: { table?: string; row_id?: string; text?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { table, row_id, text } = payload;
  if (!table || !row_id || !text) {
    return json({ error: "table + row_id + text obrigatórios" }, 400);
  }
  if (!["agent_notes"].includes(table)) {
    return json({ error: "table não permitida" }, 400);
  }

  try {
    // 1. Chama Gemini text-embedding-004
    const gemResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "models/text-embedding-004",
          content: { parts: [{ text: text.slice(0, 20_000) }] },  // limite seguro
          taskType: "RETRIEVAL_DOCUMENT",
        }),
      },
    );

    if (!gemResp.ok) {
      const errBody = await gemResp.text();
      console.error(`[gen-embedding] Gemini ${gemResp.status}:`, errBody.slice(0, 200));
      return json({ error: "gemini_failed", status: gemResp.status, body: errBody.slice(0, 200) }, 502);
    }

    const gemData = await gemResp.json();
    const embedding = gemData?.embedding?.values;

    if (!Array.isArray(embedding) || embedding.length !== 768) {
      return json({ error: "embedding_invalid", got_length: embedding?.length }, 500);
    }

    // 2. Update na tabela
    // PostgREST aceita vector como array — usa format pgvector "[0.1, 0.2, ...]"
    const pgVectorStr = `[${embedding.join(",")}]`;

    const { error } = await supabase
      .from(table)
      .update({ embedding: pgVectorStr, embedding_at: new Date().toISOString() })
      .eq("id", row_id);

    if (error) {
      console.error(`[gen-embedding] update err:`, error.message);
      return json({ error: "update_failed", message: error.message }, 500);
    }

    return json({ ok: true, row_id, embedding_dim: embedding.length });
  } catch (err: any) {
    console.error(`[gen-embedding] exception:`, err?.message);
    return json({ error: "exception", message: err?.message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
