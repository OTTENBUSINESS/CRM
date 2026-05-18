import "https://deno.land/x/xhr@0.3.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

let OPENAI_API_KEY = "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

const systemPrompt = `Você é um especialista em análise de calls comerciais B2B.

Analise a transcrição desta call e extraia informações estruturadas para ajudar o time de vendas.

IMPORTANTE:
- Extraia APENAS informações que foram explicitamente mencionadas na transcrição
- Se uma informação não foi mencionada, deixe o campo vazio ou null
- Seja preciso e objetivo
- Identifique quem é o vendedor e quem é o lead/cliente

Retorne um JSON válido com a seguinte estrutura:

{
  "resumo": "Resumo executivo de 2-3 frases da call",
  "sentimento": "positivo|neutro|negativo",
  "interesse": "alto|medio|baixo",
  "pontos_principais": ["Ponto importante 1", "Ponto importante 2"],
  "objecoes": ["Objeção identificada 1", "Objeção identificada 2"],
  "proximos_passos": ["Próximo passo sugerido 1", "Próximo passo sugerido 2"],
  "compromissos": ["Compromisso assumido pelo lead ou vendedor"],
  "produtos_discutidos": ["Produto 1", "Produto 2"],
  "bant_updates": {
    "budget": "Orçamento mencionado ou null",
    "authority": "Quem decide ou null",
    "need": "Necessidade identificada ou null",
    "timeline": "Prazo mencionado ou null"
  },
  "score_adjustment": número de -20 a +20 baseado no tom da call
}

Retorne APENAS o JSON, sem explicações adicionais.`;

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { lead_id, task_id, transcription, call_title, call_date } = await req.json();

    if (!lead_id || !transcription) {
      return new Response(
        JSON.stringify({ error: "lead_id e transcription são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  OPENAI_API_KEY = (await getIntegrationKey(supabase, "OPENAI_API_KEY")) || "";

    // Buscar dados do lead para contexto
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Buscar produtos para contexto
    const { data: products } = await supabase
      .from("products")
      .select("name, price")
      .eq("active", true);

    // Preparar contexto
    const leadContext = `
CONTEXTO DO LEAD:
- Nome: ${lead.name}
- Email: ${lead.email || "N/A"}
- Estágio atual: ${lead.sales_stage || "novo"}
- Score atual: ${lead.sales_score || 0}
- BANT: Budget=${lead.bant_budget || "?"}, Authority=${lead.bant_authority || "?"}, Need=${lead.bant_need || "?"}, Timeline=${lead.bant_timeline || "?"}

PRODUTOS DISPONÍVEIS:
${products?.map(p => `- ${p.name}: R$ ${p.price}`).join("\n") || "Não especificados"}
`;

    // Chamar OpenAI (mesmo modelo do onboarding)
    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: `${leadContext}

TRANSCRIÇÃO DA CALL:
---
${transcription}
---

Analise a transcrição acima e gere o JSON estruturado.`,
          },
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error("Erro OpenAI:", errorText);
      return new Response(
        JSON.stringify({ error: "Erro ao processar com IA", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const aiContent = openaiData.choices[0]?.message?.content;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ error: "IA não retornou conteúdo" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parsear JSON da resposta
    let analysis;
    try {
      const cleanContent = aiContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();
      analysis = JSON.parse(cleanContent);
    } catch (parseError) {
      console.error("Erro ao parsear JSON da IA:", parseError);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA", content: aiContent }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calcular novo score
    const currentScore = lead.sales_score || 50;
    const scoreAdjustment = analysis.score_adjustment || 0;
    const newScore = Math.max(0, Math.min(100, currentScore + scoreAdjustment));

    // Preparar updates para o lead
    const leadUpdates: Record<string, unknown> = {
      ai_last_analysis_at: new Date().toISOString(),
    };

    // Atualizar score se mudou
    if (Math.abs(newScore - currentScore) >= 3) {
      leadUpdates.sales_score = newScore;
    }

    // Atualizar BANT se houver novas informações
    if (analysis.bant_updates) {
      if (analysis.bant_updates.budget) leadUpdates.bant_budget = analysis.bant_updates.budget;
      if (analysis.bant_updates.authority) leadUpdates.bant_authority = analysis.bant_updates.authority;
      if (analysis.bant_updates.need) leadUpdates.bant_need = analysis.bant_updates.need;
      if (analysis.bant_updates.timeline) leadUpdates.bant_timeline = analysis.bant_updates.timeline;
    }

    // Mesclar análise com insights existentes
    const existingInsights = lead.ai_conversation_insights || {};
    leadUpdates.ai_conversation_insights = {
      ...existingInsights,
      last_call_analysis: {
        date: call_date || new Date().toISOString(),
        title: call_title,
        ...analysis,
      },
      call_history: [
        {
          date: call_date || new Date().toISOString(),
          title: call_title,
          resumo: analysis.resumo,
          sentimento: analysis.sentimento,
        },
        ...(existingInsights.call_history || []).slice(0, 4),
      ],
    };

    // Atualizar lead
    const { error: updateError } = await supabase
      .from("leads")
      .update(leadUpdates)
      .eq("id", lead_id);

    if (updateError) {
      console.error("Erro ao atualizar lead:", updateError);
    }

    // Se task_id foi fornecido, atualizar a task com a análise
    if (task_id) {
      await supabase
        .from("company_activities")
        .update({
          outcome: analysis.resumo,
          metadata: {
            call_analysis: analysis,
            transcription_processed: true,
            processed_at: new Date().toISOString(),
          },
        })
        .eq("id", task_id);
    }

    // Criar alerta se call foi positiva
    if (analysis.interesse === "alto" || analysis.sentimento === "positivo") {
      await supabase.from("sales_alerts").insert({
        lead_id: lead_id,
        sales_rep_id: lead.sales_rep_id,
        alert_type: "positive_call",
        title: `Call positiva com ${lead.name}`,
        description: analysis.resumo,
        priority: 7,
        metadata: {
          call_title,
          call_date,
          interesse: analysis.interesse,
          proximos_passos: analysis.proximos_passos,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id,
        task_id,
        analysis,
        score_change: newScore - currentScore,
        new_score: newScore,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro geral:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
