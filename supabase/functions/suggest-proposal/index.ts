import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

interface ProposalSuggestion {
  recommended_product: {
    id: string;
    name: string;
    original_price: number;
  };
  suggested_price: number;
  discount_percent: number;
  discount_reason: string;
  payment_suggestion: {
    method: string;
    installments: number;
    installment_value: number;
  };
  closing_arguments: string[];
  urgency_tactics: string[];
  bonus_suggestions: string[];
  win_probability: number;
  reasoning: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id, lead_id, product_id, playbook_context } = await req.json();

    const resolvedLeadId = lead_id || contact_id;

    if (!resolvedLeadId) {
      return new Response(
        JSON.stringify({ error: "lead_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const anthropicKey = (await getIntegrationKey(supabase, "ANTHROPIC_API_KEY"));

    // 1. Buscar dados do lead
    const { data: lead } = await supabase
      .from("leads")
      .select("*")
      .eq("id", resolvedLeadId)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar produtos disponíveis
    const { data: products } = await supabase
      .from("products")
      .select("id, name, price, description")
      .eq("active", true);

    if (!products || products.length === 0) {
      return new Response(
        JSON.stringify({ error: "Nenhum produto disponível" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Se product_id foi especificado, filtrar
    const targetProduct = product_id
      ? products.find((p: any) => p.id === product_id)
      : null;

    // 3. Buscar mensagens recentes para contexto
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me, created_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 4. Buscar deals anteriores do lead (para entender histórico)
    const { data: previousDeals } = await supabase
      .from("deals")
      .select("*")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(5);

    // 5. Buscar leads similares que converteram (para benchmark)
    const { data: similarConverted } = await supabase
      .from("deals")
      .select("negotiated_price, original_price, discount_percent, payment_method, installments")
      .eq("status", "won")
      .limit(20);

    // Calcular médias de desconto e parcelamento dos convertidos
    const avgDiscount = similarConverted?.length
      ? similarConverted.reduce((sum: number, d: any) => sum + (d.discount_percent || 0), 0) / similarConverted.length
      : 10;

    const avgInstallments = similarConverted?.length
      ? Math.round(
          similarConverted.reduce((sum: number, d: any) => sum + (d.installments || 1), 0) / similarConverted.length
        )
      : 6;

    // 6. Buscar insights de conversas
    const conversationInsights = lead.ai_conversation_insights;

    const context = {
      lead: {
        name: lead.name,
        score: lead.sales_score,
        stage: lead.sales_stage,
        bant: {
          budget: lead.bant_budget,
          authority: lead.bant_authority,
          need: lead.bant_need,
          timeline: lead.bant_timeline,
        },
        utm_source: lead.utm_source,
      },
      playbook_context: playbook_context || null,
      products: products.map((p: any) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        description: p.description?.substring(0, 200),
      })),
      target_product: targetProduct,
      conversation_insights: conversationInsights ? {
        objections: conversationInsights.objections,
        interests: conversationInsights.interests,
        sentiment: conversationInsights.sentiment,
      } : null,
      recent_conversations: (messages || []).slice(0, 15).map((m: any) => ({
        from: m.is_from_me ? "Vendedor" : "Lead",
        content: m.content?.substring(0, 200),
      })),
      previous_deals: previousDeals?.map((d: any) => ({
        status: d.status,
        product: d.product_id,
        price_offered: d.negotiated_price,
        lost_reason: d.lost_reason,
      })),
      benchmark: {
        avg_discount: avgDiscount.toFixed(1),
        avg_installments: avgInstallments,
        conversion_count: similarConverted?.length || 0,
      },
    };

    // Construir contexto do playbook
    const playbookSection = playbook_context
      ? `\n\n**PLAYBOOK DE VENDAS:**\n${playbook_context}\n\nUse este contexto para escolher o produto mais adequado e argumentos de venda alinhados à estratégia da empresa.`
      : "";

    const systemPrompt = `Você é um especialista em vendas consultivas e precificação inteligente.${playbookSection}

Analise o perfil do lead e sugira a MELHOR PROPOSTA COMERCIAL para maximizar a chance de conversão.

**FATORES A CONSIDERAR:**
1. Score e qualificação BANT do lead
2. Objeções identificadas nas conversas
3. Interesse demonstrado em produtos específicos
4. Benchmark de negociações similares que converteram
5. Margem de negociação segura

**REGRAS:**
- Desconto máximo permitido: 20%
- Se lead tem budget=false, sugira parcelamento maior
- Se tem authority=false, sugira material para apresentar ao decisor
- Se tem urgency, use isso como argumento
- Baseie-se nos benchmarks de conversão

**FORMATO DE RESPOSTA (JSON):**
{
  "recommended_product": {
    "id": "id do produto recomendado",
    "name": "nome do produto",
    "original_price": valor original
  },
  "suggested_price": valor sugerido com desconto,
  "discount_percent": percentual de desconto (0-20),
  "discount_reason": "justificativa do desconto para o lead",
  "payment_suggestion": {
    "method": "pix|credit_card|bank_slip",
    "installments": número de parcelas,
    "installment_value": valor de cada parcela
  },
  "closing_arguments": ["argumento 1", "argumento 2", "argumento 3"],
  "urgency_tactics": ["tática de urgência 1", "tática 2"],
  "bonus_suggestions": ["bônus 1 que podemos oferecer", "bônus 2"],
  "win_probability": 0-100 (estimativa de chance de fechar),
  "reasoning": "explicação de 2-3 frases do porquê desta proposta"
}`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n**CONTEXTO:**\n${JSON.stringify(context, null, 2)}`,
          },
        ],
      }),
    });

    const anthropicResult = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", anthropicResult);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar proposta", details: anthropicResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultContent = anthropicResult.content?.[0]?.text;
    let proposal: ProposalSuggestion;

    try {
      const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      proposal = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Parse error:", resultContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar lead com sugestão de proposta
    await supabase
      .from("leads")
      .update({
        ai_proposal_suggestion: proposal,
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq("id", resolvedLeadId);

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: resolvedLeadId,
        proposal,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
