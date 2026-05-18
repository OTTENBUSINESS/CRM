import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

interface LeadScoreResult {
  score: number;
  reason: string;
  factors: {
    engagement: number;
    intent: number;
    profile: number;
    timing: number;
  };
  bant: {
    budget: boolean;
    authority: boolean;
    need: boolean;
    timeline: boolean;
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id, lead_id, playbook_context } = await req.json();

    // Suporta tanto lead_id quanto contact_id para compatibilidade
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

    // 2. Buscar mensagens WhatsApp (últimas 50)
    const { data: whatsappMessages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me, created_at, sender_name")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(50);

    // 3. Buscar timeline
    const { data: timeline } = await supabase
      .from("lead_timeline")
      .select("*")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 4. Buscar transações (tentativas de compra)
    const { data: transactions } = await supabase
      .from("transactions")
      .select("*")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // 5. Buscar checkouts abandonados
    const { data: checkouts } = await supabase
      .from("checkouts")
      .select("*")
      .eq("lead_id", resolvedLeadId)
      .eq("status", "abandoned")
      .order("created_at", { ascending: false })
      .limit(5);

    // 6. Buscar dados do Instagram (se disponível)
    let instagramData = null;
    if (lead.instagram_profile_id) {
      const { data: profile } = await supabase
        .from("instagram_profiles")
        .select("*")
        .eq("id", lead.instagram_profile_id)
        .single();
      instagramData = profile;
    }

    // 7. Buscar deals anteriores (para entender histórico de negociação)
    const { data: deals } = await supabase
      .from("deals")
      .select("id, status, product_id, negotiated_price, lost_reason, created_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(5);

    // 8. Buscar produtos disponíveis para contexto
    const { data: products } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("active", true)
      .limit(10);

    // Preparar contexto para a IA
    const context = {
      lead: {
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        instagram: lead.instagram,
        company_name: lead.company_name,
        region: lead.region,
        utm_source: lead.utm_source,
        utm_medium: lead.utm_medium,
        utm_campaign: lead.utm_campaign,
        created_at: lead.created_at,
        current_stage: lead.sales_stage,
        current_score: lead.sales_score,
        previous_bant: {
          budget: lead.bant_budget,
          authority: lead.bant_authority,
          need: lead.bant_need,
          timeline: lead.bant_timeline,
        },
        ai_conversation_insights: lead.ai_conversation_insights,
      },
      playbook_context: playbook_context || null,
      conversations: (whatsappMessages || []).slice(0, 30).map((m: any) => ({
        from: m.is_from_me ? "Vendedor" : "Lead",
        content: m.content?.substring(0, 300),
        date: m.created_at,
      })),
      timeline: (timeline || []).slice(0, 15).map((e: any) => ({
        type: e.type,
        description: e.description,
        date: e.created_at,
      })),
      purchase_attempts: {
        transactions: transactions?.length || 0,
        abandoned_checkouts: checkouts?.length || 0,
        last_checkout: checkouts?.[0]?.created_at || null,
        last_transaction: transactions?.[0] ? {
          status: transactions[0].status,
          amount: transactions[0].amount,
          date: transactions[0].created_at,
        } : null,
      },
      deals_history: (deals || []).map((d: any) => ({
        status: d.status,
        product_id: d.product_id,
        price: d.negotiated_price,
        lost_reason: d.lost_reason,
        date: d.created_at,
      })),
      available_products: (products || []).map((p: any) => ({
        name: p.name,
        price: p.price,
      })),
      instagram: instagramData ? {
        followers: instagramData.followers_count,
        engagement_rate: instagramData.engagement_rate,
        is_business: instagramData.is_business_account,
      } : null,
    };

    // Construir contexto do playbook se disponível
    const playbookSection = playbook_context
      ? `\n\n**PLAYBOOK DE VENDAS:**\n${playbook_context}\n\nUse este contexto para entender melhor os produtos, perfil de cliente ideal, e critérios de qualificação específicos da empresa.`
      : "";

    // Chamar Anthropic Claude
    const systemPrompt = `Você é um especialista em qualificação de leads de vendas.${playbookSection}

Analise TODOS os dados do lead e calcule um SCORE DE 0 A 100 baseado em:

**FATORES DE PONTUAÇÃO:**
1. **Engajamento (0-25)**: Frequência e qualidade das conversas, respostas rápidas, perguntas detalhadas, quantidade de mensagens, iniciativa do lead
2. **Intenção de Compra (0-35)**: Menções a preço, timing, comparação com concorrentes, perguntas sobre produto, checkouts abandonados, transações anteriores, deals criados
3. **Perfil (0-20)**: Origem (UTM), perfil Instagram, seguidores, se é empresa, região, dados da empresa
4. **Timing (0-20)**: Urgência demonstrada, checkouts abandonados, data da última interação, timeline de eventos

**DADOS DISPONÍVEIS PARA ANÁLISE:**
- Conversas WhatsApp (mensagens do lead e do vendedor)
- Timeline de eventos (visitas, interações, etc.)
- Transações e checkouts abandonados
- Histórico de deals/negociações
- Produtos disponíveis e preços
- Dados do Instagram (se disponível)
- Insights anteriores de IA (se existirem)

**BANT QUALIFICATION:**
Identifique se o lead demonstrou:
- Budget (Orçamento): Perguntou preço, parcelas, demonstrou capacidade financeira, mencionou valores
- Authority (Autoridade): É o decisor ou mencionou precisar consultar alguém, cargo/função
- Need (Necessidade): Expressou claramente o problema/dor que quer resolver, interesse específico
- Timeline (Urgência): Mencionou prazo, demonstrou urgência, evento gatilho

Responda APENAS em JSON válido:
{
  "score": 0-100,
  "reason": "Explicação clara de 2-3 frases do porquê deste score",
  "factors": {
    "engagement": 0-25,
    "intent": 0-35,
    "profile": 0-20,
    "timing": 0-20
  },
  "bant": {
    "budget": true/false,
    "authority": true/false,
    "need": true/false,
    "timeline": true/false
  }
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
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\nDados do lead:\n${JSON.stringify(context, null, 2)}`,
          },
        ],
      }),
    });

    const anthropicResult = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", anthropicResult);
      return new Response(
        JSON.stringify({ error: "Erro ao calcular score", details: anthropicResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultContent = anthropicResult.content?.[0]?.text;
    let scoreResult: LeadScoreResult;

    try {
      // Extract JSON from the response
      const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      scoreResult = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Parse error:", resultContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Atualizar o lead com o novo score
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        sales_score: scoreResult.score,
        sales_score_reason: scoreResult.reason,
        bant_budget: scoreResult.bant.budget,
        bant_authority: scoreResult.bant.authority,
        bant_need: scoreResult.bant.need,
        bant_timeline: scoreResult.bant.timeline,
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq("id", resolvedLeadId);

    if (updateError) {
      console.error("Erro ao atualizar lead:", updateError);
    }

    // Se score >= 70, criar alerta de lead quente
    if (scoreResult.score >= 70) {
      await supabase.from("sales_alerts").insert({
        lead_id: resolvedLeadId,
        sales_rep_id: lead.sales_rep_id,
        alert_type: "hot_lead",
        title: `Lead Quente: ${lead.name}`,
        description: scoreResult.reason,
        priority: Math.min(10, Math.floor(scoreResult.score / 10)),
        metadata: {
          score: scoreResult.score,
          factors: scoreResult.factors,
          bant: scoreResult.bant,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: resolvedLeadId,
        ...scoreResult,
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
