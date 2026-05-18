import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Banco da área de membros do PAIN
const PAIN_SUPABASE_URL = Deno.env.get("PAIN_SUPABASE_URL") || "https://YOUR_PAIN_PROJECT_REF.supabase.co";
const PAIN_SUPABASE_KEY = Deno.env.get("PAIN_SUPABASE_SERVICE_KEY") || "";

// Banco do CS (atual)
const CS_SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const CS_SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calculateRisk(daysSinceAccess: number | null, sessions30d: number): { status: string; score: number } {
  if (daysSinceAccess === null) return { status: "unknown", score: 50 };
  if (daysSinceAccess <= 3 && sessions30d > 5) return { status: "active", score: 0 };
  if (daysSinceAccess <= 3) return { status: "active", score: 20 };
  if (daysSinceAccess <= 7) return { status: "declining", score: 40 };
  if (daysSinceAccess <= 14) return { status: "inactive_7_days", score: 50 };
  if (daysSinceAccess <= 30) return { status: "inactive_14_days", score: 70 };
  return { status: "churning", score: 90 };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const painClient = createClient(PAIN_SUPABASE_URL, PAIN_SUPABASE_KEY);
    const csClient = createClient(CS_SUPABASE_URL, CS_SUPABASE_KEY);

    const results = {
      lessons_synced: 0,
      engagement_synced: 0,
      engagement_skipped_no_match: 0,
      calls_synced: 0,
      members_synced: 0,
      members_leads_created: 0,
      members_skipped: 0,
      errors: [] as string[],
    };

    // ─── 1. Sincronizar user_lesson_progress -> member_lessons_progress ───
    console.log("Sincronizando progresso de aulas...");

    const { data: lessonProgress, error: lpError } = await painClient
      .from("user_lesson_progress")
      .select(`
        *,
        user:profiles!user_id(email, full_name),
        lesson:lessons!lesson_id(project_id)
      `)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (lpError) {
      results.errors.push(`Erro ao buscar lesson_progress: ${lpError.message}`);
    } else if (lessonProgress) {
      for (const lp of lessonProgress) {
        if (!lp.user?.email) continue;

        const { data: lead } = await csClient
          .from("leads")
          .select("id")
          .ilike("email", lp.user.email)
          .limit(1)
          .maybeSingle();

        if (!lead) continue;

        // Try primary_contact_id first, then organization_members
        let orgId: string | null = null;
        const { data: orgByPrimary } = await csClient
          .from("organizations")
          .select("id")
          .eq("primary_contact_id", lead.id)
          .maybeSingle();
        orgId = orgByPrimary?.id || null;

        if (!orgId) {
          const { data: memberOrg } = await csClient
            .from("organization_members")
            .select("organization_id")
            .eq("contact_id", lead.id)
            .limit(1)
            .maybeSingle();
          orgId = memberOrg?.organization_id || null;
        }

        if (!orgId) continue;

        const { error: upsertError } = await csClient
          .from("member_lessons_progress")
          .upsert({
            member_email: lp.user.email,
            member_user_id: lp.user_id,
            lesson_id: lp.lesson_id,
            completed: lp.completed,
            seconds_watched: lp.last_watched_timestamp || 0,
            completed_at: lp.completed_at,
            last_watched_at: lp.updated_at,
            organization_id: orgId,
            lead_id: lead.id,
            project_id: lp.lesson?.project_id || null,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: "member_email,lesson_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          results.errors.push(`Erro ao upsert lesson: ${upsertError.message}`);
        } else {
          results.lessons_synced++;
        }
      }
    }

    // ─── 2. Sincronizar engagement (v3 - com sessions + calls + risk) ─────
    console.log("Sincronizando engagement (v3)...");

    // 2a. Buscar todos os membros do PAIN
    const { data: allMembers, error: memErr } = await painClient
      .from("organization_members")
      .select("organization_id, user_id, role")
      .limit(1000);

    if (memErr) {
      results.errors.push(`Erro ao buscar organization_members: ${memErr.message}`);
    }

    // 2b. Buscar todos os perfis do PAIN
    const { data: allProfiles, error: profErr } = await painClient
      .from("profiles")
      .select("id, email, full_name")
      .limit(1000);

    if (profErr) {
      results.errors.push(`Erro ao buscar profiles: ${profErr.message}`);
    }

    // 2c. Buscar último acesso de cada usuário via RPC (SECURITY DEFINER bypassa RLS)
    const { data: allAccess, error: accErr } = await painClient
      .rpc("get_all_user_last_access");

    if (accErr) {
      results.errors.push(`Erro ao buscar last_access via RPC: ${accErr.message}`);
    }
    console.log(`Last access: ${(allAccess || []).length} users found`);

    // 2d. Buscar progresso de aulas para contagem por usuário
    const { data: allLessonProgress, error: alpErr } = await painClient
      .from("user_lesson_progress")
      .select("user_id, completed")
      .limit(5000);

    if (alpErr) {
      results.errors.push(`Erro ao buscar lesson_progress para engagement: ${alpErr.message}`);
    }

    // 2e. Buscar session stats via RPC (agregado no servidor)
    const { data: sessionStats, error: ssErr } = await painClient
      .rpc("get_user_session_stats");

    if (ssErr) {
      results.errors.push(`Erro ao buscar session_stats: ${ssErr.message}`);
    }

    // 2f. Buscar call stats via RPC (agregado no servidor)
    const { data: callStats, error: csErr } = await painClient
      .rpc("get_user_call_stats");

    if (csErr) {
      results.errors.push(`Erro ao buscar call_stats: ${csErr.message}`);
    }

    // 2g. Construir mapas de lookup
    const profileMap = new Map<string, { email: string; full_name: string | null }>();
    for (const p of allProfiles || []) {
      profileMap.set(p.id, { email: p.email, full_name: p.full_name });
    }

    const accessMap = new Map<string, string>();
    for (const a of allAccess || []) {
      accessMap.set(a.user_id, a.last_access);
    }

    const lessonsByUser = new Map<string, { started: number; completed: number }>();
    for (const l of allLessonProgress || []) {
      const existing = lessonsByUser.get(l.user_id) || { started: 0, completed: 0 };
      existing.started++;
      if (l.completed) existing.completed++;
      lessonsByUser.set(l.user_id, existing);
    }

    const sessionStatsMap = new Map<string, {
      total_sessions: number;
      sessions_last_7_days: number;
      sessions_last_30_days: number;
      total_time_seconds: number;
    }>();
    for (const s of sessionStats || []) {
      sessionStatsMap.set(s.user_id, {
        total_sessions: Number(s.total_sessions) || 0,
        sessions_last_7_days: Number(s.sessions_last_7_days) || 0,
        sessions_last_30_days: Number(s.sessions_last_30_days) || 0,
        total_time_seconds: Number(s.total_time_seconds) || 0,
      });
    }

    // Call stats by email (since user_id may be null for some attendees)
    const callStatsByEmail = new Map<string, {
      calls_attended: number;
      calls_total_seconds: number;
      last_call_date: string | null;
    }>();
    // Also by user_id
    const callStatsByUserId = new Map<string, {
      calls_attended: number;
      calls_total_seconds: number;
      last_call_date: string | null;
    }>();
    for (const c of callStats || []) {
      const entry = {
        calls_attended: Number(c.calls_attended) || 0,
        calls_total_seconds: Number(c.calls_total_seconds) || 0,
        last_call_date: c.last_call_date,
      };
      if (c.participant_email) {
        const existing = callStatsByEmail.get(c.participant_email);
        if (existing) {
          existing.calls_attended += entry.calls_attended;
          existing.calls_total_seconds += entry.calls_total_seconds;
          if (entry.last_call_date && (!existing.last_call_date || entry.last_call_date > existing.last_call_date)) {
            existing.last_call_date = entry.last_call_date;
          }
        } else {
          callStatsByEmail.set(c.participant_email, entry);
        }
      }
      if (c.user_id) {
        callStatsByUserId.set(c.user_id, entry);
      }
    }

    console.log(`Session stats: ${sessionStatsMap.size} users, Call stats: ${callStatsByEmail.size} emails`);

    // 2h. Construir registros de engagement
    interface EngagementRecord {
      email: string;
      name: string | null;
      userId: string;
      lastAccess: string | null;
      lessonsStarted: number;
      lessonsCompleted: number;
      totalSessions: number;
      sessionsLast7Days: number;
      sessionsLast30Days: number;
      totalTimeMinutes: number;
      callsAttended: number;
      callsTotalMinutes: number;
      lastCallDate: string | null;
    }

    const engagementRecords: EngagementRecord[] = [];
    for (const mem of allMembers || []) {
      const profile = profileMap.get(mem.user_id);
      if (!profile?.email) continue;

      const lastAccess = accessMap.get(mem.user_id) || null;
      const lessons = lessonsByUser.get(mem.user_id) || { started: 0, completed: 0 };
      const sessions = sessionStatsMap.get(mem.user_id) || {
        total_sessions: 0, sessions_last_7_days: 0, sessions_last_30_days: 0, total_time_seconds: 0,
      };
      const calls = callStatsByUserId.get(mem.user_id) || callStatsByEmail.get(profile.email) || {
        calls_attended: 0, calls_total_seconds: 0, last_call_date: null,
      };

      engagementRecords.push({
        email: profile.email,
        name: profile.full_name,
        userId: mem.user_id,
        lastAccess,
        lessonsStarted: lessons.started,
        lessonsCompleted: lessons.completed,
        totalSessions: sessions.total_sessions,
        sessionsLast7Days: sessions.sessions_last_7_days,
        sessionsLast30Days: sessions.sessions_last_30_days,
        totalTimeMinutes: Math.round(sessions.total_time_seconds / 60),
        callsAttended: calls.calls_attended,
        callsTotalMinutes: Math.round(calls.calls_total_seconds / 60),
        lastCallDate: calls.last_call_date,
      });
    }

    console.log(`Engagement: ${engagementRecords.length} membros encontrados no PAIN`);

    // 2i. Buscar leads e orgs do CS em batch para matching
    // Normalizar emails para lowercase para evitar problemas de case-sensitivity
    const emails = engagementRecords.map((r) => r.email);
    const emailsLower = engagementRecords.map((r) => r.email.toLowerCase());

    const leadByEmail = new Map<string, string>(); // ALWAYS lowercase keys

    // Buscar por emails exatos E lowercase para cobrir ambos os casos
    const allEmailVariants = [...new Set([...emails, ...emailsLower])];
    for (let i = 0; i < allEmailVariants.length; i += 50) {
      const batch = allEmailVariants.slice(i, i + 50);
      const { data: leads } = await csClient
        .from("leads")
        .select("id, email")
        .in("email", batch);
      for (const lead of leads || []) {
        leadByEmail.set(lead.email.toLowerCase(), lead.id);
      }
    }

    // Fallback: buscar via ilike para emails que não deram match exato
    const unmatchedEmails = emailsLower.filter(e => !leadByEmail.has(e));
    for (const email of unmatchedEmails) {
      const { data: leads } = await csClient
        .from("leads")
        .select("id, email")
        .ilike("email", email)
        .limit(1);
      if (leads && leads.length > 0) {
        leadByEmail.set(email, leads[0].id);
      }
    }

    const leadIds = Array.from(new Set(leadByEmail.values()));
    const orgByLeadId = new Map<string, string>();

    // Source 1: primary_contact_id
    for (let i = 0; i < leadIds.length; i += 50) {
      const batch = leadIds.slice(i, i + 50);
      const { data: orgs } = await csClient
        .from("organizations")
        .select("id, primary_contact_id")
        .in("primary_contact_id", batch);
      for (const org of orgs || []) {
        orgByLeadId.set(org.primary_contact_id, org.id);
      }
    }

    // Source 2: organization_members.contact_id
    for (let i = 0; i < leadIds.length; i += 50) {
      const batch = leadIds.slice(i, i + 50);
      const { data: csMembers } = await csClient
        .from("organization_members")
        .select("organization_id, contact_id")
        .in("contact_id", batch);
      for (const mem of csMembers || []) {
        if (mem.contact_id && !orgByLeadId.has(mem.contact_id)) {
          orgByLeadId.set(mem.contact_id, mem.organization_id);
        }
      }
    }

    console.log(`Engagement: ${orgByLeadId.size} leads mapeados para orgs`);

    // 2j. Upsert snapshots no CS (com TODOS os campos)
    const now = new Date();
    for (const rec of engagementRecords) {
      const leadId = leadByEmail.get(rec.email.toLowerCase());
      if (!leadId) {
        results.engagement_skipped_no_match++;
        continue;
      }
      const orgId = orgByLeadId.get(leadId);
      if (!orgId) {
        results.engagement_skipped_no_match++;
        continue;
      }

      let daysSinceAccess: number | null = null;
      if (rec.lastAccess) {
        const accessDate = new Date(rec.lastAccess);
        daysSinceAccess = Math.floor(
          (now.getTime() - accessDate.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      const completionRate =
        rec.lessonsStarted > 0
          ? Number(((rec.lessonsCompleted / rec.lessonsStarted) * 100).toFixed(1))
          : 0;

      const risk = calculateRisk(daysSinceAccess, rec.sessionsLast30Days);

      const { error: upsertError } = await csClient
        .from("member_engagement_snapshots")
        .upsert(
          {
            organization_id: orgId,
            member_email: rec.email,
            member_name: rec.name,
            member_user_id_external: rec.userId,
            last_access: rec.lastAccess,
            days_since_last_access: daysSinceAccess,
            lessons_started: rec.lessonsStarted,
            lessons_completed: rec.lessonsCompleted,
            lessons_completion_rate: completionRate,
            // Campos de sessão (NOVOS)
            total_sessions: rec.totalSessions,
            sessions_last_7_days: rec.sessionsLast7Days,
            sessions_last_30_days: rec.sessionsLast30Days,
            total_time_minutes: rec.totalTimeMinutes,
            // Campos de calls (NOVOS)
            calls_attended: rec.callsAttended,
            calls_total_minutes: rec.callsTotalMinutes,
            last_call_date: rec.lastCallDate,
            // Risk (NOVO)
            risk_status: risk.status,
            risk_score: risk.score,
            // Timestamp
            snapshot_hour: now.toISOString(),
            lead_id: leadId,
          },
          {
            onConflict: "organization_id,lead_id",
            ignoreDuplicates: false,
          }
        );

      if (upsertError) {
        results.errors.push(`Erro ao upsert engagement ${rec.email}: ${upsertError.message}`);
      } else {
        results.engagement_synced++;
      }
    }

    console.log(
      `Engagement: ${results.engagement_synced} sincronizados, ${results.engagement_skipped_no_match} sem match no CS`
    );

    // ─── 3. Sincronizar call_session_attendance -> member_calls_history ──
    console.log("Sincronizando participação em calls...");

    const { data: callSessions, error: callSessionsError } = await painClient
      .from("call_sessions")
      .select("id, type, title, starts_at, duration_minutes");

    if (callSessionsError) {
      results.errors.push(`Erro ao buscar call_sessions: ${callSessionsError.message}`);
    }

    const sessionsMap = new Map(callSessions?.map(s => [s.id, s]) || []);

    const { data: attendance, error: attError } = await painClient
      .from("call_session_attendance")
      .select("*")
      .order("join_time", { ascending: false })
      .limit(500);

    if (attError) {
      results.errors.push(`Erro ao buscar attendance: ${attError.message}`);
    } else if (attendance) {
      for (const att of attendance) {
        if (!att.participant_email) continue;

        const session = sessionsMap.get(att.session_id);

        const leadId = leadByEmail.get(att.participant_email?.toLowerCase());
        const orgId = leadId ? orgByLeadId.get(leadId) : null;

        const { error: upsertError } = await csClient
          .from("member_calls_history")
          .upsert({
            id: att.id,
            organization_id: orgId,
            member_email: att.participant_email,
            member_user_id: att.user_id || null,
            call_id: att.session_id,
            call_title: session?.title || "Call",
            call_type: session?.type || "support",
            call_date: session?.starts_at || att.join_time,
            join_time: att.join_time,
            leave_time: att.leave_time,
            duration_minutes: Math.round((att.duration_seconds || 0) / 60),
            call_total_duration: session?.duration_minutes || null,
            attendance_percentage: session?.duration_minutes
              ? Number(((att.duration_seconds || 0) / 60 / session.duration_minutes * 100).toFixed(1))
              : null,
            lead_id: leadId || null,
          }, {
            onConflict: "id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          results.errors.push(`Erro ao upsert call: ${upsertError.message}`);
        } else {
          results.calls_synced++;
        }
      }
    }

    // ─── 4. Sincronizar dados de jornada (PAIN → CS) ──────────────────
    console.log("Sincronizando dados de jornada...");

    try {
      // 4a. Fetch journey data from PAIN via RPC
      const { data: journeyData, error: journeyErr } = await painClient.rpc('get_journey_sync_data');

      if (journeyErr) {
        results.errors.push(`Erro ao buscar journey data: ${journeyErr.message}`);
      } else if (journeyData && journeyData.length > 0) {
        // 4b. Build painOrgId → csOrgId mapping using existing maps
        const painOrgToCsOrg = new Map<string, string>();
        for (const member of allMembers || []) {
          const profile = profileMap.get(member.user_id);
          if (!profile?.email) continue;
          const leadId = leadByEmail.get(profile.email.toLowerCase());
          if (!leadId) continue;
          const csOrgId = orgByLeadId.get(leadId);
          if (csOrgId) painOrgToCsOrg.set(member.organization_id, csOrgId);
        }

        // 4c. Build upsert records (deduplicate by CS org, keep most recent journey)
        const journeyByOrg = new Map<string, any>();
        for (const j of journeyData) {
          const csOrgId = painOrgToCsOrg.get(j.organization_id);
          if (!csOrgId) continue;
          const existing = journeyByOrg.get(csOrgId);
          if (!existing || new Date(j.journey_created_at) > new Date(existing.journey_created_at)) {
            journeyByOrg.set(csOrgId, j);
          }
        }

        const journeyUpserts = Array.from(journeyByOrg.entries()).map(([csOrgId, j]) => ({
          organization_id: csOrgId,
          pain_journey_id: j.journey_id,
          journey_title: j.journey_title,
          journey_created_at: j.journey_created_at,
          objectives: j.objectives,
          assigned_tracks: j.assigned_tracks,
          total_objectives: Array.isArray(j.objectives) ? j.objectives.length : 0,
          completed_objectives: Array.isArray(j.objectives)
            ? j.objectives.filter((o: any) => o.completed_at).length
            : 0,
          total_assigned_tracks: Array.isArray(j.assigned_tracks) ? j.assigned_tracks.length : 0,
          synced_at: new Date().toISOString(),
        }));

        if (journeyUpserts.length > 0) {
          const { error: jUpsertErr } = await csClient
            .from('cs_journey_snapshots')
            .upsert(journeyUpserts, { onConflict: 'organization_id' });

          if (jUpsertErr) {
            results.errors.push(`Erro ao upsert journey snapshots: ${jUpsertErr.message}`);
          } else {
            (results as any).journeys_synced = journeyUpserts.length;
            console.log(`Jornadas: ${journeyUpserts.length} sincronizadas`);
          }
        } else {
          console.log("Jornadas: nenhuma org mapeada para CS");
        }
      } else {
        console.log("Jornadas: nenhuma jornada ativa encontrada no PAIN");
      }
    } catch (journeyError) {
      const msg = journeyError instanceof Error ? journeyError.message : String(journeyError);
      results.errors.push(`Erro na sync de jornadas: ${msg}`);
    }

    // ─── 5. Sincronizar organization_members (PAIN → CS) ──────────────
    console.log("Sincronizando membros das organizações...");

    try {
      // 5a. Build painOrgId → csOrgId mapping (reutiliza maps da seção 2)
      const painOrgToCsOrg = new Map<string, string>();
      for (const member of allMembers || []) {
        const profile = profileMap.get(member.user_id);
        if (!profile?.email) continue;
        const leadId = leadByEmail.get(profile.email.toLowerCase());
        if (!leadId) continue;
        const csOrgId = orgByLeadId.get(leadId);
        if (csOrgId) painOrgToCsOrg.set(member.organization_id, csOrgId);
      }

      // 5b. Buscar primary_contact_id de todas as orgs CS para não duplicar
      const csOrgIds = Array.from(new Set(painOrgToCsOrg.values()));
      const primaryContactByOrg = new Map<string, string>();
      for (let i = 0; i < csOrgIds.length; i += 50) {
        const batch = csOrgIds.slice(i, i + 50);
        const { data: orgs } = await csClient
          .from("organizations")
          .select("id, primary_contact_id")
          .in("id", batch);
        for (const org of orgs || []) {
          if (org.primary_contact_id) {
            primaryContactByOrg.set(org.id, org.primary_contact_id);
          }
        }
      }

      // 5c. Buscar membros já existentes no CS para não sobrescrever roles manuais
      const existingMembers = new Map<string, string>(); // "orgId:contactId" → role
      for (let i = 0; i < csOrgIds.length; i += 50) {
        const batch = csOrgIds.slice(i, i + 50);
        const { data: csMembers } = await csClient
          .from("organization_members")
          .select("organization_id, contact_id, role")
          .in("organization_id", batch);
        for (const m of csMembers || []) {
          existingMembers.set(`${m.organization_id}:${m.contact_id}`, m.role);
        }
      }

      console.log(`Members sync: ${painOrgToCsOrg.size} PAIN orgs mapeadas, ${existingMembers.size} membros existentes no CS`);

      // 5d. Para cada membro PAIN, upsert no CS
      for (const mem of allMembers || []) {
        const profile = profileMap.get(mem.user_id);
        if (!profile?.email) {
          results.members_skipped++;
          continue;
        }

        const csOrgId = painOrgToCsOrg.get(mem.organization_id);
        if (!csOrgId) {
          results.members_skipped++;
          continue;
        }

        // Encontrar ou criar lead no CS
        let leadId = leadByEmail.get(profile.email.toLowerCase());

        if (!leadId) {
          // Criar lead para membro novo
          const { data: newLead, error: createErr } = await csClient
            .from("leads")
            .insert({
              name: profile.full_name || profile.email.split("@")[0],
              email: profile.email,
              phone: "",
              status: "active",
            })
            .select("id")
            .single();

          if (createErr || !newLead) {
            results.errors.push(`Erro ao criar lead para ${profile.email}: ${createErr?.message}`);
            continue;
          }

          leadId = newLead.id;
          leadByEmail.set(profile.email.toLowerCase(), leadId);
          results.members_leads_created++;
        }

        // Mapear role do PAIN para CS
        const painRole = mem.role?.toLowerCase() || "member";
        let csRole: string;
        if (painRole === "sponsor") {
          csRole = "sponsor";
        } else if (painRole === "executor") {
          csRole = "executor";
        } else {
          csRole = "member";
        }

        // Verificar se já é primary_contact (não duplicar)
        const primaryContactId = primaryContactByOrg.get(csOrgId);
        const isPrimary = primaryContactId === leadId;

        // Verificar se membro já existe com role manual
        const existingRole = existingMembers.get(`${csOrgId}:${leadId}`);
        const isManualRole = existingRole && ["champion", "viewer", "owner", "admin"].includes(existingRole);

        // Se é primary_contact e já é membro, apenas atualizar user_id
        // Se tem role manual, não sobrescrever role
        const upsertData: Record<string, unknown> = {
          organization_id: csOrgId,
          contact_id: leadId,
          user_id: mem.user_id,
          status: "active",
          joined_at: new Date().toISOString(),
        };

        // Só definir role se não tiver role manual
        if (!isManualRole) {
          upsertData.role = isPrimary ? "sponsor" : csRole;
        }

        const { error: upsertError } = await csClient
          .from("organization_members")
          .upsert(upsertData, {
            onConflict: "organization_id,contact_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          results.errors.push(`Erro ao upsert member ${profile.email}: ${upsertError.message}`);
        } else {
          results.members_synced++;
        }
      }

      console.log(`Members: ${results.members_synced} sincronizados, ${results.members_leads_created} leads criados, ${results.members_skipped} pulados`);
    } catch (memberSyncError) {
      const msg = memberSyncError instanceof Error ? memberSyncError.message : String(memberSyncError);
      results.errors.push(`Erro na sync de membros: ${msg}`);
    }

    console.log("Sincronização concluída:", results);

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error("Erro na sincronização:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
