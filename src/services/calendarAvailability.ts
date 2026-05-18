/**
 * Serviço para verificar disponibilidade de agenda
 * Consulta 3 fontes: company_activities + calendar_blocks + calendar_events (Google)
 * Usa working_hours por vendedor em vez de 9-17 hardcoded
 */

import { supabase } from "@/lib/supabase";

export interface AvailabilityResult {
  team_member_id: string;
  name: string;
  status: "free" | "busy";
  conflicting_tasks: { id: string; name: string; start: string; end: string }[];
}

export interface DayScheduleItem {
  id: string;
  name: string;
  start: string;
  end: string;
  type: "task" | "block" | "google";
  taskType?: string;
}

export interface CheckAvailabilityResponse {
  success: boolean;
  has_conflicts: boolean;
  all_free: boolean;
  results: AvailabilityResult[];
  error?: string;
}

/**
 * Verifica disponibilidade de agenda para os membros do time
 * Consulta: company_activities + calendar_blocks + calendar_events (Google Calendar)
 *
 * @param teamMemberIds - IDs dos team_members (responsável + participantes)
 * @param startDateTime - Data/hora de início (formato datetime-local: "2026-02-02T11:00")
 * @param durationMinutes - Duração em minutos
 */
export async function checkCalendarAvailability(
  teamMemberIds: string[],
  startDateTime: string,
  durationMinutes: number
): Promise<CheckAvailabilityResponse> {
  if (!teamMemberIds.length) {
    return {
      success: true,
      has_conflicts: false,
      all_free: true,
      results: [],
    };
  }

  // Calcular intervalo da nova tarefa
  const startDate = new Date(startDateTime);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  // Timeout global de 5s — não travar UI se Supabase estiver lento
  const timeoutPromise = new Promise<CheckAvailabilityResponse>((resolve) =>
    setTimeout(() => resolve({
      success: true,
      has_conflicts: false,
      all_free: true,
      results: [],
    }), 5000)
  );

  return Promise.race([checkAvailabilityInternal(teamMemberIds, startDate, endDate), timeoutPromise]);
}

async function checkAvailabilityInternal(
  teamMemberIds: string[],
  startDate: Date,
  endDate: Date,
): Promise<CheckAvailabilityResponse> {
  try {
    // Buscar membros com working_hours e auth_user_id
    const { data: members } = await supabase
      .from("team_members")
      .select("id, name, working_hours, auth_user_id")
      .in("id", teamMemberIds);

    const memberMap = new Map(members?.map(m => [m.id, m]) || []);

    // Janela de busca: ±1 dia
    const windowStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString();

    // Fetch all 3 sources in parallel
    const [tasksResult, blocksResult, googleEventsResult] = await Promise.all([
      // 1. company_activities (tarefas) - meetings e onboarding sempre bloqueiam
      // Calls só bloqueiam se tiverem meeting_link (reunião vinculada)
      supabase
        .from("company_activities")
        .select("id, name, scheduled_at, due_datetime, end_datetime, task_type, meeting_link, responsavel_id, participants")
        .eq("completed", false)
        .in("task_type", ["call", "meeting", "onboarding"])
        .or(`and(scheduled_at.gte.${windowStart},scheduled_at.lte.${windowEnd}),and(due_datetime.gte.${windowStart},due_datetime.lte.${windowEnd})`)
        .limit(200),

      // 2. calendar_blocks
      supabase
        .from("calendar_blocks")
        .select("*")
        .in("team_member_id", teamMemberIds)
        .eq("is_active", true)
        .or(`block_type.eq.recurring,and(block_type.eq.one_time,start_datetime.lte.${windowEnd},end_datetime.gte.${windowStart})`),

      // 3. calendar_events (Google Calendar)
      (async () => {
        const authUserIds = members
          ?.filter(m => m.auth_user_id)
          .map(m => m.auth_user_id!) || [];
        if (!authUserIds.length) return { data: [], error: null };
        return supabase
          .from("calendar_events")
          .select("id, title, start_datetime, end_datetime, team_member_id, status")
          .in("team_member_id", authUserIds)
          .neq("status", "cancelled")
          .gte("end_datetime", windowStart)
          .lte("start_datetime", windowEnd);
      })(),
    ]);

    const tasks = tasksResult.data || [];
    const blocks = blocksResult.data || [];
    const googleEvents = googleEventsResult.data || [];

    // Build reverse map: auth_user_id → team_member_id
    const authToTeamMap = new Map<string, string>();
    members?.forEach(m => {
      if (m.auth_user_id) authToTeamMap.set(m.auth_user_id, m.id);
    });

    // Verificar conflitos para cada team_member
    const results: AvailabilityResult[] = [];

    for (const teamMemberId of teamMemberIds) {
      const member = memberMap.get(teamMemberId);
      const conflictingTasks: AvailabilityResult["conflicting_tasks"] = [];

      // Check working hours
      if (member?.working_hours) {
        const wh = member.working_hours as Record<string, { start: string; end: string } | null>;
        const dayOfWeek = startDate.getDay();
        const dayConfig = wh[String(dayOfWeek)];
        if (!dayConfig) {
          // Day off — always busy
          conflictingTasks.push({
            id: "working-hours",
            name: "Fora do horário de trabalho (dia de folga)",
            start: startDate.toISOString(),
            end: endDate.toISOString(),
          });
        } else {
          const [startH, startM] = dayConfig.start.split(":").map(Number);
          const [endH, endM] = dayConfig.end.split(":").map(Number);
          const whStart = startH * 60 + startM;
          const whEnd = endH * 60 + endM;
          const proposedStartMin = startDate.getHours() * 60 + startDate.getMinutes();
          const proposedEndMin = endDate.getHours() * 60 + endDate.getMinutes();
          if (proposedStartMin < whStart || proposedEndMin > whEnd) {
            conflictingTasks.push({
              id: "working-hours",
              name: `Fora do horário de trabalho (${dayConfig.start}-${dayConfig.end})`,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
            });
          }
        }
      }

      // 1. Check company_activities
      for (const task of tasks) {
        // Plain calls (without meeting link) don't block the calendar
        if (task.task_type === "call" && !task.meeting_link) continue;

        const isResponsavel = task.responsavel_id === teamMemberId;
        const isParticipant = task.participants?.includes(teamMemberId);
        if (!isResponsavel && !isParticipant) continue;

        const taskStartRaw = task.scheduled_at || task.due_datetime;
        if (!taskStartRaw) continue;
        const taskStart = new Date(taskStartRaw);
        const taskEnd = task.end_datetime
          ? new Date(task.end_datetime)
          : new Date(taskStart.getTime() + 60 * 60 * 1000);

        if (startDate < taskEnd && endDate > taskStart) {
          conflictingTasks.push({
            id: task.id,
            name: task.name,
            start: taskStart.toISOString(),
            end: taskEnd.toISOString(),
          });
        }
      }

      // 2. Check calendar_blocks (one_time)
      for (const block of blocks) {
        if (block.team_member_id !== teamMemberId) continue;
        if (block.block_type === "one_time" && block.start_datetime && block.end_datetime) {
          const blockStart = new Date(block.start_datetime);
          const blockEnd = new Date(block.end_datetime);
          if (startDate < blockEnd && endDate > blockStart) {
            conflictingTasks.push({
              id: block.id,
              name: `Bloqueio: ${block.title}`,
              start: blockStart.toISOString(),
              end: blockEnd.toISOString(),
            });
          }
        }
        // Recurring blocks
        if (block.block_type === "recurring" && block.recurrence_start_time && block.recurrence_end_time) {
          const dayOfWeek = startDate.getDay();
          if (block.recurrence_days?.includes(dayOfWeek)) {
            const [sh, sm] = block.recurrence_start_time.split(":").map(Number);
            const [eh, em] = block.recurrence_end_time.split(":").map(Number);
            const blockStartMin = sh * 60 + sm;
            const blockEndMin = eh * 60 + em;
            const proposedStartMin = startDate.getHours() * 60 + startDate.getMinutes();
            const proposedEndMin = endDate.getHours() * 60 + endDate.getMinutes();
            if (proposedStartMin < blockEndMin && proposedEndMin > blockStartMin) {
              conflictingTasks.push({
                id: block.id,
                name: `Bloqueio recorrente: ${block.title}`,
                start: startDate.toISOString(),
                end: endDate.toISOString(),
              });
            }
          }
        }
      }

      // 3. Check Google Calendar events
      const authUserId = member?.auth_user_id;
      if (authUserId) {
        for (const evt of googleEvents) {
          if (evt.team_member_id !== authUserId) continue;
          const evtStart = new Date(evt.start_datetime);
          const evtEnd = new Date(evt.end_datetime);
          if (startDate < evtEnd && endDate > evtStart) {
            conflictingTasks.push({
              id: evt.id,
              name: `Google: ${evt.title}`,
              start: evtStart.toISOString(),
              end: evtEnd.toISOString(),
            });
          }
        }
      }

      results.push({
        team_member_id: teamMemberId,
        name: member?.name || "Desconhecido",
        status: conflictingTasks.length > 0 ? "busy" : "free",
        conflicting_tasks: conflictingTasks,
      });
    }

    const hasConflicts = results.some(r => r.status === "busy");
    const allFree = results.every(r => r.status === "free");

    return {
      success: true,
      has_conflicts: hasConflicts,
      all_free: allFree,
      results,
    };

  } catch (error) {
    console.error("Erro ao verificar disponibilidade:", error);
    return {
      success: false,
      has_conflicts: false,
      all_free: false,
      results: [],
      error: "Falha ao verificar agenda",
    };
  }
}

/**
 * Busca a agenda do dia para um team_member (tasks + blocks + google events)
 * Usado no mini display de agenda ao criar tarefa
 */
export async function getDaySchedule(
  teamMemberId: string,
  dateStr: string // "2026-03-23"
): Promise<DayScheduleItem[]> {
  try {
    const dayStart = new Date(`${dateStr}T00:00:00-03:00`).toISOString();
    const dayEnd = new Date(`${dateStr}T23:59:59-03:00`).toISOString();

    const { data: member } = await supabase
      .from("team_members")
      .select("auth_user_id")
      .eq("id", teamMemberId)
      .single();

    const [tasksResult, blocksResult, googleResult] = await Promise.all([
      supabase
        .from("company_activities")
        .select("id, name, scheduled_at, end_datetime, task_type, meeting_link")
        .eq("completed", false)
        .eq("responsavel_id", teamMemberId)
        .in("task_type", ["call", "meeting", "onboarding"])
        .gte("scheduled_at", dayStart)
        .lte("scheduled_at", dayEnd)
        .order("scheduled_at")
        .limit(50),

      supabase
        .from("calendar_blocks")
        .select("id, title, block_type, start_datetime, end_datetime, recurrence_days, recurrence_start_time, recurrence_end_time")
        .eq("team_member_id", teamMemberId)
        .eq("is_active", true),

      member?.auth_user_id
        ? supabase
            .from("calendar_events")
            .select("id, title, start_datetime, end_datetime")
            .eq("team_member_id", member.auth_user_id)
            .neq("status", "cancelled")
            .gte("start_datetime", dayStart)
            .lte("start_datetime", dayEnd)
            .order("start_datetime")
            .limit(50)
        : Promise.resolve({ data: [] }),
    ]);

    const items: DayScheduleItem[] = [];

    // Tasks (only meetings/onboarding and calls with meet)
    for (const t of tasksResult.data || []) {
      if (t.task_type === "call" && !t.meeting_link) continue;
      const start = t.scheduled_at!;
      const end = t.end_datetime || new Date(new Date(start).getTime() + 60 * 60 * 1000).toISOString();
      items.push({ id: t.id, name: t.name, start, end, type: "task", taskType: t.task_type });
    }

    // Blocks
    const date = new Date(`${dateStr}T12:00:00-03:00`);
    const dayOfWeek = date.getDay();
    for (const b of blocksResult.data || []) {
      if (b.block_type === "one_time" && b.start_datetime && b.end_datetime) {
        const bStart = new Date(b.start_datetime);
        const bEnd = new Date(b.end_datetime);
        if (bStart >= new Date(dayStart) && bStart <= new Date(dayEnd)) {
          items.push({ id: b.id, name: b.title || "Bloqueio", start: b.start_datetime, end: b.end_datetime, type: "block" });
        }
      }
      if (b.block_type === "recurring" && b.recurrence_days?.includes(dayOfWeek) && b.recurrence_start_time && b.recurrence_end_time) {
        items.push({
          id: b.id,
          name: b.title || "Bloqueio",
          start: `${dateStr}T${b.recurrence_start_time}:00-03:00`,
          end: `${dateStr}T${b.recurrence_end_time}:00-03:00`,
          type: "block",
        });
      }
    }

    // Google events
    for (const e of googleResult.data || []) {
      items.push({ id: e.id, name: e.title || "Evento Google", start: e.start_datetime, end: e.end_datetime, type: "google" });
    }

    return items.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  } catch (error) {
    console.error("Erro ao buscar agenda do dia:", error);
    return [];
  }
}
