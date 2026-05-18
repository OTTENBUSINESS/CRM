import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

// Helper: converte amount baseado na origem
// - Braip com payment_method numérico ('2', '5', etc) → valor em CENTAVOS → dividir por 100
// - Todos os outros casos → valor já em REAIS
const convertTransactionAmount = (
  amount: string | number,
  paymentMethod?: string | null,
  paymentPlatform?: string | null
): number => {
  const value = parseFloat(String(amount) || '0');
  const isBraipNumeric = paymentPlatform === 'braip' &&
    paymentMethod &&
    /^\d+$/.test(paymentMethod);
  return isBraipNumeric ? value / 100 : value;
};

interface ConversationAnalysis {
  sentiment: "positive" | "neutral" | "negative";
  interest_level: "high" | "medium" | "low";
  objections: string[];
  interests: string[];
  questions_unanswered: string[];
  products_mentioned: string[];
  urgency_detected: boolean;
  key_insights: string[];
  recommended_action: string;
  summary: string;
  data_sources_used: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id, lead_id, playbook_context, message_limit = 50 } = await req.json();

    // Suporta tanto contact_id quanto lead_id para compatibilidade
    const resolvedLeadId = lead_id || contact_id;

    if (!resolvedLeadId) {
      return new Response(
        JSON.stringify({ error: "lead_id ou contact_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);
    const anthropicKey = (await getIntegrationKey(supabase, "ANTHROPIC_API_KEY"));

    // 1. Buscar dados completos do lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", resolvedLeadId)
      .single();

    if (leadError || !lead) {
      console.error("Lead não encontrado:", leadError);
      return new Response(
        JSON.stringify({ error: "Lead não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rastrear quais fontes de dados foram usadas
    const dataSources: string[] = ["lead"];

    // 2. Buscar mensagens WhatsApp (se houver)
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me, created_at, sender_name, message_type")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: true })
      .limit(message_limit);

    if (messages && messages.length > 0) {
      dataSources.push("whatsapp_messages");
    }

    // 3. Buscar timeline/activities
    const { data: activities } = await supabase
      .from("company_activities")
      .select("type, title, description, outcome, created_at, completed_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (activities && activities.length > 0) {
      dataSources.push("activities");
    }

    // 4. Buscar transações
    const { data: transactions } = await supabase
      .from("transactions")
      .select("product_name, amount, status, created_at, payment_method, payment_platform")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (transactions && transactions.length > 0) {
      dataSources.push("transactions");
    }

    // 5. Buscar deals do lead
    const { data: deals } = await supabase
      .from("deals")
      .select(`
        id, status, negotiated_price, original_price, discount_percent,
        payment_method, installments, notes, created_at, won_at, lost_at, lost_reason,
        product:products!deals_product_id_fkey(id, name, price),
        pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name)
      `)
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (deals && deals.length > 0) {
      dataSources.push("deals");
    }

    // 6. Buscar perfil Instagram (se existir)
    const { data: instagram } = await supabase
      .from("instagram_profiles")
      .select("*")
      .eq("lead_id", resolvedLeadId)
      .single();

    if (instagram) {
      dataSources.push("instagram_profile");
    }

    // 7. Buscar checkouts abandonados
    const { data: checkouts } = await supabase
      .from("checkouts")
      .select("product_name, amount, status, created_at, abandoned_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (checkouts && checkouts.length > 0) {
      dataSources.push("checkouts");
    }

    // 8. Buscar produtos disponíveis para contexto
    const { data: products } = await supabase
      .from("products")
      .select("id, name, price")
      .eq("active", true)
      .limit(15);

    // Se não tem NENHUM dado além do lead, ainda assim analisar
    if (dataSources.length === 1) {
      console.log("Apenas dados do lead disponíveis, gerando análise básica");
    }

    // Preparar conversa WhatsApp para análise
    const conversationText = messages && messages.length > 0
      ? messages
          .map((m: any) => {
            const sender = m.is_from_me ? "VENDEDOR" : "LEAD";
            const date = new Date(m.created_at).toLocaleString("pt-BR");
            return `[${date}] ${sender}: ${m.content || "[mídia]"}`;
          })
          .join("\n")
      : "Nenhuma conversa WhatsApp disponível";

    // Preparar timeline de atividades
    const activitiesText = activities && activities.length > 0
      ? activities
          .map((a: any) => {
            const date = new Date(a.created_at).toLocaleString("pt-BR");
            return `[${date}] ${a.type}: ${a.title}${a.description ? ` - ${a.description}` : ""}${a.outcome ? ` (Resultado: ${a.outcome})` : ""}`;
          })
          .join("\n")
      : "Nenhuma atividade registrada";

    // Preparar histórico de transações
    const transactionsText = transactions && transactions.length > 0
      ? transactions
          .map((t: any) => {
            const date = new Date(t.created_at).toLocaleString("pt-BR");
            const amountReais = convertTransactionAmount(t.amount, t.payment_method, t.payment_platform);
            return `[${date}] ${t.product_name}: R$ ${amountReais.toFixed(2)} - ${t.status}`;
          })
          .join("\n")
      : "Nenhuma transação";

    // Preparar deals
    const dealsText = deals && deals.length > 0
      ? deals
          .map((d: any) => {
            const date = new Date(d.created_at).toLocaleString("pt-BR");
            const product = d.product?.name || "Produto não especificado";
            const stage = d.pipeline_stage?.name || d.status;
            return `[${date}] ${product}: R$ ${d.negotiated_price} - ${stage}${d.lost_reason ? ` (Perdido: ${d.lost_reason})` : ""}`;
          })
          .join("\n")
      : "Nenhum deal";

    // Preparar checkouts
    const checkoutsText = checkouts && checkouts.length > 0
      ? checkouts
          .map((c: any) => {
            const date = new Date(c.created_at).toLocaleString("pt-BR");
            return `[${date}] ${c.product_name}: R$ ${c.amount} - ${c.status}${c.abandoned_at ? " (ABANDONADO)" : ""}`;
          })
          .join("\n")
      : "Nenhum checkout";

    // Preparar dados do Instagram
    const instagramText = instagram
      ? `
Username: @${instagram.username}
Seguidores: ${instagram.followers_count || "N/A"}
Seguindo: ${instagram.following_count || "N/A"}
Posts: ${instagram.posts_count || "N/A"}
Bio: ${instagram.bio || "N/A"}
É verificado: ${instagram.is_verified ? "Sim" : "Não"}
É conta business: ${instagram.is_business ? "Sim" : "Não"}
`.trim()
      : "Sem perfil Instagram vinculado";

    const context = {
      lead_info: {
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        stage: lead.sales_stage || "new",
        score: lead.sales_score,
        source: lead.source,
        created_at: lead.created_at,
        bant: {
          budget: lead.bant_budget,
          authority: lead.bant_authority,
          need: lead.bant_need,
          timeline: lead.bant_timeline,
        },
        tags: lead.tags,
        notes: lead.notes,
      },
      data_available: dataSources,
      total_messages: messages?.length || 0,
      total_activities: activities?.length || 0,
      total_transactions: transactions?.length || 0,
      total_deals: deals?.length || 0,
      total_checkouts: checkouts?.length || 0,
      has_instagram: !!instagram,
      available_products: products?.map((p: any) => `${p.name} (R$ ${p.price})`) || [],
      playbook_context: playbook_context || null,
    };

    // Construir contexto do playbook se disponível
    const playbookSection = playbook_context
      ? `\n\n**CONTEXTO DO PLAYBOOK DE VENDAS:**\n${playbook_context}\n\nUse este contexto para enriquecer sua análise.`
      : "";

    // Chamar Anthropic Claude
    const systemPrompt = `Você é um especialista em análise de leads e conversas comerciais.${playbookSection}

Analise TODOS os dados disponíveis deste lead e extraia insights acionáveis.

**DADOS DISPONÍVEIS:**
- Informações do Lead: Nome, email, telefone, estágio, score, origem, BANT
- Mensagens WhatsApp: Conversas entre vendedor e lead
- Timeline de Atividades: Ligações, reuniões, tarefas realizadas
- Transações: Histórico de compras
- Deals: Oportunidades de venda (ganhas, perdidas, em andamento)
- Checkouts: Tentativas de compra (incluindo abandonos)
- Instagram: Perfil e métricas do lead

**ANÁLISE REQUERIDA:**

1. **Sentimento Geral**: positive, neutral, ou negative (baseado em TODO o contexto)
2. **Nível de Interesse**: high, medium, ou low
3. **Objeções Identificadas**: Liste todas as objeções (preço, tempo, confiança, etc.)
4. **Interesses Demonstrados**: O que despertou interesse do lead
5. **Perguntas Não Respondidas**: Dúvidas do lead que ficaram pendentes
6. **Produtos Mencionados/Relacionados**: Quais produtos foram discutidos ou comprados
7. **Urgência Detectada**: O lead demonstrou urgência?
8. **Insights Chave**: 3-5 observações importantes (baseie-se em TODOS os dados)
9. **Ação Recomendada**: O que o vendedor deveria fazer AGORA
10. **Resumo**: Resumo executivo de 2-3 frases

Responda APENAS em JSON válido:
{
  "sentiment": "positive|neutral|negative",
  "interest_level": "high|medium|low",
  "objections": ["lista de objeções"],
  "interests": ["lista de interesses"],
  "questions_unanswered": ["perguntas sem resposta"],
  "products_mentioned": ["produtos mencionados"],
  "urgency_detected": true/false,
  "key_insights": ["insight 1", "insight 2", ...],
  "recommended_action": "ação recomendada detalhada",
  "summary": "resumo completo do lead"
}`;

    const userMessage = `**CONTEXTO DO LEAD:**
${JSON.stringify(context, null, 2)}

**CONVERSA WHATSAPP:**
${conversationText}

**TIMELINE DE ATIVIDADES:**
${activitiesText}

**HISTÓRICO DE TRANSAÇÕES:**
${transactionsText}

**DEALS/OPORTUNIDADES:**
${dealsText}

**CHECKOUTS:**
${checkoutsText}

**INSTAGRAM:**
${instagramText}

Analise todos esses dados e gere insights acionáveis.`;

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
            content: `${systemPrompt}\n\n${userMessage}`,
          },
        ],
      }),
    });

    const anthropicResult = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", anthropicResult);
      return new Response(
        JSON.stringify({ error: "Erro ao analisar conversa", details: anthropicResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultContent = anthropicResult.content?.[0]?.text;
    let analysis: ConversationAnalysis;

    try {
      const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      analysis = JSON.parse(jsonMatch[0]);
      // Adicionar quais fontes foram usadas
      analysis.data_sources_used = dataSources;
    } catch {
      console.error("Parse error:", resultContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Salvar análise no lead
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        ai_conversation_insights: analysis,
        ai_last_analysis_at: new Date().toISOString(),
      })
      .eq("id", resolvedLeadId);

    if (updateError) {
      console.error("Erro ao salvar análise:", updateError);
    }

    // Se detectou urgência ou interesse alto, criar alerta
    if (analysis.urgency_detected || analysis.interest_level === "high") {
      await supabase.from("sales_alerts").insert({
        lead_id: resolvedLeadId,
        sales_rep_id: lead.sales_rep_id,
        alert_type: analysis.urgency_detected ? "urgency_detected" : "hot_lead",
        title: analysis.urgency_detected
          ? `Urgência detectada: ${lead.name}`
          : `Lead com alto interesse: ${lead.name}`,
        description: analysis.summary,
        priority: analysis.urgency_detected ? 9 : 7,
        metadata: {
          interest_level: analysis.interest_level,
          objections: analysis.objections,
          recommended_action: analysis.recommended_action,
          data_sources: dataSources,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: resolvedLeadId,
        data_sources: dataSources,
        messages_analyzed: messages?.length || 0,
        activities_analyzed: activities?.length || 0,
        transactions_analyzed: transactions?.length || 0,
        deals_analyzed: deals?.length || 0,
        analysis,
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
