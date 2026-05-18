import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { deleteWithUndo } from "@/lib/undoable-delete";

// ── Types ────────────────────────────────────────────────────────────────

export interface WorkingHours {
  [day: string]: { start: string; end: string } | null;
}

export interface CalendarBlock {
  id: string;
  team_member_id: string;
  title: string;
  block_type: "one_time" | "recurring";
  start_datetime: string | null;
  end_datetime: string | null;
  recurrence_days: number[];
  recurrence_start_time: string | null;
  recurrence_end_time: string | null;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateBlockInput {
  title: string;
  block_type: "one_time" | "recurring";
  start_datetime?: string;
  end_datetime?: string;
  recurrence_days?: number[];
  recurrence_start_time?: string;
  recurrence_end_time?: string;
  color?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  start_datetime: string;
  end_datetime: string;
  all_day: boolean | null;
  location: string | null;
  meet_link: string | null;
  html_link: string | null;
  status: string | null;
  team_member_id: string | null;
}

// ── Working Hours ────────────────────────────────────────────────────────

export const useWorkingHours = (teamMemberId?: string) => {
  const { teamMember } = useAuth();
  const id = teamMemberId || teamMember?.id;

  return useQuery({
    queryKey: ["working-hours", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("team_members")
        .select("working_hours, meeting_duration_minutes")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return {
        working_hours: (data.working_hours as WorkingHours) || defaultWorkingHours(),
        meeting_duration_minutes: data.meeting_duration_minutes || 45,
      };
    },
    enabled: !!id,
  });
};

export const useUpdateWorkingHours = () => {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async ({
      working_hours,
      meeting_duration_minutes,
    }: {
      working_hours: WorkingHours;
      meeting_duration_minutes?: number;
    }) => {
      const updates: Record<string, unknown> = { working_hours };
      if (meeting_duration_minutes !== undefined) {
        updates.meeting_duration_minutes = meeting_duration_minutes;
      }
      const { error } = await supabase
        .from("team_members")
        .update(updates)
        .eq("id", teamMember!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["working-hours"] });
      toast.success("Horário de trabalho salvo");
    },
    onError: () => toast.error("Erro ao salvar horário"),
  });
};

// ── Calendar Blocks ──────────────────────────────────────────────────────

export const useCalendarBlocks = (teamMemberId?: string, startDate?: string, endDate?: string) => {
  const { teamMember } = useAuth();
  const id = teamMemberId || teamMember?.id;

  return useQuery({
    queryKey: ["calendar-blocks", id, startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("calendar_blocks")
        .select("*")
        .eq("team_member_id", id!)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      // For one_time blocks, filter by date range if provided
      // Recurring blocks are always included
      if (startDate && endDate) {
        query = query.or(
          `block_type.eq.recurring,and(block_type.eq.one_time,start_datetime.lte.${endDate},end_datetime.gte.${startDate})`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CalendarBlock[];
    },
    enabled: !!id,
  });
};

export const useCreateBlock = () => {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async (input: CreateBlockInput) => {
      const { error } = await supabase.from("calendar_blocks").insert({
        team_member_id: teamMember!.id,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-blocks"] });
      toast.success("Bloqueio criado");
    },
    onError: () => toast.error("Erro ao criar bloqueio"),
  });
};

export const useUpdateBlock = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<CalendarBlock> & { id: string }) => {
      const { error } = await supabase
        .from("calendar_blocks")
        .update(updates)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-blocks"] });
      toast.success("Bloqueio atualizado");
    },
    onError: () => toast.error("Erro ao atualizar bloqueio"),
  });
};

export const useDeleteBlock = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (blockId: string) => {
      await deleteWithUndo({
        table: 'calendar_blocks',
        id: blockId,
        label: 'Bloqueio',
        queryClient,
        queryKeys: [['calendar-blocks']],
      });
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });
};

// ── Google Calendar Events ───────────────────────────────────────────────

export const useGoogleCalendarEvents = (teamMemberId?: string, startDate?: string, endDate?: string) => {
  const { teamMember } = useAuth();
  const id = teamMemberId || teamMember?.id;
  // calendar_events.team_member_id references profiles.id, so look up via auth_user_id
  const authUserId = teamMember?.auth_user_id;

  return useQuery({
    queryKey: ["google-calendar-events", id, startDate, endDate],
    queryFn: async () => {
      // Find auth_user_id for this team member if viewing someone else
      let profileId = authUserId;
      if (teamMemberId && teamMemberId !== teamMember?.id) {
        const { data: tm } = await supabase
          .from("team_members")
          .select("auth_user_id")
          .eq("id", teamMemberId)
          .single();
        profileId = tm?.auth_user_id || null;
      }

      if (!profileId) return [];

      let query = supabase
        .from("calendar_events")
        .select("id, title, start_datetime, end_datetime, all_day, location, meet_link, html_link, status, team_member_id")
        .eq("team_member_id", profileId)
        .neq("status", "cancelled");

      if (startDate) query = query.gte("end_datetime", startDate);
      if (endDate) query = query.lte("start_datetime", endDate);

      const { data, error } = await query.order("start_datetime", { ascending: true });
      if (error) throw error;
      return (data || []) as CalendarEvent[];
    },
    enabled: !!id,
  });
};

// ── Helpers ──────────────────────────────────────────────────────────────

export function defaultWorkingHours(): WorkingHours {
  return {
    "0": null,
    "1": { start: "09:00", end: "18:00" },
    "2": { start: "09:00", end: "18:00" },
    "3": { start: "09:00", end: "18:00" },
    "4": { start: "09:00", end: "18:00" },
    "5": { start: "09:00", end: "18:00" },
    "6": null,
  };
}

const DAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export function getDayName(dayIndex: number): string {
  return DAY_NAMES[dayIndex] || "";
}

/** Check if a specific time falls within working hours for a given day of week */
export function isWithinWorkingHours(
  dayOfWeek: number,
  timeMinutes: number,
  workingHours: WorkingHours
): boolean {
  const dayConfig = workingHours[String(dayOfWeek)];
  if (!dayConfig) return false;
  const [startH, startM] = dayConfig.start.split(":").map(Number);
  const [endH, endM] = dayConfig.end.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;
  return timeMinutes >= startMin && timeMinutes < endMin;
}

/** Expand recurring blocks into concrete time ranges for a given date range */
export function expandRecurringBlocks(
  blocks: CalendarBlock[],
  rangeStart: Date,
  rangeEnd: Date
): { title: string; start: Date; end: Date; color: string; blockId: string }[] {
  const results: { title: string; start: Date; end: Date; color: string; blockId: string }[] = [];

  for (const block of blocks) {
    if (block.block_type !== "recurring" || !block.recurrence_start_time || !block.recurrence_end_time) continue;

    const current = new Date(rangeStart);
    current.setHours(0, 0, 0, 0);

    while (current <= rangeEnd) {
      const dayOfWeek = current.getDay();
      if (block.recurrence_days.includes(dayOfWeek)) {
        const [sh, sm] = block.recurrence_start_time.split(":").map(Number);
        const [eh, em] = block.recurrence_end_time.split(":").map(Number);
        const start = new Date(current);
        start.setHours(sh, sm, 0, 0);
        const end = new Date(current);
        end.setHours(eh, em, 0, 0);
        results.push({ title: block.title, start, end, color: block.color, blockId: block.id });
      }
      current.setDate(current.getDate() + 1);
    }
  }

  return results;
}
