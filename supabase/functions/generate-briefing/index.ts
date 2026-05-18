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

interface BriefingData {
  who: string;
  how_found_us: string;
  timeline_summary: string[];
  last_conversation: string;
  known_objections: string[];
  interests: string[];
  sentiment: string;
  attention_points: string[];
  opening_hook: string;
  call_objective: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id, lead_id, playbook_context } = await req.json();

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

    // 1. Buscar dados completos do lead
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", resolvedLeadId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Buscar mensagens WhatsApp
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me, created_at, sender_name")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(30);

    // 3. Buscar timeline/activities
    const { data: activities } = await supabase
      .from("company_activities")
      .select("type, title, description, outcome, created_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(15);

    // 4. Buscar transações
    const { data: transactions } = await supabase
      .from("transactions")
      .select("product_name, amount, status, created_at, payment_method, payment_platform")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(10);

    // 5. Buscar deals
    const { data: deals } = await supabase
      .from("deals")
      .select(`
        status, negotiated_price, lost_reason, created_at,
        product:products!deals_product_id_fkey(name)
      `)
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(5);

    // 6. Buscar insights de IA anteriores
    const previousInsights = lead.ai_conversation_insights;

    // Preparar contexto
    const conversationText = messages && messages.length > 0
      ? messages
          .slice(0, 20)
          .reverse()
          .map((m: any) => {
            const sender = m.is_from_me ? "VENDEDOR" : "LEAD";
            const date = new Date(m.created_at).toLocaleDateString("pt-BR");
            return `[${date}] ${sender}: ${m.content || "[mídia]"}`;
          })
          .join("\n")
      : "Sem conversas registradas";

    const activitiesText = activities && activities.length > 0
      ? activities
          .map((a: any) => {
            const date = new Date(a.created_at).toLocaleDateString("pt-BR");
            return `[${date}] ${a.type}: ${a.title}`;
          })
          .join("\n")
      : "Sem atividades registradas";

    // Converter amount baseado no payment_method
    const transactionsText = transactions && transactions.length > 0
      ? transactions
          .map((t: any) => {
            const date = new Date(t.created_at).toLocaleDateString("pt-BR");
            const amountReais = convertTransactionAmount(t.amount, t.payment_method, t.payment_platform);
            return `[${date}] ${t.product_name}: R$ ${amountReais.toFixed(2)} - ${t.status}`;
          })
          .join("\n")
      : "Sem transações";

    const dealsText = deals && deals.length > 0
      ? deals
          .map((d: any) => {
            const date = new Date(d.created_at).toLocaleDateString("pt-BR");
            return `[${date}] ${d.product?.name || "Produto"}: R$ ${d.negotiated_price} - ${d.status}${d.lost_reason ? ` (${d.lost_reason})` : ""}`;
          })
          .join("\n")
      : "Sem deals";

    const context = {
      lead: {
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        company: lead.company_name,
        stage: lead.sales_stage,
        score: lead.sales_score,
        source: lead.source,
        utm_source: lead.utm_source,
        utm_medium: lead.utm_medium,
        utm_campaign: lead.utm_campaign,
        created_at: lead.created_at,
        tags: lead.tags,
        notes: lead.notes,
      },
      previous_insights: previousInsights ? {
        sentiment: previousInsights.sentiment,
        interest_level: previousInsights.interest_level,
        objections: previousInsights.objections,
        interests: previousInsights.interests,
      } : null,
    };

    const playbookSection = playbook_context
      ? `\n\n**PLAYBOOK DE VENDAS:**\n${playbook_context}`
      : "";

    const systemPrompt = `Você é um assistente de vendas preparando um briefing para uma ligação/contato.${playbookSection}

Analise TODOS os dados disponíveis e gere um briefing completo e prático.

**DADOS DISPONÍVEIS:**
- Informações do Lead
- Conversas WhatsApp
- Timeline de Atividades
- Transações
- Deals/Negociações
- Insights anteriores de IA

**BRIEFING REQUERIDO:**

1. **Quem é**: Descreva quem é o lead (nome, contexto, ocupação se souber)
2. **Como nos conheceu**: Origem, campanha, anúncio que trouxe o lead
3. **Timeline resumida**: 3-5 eventos mais importantes em ordem cronológica
4. **Última conversa**: Resumo do último contato e assuntos pendentes
5. **Objeções conhecidas**: O que já foi levantado como impedimento
6. **Interesses**: Produtos ou temas que despertaram interesse
7. **Sentimento**: positivo, neutro ou negativo
8. **Pontos de atenção**: Algo a evitar ou ter cuidado
9. **Gancho de abertura**: Sugestão de como iniciar a conversa naturalmente
10. **Objetivo da ligação**: O que deve ser conseguido neste contato

Responda APENAS em JSON válido (sem markdown, sem \`\`\`):
{
  "who": "descrição de quem é o lead",
  "how_found_us": "como nos encontrou",
  "timeline_summary": ["evento 1", "evento 2", "evento 3"],
  "last_conversation": "resumo da última conversa",
  "known_objections": ["objeção 1", "objeção 2"],
  "interests": ["interesse 1", "interesse 2"],
  "sentiment": "positivo|neutro|negativo",
  "attention_points": ["ponto 1", "ponto 2"],
  "opening_hook": "sugestão de abertura",
  "call_objective": "objetivo claro"
}`;

    const userMessage = `**CONTEXTO DO LEAD:**
${JSON.stringify(context, null, 2)}

**CONVERSAS WHATSAPP:**
${conversationText}

**TIMELINE DE ATIVIDADES:**
${activitiesText}

**TRANSAÇÕES:**
${transactionsText}

**DEALS:**
${dealsText}

Gere o briefing completo para eu contatar este lead.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1500,
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
        JSON.stringify({ error: "Erro ao gerar briefing", details: anthropicResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultContent = anthropicResult.content?.[0]?.text;
    let briefing: BriefingData;

    try {
      // Limpar possíveis marcadores de código
      let cleanContent = resultContent
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      briefing = JSON.parse(jsonMatch[0]);

      // Garantir que arrays existam
      briefing.timeline_summary = briefing.timeline_summary || [];
      briefing.known_objections = briefing.known_objections || [];
      briefing.interests = briefing.interests || [];
      briefing.attention_points = briefing.attention_points || [];
    } catch (parseError) {
      console.error("Parse error:", resultContent);
      console.error("Error details:", parseError);

      // Fallback: criar briefing básico com os dados disponíveis
      briefing = {
        who: `${lead.name}${lead.company_name ? ` da ${lead.company_name}` : ""}`,
        how_found_us: lead.utm_source || lead.source || "Origem não identificada",
        timeline_summary: activities?.slice(0, 3).map((a: any) => `${a.type}: ${a.title}`) || ["Sem atividades registradas"],
        last_conversation: messages?.[0]?.content?.substring(0, 200) || "Sem conversas recentes",
        known_objections: previousInsights?.objections || [],
        interests: previousInsights?.interests || [],
        sentiment: previousInsights?.sentiment || "neutro",
        attention_points: ["Verificar dados antes de ligar"],
        opening_hook: `Olá ${lead.name?.split(" ")[0]}, tudo bem?`,
        call_objective: "Entender necessidades e avançar no funil",
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: resolvedLeadId,
        lead_name: lead.name,
        briefing,
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
