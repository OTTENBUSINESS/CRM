import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { isAuthorizedCaller, unauthorizedResponse } from "../_shared/requireCaller.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Instância CAROL (UAZAPI)
const CAROL_INSTANCE_ID = "e6f5adfa-6fb7-42b6-b837-fe33e8069877";
// Grupo comercial
const GRUPO_COMERCIAL_JID = "120363406734172905@g.us";

// Pipeline Closer - stages relevantes
const STAGE_CALL_REALIZADA = "11111111-0001-0001-0001-000000000006";
const STAGE_EM_FECHAMENTO = "11111111-0001-0001-0001-000000000007";

// ============================================================
// SHARED UTILS
// ============================================================

interface WhatsAppInstance {
  id: string;
  name: string;
  api_key: string;
  api_url: string;
}

async function sendWhatsApp(
  instance: WhatsAppInstance,
  targetJid: string,
  message: string
): Promise<boolean> {
  try {
    const response = await fetch(`${instance.api_url}/send/text`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        token: instance.api_key,
      },
      body: JSON.stringify({ number: targetJid, text: message }),
    });

    const result = await response.json();
    if (response.ok) {
      console.log(`✅ Mensagem enviada ao grupo`);
      return true;
    } else {
      console.error(`❌ Erro ao enviar:`, result);
      return false;
    }
  } catch (error) {
    console.error(`❌ Exceção ao enviar:`, error);
    return false;
  }
}

async function getInstance(supabase: any): Promise<WhatsAppInstance | null> {
  const { data, error } = await supabase
    .from("whatsapp_instances")
    .select("id, name, api_key, api_url")
    .eq("id", CAROL_INSTANCE_ID)
    .eq("status", "connected")
    .single();

  if (error || !data) {
    console.error("❌ Instância CAROL não disponível:", error);
    return null;
  }
  return data;
}

function toBRT(date: Date): Date {
  // UTC → BRT (UTC-3)
  return new Date(date.getTime() - 3 * 60 * 60 * 1000);
}

function formatTimeBRT(dateStr: string): string {
  const d = toBRT(new Date(dateStr));
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateBRT(date: Date): string {
  const d = toBRT(date);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatCurrency(value: number | null): string {
  if (!value) return "R$ 0";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

// ============================================================
// 1. MORNING SUMMARY — Pipeline quente + agenda do dia
// ============================================================

async function morningDigest(supabase: any): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(3, 0, 0, 0); // 00:00 BRT
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCHours(27, 0, 0, 0); // 00:00 BRT dia seguinte

  // 1. Deals em Call Realizada + Em Fechamento
  const { data: hotDeals } = await supabase
    .from("deals")
    .select("id, pipeline_stage_id, negotiated_price")
    .in("pipeline_stage_id", [STAGE_CALL_REALIZADA, STAGE_EM_FECHAMENTO])
    .not("status", "in", "(won,lost)");

  const callRealizada = (hotDeals || []).filter((d: any) => d.pipeline_stage_id === STAGE_CALL_REALIZADA);
  const emFechamento = (hotDeals || []).filter((d: any) => d.pipeline_stage_id === STAGE_EM_FECHAMENTO);
  const sumCR = callRealizada.reduce((s: number, d: any) => s + (d.negotiated_price || 0), 0);
  const sumEF = emFechamento.reduce((s: number, d: any) => s + (d.negotiated_price || 0), 0);

  // 2. Calls/meetings agendadas para hoje
  const { data: todayMeetings } = await supabase
    .from("company_activities")
    .select(
      `id, name, scheduled_at, confirmed_by_client, lead_id,
       lead:leads!company_activities_lead_id_fkey(name),
       responsavel:team_members!company_activities_responsavel_id_fkey(name)`
    )
    .in("team", ["sales", "comercial", "cs"])
    .in("task_type", ["meeting", "call"])
    .eq("completed", false)
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString())
    .order("scheduled_at", { ascending: true });

  const meetings = todayMeetings || [];
  const confirmed = meetings.filter((m: any) => m.confirmed_by_client);
  const pending = meetings.filter((m: any) => !m.confirmed_by_client);

  // --- Montar mensagem ---
  const dataBRT = formatDateBRT(now);
  let msg = `☀️ *BOM DIA, TIME!* — ${dataBRT}\n`;

  // Pipeline quente
  msg += `\n📊 *Pipeline Quente:*\n`;
  msg += `• Call Realizada: ${callRealizada.length} deal${callRealizada.length !== 1 ? "s" : ""} (${formatCurrency(sumCR)})\n`;
  msg += `• Em Fechamento: ${emFechamento.length} deal${emFechamento.length !== 1 ? "s" : ""} (${formatCurrency(sumEF)})\n`;

  // Agenda do dia
  msg += `\n📞 *Agenda de Hoje:*\n`;
  msg += `• ${meetings.length} call${meetings.length !== 1 ? "s" : ""}/reuniões agendadas\n`;
  msg += `• ${confirmed.length} confirmada${confirmed.length !== 1 ? "s" : ""} ✅ | ${pending.length} pendente${pending.length !== 1 ? "s" : ""} ⚠️\n`;

  // Lista breve de meetings
  if (meetings.length > 0) {
    msg += `\n`;
    for (const m of meetings) {
      const time = formatTimeBRT(m.scheduled_at);
      const leadName = m.lead?.name || "-";
      const closerName = m.responsavel?.name || "?";
      const status = m.confirmed_by_client ? "✅" : "⚠️";
      msg += `${time} — ${leadName} (${closerName}) ${status}\n`;
    }
  }

  msg += `\nBora fechar! 💰`;

  return msg;
}

// ============================================================
// 2. PRE-MEETING BRIEFING — 1h antes de cada reunião
// ============================================================

async function preMeetingBriefing(supabase: any): Promise<string[]> {
  const now = new Date();
  const min = new Date(now.getTime() + 50 * 60 * 1000); // 50 min
  const max = new Date(now.getTime() + 70 * 60 * 1000); // 70 min

  // Buscar reuniões na janela de 50-70 min
  const { data: meetings } = await supabase
    .from("company_activities")
    .select(
      `id, name, scheduled_at, meeting_link, responsavel_id, lead_id, confirmed_by_client, metadata,
       lead:leads!company_activities_lead_id_fkey(name, company_name, sales_score, bant_budget, bant_authority, bant_need, bant_timeline, phone),
       responsavel:team_members!company_activities_responsavel_id_fkey(name)`
    )
    .eq("task_type", "meeting")
    .eq("completed", false)
    .in("team", ["sales", "comercial", "cs"])
    .gte("scheduled_at", min.toISOString())
    .lte("scheduled_at", max.toISOString());

  if (!meetings || meetings.length === 0) return [];

  // Filtrar reuniões que já receberam briefing (metadata.briefing_sent)
  const pendingMeetings = meetings.filter(
    (m: any) => !m.metadata?.briefing_sent
  );
  if (pendingMeetings.length === 0) return [];

  const messages: string[] = [];

  for (const meeting of pendingMeetings) {
    const leadName = meeting.lead?.name || "Lead";
    const company = meeting.lead?.company_name || "";
    const score = meeting.lead?.sales_score;
    const time = formatTimeBRT(meeting.scheduled_at);
    const closerName = meeting.responsavel?.name || "Sem closer";

    // BANT
    const bant: string[] = [];
    if (meeting.lead?.bant_budget) bant.push(`💰 Budget: ${meeting.lead.bant_budget}`);
    if (meeting.lead?.bant_authority) bant.push(`👑 Authority: ${meeting.lead.bant_authority}`);
    if (meeting.lead?.bant_need) bant.push(`🎯 Need: ${meeting.lead.bant_need}`);
    if (meeting.lead?.bant_timeline) bant.push(`⏰ Timeline: ${meeting.lead.bant_timeline}`);

    // Buscar deal do lead
    let dealInfo = "";
    if (meeting.lead_id) {
      const { data: deal } = await supabase
        .from("deals")
        .select("title, negotiated_price, product_id")
        .eq("lead_id", meeting.lead_id)
        .not("status", "in", "(won,lost)")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (deal) {
        dealInfo = `\n💼 *Deal:* ${deal.title || "-"} — ${formatCurrency(deal.negotiated_price)}`;
        if (deal.product_id) dealInfo += ` (${deal.product_id})`;
      }
    }

    // Últimas mensagens WhatsApp
    let lastMsgs = "";
    if (meeting.lead_id) {
      const { data: msgs } = await supabase
        .from("whatsapp_messages")
        .select("content, direction, created_at")
        .eq("lead_id", meeting.lead_id)
        .order("created_at", { ascending: false })
        .limit(5);

      if (msgs && msgs.length > 0) {
        const lines = msgs
          .reverse()
          .map((m: any) => {
            const dir = m.direction === "outgoing" ? "→" : "←";
            const text =
              m.content?.length > 80
                ? m.content.substring(0, 80) + "..."
                : m.content || "";
            return `  ${dir} ${text}`;
          })
          .join("\n");
        lastMsgs = `\n\n💬 *Últimas mensagens:*\n${lines}`;
      }
    }

    const confirmed = meeting.confirmed_by_client
      ? "✅ Confirmada"
      : "⚠️ Não confirmada";

    let msg = `🔔 *BRIEFING PRÉ-REUNIÃO*\n\n`;
    msg += `👤 *${leadName}*${company ? ` — ${company}` : ""}\n`;
    msg += `🕐 *Horário:* ${time} — ${confirmed}\n`;
    msg += `🎯 *Closer:* ${closerName}\n`;
    if (score) msg += `📊 *Score:* ${score}/100\n`;
    if (bant.length > 0) msg += `\n${bant.join("\n")}\n`;
    msg += dealInfo;
    if (meeting.meeting_link) msg += `\n\n🔗 *Link:* ${meeting.meeting_link}`;
    msg += lastMsgs;

    msg += `\n\n🩸👁️ *LEMBREM! A VENDA OCORRE NA SEGUNDA COMPRA, E UM CLIENTE VIRA 10 COM PROCESSO DE INDICAÇÃO. VAMOS PARA CIMA, 20 MM ESSE ANO, SANGUE NO OLHO*`;

    messages.push(msg);

    // Marcar briefing como enviado
    const existingMetadata = meeting.metadata || {};
    await supabase
      .from("company_activities")
      .update({
        metadata: { ...existingMetadata, briefing_sent: new Date().toISOString() },
      })
      .eq("id", meeting.id);
  }

  return messages;
}

// ============================================================
// 3. EVENING REPORT — Fechamento do dia + cobrança contextual
// ============================================================

async function eveningReport(supabase: any): Promise<string> {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setUTCHours(3, 0, 0, 0); // 00:00 BRT
  const todayEnd = new Date(todayStart);
  todayEnd.setUTCHours(27, 0, 0, 0); // 00:00 BRT dia seguinte

  const dataBRT = formatDateBRT(now);

  // 1. Calls/reuniões realizadas hoje (completed)
  const { data: completedMeetings } = await supabase
    .from("company_activities")
    .select("id, status")
    .in("team", ["sales", "comercial", "cs"])
    .in("task_type", ["meeting", "call"])
    .eq("completed", true)
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString());

  // 2. No-shows de hoje
  const { data: noShowMeetings } = await supabase
    .from("company_activities")
    .select("id")
    .in("team", ["sales", "comercial", "cs"])
    .in("task_type", ["meeting", "call"])
    .eq("status", "no_show")
    .gte("scheduled_at", todayStart.toISOString())
    .lte("scheduled_at", todayEnd.toISOString());

  // 3. Deals ganhos hoje
  const { data: wonDeals } = await supabase
    .from("deals")
    .select(
      `id, title, negotiated_price,
       lead:leads!deals_lead_id_fkey(name),
       sales_rep:team_members!deals_sales_rep_id_fkey(name)`
    )
    .eq("status", "won")
    .gte("closed_at", todayStart.toISOString())
    .lte("closed_at", todayEnd.toISOString());

  // 4. Pipeline snapshot (Call Realizada + Em Fechamento)
  const { data: hotDeals } = await supabase
    .from("deals")
    .select("id, pipeline_stage_id, negotiated_price")
    .in("pipeline_stage_id", [STAGE_CALL_REALIZADA, STAGE_EM_FECHAMENTO])
    .not("status", "in", "(won,lost)");

  const callRealizada = (hotDeals || []).filter((d: any) => d.pipeline_stage_id === STAGE_CALL_REALIZADA);
  const emFechamento = (hotDeals || []).filter((d: any) => d.pipeline_stage_id === STAGE_EM_FECHAMENTO);

  const realizadas = completedMeetings?.length || 0;
  const noShows = noShowMeetings?.length || 0;
  const wins = wonDeals || [];
  const totalWonValue = wins.reduce((s: number, d: any) => s + (d.negotiated_price || 0), 0);

  // --- Montar mensagem ---
  let msg = `🌙 *FECHAMENTO DO DIA — ${dataBRT}*\n`;

  // Calls/Reuniões
  msg += `\n📞 *Calls/Reuniões:*\n`;
  msg += `• ${realizadas} realizada${realizadas !== 1 ? "s" : ""} ✅\n`;
  if (noShows > 0) {
    msg += `• ${noShows} no-show${noShows !== 1 ? "s" : ""} ❌\n`;
  }

  // Fechamentos
  msg += `\n💰 *Fechamentos:*\n`;
  if (wins.length > 0) {
    msg += `• ${wins.length} deal${wins.length !== 1 ? "s" : ""} ganho${wins.length !== 1 ? "s" : ""} (${formatCurrency(totalWonValue)})\n`;
    for (const deal of wins) {
      msg += `  🏆 ${deal.lead?.name || deal.title} — ${formatCurrency(deal.negotiated_price)} (${deal.sales_rep?.name || "?"})\n`;
    }
  } else {
    msg += `• Nenhum fechamento hoje\n`;
  }

  // Pipeline
  msg += `\n📊 *Pipeline:*\n`;
  msg += `• Call Realizada: ${callRealizada.length} deal${callRealizada.length !== 1 ? "s" : ""}\n`;
  msg += `• Em Fechamento: ${emFechamento.length} deal${emFechamento.length !== 1 ? "s" : ""}\n`;

  // Mensagem de cobrança contextual
  msg += `\n━━━━━━━━━━━━━━━━━━━━\n`;
  if (wins.length > 0) {
    msg += `💪 Parabéns pelo resultado! ${wins.length} fechamento${wins.length !== 1 ? "s" : ""} hoje. Amanhã tem mais! 🔥`;
  } else if (noShows > 0) {
    msg += `⚠️ ${noShows} no-show${noShows !== 1 ? "s" : ""} hoje. Confirmar reuniões no D-1 é fundamental. Quem está em Call Realizada? Quem pode fechar amanhã?`;
  } else if (callRealizada.length > 0 || emFechamento.length > 0) {
    msg += `💪 Dia sem fechamento, mas tem ${callRealizada.length + emFechamento.length} deal${(callRealizada.length + emFechamento.length) !== 1 ? "s" : ""} quente${(callRealizada.length + emFechamento.length) !== 1 ? "s" : ""}. Quem fecha amanhã? 🔥`;
  } else {
    msg += `💪 Amanhã é dia de virada. Bora pra cima! 🔥`;
  }

  return msg;
}

// ============================================================
// MAIN HANDLER
// ============================================================

Deno.serve(async (req: Request) => {
  if (req.method !== "OPTIONS" && !isAuthorizedCaller(req)) return unauthorizedResponse();
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const type = body.type || "morning_summary";

    console.log(`🔔 daily-sales-digest: tipo=${type}`);

    const instance = await getInstance(supabase);
    if (!instance) {
      return new Response(
        JSON.stringify({ error: "Instância CAROL não disponível" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
      );
    }

    let sent = 0;
    let errors: string[] = [];

    switch (type) {
      case "morning_summary": {
        const msg = await morningDigest(supabase);
        if (msg) {
          const ok = await sendWhatsApp(instance, GRUPO_COMERCIAL_JID, msg);
          ok ? sent++ : errors.push("Falha ao enviar morning_summary");
        }
        break;
      }

      case "pre_meeting_briefing": {
        const msgs = await preMeetingBriefing(supabase);
        for (const msg of msgs) {
          const ok = await sendWhatsApp(instance, GRUPO_COMERCIAL_JID, msg);
          ok ? sent++ : errors.push("Falha ao enviar briefing");
        }
        break;
      }

      case "evening_report": {
        const msg = await eveningReport(supabase);
        if (msg) {
          const ok = await sendWhatsApp(instance, GRUPO_COMERCIAL_JID, msg);
          ok ? sent++ : errors.push("Falha ao enviar evening_report");
        }
        break;
      }

      default:
        return new Response(
          JSON.stringify({ error: `Tipo desconhecido: ${type}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
    }

    console.log(`✅ Concluído: ${sent} mensagen(s) enviada(s), ${errors.length} erro(s)`);

    return new Response(
      JSON.stringify({ success: true, type, sent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Erro:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
