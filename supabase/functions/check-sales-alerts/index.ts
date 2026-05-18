import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Pipeline stage UUIDs
const STAGE_CALL_REALIZADA = "11111111-0001-0001-0001-000000000006";
const STAGE_EM_FECHAMENTO = "11111111-0001-0001-0001-000000000007";

// Group JID for sales team
const GROUP_JID = "120363406734172905@g.us";

// ========== UTILS ==========

function formatPhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, "");
  if (!cleaned.startsWith("55") && cleaned.length <= 11) {
    cleaned = "55" + cleaned;
  }
  return cleaned;
}

function toBRT(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function toBRTTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function hoursAgo(dateStr: string): number {
  return Math.floor(
    (Date.now() - new Date(dateStr).getTime()) / (1000 * 60 * 60)
  );
}

async function sendGroupMessage(
  instance: { api_url: string; api_key: string },
  text: string
): Promise<boolean> {
  try {
    const res = await fetch(`${instance.api_url}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: instance.api_key,
      },
      body: JSON.stringify({ number: GROUP_JID, text }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[Alerts] Failed to send message:", err);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Alerts] Send error:", err);
    return false;
  }
}

async function getWhatsAppInstance(supabase: any) {
  const { data } = await supabase
    .from("whatsapp_instances")
    .select("id, api_key, api_url")
    .eq("status", "connected")
    .limit(1)
    .single();
  return data;
}

// Meta do time — sempre presente em mensagens de cobrança
const TEAM_META = "🔥🔥🔥 20 MM POR ANO, 5 MM POR MÊS. BORA PARA CIMA, SANGUE NOS OLHOS! 🩸👁️";

/**
 * Busca frase motivacional via RPC
 */
async function getMotivationalQuote(
  supabase: any,
  context: string
): Promise<{ quote: string; source: string } | null> {
  try {
    const { data, error } = await supabase.rpc("get_motivational_quote", {
      p_context: context,
    });
    if (error || !data || data.length === 0) return null;
    return data[0];
  } catch {
    return null;
  }
}

/**
 * Append frase motivacional + meta ao final da mensagem
 */
function appendQuoteAndMeta(msg: string, quote: { quote: string; source: string } | null): string {
  let result = msg;
  if (quote) {
    result += `\n\n💬 _"${quote.quote}"_\n— ${quote.source}`;
  }
  result += `\n\n${TEAM_META}`;
  return result;
}

// ========== ALERT TYPE: NO FOLLOW-UP ==========

async function checkNoFollowup(supabase: any, instance: any, quote: { quote: string; source: string } | null) {
  console.log("[Alerts] Checking no-followup...");
  let alertsCreated = 0;
  let messagesSent = 0;

  // CRITICAL: Deals in "Em Fechamento" or "Call Realizada" without WhatsApp message in 24h
  const { data: criticalDeals } = await supabase
    .from("deals")
    .select(
      `
      id, title, negotiated_price, pipeline_stage_id, updated_at,
      lead:leads!inner(id, name, phone),
      sales_rep:team_members!inner(id, name, phone)
    `
    )
    .eq("status", "open")
    .in("pipeline_stage_id", [STAGE_CALL_REALIZADA, STAGE_EM_FECHAMENTO]);

  if (criticalDeals && criticalDeals.length > 0) {
    const cutoff24h = new Date(
      Date.now() - 24 * 60 * 60 * 1000
    ).toISOString();

    for (const deal of criticalDeals) {
      if (!deal.lead?.id) continue;

      // Check for recent WhatsApp messages
      const { count: recentMsgCount } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", deal.lead.id)
        .gte("created_at", cutoff24h);

      if (recentMsgCount && recentMsgCount > 0) continue;

      // Check for recent calls
      const { count: recentCallCount } = await supabase
        .from("call_history")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", deal.lead.id)
        .gte("started_at", cutoff24h);

      if (recentCallCount && recentCallCount > 0) continue;

      // Check deduplication: no unactioned alert of same type for this lead
      const { data: existingAlert } = await supabase
        .from("sales_alerts")
        .select("id")
        .eq("lead_id", deal.lead.id)
        .eq("alert_type", "no_followup_critical")
        .eq("is_actioned", false)
        .maybeSingle();

      if (existingAlert) continue;

      const stageName =
        deal.pipeline_stage_id === STAGE_EM_FECHAMENTO
          ? "Em Fechamento"
          : "Call Realizada";
      const hoursSince = hoursAgo(deal.updated_at);
      const value = deal.negotiated_price
        ? `R$${Number(deal.negotiated_price).toLocaleString("pt-BR")}`
        : "";

      // Insert alert
      await supabase.from("sales_alerts").insert({
        lead_id: deal.lead.id,
        sales_rep_id: deal.sales_rep?.id || null,
        alert_type: "no_followup_critical",
        title: `${deal.lead.name} — sem contato há ${hoursSince}h`,
        description: `Deal "${deal.title}" em ${stageName} ${value}. Closer: ${deal.sales_rep?.name}. Sem mensagem ou ligação há ${hoursSince}h.`,
        priority: 9,
        metadata: {
          deal_id: deal.id,
          stage: stageName,
          hours_since_contact: hoursSince,
        },
      });
      alertsCreated++;

      // Send WhatsApp group message
      const repPhone = deal.sales_rep?.phone
        ? formatPhone(deal.sales_rep.phone)
        : "";
      const mention = repPhone ? `@${repPhone}` : deal.sales_rep?.name || "";

      const msgBase = [
        `🚨 *ALERTA: LEAD SEM FOLLOW-UP*`,
        ``,
        `💰 *Deal:* ${deal.title} ${value ? `— ${value}` : ""}`,
        `👤 *Lead:* ${deal.lead.name}`,
        `📊 *Etapa:* ${stageName}`,
        `⏰ *Sem contato há:* ${hoursSince}h`,
        `👤 *Closer:* ${mention}`,
        ``,
        `⚡ Prioridade MÁXIMA — entre em contato AGORA!`,
      ].join("\n");

      if (await sendGroupMessage(instance, appendQuoteAndMeta(msgBase, quote))) {
        messagesSent++;
      }
    }
  }

  // MEDIUM: Any active lead without messages in 48h
  const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const { data: staleDeals } = await supabase
    .from("deals")
    .select(
      `
      id, title, pipeline_stage_id,
      lead:leads!inner(id, name),
      sales_rep:team_members!inner(id, name, phone)
    `
    )
    .eq("status", "open")
    .not("pipeline_stage_id", "in", `(${STAGE_CALL_REALIZADA},${STAGE_EM_FECHAMENTO})`)
    .limit(50);

  if (staleDeals) {
    for (const deal of staleDeals) {
      if (!deal.lead?.id) continue;

      const { count: recentMsgCount } = await supabase
        .from("whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", deal.lead.id)
        .gte("created_at", cutoff48h);

      if (recentMsgCount && recentMsgCount > 0) continue;

      const { count: recentCallCount } = await supabase
        .from("call_history")
        .select("id", { count: "exact", head: true })
        .eq("lead_id", deal.lead.id)
        .gte("started_at", cutoff48h);

      if (recentCallCount && recentCallCount > 0) continue;

      // Deduplication
      const { data: existingAlert } = await supabase
        .from("sales_alerts")
        .select("id")
        .eq("lead_id", deal.lead.id)
        .eq("alert_type", "no_followup_medium")
        .eq("is_actioned", false)
        .maybeSingle();

      if (existingAlert) continue;

      await supabase.from("sales_alerts").insert({
        lead_id: deal.lead.id,
        sales_rep_id: deal.sales_rep?.id || null,
        alert_type: "no_followup_medium",
        title: `${deal.lead.name} — sem follow-up há 48h+`,
        description: `Lead sem mensagem ou ligação há mais de 48h. Deal: "${deal.title}". Closer: ${deal.sales_rep?.name}.`,
        priority: 5,
        metadata: { deal_id: deal.id },
      });
      alertsCreated++;
    }
  }

  console.log(
    `[Alerts] no_followup: ${alertsCreated} alerts, ${messagesSent} messages`
  );
  return { alertsCreated, messagesSent };
}

// ========== ALERT TYPE: OVERDUE TASKS ==========

async function checkOverdueTasks(supabase: any, instance: any, quote: { quote: string; source: string } | null) {
  console.log("[Alerts] Checking overdue tasks...");
  let alertsCreated = 0;
  let messagesSent = 0;

  const { data: overdueTasks } = await supabase
    .from("company_activities")
    .select(
      `
      id, name, task_type, scheduled_at, priority,
      responsavel:team_members!company_activities_responsavel_id_fkey(id, name, phone),
      lead:leads(id, name)
    `
    )
    .lt("scheduled_at", new Date().toISOString())
    .or("completed.is.null,completed.eq.false")
    .not("status", "in", '("completed","cancelled")')
    .eq("team", "comercial")
    .not("responsavel_id", "is", null)
    .not("lead_id", "is", null)
    .order("scheduled_at", { ascending: true })
    .limit(50);

  if (!overdueTasks || overdueTasks.length === 0) {
    console.log("[Alerts] No overdue tasks found");
    return { alertsCreated: 0, messagesSent: 0 };
  }

  for (const task of overdueTasks) {
    const overdueHours = hoursAgo(task.scheduled_at);
    const isEscalation = overdueHours >= 4;
    const alertType = isEscalation ? "overdue_task_escalated" : "overdue_task";

    // Deduplication
    const { data: existingAlert } = await supabase
      .from("sales_alerts")
      .select("id")
      .eq("alert_type", alertType)
      .eq("is_actioned", false)
      .filter("metadata->>task_id", "eq", task.id)
      .maybeSingle();

    if (existingAlert) continue;

    // For escalation, also skip if a non-escalated alert already sent and it's the same check
    if (isEscalation) {
      // Clean up the non-escalated alert
      await supabase
        .from("sales_alerts")
        .update({ is_actioned: true, actioned_at: new Date().toISOString() })
        .eq("alert_type", "overdue_task")
        .eq("is_actioned", false)
        .filter("metadata->>task_id", "eq", task.id);
    }

    const leadId = task.lead?.id;
    // sales_alerts requires lead_id (NOT NULL). If no lead, try to find from task context.
    if (!leadId) continue;

    await supabase.from("sales_alerts").insert({
      lead_id: leadId,
      sales_rep_id: task.responsavel?.id || null,
      alert_type: alertType,
      title: `${task.name} — atrasada ${overdueHours}h`,
      description: isEscalation
        ? `Tarefa atrasada há ${overdueHours}h. ESCALONADA ao gestor. Lead: ${task.lead?.name || "N/A"}. Responsável: ${task.responsavel?.name || "N/A"}.`
        : `Tarefa atrasada há ${overdueHours}h. Lead: ${task.lead?.name || "N/A"}. Responsável: ${task.responsavel?.name || "N/A"}.`,
      priority: isEscalation ? 9 : 7,
      metadata: {
        task_id: task.id,
        task_type: task.task_type,
        overdue_hours: overdueHours,
        escalated: isEscalation,
      },
    });
    alertsCreated++;

    // Send WhatsApp group message
    const repPhone = task.responsavel?.phone
      ? formatPhone(task.responsavel.phone)
      : "";
    const mention = repPhone ? `@${repPhone}` : task.responsavel?.name || "";
    const scheduledBRT = toBRT(task.scheduled_at);

    let msgBase: string;
    if (isEscalation) {
      msgBase = [
        `🔴 *ESCALONAMENTO — TAREFA ATRASADA ${overdueHours}h+*`,
        ``,
        `📋 *${task.name}*`,
        `👤 *Lead:* ${task.lead?.name || "N/A"}`,
        `🕐 *Prazo original:* ${scheduledBRT}`,
        `⏱️ *Atraso:* ${overdueHours}h`,
        `👤 *Responsável:* ${mention}`,
        ``,
        `🚨 Gestor, tarefa não foi cumprida. Intervenção necessária.`,
      ].join("\n");
    } else {
      msgBase = [
        `⏰ *TAREFA ATRASADA*`,
        ``,
        `📋 *${task.name}*`,
        `👤 *Lead:* ${task.lead?.name || "N/A"}`,
        `🕐 *Prazo:* ${scheduledBRT}`,
        `⏱️ *Atraso:* ${overdueHours}h`,
        `👤 *Responsável:* ${mention}`,
        ``,
        `⚠️ Finalize esta tarefa o quanto antes!`,
      ].join("\n");
    }

    if (await sendGroupMessage(instance, appendQuoteAndMeta(msgBase, quote))) {
      messagesSent++;
    }
  }

  console.log(
    `[Alerts] overdue_tasks: ${alertsCreated} alerts, ${messagesSent} messages`
  );
  return { alertsCreated, messagesSent };
}

// ========== ALERT TYPE: UNCONFIRMED MEETINGS ==========

async function checkUnconfirmedMeetings(supabase: any, instance: any, quote: { quote: string; source: string } | null) {
  console.log("[Alerts] Checking unconfirmed meetings...");
  let alertsCreated = 0;
  let messagesSent = 0;

  // Today in BRT
  const now = new Date();
  const brtOffset = -3 * 60;
  const brtNow = new Date(now.getTime() + (brtOffset + now.getTimezoneOffset()) * 60000);
  const todayStr = brtNow.toISOString().split("T")[0];

  const { data: meetings } = await supabase
    .from("company_activities")
    .select(
      `
      id, name, task_type, scheduled_at, confirmed_by_client, metadata,
      responsavel:team_members!company_activities_responsavel_id_fkey(id, name, phone),
      lead:leads(id, name, phone)
    `
    )
    .gte("scheduled_at", `${todayStr}T00:00:00-03:00`)
    .lte("scheduled_at", `${todayStr}T23:59:59-03:00`)
    .in("task_type", ["meeting", "call"])
    .or("confirmed_by_client.is.null,confirmed_by_client.eq.false")
    .or("completed.is.null,completed.eq.false")
    .not("status", "in", '("completed","cancelled","confirmed")')
    .eq("team", "comercial");

  if (!meetings || meetings.length === 0) {
    console.log("[Alerts] No unconfirmed meetings found");
    return { alertsCreated: 0, messagesSent: 0 };
  }

  for (const meeting of meetings) {
    if (!meeting.lead?.id) continue;

    // Check how many call attempts were made for this meeting today
    const { count: callAttempts } = await supabase
      .from("call_history")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", meeting.lead.id)
      .gte("started_at", `${todayStr}T00:00:00-03:00`)
      .eq("direction", "outbound");

    const attempts = callAttempts || 0;
    const isEscalated = attempts >= 3;
    const alertType = isEscalated
      ? "unconfirmed_meeting_escalated"
      : "unconfirmed_meeting";

    // Deduplication: check existing alert for this specific task
    const { data: existingAlert } = await supabase
      .from("sales_alerts")
      .select("id, metadata")
      .eq("lead_id", meeting.lead.id)
      .eq("alert_type", alertType)
      .eq("is_actioned", false)
      .filter("metadata->>task_id", "eq", meeting.id)
      .maybeSingle();

    if (existingAlert) {
      // For unconfirmed_meeting, we re-send the reminder but don't create a new alert
      // (the cron runs every 90min so this is the "lembrete a cada 90min")
      if (!isEscalated) {
        const repPhone = meeting.responsavel?.phone
          ? formatPhone(meeting.responsavel.phone)
          : "";
        const mention = repPhone
          ? `@${repPhone}`
          : meeting.responsavel?.name || "";
        const meetingTime = toBRTTime(meeting.scheduled_at);

        const msgBase = [
          `⚠️ *REUNIÃO NÃO CONFIRMADA*`,
          ``,
          `🤝 *${meeting.name}*`,
          `👤 *Lead:* ${meeting.lead.name}`,
          `🕐 *Horário:* ${meetingTime}`,
          `📞 *Telefone:* ${meeting.lead.phone || "N/A"}`,
          `👤 *Closer:* ${mention}`,
          ``,
          `📞 Ligue para confirmar! (Tentativa ${attempts}/3)`,
        ].join("\n");

        if (await sendGroupMessage(instance, appendQuoteAndMeta(msgBase, quote))) {
          messagesSent++;
        }
      }
      continue;
    }

    // If escalated, close the non-escalated alert
    if (isEscalated) {
      await supabase
        .from("sales_alerts")
        .update({ is_actioned: true, actioned_at: new Date().toISOString() })
        .eq("lead_id", meeting.lead.id)
        .eq("alert_type", "unconfirmed_meeting")
        .eq("is_actioned", false)
        .filter("metadata->>task_id", "eq", meeting.id);
    }

    await supabase.from("sales_alerts").insert({
      lead_id: meeting.lead.id,
      sales_rep_id: meeting.responsavel?.id || null,
      alert_type: alertType,
      title: isEscalated
        ? `${meeting.lead.name} — reunião sem confirmação, 3 tentativas`
        : `${meeting.lead.name} — reunião não confirmada`,
      description: isEscalated
        ? `Reunião "${meeting.name}" sem confirmação após 3 ligações. ESCALONADO ao gestor.`
        : `Reunião "${meeting.name}" agendada para ${toBRTTime(meeting.scheduled_at)} sem confirmação do lead.`,
      priority: isEscalated ? 9 : 7,
      metadata: {
        task_id: meeting.id,
        call_attempts: attempts,
        meeting_time: meeting.scheduled_at,
        escalated: isEscalated,
      },
    });
    alertsCreated++;

    // Send WhatsApp group message
    const repPhone = meeting.responsavel?.phone
      ? formatPhone(meeting.responsavel.phone)
      : "";
    const mention = repPhone
      ? `@${repPhone}`
      : meeting.responsavel?.name || "";
    const meetingTime = toBRTTime(meeting.scheduled_at);

    let msgBase2: string;
    if (isEscalated) {
      msgBase2 = [
        `🔴 *REUNIÃO SEM CONFIRMAÇÃO — 3 TENTATIVAS*`,
        ``,
        `🤝 *${meeting.name}*`,
        `👤 *Lead:* ${meeting.lead.name}`,
        `🕐 *Horário:* ${meetingTime}`,
        `👤 *Closer:* ${mention}`,
        ``,
        `🚨 3 ligações sem sucesso. Gestor, decidir próximo passo.`,
      ].join("\n");
    } else {
      msgBase2 = [
        `⚠️ *REUNIÃO NÃO CONFIRMADA*`,
        ``,
        `🤝 *${meeting.name}*`,
        `👤 *Lead:* ${meeting.lead.name}`,
        `🕐 *Horário:* ${meetingTime}`,
        `📞 *Telefone:* ${meeting.lead.phone || "N/A"}`,
        `👤 *Closer:* ${mention}`,
        ``,
        `📞 Ligue para confirmar! (Tentativa ${attempts}/3)`,
      ].join("\n");
    }

    if (await sendGroupMessage(instance, appendQuoteAndMeta(msgBase2, quote))) {
      messagesSent++;
    }
  }

  console.log(
    `[Alerts] unconfirmed_meetings: ${alertsCreated} alerts, ${messagesSent} messages`
  );
  return { alertsCreated, messagesSent };
}

// ========== MAIN ==========

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let body: { type?: string } = {};
    try {
      body = await req.json();
    } catch {
      // No body = run all checks
    }

    const checkType = body.type || "all";

    // Get WhatsApp instance
    const instance = await getWhatsAppInstance(supabase);
    if (!instance) {
      console.error("[Alerts] No connected WhatsApp instance found");
      return new Response(
        JSON.stringify({ error: "No WhatsApp instance connected" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch motivational quote once per execution (shared across all checks)
    const quote = await getMotivationalQuote(supabase, "accountability");

    const results: Record<string, any> = {};

    if (checkType === "all" || checkType === "no_followup") {
      results.no_followup = await checkNoFollowup(supabase, instance, quote);
    }

    if (checkType === "all" || checkType === "overdue_tasks") {
      results.overdue_tasks = await checkOverdueTasks(supabase, instance, quote);
    }

    if (checkType === "all" || checkType === "unconfirmed_meetings") {
      results.unconfirmed_meetings = await checkUnconfirmedMeetings(
        supabase,
        instance,
        quote
      );
    }

    console.log("[Alerts] Results:", JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[Alerts] Fatal error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
