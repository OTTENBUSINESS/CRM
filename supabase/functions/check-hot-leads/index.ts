import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface HotLeadCheck {
  contact_id: string;
  contact_name: string;
  alert_type: string;
  reason: string;
  priority: number;
  score: number;
  triggers: string[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const hotLeads: HotLeadCheck[] = [];
    const now = new Date();

    // 1. TRIGGER: Checkouts abandonados nas últimas 24h
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const { data: abandonedCheckouts } = await supabase
      .from("checkouts")
      .select(`
        id,
        lead_id,
        product_name,
        amount,
        created_at,
        contact:contacts(id, name, sales_rep_id, sales_score)
      `)
      .eq("status", "abandoned")
      .gte("created_at", oneDayAgo.toISOString())
      .limit(50);

    for (const checkout of abandonedCheckouts || []) {
      if (checkout.contact) {
        hotLeads.push({
          contact_id: checkout.contact.id,
          contact_name: checkout.contact.name,
          alert_type: "checkout_abandoned",
          reason: `Abandonou checkout de ${checkout.product_name} (R$ ${checkout.amount})`,
          priority: 9,
          score: checkout.contact.sales_score || 50,
          triggers: ["checkout_abandonado", `produto:${checkout.product_name}`],
        });
      }
    }

    // 2. TRIGGER: Leads que enviaram mensagem após 7+ dias inativos
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

    const { data: reengagedLeads } = await supabase
      .from("whatsapp_messages")
      .select(`
        id,
        contact_id,
        created_at,
        content,
        contact:contacts(id, name, sales_rep_id, sales_score)
      `)
      .eq("is_from_me", false)
      .gte("created_at", twoDaysAgo.toISOString())
      .order("created_at", { ascending: false })
      .limit(100);

    // Verificar se o lead estava inativo antes
    for (const msg of reengagedLeads || []) {
      if (!msg.contact) continue;

      // Buscar mensagem anterior do lead
      const { data: previousMessages } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("contact_id", msg.contact_id)
        .eq("is_from_me", false)
        .lt("created_at", msg.created_at)
        .order("created_at", { ascending: false })
        .limit(1);

      if (previousMessages?.[0]) {
        const previousDate = new Date(previousMessages[0].created_at);
        const daysSincePrevious = Math.floor(
          (new Date(msg.created_at).getTime() - previousDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSincePrevious >= 7) {
          hotLeads.push({
            contact_id: msg.contact.id,
            contact_name: msg.contact.name,
            alert_type: "reengagement",
            reason: `Voltou a entrar em contato após ${daysSincePrevious} dias inativo`,
            priority: 8,
            score: msg.contact.sales_score || 60,
            triggers: ["reengajamento", `dias_inativo:${daysSincePrevious}`],
          });
        }
      }
    }

    // 3. TRIGGER: Leads com score alto sem contato há 2+ dias
    const { data: highScoreLeads } = await supabase
      .from("contacts")
      .select("id, name, sales_rep_id, sales_score, sales_stage")
      .gte("sales_score", 70)
      .not("sales_stage", "in", '("won","lost")')
      .limit(50);

    for (const lead of highScoreLeads || []) {
      // Verificar última mensagem enviada
      const { data: lastOutbound } = await supabase
        .from("whatsapp_messages")
        .select("created_at")
        .eq("contact_id", lead.id)
        .eq("is_from_me", true)
        .order("created_at", { ascending: false })
        .limit(1);

      if (lastOutbound?.[0]) {
        const lastDate = new Date(lastOutbound[0].created_at);
        const daysSinceContact = Math.floor(
          (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (daysSinceContact >= 2) {
          hotLeads.push({
            contact_id: lead.id,
            contact_name: lead.name,
            alert_type: "hot_lead",
            reason: `Score ${lead.sales_score} e sem contato há ${daysSinceContact} dias`,
            priority: 7,
            score: lead.sales_score,
            triggers: ["score_alto", `sem_contato:${daysSinceContact}d`],
          });
        }
      }
    }

    // 4. TRIGGER: Mensagens com palavras de urgência
    const urgencyKeywords = [
      "urgente",
      "preciso hoje",
      "para ontem",
      "logo",
      "rápido",
      "prazo",
      "deadline",
      "agora",
      "imediato",
    ];

    const { data: urgentMessages } = await supabase
      .from("whatsapp_messages")
      .select(`
        id,
        contact_id,
        content,
        created_at,
        contact:contacts(id, name, sales_rep_id, sales_score)
      `)
      .eq("is_from_me", false)
      .gte("created_at", oneDayAgo.toISOString())
      .limit(200);

    for (const msg of urgentMessages || []) {
      if (!msg.content || !msg.contact) continue;

      const contentLower = msg.content.toLowerCase();
      const foundKeywords = urgencyKeywords.filter((kw) =>
        contentLower.includes(kw)
      );

      if (foundKeywords.length > 0) {
        // Evitar duplicatas
        if (!hotLeads.some((h) => h.contact_id === msg.contact.id && h.alert_type === "urgency_detected")) {
          hotLeads.push({
            contact_id: msg.contact.id,
            contact_name: msg.contact.name,
            alert_type: "urgency_detected",
            reason: `Detectada urgência: "${foundKeywords.join(", ")}"`,
            priority: 9,
            score: msg.contact.sales_score || 70,
            triggers: foundKeywords.map((k) => `urgencia:${k}`),
          });
        }
      }
    }

    // Remover duplicatas por contact_id (manter o de maior prioridade)
    const uniqueLeads = hotLeads.reduce((acc, lead) => {
      const existing = acc.find((l) => l.contact_id === lead.contact_id);
      if (!existing || existing.priority < lead.priority) {
        return [
          ...acc.filter((l) => l.contact_id !== lead.contact_id),
          lead,
        ];
      }
      return acc;
    }, [] as HotLeadCheck[]);

    // Ordenar por prioridade
    uniqueLeads.sort((a, b) => b.priority - a.priority);

    // Criar alertas no banco
    const alertsToCreate = [];
    for (const lead of uniqueLeads) {
      // Verificar se já existe alerta ativo similar
      const { data: existingAlert } = await supabase
        .from("sales_alerts")
        .select("id")
        .eq("contact_id", lead.contact_id)
        .eq("alert_type", lead.alert_type)
        .eq("is_actioned", false)
        .single();

      if (!existingAlert) {
        alertsToCreate.push({
          contact_id: lead.contact_id,
          alert_type: lead.alert_type,
          title: `${lead.alert_type === "checkout_abandoned" ? "🛒" : lead.alert_type === "urgency_detected" ? "🔥" : "⚡"} ${lead.contact_name}`,
          description: lead.reason,
          priority: lead.priority,
          metadata: {
            score: lead.score,
            triggers: lead.triggers,
          },
        });
      }
    }

    if (alertsToCreate.length > 0) {
      const { error } = await supabase.from("sales_alerts").insert(alertsToCreate);
      if (error) {
        console.error("Erro ao criar alertas:", error);
      }
    }

    console.log(`Check hot leads: ${uniqueLeads.length} leads quentes, ${alertsToCreate.length} alertas criados`);

    return new Response(
      JSON.stringify({
        success: true,
        hot_leads_found: uniqueLeads.length,
        alerts_created: alertsToCreate.length,
        leads: uniqueLeads.slice(0, 20), // Retorna top 20
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
