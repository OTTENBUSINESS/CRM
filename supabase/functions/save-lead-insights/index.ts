import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { lead_id, content, source } = await req.json();

    if (!lead_id || !content) {
      return new Response(
        JSON.stringify({ error: "lead_id e content são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usar service role para bypass de RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    // Atualizar o lead com os insights
    const { data, error } = await supabaseAdmin
      .from("leads")
      .update({
        ai_conversation_insights: {
          content,
          updated_at: new Date().toISOString(),
          source: source || "sales-copilot",
        },
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq("id", lead_id)
      .select("id, name")
      .single();

    if (error) {
      console.error("Erro ao atualizar lead:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`✅ Insights salvos para lead ${data.name} (${lead_id})`);

    return new Response(
      JSON.stringify({ success: true, lead: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
