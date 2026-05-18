import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getIntegrationKey } from "../_shared/config.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GOOGLE_CLIENT_ID =
  Deno.env.get("GOOGLE_CLIENT_ID") ||
  "36845942377-3gf0kttlo5cp3csg1a0nfo2dhgqia8ig.apps.googleusercontent.com";
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;

const SAMUEL_ID = "5da87f94-4351-4c5d-b9ab-2976c39fdb09";
const WEBINAR_PIPELINE_ID = "90b09d81-8282-4503-a869-1787baf8f736";
const WEBINAR_AGENDOU_STAGE_ID = "8c08612a-6ff8-4505-836e-006ee69fb5c3";
const CLOSER_PIPELINE_ID = "9c21bd06-a898-44a1-88db-ad3c6ec7140c";
const CLOSER_CALL_AGENDADA_STAGE_ID = "11111111-0001-0001-0001-000000000004";

const UTM_SOURCE = "webinar_pitch";
const UTM_CAMPAIGN = "agendamento_0704";

// ─── Slot rules ──────────────────────────────────────────────────────────────
const FIRST_SLOT_BRT = 9;  // 09:00 BRT (default)
const FIRST_DAY_FIRST_SLOT_BRT = 10; // 10:00 BRT (first available day only — hardcoded for 08/04)
const FIRST_DAY_DATE = "2026-04-08";
const LAST_SLOT_BRT = 19; // 19:00 BRT (meeting ends 20:00)
const SLOT_DURATION_MIN = 60;
const SLOT_GAP_MIN = 20;
const SLOT_STEP_MIN = SLOT_DURATION_MIN + SLOT_GAP_MIN; // 80 min between starts
const MAX_DAYS_TO_SHOW = 3; // show 3 days with available slots
const MAX_DAYS_TO_SEARCH = 14; // search up to 14 days ahead

// Generate next business days starting from tomorrow (or a specific date)
function getNextBusinessDays(startDate: string, count: number, maxSearch: number): { date: string; firstSlotBRT: number }[] {
  const result: { date: string; firstSlotBRT: number }[] = [];
  const start = new Date(startDate + "T12:00:00Z");

  for (let i = 0; i < maxSearch && result.length < count; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const dayOfWeek = d.getUTCDay(); // 0=Sun, 6=Sat
    if (dayOfWeek === 0 || dayOfWeek === 6) continue; // skip weekends

    const dateStr = d.toISOString().split("T")[0];
    const firstSlot = dateStr === FIRST_DAY_DATE ? FIRST_DAY_FIRST_SLOT_BRT : FIRST_SLOT_BRT;
    result.push({ date: dateStr, firstSlotBRT: firstSlot });
  }
  return result;
}

// ─── Google token helpers ─────────────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    if (!response.ok) {
      console.error("Failed to refresh token:", await response.text());
      return null;
    }
    return await response.json();
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

async function getValidAccessToken(supabase: any, teamMemberId: string) {
  const { data: member, error } = await supabase
    .from("team_members")
    .select(
      "google_access_token, google_refresh_token, google_token_expires_at"
    )
    .eq("id", teamMemberId)
    .single();

  if (error || !member) throw new Error("Team member not found");
  if (!member.google_access_token || !member.google_refresh_token) {
    throw new Error("Google Calendar not connected.");
  }

  let accessToken = member.google_access_token;
  const tokenExpiry = member.google_token_expires_at
    ? new Date(member.google_token_expires_at)
    : new Date(0);

  if (tokenExpiry <= new Date()) {
    console.log("Token expired, refreshing...");
    const newTokens = await refreshAccessToken(member.google_refresh_token);
    if (!newTokens) {
      throw new Error("Failed to refresh Google token.");
    }
    accessToken = newTokens.access_token;
    const newExpiry = new Date(Date.now() + newTokens.expires_in * 1000);
    await supabase
      .from("team_members")
      .update({
        google_access_token: accessToken,
        google_token_expires_at: newExpiry.toISOString(),
      })
      .eq("id", teamMemberId);
  }

  return accessToken;
}

// ─── Slot generation helpers ──────────────────────────────────────────────────

function generateSlotsForDay(day: { date: string; firstSlotBRT: number }) {
  const slots: { brt: string; utcStart: Date; utcEnd: Date }[] = [];
  let hourBRT = day.firstSlotBRT;
  let minuteBRT = 0;

  while (hourBRT < LAST_SLOT_BRT || (hourBRT === LAST_SLOT_BRT && minuteBRT === 0)) {
    const utcHour = hourBRT + 3; // BRT = UTC-3
    const utcStart = new Date(`${day.date}T${String(utcHour).padStart(2, "0")}:${String(minuteBRT).padStart(2, "0")}:00Z`);
    const utcEnd = new Date(utcStart.getTime() + SLOT_DURATION_MIN * 60_000);
    const brtLabel = `${String(hourBRT).padStart(2, "0")}:${String(minuteBRT).padStart(2, "0")}`;

    slots.push({ brt: brtLabel, utcStart, utcEnd });

    // Advance by SLOT_STEP_MIN (80 min)
    const totalMin = hourBRT * 60 + minuteBRT + SLOT_STEP_MIN;
    hourBRT = Math.floor(totalMin / 60);
    minuteBRT = totalMin % 60;
  }

  return slots;
}

interface BusyPeriod {
  start: string;
  end: string;
}

function filterAvailableSlots(
  slots: { brt: string; utcStart: Date; utcEnd: Date }[],
  busy: BusyPeriod[]
) {
  return slots.filter((slot) => {
    return !busy.some((b) => {
      const bStart = new Date(b.start).getTime();
      const bEnd = new Date(b.end).getTime();
      const sStart = slot.utcStart.getTime();
      const sEnd = slot.utcEnd.getTime();
      // Overlap: slot starts before busy ends AND slot ends after busy starts
      return sStart < bEnd && sEnd > bStart;
    });
  });
}

// ─── Action: check_availability ───────────────────────────────────────────────

async function handleCheckAvailability(supabase: any, checkPhone?: string, checkEmail?: string) {
  const accessToken = await getValidAccessToken(supabase, SAMUEL_ID);

  // Check if lead already has a meeting booked
  if (checkPhone || checkEmail) {
    let existingMeeting: any = null;
    if (checkPhone) {
      const cleanPhone = checkPhone.replace(/\D/g, "");
      const { data: lead } = await supabase.rpc("find_lead_by_phone_normalized", { p_phone: cleanPhone });
      const leadRow = Array.isArray(lead) && lead.length > 0 ? lead[0] : lead?.id ? lead : null;
      if (leadRow) {
        const { data: meeting } = await supabase
          .from("company_activities")
          .select("scheduled_at, meeting_link")
          .eq("lead_id", leadRow.id)
          .in("task_type", ["meeting", "webinar_booking"])
          .eq("completed", false)
          .neq("status", "cancelled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (meeting) existingMeeting = meeting;
      }
    }
    if (!existingMeeting && checkEmail) {
      const { data: leadByEmail } = await supabase.from("leads").select("id").eq("email", checkEmail.toLowerCase().trim()).maybeSingle();
      if (leadByEmail) {
        const { data: meeting } = await supabase
          .from("company_activities")
          .select("scheduled_at, meeting_link")
          .eq("lead_id", leadByEmail.id)
          .in("task_type", ["meeting", "webinar_booking"])
          .eq("completed", false)
          .neq("status", "cancelled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (meeting) existingMeeting = meeting;
      }
    }
    if (existingMeeting) {
      return { already_booked: true, scheduled_at: existingMeeting.scheduled_at, meeting_link: existingMeeting.meeting_link };
    }
  }

  // Generate next 3 business days dynamically
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  // Use FIRST_DAY_DATE if it's still in the future, otherwise start from tomorrow
  const startDate = FIRST_DAY_DATE >= tomorrow.toISOString().split("T")[0] ? FIRST_DAY_DATE : tomorrow.toISOString().split("T")[0];
  const candidateDays = getNextBusinessDays(startDate, MAX_DAYS_TO_SHOW + 3, MAX_DAYS_TO_SEARCH); // fetch extra to filter

  const firstDay = candidateDays[0];
  const lastDay = candidateDays[candidateDays.length - 1];
  if (!firstDay || !lastDay) return { days: [] };

  const timeMin = `${firstDay.date}T00:00:00Z`;
  const timeMax = `${lastDay.date}T23:59:59Z`;

  // FreeBusy API
  const freeBusyRes = await fetch(
    "https://www.googleapis.com/calendar/v3/freeBusy",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin,
        timeMax,
        timeZone: "America/Sao_Paulo",
        items: [{ id: "primary" }],
      }),
    }
  );

  if (!freeBusyRes.ok) {
    const errText = await freeBusyRes.text();
    console.error("FreeBusy error:", errText);
    throw new Error(`Google FreeBusy failed: ${freeBusyRes.status}`);
  }

  const freeBusyData = await freeBusyRes.json();
  const googleBusy: BusyPeriod[] =
    freeBusyData.calendars?.primary?.busy || [];

  console.log("[book-meeting] Google busy:", JSON.stringify(googleBusy));

  // Also check internal meetings (company_activities) — these may not be in Google Calendar
  const { data: internalMeetings } = await supabase
    .from("company_activities")
    .select("scheduled_at")
    .eq("responsavel_id", SAMUEL_ID)
    .in("task_type", ["meeting", "call", "webinar_booking"])
    .eq("completed", false)
    .neq("status", "cancelled")
    .gte("scheduled_at", timeMin)
    .lte("scheduled_at", timeMax);

  // Internal meetings: consider duration from metadata if available
  const internalBusy: BusyPeriod[] = (internalMeetings || []).map((m: any) => {
    const duration = m.metadata?.duration_minutes || SLOT_DURATION_MIN;
    return {
      start: m.scheduled_at,
      end: new Date(new Date(m.scheduled_at).getTime() + duration * 60_000).toISOString(),
    };
  });

  console.log("[book-meeting] Internal busy:", JSON.stringify(internalBusy));

  const busyPeriods = [...googleBusy, ...internalBusy];

  // Generate slots for each candidate day, keep only days with available slots, limit to MAX_DAYS_TO_SHOW
  const days: { date: string; slots: string[] }[] = [];
  for (const day of candidateDays) {
    if (days.length >= MAX_DAYS_TO_SHOW) break;
    const allSlots = generateSlotsForDay(day);
    const available = filterAvailableSlots(allSlots, busyPeriods);
    if (available.length > 0) {
      days.push({ date: day.date, slots: available.map((s) => s.brt) });
    }
  }

  return { days };
}

// ─── Action: book ─────────────────────────────────────────────────────────────

interface BookPayload {
  name: string;
  email: string;
  phone: string;
  company: string;
  revenue: number;
  slot_datetime?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  evento?: string;
}

async function handleBook(supabase: any, payload: BookPayload) {
  const { name, email, phone, company, revenue, slot_datetime, utm_source, utm_campaign, utm_content, evento } = payload;
  const finalUtmSource = utm_source || UTM_SOURCE;
  const finalUtmCampaign = utm_campaign || UTM_CAMPAIGN;

  if (!name || !phone) {
    throw new Error("name and phone are required");
  }

  // 1. Find lead by phone (last 8 digits) or email
  const cleanPhone = phone.replace(/\D/g, "");
  const phoneLast8 = cleanPhone.slice(-8);
  let lead: any = null;

  console.log(`[book-meeting] Looking for lead: phone=${cleanPhone} last8=${phoneLast8} email=${email}`);

  const { data: foundByPhone, error: phoneErr } = await supabase.rpc(
    "find_lead_by_phone_normalized",
    { p_phone: cleanPhone }
  );
  // RPC returns array (RETURN QUERY), take first element
  if (foundByPhone && Array.isArray(foundByPhone) && foundByPhone.length > 0) {
    lead = foundByPhone[0];
    console.log(`[book-meeting] Found lead by phone: ${lead.id} (${lead.name})`);
  } else if (foundByPhone && !Array.isArray(foundByPhone) && foundByPhone.id) {
    lead = foundByPhone;
    console.log(`[book-meeting] Found lead by phone (single): ${lead.id}`);
  }
  if (phoneErr) console.error(`[book-meeting] Phone RPC error:`, phoneErr.message);

  // Fallback: search by email
  if (!lead && email) {
    const { data: foundByEmail } = await supabase
      .from("leads")
      .select("*")
      .eq("email", email.toLowerCase().trim())
      .maybeSingle();
    if (foundByEmail) {
      lead = foundByEmail;
      console.log(`[book-meeting] Found lead by email: ${lead.id} (${lead.name})`);
    }
  }

  // 2. If not found, create new lead
  if (!lead) {
    console.log(`[book-meeting] Lead not found, creating new...`);
    const { data: newLead, error: createErr } = await supabase
      .from("leads")
      .insert({
        name,
        email: email?.toLowerCase().trim() || null,
        phone: cleanPhone,
        company_name: company || null,
        monthly_revenue: revenue || null,
        utm_source: finalUtmSource,
        utm_campaign: finalUtmCampaign,
      })
      .select()
      .single();
    if (createErr) throw new Error(`Failed to create lead: ${createErr.message}`);
    lead = newLead;
    console.log(`[book-meeting] Created new lead: ${lead.id}`);
  }

  // 3. Update lead with latest info
  const updatePayload: any = {};
  if (name) updatePayload.name = name;
  if (email) updatePayload.email = email.toLowerCase().trim();
  if (company) updatePayload.company_name = company;
  if (revenue !== undefined && revenue !== null) {
    // Formatar faturamento como texto legível (sempre sobrescreve — dado mais recente)
    const revenueText = revenue >= 1000000
      ? `R$ ${(revenue/1000000).toFixed(1).replace('.0', '')}M/mês`
      : `R$ ${(revenue/1000).toFixed(0)}k/mês`;
    updatePayload.monthly_revenue = revenueText;
    updatePayload.bant_budget = revenue >= 50000 ? `Faturamento informado: ${revenueText} (via formulário agendamento)` : null;
  }
  // BANT: Timeline = agendou pelo webinar (demonstra urgência)
  if (slot_datetime) {
    updatePayload.bant_timeline = "Agendou reunião pelo pitch do webinário — interesse imediato";
  }
  // Contexto pro agente/vendedor
  updatePayload.context = `Lead preencheu formulário de agendamento no webinário. Empresa: ${company || 'N/I'}. Faturamento: R$ ${revenue ? (revenue/1000).toFixed(0) + 'k/mês' : 'N/I'}. ${slot_datetime ? 'Agendou call.' : 'Abaixo do threshold, aguardando contato.'}`;
  updatePayload.sales_stage = slot_datetime ? 'agendamento' : 'qualificacao';

  const { error: updateErr } = await supabase.from("leads").update(updatePayload).eq("id", lead.id);
  if (updateErr) console.error(`[book-meeting] Lead update error:`, updateErr.message);
  else console.log(`[book-meeting] Lead updated: ${lead.id}`);

  // 4. Find or create deal in Webinar pipeline → move to "Agendou"
  const { data: webinarDeal, error: wdErr } = await supabase
    .from("deals")
    .select("id, pipeline_stage_id")
    .eq("lead_id", lead.id)
    .eq("pipeline_id", WEBINAR_PIPELINE_ID)
    .in("status", ["open", "negotiation"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (wdErr) console.error(`[book-meeting] Webinar deal query error:`, wdErr.message);

  if (webinarDeal) {
    await supabase
      .from("deals")
      .update({ pipeline_stage_id: WEBINAR_AGENDOU_STAGE_ID })
      .eq("id", webinarDeal.id);
    console.log(`[book-meeting] Moved webinar deal to Agendou: ${webinarDeal.id}`);
  } else {
    const { error: dealErr } = await supabase.from("deals").insert({
      lead_id: lead.id,
      pipeline_id: WEBINAR_PIPELINE_ID,
      pipeline_stage_id: WEBINAR_AGENDOU_STAGE_ID,
      sales_rep_id: SAMUEL_ID,
      title: `Webinar - ${name}`,
      status: "open",
    });
    if (dealErr) console.error(`[book-meeting] Create webinar deal error:`, dealErr.message);
    else console.log(`[book-meeting] Created webinar deal for lead: ${lead.id}`);
  }

  // 5. If revenue >= 50000 AND slot provided → full booking
  let meetingLink: string | null = null;
  let scheduledAt: string | null = null;

  if (revenue >= 50000 && slot_datetime) {
    const slotStart = new Date(slot_datetime);
    const slotEnd = new Date(slotStart.getTime() + SLOT_DURATION_MIN * 60_000);
    scheduledAt = slotStart.toISOString();

    // 5a. Create Google Calendar event with Meet
    try {
      const accessToken = await getValidAccessToken(supabase, SAMUEL_ID);

      const calendarEvent = {
        summary: `Reuniao IAP - ${name}${company ? ` (${company})` : ""}`,
        description: `Lead: ${name}\nEmpresa: ${company || "N/A"}\nEmail: ${email || "N/A"}\nTelefone: ${phone}\nFaturamento: R$ ${(revenue || 0).toLocaleString("pt-BR")}\n\nAgendado via webinar pitch.`,
        start: {
          dateTime: slotStart.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        end: {
          dateTime: slotEnd.toISOString(),
          timeZone: "America/Sao_Paulo",
        },
        attendees: email ? [{ email }] : [],
        conferenceData: {
          createRequest: {
            requestId: `book-${lead.id}-${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 30 },
            { method: "popup", minutes: 10 },
          ],
        },
      };

      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(calendarEvent),
        }
      );

      if (calRes.ok) {
        const calData = await calRes.json();
        meetingLink =
          calData.hangoutLink ||
          calData.conferenceData?.entryPoints?.[0]?.uri ||
          null;
        console.log("Google Calendar event created:", calData.id, meetingLink);
      } else {
        console.error("Calendar event creation failed:", await calRes.text());
      }
    } catch (calErr) {
      console.error("Error creating calendar event:", calErr);
    }

    // 5b. Create meeting in company_activities
    await supabase.from("company_activities").insert({
      task_type: "meeting",
      name: `Reunião IA na Prática & ${name}`,
      lead_id: lead.id,
      responsavel_id: SAMUEL_ID,
      scheduled_at: scheduledAt,
      meeting_link: meetingLink,
      status: "scheduled",
      completed: false,
      team: "comercial",
      metadata: {
        meeting_type: "video",
        source: "book_meeting_page",
        evento: evento || "webinario_0704",
        utm_source: finalUtmSource,
        utm_campaign: finalUtmCampaign,
        revenue,
        company,
      },
    });
    console.log(`[book-meeting] Meeting created for ${lead.id} at ${scheduledAt}`);

    // 5b2. Send confirmation email
    if (email) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
        await fetch(`${SUPABASE_URL}/functions/v1/send-meeting-email`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
          body: JSON.stringify({
            lead_id: lead.id,
            email_type: "scheduled",
            meeting_date: slotStart.toISOString(),
            meeting_duration_minutes: 60,
            specialist_name: "Samuel",
            meet_link: meetingLink,
          }),
        });
        console.log(`[book-meeting] Confirmation email sent to ${email}`);
      } catch (emailErr) {
        console.error(`[book-meeting] Email error:`, emailErr);
      }
    }

    // 5c. Find or create deal in Closer pipeline → "Call Agendada"
    const { data: closerDeal } = await supabase
      .from("deals")
      .select("id")
      .eq("lead_id", lead.id)
      .eq("pipeline_id", CLOSER_PIPELINE_ID)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (closerDeal) {
      await supabase
        .from("deals")
        .update({ pipeline_stage_id: CLOSER_CALL_AGENDADA_STAGE_ID })
        .eq("id", closerDeal.id);
      console.log("Moved closer deal to Call Agendada:", closerDeal.id);
    } else {
      await supabase.from("deals").insert({
        lead_id: lead.id,
        pipeline_id: CLOSER_PIPELINE_ID,
        pipeline_stage_id: CLOSER_CALL_AGENDADA_STAGE_ID,
        sales_rep_id: SAMUEL_ID,
        title: `Closer - ${name}`,
        status: "open",
      });
      console.log("Created closer deal for lead:", lead.id);
    }

    // Timeline já registrada via meeting acima (task_type: meeting)
    console.log(`[book-meeting] All done for ${lead.id} — meeting at ${slotStart.toISOString()}`);
  } else {
    // 6. Revenue < 50000 or no slot → register interest only
    await supabase.from("company_activities").insert({
      task_type: "webinar_booking",
      name: `Solicitou agendamento (abaixo de 50k) — entrar em contato pra qualificar`,
      lead_id: lead.id,
      responsavel_id: SAMUEL_ID,
      status: "completed",
      completed: true,
      team: "comercial",
      scheduled_at: new Date().toISOString(),
      metadata: {
        source: "book_meeting_page",
        evento: evento || "webinario_0704",
        utm_source: finalUtmSource,
        utm_campaign: finalUtmCampaign,
        utm_content: utm_content || null,
        revenue,
        company,
        below_threshold: true,
      },
    });
    console.log("Lead below revenue threshold, timeline registered:", lead.id);
  }

  return {
    success: true,
    meeting_link: meetingLink,
    scheduled_at: scheduledAt,
    lead_id: lead.id,
  };
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { action } = body;

    if (action === "check_availability") {
      const result = await handleCheckAvailability(supabase, body.phone, body.email);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "book") {
      const result = await handleBook(supabase, body);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use 'check_availability' or 'book'." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  } catch (err) {
    console.error("book-meeting error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
