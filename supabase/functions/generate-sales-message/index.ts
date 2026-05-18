import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ANTHROPIC_MODEL = "claude-3-haiku-20240307";

type MessageType = "first_contact" | "follow_up" | "objection_handling" | "proposal" | "reengagement" | "smart_follow_up";

interface GeneratedMessage {
  message: string;
  tone: string;
  call_to_action: string;
  best_send_time: string;
  alternative_messages: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { contact_id, lead_id, message_type, custom_context, playbook_context } = await req.json() as {
      contact_id?: string;
      lead_id?: string;
      message_type: MessageType;
      custom_context?: string;
      playbook_context?: string;
    };

    const resolvedLeadId = lead_id || contact_id;

    if (!resolvedLeadId || !message_type) {
      return new Response(
        JSON.stringify({ error: "lead_id e message_type são obrigatórios" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const validTypes: MessageType[] = ["first_contact", "follow_up", "objection_handling", "proposal", "reengagement", "smart_follow_up"];
    if (!validTypes.includes(message_type)) {
      return new Response(
        JSON.stringify({ error: `message_type inválido. Use: ${validTypes.join(", ")}` }),
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

    // 2. Buscar mensagens recentes
    const { data: messages } = await supabase
      .from("whatsapp_messages")
      .select("content, is_from_me, created_at")
      .eq("lead_id", resolvedLeadId)
      .order("created_at", { ascending: false })
      .limit(20);

    // 3. Buscar insights de conversas anteriores
    const conversationInsights = lead.ai_conversation_insights;

    // 4. Buscar produtos
    const { data: products } = await supabase
      .from("products")
      .select("id, name, price, description")
      .eq("active", true)
      .limit(5);

    // 5. Buscar calls recentes
    const { data: calls } = await supabase
      .from("call_history")
      .select("ai_summary, ai_key_points, duration_seconds, started_at, direction")
      .eq("lead_id", resolvedLeadId)
      .order("started_at", { ascending: false })
      .limit(5);

    // 6. Buscar reuniões recentes
    const { data: meetings } = await supabase
      .from("meetings")
      .select("ai_summary, ai_key_points, started_at, status")
      .eq("lead_id", resolvedLeadId)
      .order("started_at", { ascending: false })
      .limit(3);

    // 7. Buscar deals ativos
    const { data: deals } = await supabase
      .from("deals")
      .select("title, value, status, pipeline_stage_id, probability, product:products(name)")
      .eq("lead_id", resolvedLeadId)
      .in("status", ["open", "negotiation", "proposal_sent"]);

    // 8. Buscar tarefas pendentes
    const { data: tasks } = await supabase
      .from("company_activities")
      .select("title, type, scheduled_at")
      .eq("lead_id", resolvedLeadId)
      .eq("status", "pending")
      .order("scheduled_at", { ascending: true })
      .limit(5);

    // Calcular dias desde último contato
    const lastMessage = messages?.[0];
    const daysSinceLastContact = lastMessage
      ? Math.floor((Date.now() - new Date(lastMessage.created_at).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const context: Record<string, any> = {
      lead: {
        name: lead.name,
        first_name: lead.name?.split(" ")[0] || "você",
        stage: lead.sales_stage,
        score: lead.sales_score,
        utm_source: lead.utm_source,
      },
      conversation: {
        total_messages: messages?.length || 0,
        days_since_last_contact: daysSinceLastContact,
        last_message_from_lead: messages?.find((m: any) => !m.is_from_me)?.content?.substring(0, 200),
        last_message_from_us: messages?.find((m: any) => m.is_from_me)?.content?.substring(0, 200),
      },
      insights: conversationInsights ? {
        objections: conversationInsights.objections,
        interests: conversationInsights.interests,
        sentiment: conversationInsights.sentiment,
      } : null,
      products: products?.map((p: any) => ({ name: p.name, price: p.price })),
      custom_context,
      playbook_context: playbook_context || null,
    };

    // Adicionar BANT ao contexto
    if (lead.bant_budget || lead.bant_authority || lead.bant_need || lead.bant_timeline) {
      context.bant = {
        budget: lead.bant_budget,
        authority: lead.bant_authority,
        need: lead.bant_need,
        timeline: lead.bant_timeline,
      };
    }

    // Adicionar calls ao contexto
    if (calls && calls.length > 0) {
      context.recent_calls = calls.map((c: any) => ({
        date: c.started_at,
        duration_seconds: c.duration_seconds,
        direction: c.direction,
        summary: c.ai_summary?.substring(0, 300),
        key_points: c.ai_key_points?.slice(0, 3),
      }));
    }

    // Adicionar reuniões ao contexto
    if (meetings && meetings.length > 0) {
      context.recent_meetings = meetings.map((m: any) => ({
        date: m.started_at,
        status: m.status,
        summary: m.ai_summary?.substring(0, 300),
        key_points: m.ai_key_points?.slice(0, 3),
      }));
    }

    // Adicionar deals ao contexto
    if (deals && deals.length > 0) {
      context.active_deals = deals.map((d: any) => ({
        title: d.title,
        value: d.value,
        status: d.status,
        probability: d.probability,
        product: (d.product as any)?.name,
      }));
    }

    // Adicionar tarefas pendentes ao contexto
    if (tasks && tasks.length > 0) {
      context.pending_tasks = tasks.map((t: any) => ({
        title: t.title,
        type: t.type,
        scheduled_at: t.scheduled_at,
      }));
    }

    // Prompts específicos por tipo de mensagem
    const typePrompts: Record<MessageType, string> = {
      first_contact: `Crie uma PRIMEIRA MENSAGEM de apresentação para este lead.
- Tom: Amigável e profissional
- Objetivo: Iniciar conversa e despertar interesse
- NÃO seja vendedor demais, foque em conhecer a pessoa
- Mencione de onde veio (se tiver UTM)
- Termine com uma pergunta aberta`,

      follow_up: `Crie uma mensagem de FOLLOW-UP para retomar o contato.
- Considere os dias sem resposta: ${daysSinceLastContact || "desconhecido"}
- Retome o assunto da última conversa de forma natural
- NÃO seja insistente ou desesperado
- Se passou muito tempo, use gatilho de novidade/oferta
- Termine com pergunta ou CTA claro`,

      objection_handling: `Crie uma mensagem para CONTORNAR OBJEÇÕES identificadas.
- Objeções detectadas: ${conversationInsights?.objections?.join(", ") || "nenhuma específica"}
- Use argumentos lógicos e emocionais
- Inclua prova social ou garantia se aplicável
- NÃO seja defensivo
- Valide a preocupação antes de contornar`,

      proposal: `Crie uma mensagem para APRESENTAR UMA PROPOSTA comercial.
- Seja direto mas não agressivo
- Destaque os benefícios principais
- Inclua condição especial ou urgência se fizer sentido
- Mencione forma de pagamento
- CTA claro para próximo passo`,

      reengagement: `Crie uma mensagem de REENGAJAMENTO para lead frio.
- Lead está inativo há muito tempo
- Use gatilho de novidade, oferta especial ou conteúdo de valor
- NÃO culpe o lead pelo sumiço
- Ofereça algo novo/diferente
- Tom leve e sem pressão`,

      smart_follow_up: `Crie uma mensagem CURTA de follow-up inteligente (2-3 frases no máximo).
- Analise TODO o contexto: conversas WhatsApp, calls, reuniões, deals, tarefas pendentes e BANT
- Retome O ASSUNTO MAIS RELEVANTE da última interação (call, reunião ou mensagem)
- Se houve uma call/reunião recente, referencie algo específico que foi discutido
- Se há deal ativo, conecte a mensagem ao próximo passo do deal
- Se há tarefa pendente, use como gancho natural
- Tom: casual-profissional, como um colega de confiança
- MÁXIMO 2-3 frases + CTA claro (pergunta ou próximo passo)
- NÃO seja genérico - a mensagem DEVE demonstrar que você se lembra da conversa
- Dias sem contato: ${daysSinceLastContact || "desconhecido"}`,
    };

    // Construir contexto do playbook
    const playbookSection = playbook_context
      ? `\n\n**PLAYBOOK DE VENDAS:**\n${playbook_context}\n\nUse este contexto para personalizar a mensagem com os produtos, tom e argumentos corretos.`
      : "";

    const systemPrompt = `Você é um copywriter especialista em mensagens de WhatsApp para vendas.${playbookSection}

${typePrompts[message_type]}

**REGRAS IMPORTANTES:**
1. Mensagens CURTAS (máx 3 parágrafos${message_type === 'smart_follow_up' ? ', idealmente 2-3 frases' : ''})
2. Use o PRIMEIRO NOME do lead
3. Tom conversacional, como se fosse um amigo
4. NÃO use emojis em excesso (máx 2-3)
5. NÃO use "Prezado", "Estimado" ou linguagem corporativa
6. SEMPRE termine com uma pergunta ou CTA
7. Seja AUTÊNTICO, não robótico

**FORMATO DE RESPOSTA (JSON):**
{
  "message": "A mensagem principal pronta para enviar",
  "tone": "tom usado (amigável/urgente/profissional/casual)",
  "call_to_action": "qual ação você quer que o lead tome",
  "best_send_time": "melhor horário para enviar (manhã/tarde/noite)",
  "alternative_messages": ["opção alternativa 1", "opção alternativa 2"]
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
        max_tokens: 1500,
        messages: [
          {
            role: "user",
            content: `${systemPrompt}\n\n**CONTEXTO DO LEAD:**\n${JSON.stringify(context, null, 2)}`,
          },
        ],
      }),
    });

    const anthropicResult = await response.json();

    if (!response.ok) {
      console.error("Anthropic error:", anthropicResult);
      return new Response(
        JSON.stringify({ error: "Erro ao gerar mensagem", details: anthropicResult }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resultContent = anthropicResult.content?.[0]?.text;
    let generated: GeneratedMessage;

    try {
      const jsonMatch = resultContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found");
      generated = JSON.parse(jsonMatch[0]);
    } catch {
      console.error("Parse error:", resultContent);
      return new Response(
        JSON.stringify({ error: "Erro ao parsear resposta da IA" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        lead_id: resolvedLeadId,
        message_type,
        ...generated,
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
