import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getIntegrationKey } from "../_shared/config.ts";

// IMPORTANTE: esta função deve ser deployada com `--no-verify-jwt` porque
// é chamada do browser direto. A validação é feita por apikey (anon key),
// que o Supabase SDK sempre manda.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validação mínima: exige apikey OU authorization header.
    const apikey = req.headers.get("apikey") || req.headers.get("Apikey");
    const authHeader = req.headers.get("Authorization");
    if (!apikey && !authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing apikey or authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usa service_role pra ler config (sem depender de RLS/auth.getUser()).
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const apiKey = await getIntegrationKey(supabase, "SONIOX_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Soniox API key nao configurada. Cadastre em /configuracoes > API Keys." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ api_key: apiKey }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[soniox-token] error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
