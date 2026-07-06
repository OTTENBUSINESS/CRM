// ============================================================
// cancel-nfse
// Cancela uma NFSe autorizada via Focus NFe.
// ATENÇÃO: cancelamento usa /v2/nfse (sem N), diferente da
// emissão que usa /v2/nfsen.
//
// Body: { emission_id, motivo } (motivo min 15 chars)
// ============================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function focusBaseUrl(ambiente: string | null): string {
  return ambiente === "producao"
    ? "https://api.focusnfe.com.br"
    : "https://homologacao.focusnfe.com.br";
}

function extractFocusError(data: any): string {
  if (!data) return "Erro desconhecido na Focus NFe";
  if (Array.isArray(data.erros) && data.erros.length > 0) {
    return data.erros
      .map((e: any) => (e.codigo ? `[${e.codigo}] ` : "") + (e.mensagem || JSON.stringify(e)))
      .join(" | ");
  }
  return data.mensagem || data.codigo || JSON.stringify(data);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const { emission_id, motivo } = body;

    if (!emission_id) return json({ error: "emission_id é obrigatório" }, 400);
    if (!motivo || String(motivo).trim().length < 15) {
      return json({ error: "O motivo do cancelamento deve ter no mínimo 15 caracteres" }, 400);
    }

    // 1. Busca a emissão
    const { data: emission, error: emErr } = await supabase
      .from("nfse_emissions")
      .select("*")
      .eq("id", emission_id)
      .maybeSingle();
    if (emErr || !emission) return json({ error: "Emissão não encontrada" }, 404);

    if (emission.focus_nfe_status !== "autorizado") {
      return json({ error: "Só é possível cancelar uma nota com status autorizado" }, 400);
    }
    if (!emission.reference_id) {
      return json({ error: "Emissão sem reference_id — não é possível cancelar" }, 400);
    }

    // 2. Config fiscal do tenant (token + ambiente)
    const { data: fc } = await supabase
      .from("fiscal_config")
      .select("*")
      .eq("tenant_id", emission.tenant_id)
      .limit(1)
      .maybeSingle();
    if (!fc?.api_token) {
      return json({ error: "Configure os dados fiscais em Configurações" }, 400);
    }

    // 3. DELETE /v2/nfse/{ref} (sem N!) com body { justificativa: motivo }
    const base = focusBaseUrl(fc.ambiente);
    const res = await fetch(`${base}/v2/nfse/${emission.reference_id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Basic ${btoa(fc.api_token + ":")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ motivo: String(motivo).trim() }),
    });
    const focusData = await res.json().catch(() => ({}));

    if (!res.ok) {
      const msg = extractFocusError(focusData);
      // Guarda a resposta pra debug, sem mudar o status
      await supabase
        .from("nfse_emissions")
        .update({
          error_message: `Falha no cancelamento: ${msg}`.slice(0, 1000),
          focus_nfe_response: focusData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", emission.id);
      return json({ success: false, error: msg }, 400);
    }

    // 4. Atualiza pra cancelado
    await supabase
      .from("nfse_emissions")
      .update({
        focus_nfe_status: "cancelado",
        focus_nfe_response: focusData,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", emission.id);

    return json({
      success: true,
      status: "cancelado",
      emission_id: emission.id,
      nfse_number: emission.nfse_number,
    });
  } catch (err: any) {
    console.error("[cancel-nfse] Erro:", err);
    return json({ error: err?.message || "Erro interno" }, 500);
  }
});
