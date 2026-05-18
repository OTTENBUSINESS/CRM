import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCall } from "@/contexts/CallContext";
import { useCompleteTask, useDeleteTask } from "@/hooks/useTasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  addMonths,
  subMonths,
  addDays,
  isToday,
  isSameDay,
  isSameMonth,
  isBefore,
  startOfDay,
  endOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { LeadScoreBadge } from "@/components/sales/LeadScoreBadge";
import { SalesStageBadge } from "@/components/sales/SalesStageBadge";
import type { SalesStage } from "@/types/sales.types";
import { WeekViewGrid } from "@/components/agenda/WeekViewGrid";
import { DayViewGrid } from "@/components/agenda/DayViewGrid";
import { MiniCalendarNav } from "@/components/agenda/MiniCalendarNav";
import { CalendarSettingsSheet } from "@/components/agenda/CalendarSettingsSheet";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import {
  useWorkingHours,
  useCalendarBlocks,
  useGoogleCalendarEvents,
  defaultWorkingHours,
} from "@/hooks/useCalendarSettings";
import { useDailyActivitySummary } from "@/hooks/useDailyActivitySummary";
import type { Task } from "@/hooks/useTasks";
import {
  ChevronLeft,
  ChevronRight,
  Settings2,
  CalendarDays,
  Calendar,
  LayoutGrid,
  Plus,
  Clock,
  Video,
  Phone,
  MessageSquare,
  Mail,
  Building2,
  AlertTriangle,
  CalendarCheck,
  CheckCircle2,
  Check,
  User,
  Trash2,
  X,
  Shield,
  ExternalLink,
} from "lucide-react";

// ── Task type config (reused from original) ─────────────────────────
const TASK_TYPE_CONFIG: Record<string, { color: string; dotColor: string; label: string; icon: React.ElementType }> = {
  call: { color: "bg-blue-100 text-blue-700 border-blue-200", dotColor: "bg-blue-500", label: "Call", icon: Phone },
  whatsapp: { color: "bg-green-100 text-green-700 border-green-200", dotColor: "bg-green-500", label: "WhatsApp", icon: MessageSquare },
  email: { color: "bg-purple-100 text-purple-700 border-purple-200", dotColor: "bg-purple-500", label: "Email", icon: Mail },
  meeting: { color: "bg-indigo-100 text-indigo-700 border-indigo-200", dotColor: "bg-indigo-500", label: "Meeting", icon: Video },
  onboarding: { color: "bg-orange-100 text-orange-700 border-orange-200", dotColor: "bg-orange-500", label: "Onboarding", icon: Building2 },
  follow_up: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", dotColor: "bg-yellow-500", label: "Follow-up", icon: Clock },
  internal: { color: "bg-gray-100 text-gray-700 border-gray-200", dotColor: "bg-gray-400", label: "Interna", icon: Settings2 },
};

const getTaskConfig = (type: string) => TASK_TYPE_CONFIG[type] || TASK_TYPE_CONFIG.internal;

// Extended Task type with lead sales data
type AgendaTask = Task & {
  lead?: Task["lead"] & { sales_score?: number | null; sales_stage?: SalesStage | null } | null;
};

type ViewMode = "calendar" | "week" | "day";

// ── Persistent preferences (localStorage) ───────────────────────────
const PREFS_KEY = "agenda-v2-prefs";

// Types that occupy time blocks on the grid (appointments)
// Calls only occupy time if they have a meeting_link (Meet vinculado)
const APPOINTMENT_TYPES = new Set(["meeting", "onboarding"]);
const isAppointment = (t: { task_type: string; meeting_link?: string | null }) =>
  APPOINTMENT_TYPES.has(t.task_type) || (t.task_type === "call" && !!t.meeting_link);
// All filterable types for the grid filter bar
const GRID_FILTER_TYPES = [
  { key: "call", label: "Calls", dotColor: "bg-blue-500" },
  { key: "meeting", label: "Meetings", dotColor: "bg-indigo-500" },
  { key: "onboarding", label: "Onboarding", dotColor: "bg-orange-500" },
  { key: "whatsapp", label: "WhatsApp", dotColor: "bg-green-500" },
  { key: "email", label: "Email", dotColor: "bg-purple-500" },
  { key: "follow_up", label: "Follow-up", dotColor: "bg-yellow-500" },
  { key: "internal", label: "Interno", dotColor: "bg-gray-400" },
] as const;

interface AgendaPrefs {
  viewMode: ViewMode;
  selectedDate: string; // yyyy-MM-dd
  memberId: string;
  listRangeMode: "day" | "period";
  listDateFrom: string;
  listDateTo: string;
  filterType: string;
  filterStatus: string;
  filterPriority: string;
  overdueSort: string;
  overdueFilterType: string;
  overdueFilterScore: string;
  confirmDelete: boolean;
  activeGridTypes: string[]; // persisted grid filter types
}

const defaultPrefs: AgendaPrefs = {
  viewMode: "calendar",
  selectedDate: format(new Date(), "yyyy-MM-dd"),
  memberId: "me",
  listRangeMode: "day",
  listDateFrom: "",
  listDateTo: "",
  filterType: "all",
  filterStatus: "all",
  filterPriority: "all",
  overdueSort: "oldest",
  overdueFilterType: "all",
  overdueFilterScore: "all",
  confirmDelete: true,
  activeGridTypes: GRID_FILTER_TYPES.map(t => t.key),
};

function loadPrefs(): AgendaPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw);
    return { ...defaultPrefs, ...parsed };
  } catch {
    return defaultPrefs;
  }
}

function savePrefs(partial: Partial<AgendaPrefs>) {
  try {
    const current = loadPrefs();
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {}
}

function parseSavedDate(dateStr: string): Date {
  const d = new Date(dateStr + "T12:00:00");
  return isNaN(d.getTime()) ? new Date() : d;
}

export function AgendaViewContent() {
  const { teamMember } = useAuth();
  const navigate = useNavigate();
  const { initiateCall } = useCall();
  const queryClient = useQueryClient();
  const completeTask = useCompleteTask();
  const deleteTask = useDeleteTask();

  // ── Load saved prefs once ─────────────────────────────────────
  const [savedPrefs] = useState(loadPrefs);

  // ── State (initialized from prefs) ────────────────────────────
  const [selectedDate, _setSelectedDate] = useState(() => parseSavedDate(savedPrefs.selectedDate));
  const [currentMonth, setCurrentMonth] = useState(() => parseSavedDate(savedPrefs.selectedDate));
  const [viewMode, _setViewMode] = useState<ViewMode>(savedPrefs.viewMode);
  const [selectedMemberId, _setSelectedMemberId] = useState<string>(savedPrefs.memberId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createTaskOpen, setCreateTaskOpen] = useState(false);
  const [createTaskDate, setCreateTaskDate] = useState<Date | null>(null);
  const [selectedTask, setSelectedTask] = useState<AgendaTask | null>(null);

  // Wrappers that auto-save to localStorage
  const setSelectedDate = useCallback((v: Date | ((prev: Date) => Date)) => {
    _setSelectedDate(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      savePrefs({ selectedDate: format(next, "yyyy-MM-dd") });
      // Manter currentMonth sincronizado com a data selecionada
      if (!isSameMonth(next, prev)) {
        setCurrentMonth(next);
      }
      return next;
    });
    setActiveMetric(null);
  }, []);

  const setViewMode = useCallback((v: ViewMode) => {
    _setViewMode(v);
    savePrefs({ viewMode: v });
  }, []);

  const setSelectedMemberId = useCallback((v: string) => {
    _setSelectedMemberId(v);
    savePrefs({ memberId: v });
  }, []);

  // ── Task list range mode — persisted ────────────────────────────
  type ListRangeMode = "day" | "period";
  const [listRangeMode, _setListRangeMode] = useState<ListRangeMode>(savedPrefs.listRangeMode || "day");
  const [listDateFrom, _setListDateFrom] = useState<string>(savedPrefs.listDateFrom || "");
  const [listDateTo, _setListDateTo] = useState<string>(savedPrefs.listDateTo || "");

  const setListRangeMode = useCallback((v: ListRangeMode) => { _setListRangeMode(v); savePrefs({ listRangeMode: v }); }, []);
  const setListDateFrom = useCallback((v: string) => { _setListDateFrom(v); savePrefs({ listDateFrom: v }); }, []);
  const setListDateTo = useCallback((v: string) => { _setListDateTo(v); savePrefs({ listDateTo: v }); }, []);

  // ── Filters (task list) — persisted ───────────────────────────
  const [filterType, _setFilterType] = useState<string>(savedPrefs.filterType);
  const [filterStatus, _setFilterStatus] = useState<string>(savedPrefs.filterStatus);
  const [filterPriority, _setFilterPriority] = useState<string>(savedPrefs.filterPriority);
  const hasFilters = filterType !== "all" || filterStatus !== "all" || filterPriority !== "all";

  const setFilterType = useCallback((v: string) => { _setFilterType(v); savePrefs({ filterType: v }); }, []);
  const setFilterStatus = useCallback((v: string) => { _setFilterStatus(v); savePrefs({ filterStatus: v }); }, []);
  const setFilterPriority = useCallback((v: string) => { _setFilterPriority(v); savePrefs({ filterPriority: v }); }, []);

  // ── Active metric filter (click on metric cards) ─────────────
  type MetricFilter = 'overdue' | 'today' | 'week' | 'completed' | null;
  const [activeMetric, setActiveMetric] = useState<MetricFilter>(null);

  // ── Overdue filters/sort — persisted ──────────────────────────
  const [overdueSort, _setOverdueSort] = useState<string>(savedPrefs.overdueSort);
  const [overdueFilterType, _setOverdueFilterType] = useState<string>(savedPrefs.overdueFilterType);
  const [overdueFilterScore, _setOverdueFilterScore] = useState<string>(savedPrefs.overdueFilterScore);
  const hasOverdueFilters = overdueSort !== "oldest" || overdueFilterType !== "all" || overdueFilterScore !== "all";

  const setOverdueSort = useCallback((v: string) => { _setOverdueSort(v); savePrefs({ overdueSort: v }); }, []);
  const setOverdueFilterType = useCallback((v: string) => { _setOverdueFilterType(v); savePrefs({ overdueFilterType: v }); }, []);
  const setOverdueFilterScore = useCallback((v: string) => { _setOverdueFilterScore(v); savePrefs({ overdueFilterScore: v }); }, []);

  // ── Delete confirmation toggle (persisted) ────────────────────
  const [confirmDelete, _setConfirmDelete] = useState<boolean>(savedPrefs.confirmDelete);
  const toggleConfirmDelete = useCallback(() => {
    _setConfirmDelete(prev => {
      const next = !prev;
      savePrefs({ confirmDelete: next });
      return next;
    });
  }, []);

  // ── Grid type filter (week/day views) — persisted ──────────
  const [activeGridTypes, _setActiveGridTypes] = useState<Set<string>>(
    () => new Set(savedPrefs.activeGridTypes ?? GRID_FILTER_TYPES.map(t => t.key))
  );
  const setActiveGridTypes = useCallback((next: Set<string>) => {
    _setActiveGridTypes(next);
    savePrefs({ activeGridTypes: Array.from(next) });
  }, []);
  const toggleGridType = useCallback((type: string) => {
    _setActiveGridTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      savePrefs({ activeGridTypes: Array.from(next) });
      return next;
    });
  }, []);
  const setOnlyMeetings = useCallback(() => {
    const next = new Set(["call", "meeting"]);
    _setActiveGridTypes(next);
    savePrefs({ activeGridTypes: Array.from(next) });
  }, []);
  const setAllGridTypes = useCallback(() => {
    const next = new Set(GRID_FILTER_TYPES.map(t => t.key));
    _setActiveGridTypes(next);
    savePrefs({ activeGridTypes: Array.from(next) });
  }, []);
  const allGridTypesActive = activeGridTypes.size === GRID_FILTER_TYPES.length;
  const onlyMeetingsActive = activeGridTypes.size === 2 && activeGridTypes.has("call") && activeGridTypes.has("meeting");

  const applyFilters = useCallback((tasks: AgendaTask[]) => {
    return tasks.filter(t => {
      if (filterType !== "all" && t.task_type !== filterType) return false;
      if (filterStatus === "pending" && t.completed) return false;
      if (filterStatus === "completed" && !t.completed) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      return true;
    });
  }, [filterType, filterStatus, filterPriority]);

  const effectiveRepId = selectedMemberId === "me" ? teamMember?.id : selectedMemberId;

  // ── Daily activity summary (for summary badges) ───────────────────
  const today = useMemo(() => new Date(), []);
  const { data: activityRows } = useDailyActivitySummary(today, effectiveRepId || undefined);
  const activitySummary = activityRows?.[0];

  // ── Team members ──────────────────────────────────────────────────
  const { data: teamMembers } = useQuery({
    queryKey: ["team-members-active"],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_members")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      return data || [];
    },
  });

  // ── Date ranges ───────────────────────────────────────────────────
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarGridStart = startOfWeek(monthStart);
  const calendarGridEnd = endOfWeek(monthEnd);

  const weekStart = startOfWeek(selectedDate);
  const weekEnd = endOfWeek(selectedDate);

  // Use a broad range for data fetching that covers all views
  const rangeStart = viewMode === "calendar" ? calendarGridStart : viewMode === "week" ? weekStart : startOfDay(selectedDate);
  const rangeEnd = viewMode === "calendar" ? calendarGridEnd : viewMode === "week" ? weekEnd : endOfDay(selectedDate);
  const rangeStartISO = rangeStart.toISOString();
  const rangeEndISO = rangeEnd.toISOString();

  // ── Tasks ─────────────────────────────────────────────────────────
  const { data: allTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["agenda-v2-tasks", effectiveRepId, format(rangeStart, "yyyy-MM-dd"), format(rangeEnd, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!effectiveRepId) return [];
      const dateFrom = format(rangeStart, "yyyy-MM-dd");
      const dateTo = format(addDays(rangeEnd, 1), "yyyy-MM-dd");
      const selectFields = `
        *,
        lead:leads!company_activities_lead_id_fkey(id, name, email, phone, sales_score, sales_stage),
        organization:organizations!company_activities_organization_id_fkey(id, name),
        responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
      `;

      const [respResult, partResult] = await Promise.all([
        supabase
          .from("company_activities")
          .select(selectFields)
          .eq("responsavel_id", effectiveRepId)
          .neq("status", "cancelled")
          .gte("scheduled_at", dateFrom)
          .lte("scheduled_at", dateTo)
          .order("scheduled_at", { ascending: true }),
        supabase
          .from("company_activities")
          .select(selectFields)
          .contains("participants", [effectiveRepId])
          .neq("status", "cancelled")
          .gte("scheduled_at", dateFrom)
          .lte("scheduled_at", dateTo)
          .order("scheduled_at", { ascending: true }),
      ]);

      const map = new Map<string, AgendaTask>();
      for (const t of (respResult.data || [])) map.set(t.id, t as AgendaTask);
      for (const t of (partResult.data || [])) map.set(t.id, t as AgendaTask);

      return Array.from(map.values()).sort(
        (a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime()
      );
    },
    enabled: !!effectiveRepId,
  });

  // ── Calendar settings (for week/day views) ────────────────────────
  const { data: whSettings } = useWorkingHours(effectiveRepId || undefined);
  const workingHours = whSettings?.working_hours || defaultWorkingHours();

  const { data: blocks = [] } = useCalendarBlocks(
    effectiveRepId || undefined,
    rangeStartISO,
    rangeEndISO,
  );

  const { data: googleEvents = [] } = useGoogleCalendarEvents(
    effectiveRepId || undefined,
    rangeStartISO,
    rangeEndISO,
  );

  // ── Split tasks for grid views (appointments vs quick tasks) ──
  const { gridAppointments, gridQuickTasks } = useMemo(() => {
    const filtered = allTasks.filter(t => activeGridTypes.has(t.task_type));
    const appointments = filtered.filter(t => isAppointment(t));
    const quick = filtered.filter(t => !isAppointment(t));
    return { gridAppointments: appointments, gridQuickTasks: quick };
  }, [allTasks, activeGridTypes]);

  // ── Metrics (for calendar view) ───────────────────────────────────
  const metrics = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);
    const weekEndDate = addDays(todayStart, 7);

    let overdue = 0, today = 0, thisWeek = 0, completed = 0;

    for (const task of allTasks) {
      if (task.completed) {
        const completedAt = task.completed_at ? new Date(task.completed_at) : null;
        if (completedAt && completedAt >= todayStart && completedAt <= todayEnd) completed++;
        continue;
      }
      const scheduledAt = task.scheduled_at ? new Date(task.scheduled_at) : null;
      if (!scheduledAt) continue;
      if (isBefore(scheduledAt, todayStart)) overdue++;
      if (scheduledAt >= todayStart && scheduledAt <= todayEnd) today++;
      if (scheduledAt >= todayStart && scheduledAt <= weekEndDate) thisWeek++;
    }

    return { overdue, today, thisWeek, completed };
  }, [allTasks]);

  // ── Summary badge counts (reuniões, follow-ups, atrasadas, calls) ─
  const summaryBadges = useMemo(() => {
    const now = new Date();
    const todayStart = startOfDay(now);
    const todayEnd = endOfDay(now);

    const todayTasks = allTasks.filter(t => {
      if (t.completed) return false;
      const sa = t.scheduled_at ? new Date(t.scheduled_at) : null;
      return sa && sa >= todayStart && sa <= todayEnd;
    });

    const reunioes = todayTasks.filter(t => isAppointment(t)).length;
    const followUps = todayTasks.filter(t => t.task_type === "follow_up" || t.task_type === "whatsapp").length;
    const overdue = allTasks.filter(t => {
      if (t.completed) return false;
      const sa = t.scheduled_at ? new Date(t.scheduled_at) : null;
      return sa && isBefore(sa, todayStart);
    }).length;

    return { reunioes, followUps, overdue };
  }, [allTasks]);

  // ── Dashboard metrics (meetings, revenue, conversions) ────────────
  const { data: dashMetrics } = useQuery({
    queryKey: ["agenda-dashboard-metrics", effectiveRepId],
    queryFn: async () => {
      if (!effectiveRepId) return null;
      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const todayEnd = endOfDay(now).toISOString();
      const weekEndDate = endOfDay(addDays(startOfDay(now), 6)).toISOString();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

      // Meetings today (call + meeting types)
      const { data: meetingsToday } = await supabase
        .from("company_activities")
        .select("id, status, completed, task_type")
        .eq("responsavel_id", effectiveRepId)
        .in("task_type", ["call", "meeting"])
        .gte("scheduled_at", todayStart)
        .lt("scheduled_at", todayEnd);

      // Meetings this week
      const { data: meetingsWeek } = await supabase
        .from("company_activities")
        .select("id, status, completed, task_type")
        .eq("responsavel_id", effectiveRepId)
        .in("task_type", ["call", "meeting"])
        .gte("scheduled_at", todayStart)
        .lt("scheduled_at", weekEndDate);

      // Confirmed meetings today (placeholder: status === 'confirmed')
      const confirmedToday = meetingsToday?.filter(m => m.status === "confirmed").length || 0;

      // Completed meetings (realized, not no-show)
      const completedMeetings = meetingsToday?.filter(m =>
        (m.status === "completed" || m.status === "realized" || m.completed) && m.status !== "no_show"
      ).length || 0;

      // Won pipeline stages
      const { data: pipelineStages } = await supabase
        .from("sales_pipeline_stages")
        .select("id, is_won");
      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];

      // Won deals this month (converted)
      const { data: wonMonth } = await (supabase
        .from("deals" as any)
        .select("id, negotiated_price, won_at, pipeline_stage_id") as any)
        .eq("sales_rep_id", effectiveRepId)
        .gte("won_at", monthStart)
        .lt("won_at", monthEnd);

      // Also deals in won stages without won_at
      const { data: wonByStageMonth } = await (supabase
        .from("deals" as any)
        .select("id, negotiated_price, updated_at, pipeline_stage_id") as any)
        .eq("sales_rep_id", effectiveRepId)
        .in("pipeline_stage_id", wonStageIds)
        .gte("updated_at", monthStart)
        .lt("updated_at", monthEnd)
        .is("won_at", null);

      const convertedCount = (wonMonth?.length || 0) + (wonByStageMonth?.length || 0);
      const faturamentoMes = (wonMonth?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0) +
        (wonByStageMonth?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0);

      return {
        meetingsToday: meetingsToday?.length || 0,
        confirmedToday,
        completedMeetings,
        meetingsWeek: meetingsWeek?.length || 0,
        convertedCount,
        faturamentoMes,
        metaMes: 12_000_000 / 12, // META_MENSAL from cockpit
      };
    },
    enabled: !!effectiveRepId,
    refetchInterval: 60_000,
  });

  // ── Tasks grouped by date (for calendar view) ─────────────────────
  const tasksByDate = useMemo(() => {
    const map = new Map<string, AgendaTask[]>();
    for (const task of allTasks) {
      const dateKey = task.scheduled_at
        ? format(new Date(task.scheduled_at), "yyyy-MM-dd")
        : "no-date";
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey)!.push(task);
    }
    return map;
  }, [allTasks]);

  const selectedDayTasks = useMemo(() => {
    const key = format(selectedDate, "yyyy-MM-dd");
    const tasks = tasksByDate.get(key) || [];
    return tasks.sort((a, b) => {
      if (!a.scheduled_at) return 1;
      if (!b.scheduled_at) return -1;
      return new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime();
    });
  }, [selectedDate, tasksByDate]);

  const calendarDays = useMemo(
    () => eachDayOfInterval({ start: calendarGridStart, end: calendarGridEnd }),
    [calendarGridStart.toISOString(), calendarGridEnd.toISOString()]
  );

  // ── Task list panel tasks (day, period, or metric filter) ──────
  const listTasks = useMemo(() => {
    // Metric filter mode: show tasks matching the clicked metric card
    if (activeMetric) {
      const now = new Date();
      const todayStart = startOfDay(now);
      const todayEnd = endOfDay(now);
      const weekEndDate = addDays(todayStart, 7);

      const isMeeting = (t: AgendaTask) => t.task_type === 'meeting' || (t.task_type === 'call' && !!t.meeting_link);

      return allTasks.filter(t => {
        const scheduledAt = t.scheduled_at ? new Date(t.scheduled_at) : null;

        switch (activeMetric) {
          case 'overdue':
            return !t.completed && scheduledAt && isBefore(scheduledAt, todayStart);
          case 'today':
            return !t.completed && isMeeting(t) && scheduledAt && scheduledAt >= todayStart && scheduledAt <= todayEnd;
          case 'week':
            return !t.completed && isMeeting(t) && scheduledAt && scheduledAt >= todayStart && scheduledAt <= weekEndDate;
          case 'completed': {
            const completedAt = t.completed_at ? new Date(t.completed_at) : null;
            return t.completed && isMeeting(t) && t.status !== 'no_show' && completedAt && completedAt >= todayStart && completedAt <= todayEnd;
          }
          default:
            return false;
        }
      }).sort((a, b) => {
        const aDate = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
        const bDate = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
        return aDate - bDate;
      });
    }

    if (listRangeMode === "day") return selectedDayTasks;
    // Period mode: filter allTasks by from/to range
    const from = listDateFrom ? startOfDay(new Date(listDateFrom + "T12:00:00")) : rangeStart;
    const to = listDateTo ? endOfDay(new Date(listDateTo + "T12:00:00")) : rangeEnd;
    return allTasks.filter(t => {
      if (!t.scheduled_at) return false;
      const d = new Date(t.scheduled_at);
      return d >= from && d <= to;
    });
  }, [activeMetric, listRangeMode, selectedDayTasks, allTasks, listDateFrom, listDateTo, rangeStart, rangeEnd]);

  const pendingCount = listTasks.filter(t => !t.completed).length;
  const completedCount = listTasks.filter(t => t.completed).length;

  // ── Navigation ────────────────────────────────────────────────────
  const goToday = useCallback(() => {
    setSelectedDate(new Date());
    setCurrentMonth(new Date());
  }, []);

  const goPrev = useCallback(() => {
    if (viewMode === "calendar") setCurrentMonth(prev => subMonths(prev, 1));
    else if (viewMode === "week") setSelectedDate(prev => subWeeks(prev, 1));
    else setSelectedDate(prev => addDays(prev, -1));
  }, [viewMode]);

  const goNext = useCallback(() => {
    if (viewMode === "calendar") setCurrentMonth(prev => addMonths(prev, 1));
    else if (viewMode === "week") setSelectedDate(prev => addWeeks(prev, 1));
    else setSelectedDate(prev => addDays(prev, 1));
  }, [viewMode]);

  const handleCreateTask = useCallback((start: Date) => {
    setCreateTaskDate(start);
    setCreateTaskOpen(true);
  }, []);

  const handleTaskClick = useCallback((task: AgendaTask) => {
    setSelectedTask(task);
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    deleteTask.mutate(taskId, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["agenda-v2-tasks"] });
      },
    });
  }, [deleteTask, queryClient]);

  const handleCall = useCallback((phone: string, leadId?: string) => {
    initiateCall(phone, leadId);
  }, [initiateCall]);

  const handleOpenLead = useCallback((leadId: string) => {
    navigate(`/comercial/leads/${leadId}`);
  }, [navigate]);

  const refetchAll = () => {
    queryClient.invalidateQueries({ queryKey: ["agenda-v2-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["calendar-blocks"] });
    queryClient.invalidateQueries({ queryKey: ["google-calendar-events"] });
  };

  // ── Header date label ─────────────────────────────────────────────
  const headerDateLabel =
    viewMode === "calendar"
      ? format(currentMonth, "MMMM yyyy", { locale: ptBR })
      : viewMode === "week"
        ? `${format(weekStart, "d MMM", { locale: ptBR })} – ${format(weekEnd, "d MMM yyyy", { locale: ptBR })}`
        : format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR });

  // ── Render ────────────────────────────────────────────────────────
  return (
    <>
      <div className={cn(
        "flex flex-col",
        viewMode !== "calendar" ? "h-[calc(100vh-64px)]" : "",
      )}>
        {/* ── Header ──────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-bold hidden sm:block">Minha Agenda</h1>

            <Button variant="outline" size="sm" onClick={goToday} className="text-xs">
              Hoje
            </Button>

            <div className="flex items-center">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <span className="text-sm font-medium capitalize">{headerDateLabel}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Team member selector */}
            <Select value={selectedMemberId} onValueChange={setSelectedMemberId}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue placeholder="Minha agenda" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="me">Minha agenda</SelectItem>
                {teamMembers?.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* View mode toggle — 3 options */}
            <div className="flex border rounded-md overflow-hidden">
              <button
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors",
                  viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                )}
                onClick={() => setViewMode("calendar")}
                title="Mês"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors border-l",
                  viewMode === "week" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                )}
                onClick={() => setViewMode("week")}
                title="Semana"
              >
                <CalendarDays className="h-3.5 w-3.5" />
              </button>
              <button
                className={cn(
                  "px-2.5 py-1.5 text-xs font-medium transition-colors border-l",
                  viewMode === "day" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                )}
                onClick={() => setViewMode("day")}
                title="Dia"
              >
                <Calendar className="h-3.5 w-3.5" />
              </button>
            </div>

            <Button size="sm" className="gap-1 text-xs" onClick={() => setCreateTaskOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Nova tarefa</span>
            </Button>

            {/* Settings gear (only relevant for week/day views) */}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSettingsOpen(true)}>
              <Settings2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Summary Badges Bar ─────────────────────────────────── */}
        <div className="flex items-center gap-2 px-4 py-1.5 border-b bg-muted/30 shrink-0">
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300")}>
            <Video className="h-3.5 w-3.5" />
            <span>{summaryBadges.reunioes} reuniões</span>
          </div>
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300")}>
            <Clock className="h-3.5 w-3.5" />
            <span>{summaryBadges.followUps} follow-ups</span>
          </div>
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", summaryBadges.overdue > 0 ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground")}>
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{summaryBadges.overdue} atrasadas</span>
          </div>
          <div className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium", "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300")}>
            <Phone className="h-3.5 w-3.5" />
            <span>{activitySummary?.calls_made ?? 0} calls</span>
          </div>
        </div>

        {/* ── View: Calendar (original month + list) ──────────────── */}
        {viewMode === "calendar" && (
          <div className="flex-1 overflow-auto p-6 space-y-6">
            {/* Compact metrics bar */}
            <div className="flex items-center gap-4 text-xs">
              <button onClick={() => setActiveMetric(prev => prev === 'overdue' ? null : 'overdue')} className={cn("flex items-center gap-1 px-2 py-1 rounded-md transition-colors", activeMetric === 'overdue' ? "bg-red-100 text-red-700" : "text-muted-foreground hover:bg-muted")}>
                <AlertTriangle className="h-3 w-3" />
                <span className="font-medium">Atrasadas: {metrics.overdue}</span>
              </button>
              <button onClick={() => setActiveMetric(prev => prev === 'today' ? null : 'today')} className={cn("flex items-center gap-1 px-2 py-1 rounded-md transition-colors", activeMetric === 'today' ? "bg-blue-100 text-blue-700" : "text-muted-foreground hover:bg-muted")}>
                <span className="font-medium">Hoje: {metrics.today}</span>
              </button>
              <button onClick={() => setActiveMetric(prev => prev === 'week' ? null : 'week')} className={cn("flex items-center gap-1 px-2 py-1 rounded-md transition-colors", activeMetric === 'week' ? "bg-violet-100 text-violet-700" : "text-muted-foreground hover:bg-muted")}>
                <span className="font-medium">Semana: {metrics.thisWeek}</span>
              </button>
              <button onClick={() => setActiveMetric(prev => prev === 'completed' ? null : 'completed')} className={cn("flex items-center gap-1 px-2 py-1 rounded-md transition-colors", activeMetric === 'completed' ? "bg-emerald-100 text-emerald-700" : "text-muted-foreground hover:bg-muted")}>
                <CheckCircle2 className="h-3 w-3" />
                <span className="font-medium">Concluídas hoje: {metrics.completed}</span>
              </button>
            </div>

            {/* Calendar + Task List */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Monthly Calendar */}
              <Card className="lg:col-span-2 border">
                <CardContent className="p-6">
                  <p className="text-sm text-muted-foreground mb-4">Clique em um dia para ver as tarefas</p>

                  {/* Day Headers */}
                  <div className="grid grid-cols-7 mb-2">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"].map(d => (
                      <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2">{d}</div>
                    ))}
                  </div>

                  {/* Calendar Grid */}
                  <div className="grid grid-cols-7">
                    {calendarDays.map(day => {
                      const key = format(day, "yyyy-MM-dd");
                      const dayTasks = tasksByDate.get(key) || [];
                      const isCurrentMonth = isSameMonth(day, currentMonth);
                      const isSelected = isSameDay(day, selectedDate);
                      const isCurrentDay = isToday(day);
                      const hasTasks = dayTasks.length > 0;

                      return (
                        <button
                          key={key}
                          onClick={() => setSelectedDate(day)}
                          className={cn(
                            "relative h-20 p-1.5 border border-border/50 text-left transition-all hover:bg-muted/50",
                            !isCurrentMonth && "opacity-40",
                            isSelected && "ring-2 ring-primary bg-primary/5",
                            isCurrentDay && !isSelected && "bg-blue-50/50",
                          )}
                        >
                          <span className={cn(
                            "text-xs font-medium",
                            isCurrentDay && "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center",
                            !isCurrentDay && "text-foreground",
                          )}>
                            {format(day, "d")}
                          </span>
                          {hasTasks && (() => {
                            const meetings = dayTasks.filter(t => isAppointment(t));
                            const otherTasks = dayTasks.filter(t => !isAppointment(t));
                            return (
                              <div className="mt-1 space-y-0.5">
                                {meetings.length > 0 && (
                                  <div className="flex items-center gap-1">
                                    <div className="bg-indigo-500 text-white text-[9px] font-bold px-1.5 py-0 rounded leading-tight">
                                      {meetings.length} {meetings.length === 1 ? "reunião" : "reuniões"}
                                    </div>
                                  </div>
                                )}
                                {otherTasks.length > 0 && (
                                  <div className="flex items-center gap-0.5 flex-wrap">
                                    {otherTasks.slice(0, 4).map(task => {
                                      const config = getTaskConfig(task.task_type);
                                      return (
                                        <div key={task.id} className={cn("w-1.5 h-1.5 rounded-full", config.dotColor)} />
                                      );
                                    })}
                                    {otherTasks.length > 4 && (
                                      <span className="text-[9px] text-muted-foreground ml-0.5">+{otherTasks.length - 4}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </button>
                      );
                    })}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t">
                    {Object.entries(TASK_TYPE_CONFIG)
                      .filter(([k]) => ["call", "whatsapp", "email", "meeting", "onboarding", "internal"].includes(k))
                      .map(([key, config]) => (
                        <div key={key} className="flex items-center gap-1.5">
                          <div className={cn("w-2.5 h-2.5 rounded-full", config.dotColor)} />
                          <span className="text-xs text-muted-foreground">{config.label}</span>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>

              {/* Task List (Right) */}
              <div className="space-y-4">
                <Card className="border">
                  <CardContent className="p-4">
                    {/* Mode toggle + Nova */}
                    <div className="flex items-center justify-between mb-2">
                      {!activeMetric ? (
                        <div className="flex border rounded-md overflow-hidden">
                          <button
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium transition-colors",
                              listRangeMode === "day" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                            )}
                            onClick={() => setListRangeMode("day")}
                          >
                            Dia
                          </button>
                          <button
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium transition-colors border-l",
                              listRangeMode === "period" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                            )}
                            onClick={() => {
                              setListRangeMode("period");
                              // Default from/to to current month range if empty
                              if (!listDateFrom) setListDateFrom(format(monthStart, "yyyy-MM-dd"));
                              if (!listDateTo) setListDateTo(format(monthEnd, "yyyy-MM-dd"));
                            }}
                          >
                            Período
                          </button>
                        </div>
                      ) : (
                        <div />
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCreateTaskOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Nova
                      </Button>
                    </div>

                    {/* Date selector: single day or range (hidden when metric filter active) */}
                    {activeMetric ? null : listRangeMode === "day" ? (
                      <div className="flex items-center gap-1 mb-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(prev => addDays(prev, -1))}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <button
                          onClick={goToday}
                          className={cn(
                            "text-sm font-semibold px-2 py-1 rounded-md transition-colors hover:bg-accent",
                            isToday(selectedDate) && "text-primary",
                          )}
                        >
                          {isToday(selectedDate)
                            ? "Hoje"
                            : format(selectedDate, "dd MMM", { locale: ptBR })}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(prev => addDays(prev, 1))}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <input
                          type="date"
                          className="h-7 text-xs border rounded px-1.5 bg-background ml-1 w-[120px]"
                          value={format(selectedDate, "yyyy-MM-dd")}
                          onChange={e => {
                            const d = new Date(e.target.value + "T12:00:00");
                            if (!isNaN(d.getTime())) {
                              setSelectedDate(d);
                              setCurrentMonth(d);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">De</label>
                          <input
                            type="date"
                            className="h-7 text-xs border rounded px-1.5 bg-background w-full"
                            value={listDateFrom}
                            onChange={e => setListDateFrom(e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">Até</label>
                          <input
                            type="date"
                            className="h-7 text-xs border rounded px-1.5 bg-background w-full"
                            value={listDateTo}
                            onChange={e => setListDateTo(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs mt-3.5 px-2"
                          onClick={() => {
                            setListDateFrom(format(monthStart, "yyyy-MM-dd"));
                            setListDateTo(format(monthEnd, "yyyy-MM-dd"));
                          }}
                          title="Mês inteiro"
                        >
                          Mês
                        </Button>
                      </div>
                    )}

                    {activeMetric ? (
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className={cn("text-xs", {
                          "bg-red-100 text-red-700": activeMetric === 'overdue',
                          "bg-blue-100 text-blue-700": activeMetric === 'today',
                          "bg-violet-100 text-violet-700": activeMetric === 'week',
                          "bg-emerald-100 text-emerald-700": activeMetric === 'completed',
                        })}>
                          {activeMetric === 'overdue' && `Atrasadas (${listTasks.length})`}
                          {activeMetric === 'today' && `Reuniões hoje (${listTasks.length})`}
                          {activeMetric === 'week' && `Reuniões semana (${listTasks.length})`}
                          {activeMetric === 'completed' && `Concluídas (${listTasks.length})`}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActiveMetric(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-3">
                        {listRangeMode === "day"
                          ? `${format(selectedDate, "EEEE", { locale: ptBR })} · `
                          : ""}
                        {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                        {completedCount > 0 && ` · ${completedCount} concluída${completedCount !== 1 ? "s" : ""}`}
                      </p>
                    )}

                    {/* Filters */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos tipos</SelectItem>
                          {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="pending">Pendentes</SelectItem>
                          <SelectItem value="completed">Concluídas</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={filterPriority} onValueChange={setFilterPriority}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                      {hasFilters && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => { setFilterType("all"); setFilterStatus("all"); setFilterPriority("all"); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {(() => {
                      const filtered = applyFilters(listTasks);
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{hasFilters ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa neste período"}</p>
                            {!hasFilters && (
                              <Button variant="link" size="sm" className="mt-2" onClick={() => setCreateTaskOpen(true)}>
                                Criar tarefa
                              </Button>
                            )}
                          </div>
                        );
                      }

                      // In period/metric mode, group by date with headers
                      if (listRangeMode === "period" || activeMetric) {
                        const grouped = new Map<string, AgendaTask[]>();
                        for (const t of filtered) {
                          const dk = t.scheduled_at ? format(new Date(t.scheduled_at), "yyyy-MM-dd") : "sem-data";
                          if (!grouped.has(dk)) grouped.set(dk, []);
                          grouped.get(dk)!.push(t);
                        }
                        return (
                          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                            {Array.from(grouped.entries()).map(([dateKey, tasks]) => (
                              <div key={dateKey}>
                                <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-card py-0.5 z-10">
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                    {dateKey === "sem-data"
                                      ? "Sem data"
                                      : format(new Date(dateKey + "T12:00:00"), "EEE, dd MMM", { locale: ptBR })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
                                  <div className="flex-1 border-t border-border/50" />
                                </div>
                                <div className="space-y-1.5">
                                  {tasks.map(task => (
                                    <TaskCard
                                      key={task.id}
                                      task={task}
                                      onComplete={() => completeTask.mutate(task.id)}
                                      onDelete={handleDeleteTask}
                                      onClick={() => setSelectedTask(task)}
                                      confirmDelete={confirmDelete}
                                      onCall={handleCall}
                                      onOpenLead={handleOpenLead}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      // Day mode: flat list
                      return (
                        <div className="space-y-2">
                          {filtered.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onComplete={() => completeTask.mutate(task.id)}
                              onDelete={handleDeleteTask}
                              onClick={() => setSelectedTask(task)}
                              confirmDelete={confirmDelete}
                              onCall={handleCall}
                              onOpenLead={handleOpenLead}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Overdue section */}
                <OverdueSection
                  allTasks={allTasks}
                  overdueCount={metrics.overdue}
                  overdueSort={overdueSort}
                  setOverdueSort={setOverdueSort}
                  overdueFilterType={overdueFilterType}
                  setOverdueFilterType={setOverdueFilterType}
                  overdueFilterScore={overdueFilterScore}
                  setOverdueFilterScore={setOverdueFilterScore}
                  hasOverdueFilters={hasOverdueFilters}
                  onClearOverdueFilters={() => { setOverdueSort("oldest"); setOverdueFilterType("all"); setOverdueFilterScore("all"); }}
                  onComplete={id => completeTask.mutate(id)}
                  onDelete={handleDeleteTask}
                  onTaskClick={task => setSelectedTask(task)}
                  confirmDelete={confirmDelete}
                  toggleConfirmDelete={toggleConfirmDelete}
                  onCall={handleCall}
                  onOpenLead={handleOpenLead}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── View: Week ─────────────────────────────────────────── */}
        {viewMode === "week" && (
          <div className="flex-1 overflow-auto">

            {/* Grid filter bar */}
            <div className="px-4 pt-3 pb-0">
              <GridFilterBar
                activeGridTypes={activeGridTypes}
                toggleGridType={toggleGridType}
                onlyMeetingsActive={onlyMeetingsActive}
                allGridTypesActive={allGridTypesActive}
                setOnlyMeetings={setOnlyMeetings}
                setAllGridTypes={setAllGridTypes}
              />
            </div>

            {/* Week Grid + Task List */}
            <div className="flex flex-1 overflow-hidden p-4 pt-3 gap-4" style={{ height: 'calc(100vh - 340px)' }}>
              {/* Sidebar + Week grid */}
              <div className="flex flex-1 overflow-hidden border rounded-lg">
                <div className="w-52 border-r bg-muted/20 p-3 hidden lg:flex flex-col gap-4 overflow-y-auto shrink-0">
                  <MiniCalendarNav
                    selectedDate={selectedDate}
                    onSelectDate={d => setSelectedDate(d)}
                  />
                  <SidebarUpcoming tasks={allTasks} onTaskClick={handleTaskClick} />
                  <SidebarLegend />
                </div>
                <div className="flex-1 overflow-hidden p-2">
                  <WeekViewGrid
                    selectedDate={selectedDate}
                    tasks={gridAppointments}
                    quickTasks={gridQuickTasks}
                    blocks={blocks}
                    googleEvents={googleEvents}
                    workingHours={workingHours}
                    onTaskClick={handleTaskClick}
                    onCreateTask={handleCreateTask}
                  />
                </div>
              </div>

              {/* Task List (Right) - same as calendar view */}
              <div className="w-[340px] shrink-0 space-y-3 overflow-y-auto hidden xl:block">
                <Card className="border">
                  <CardContent className="p-4">
                    {/* Mode toggle + Nova */}
                    <div className="flex items-center justify-between mb-2">
                      {!activeMetric ? (
                        <div className="flex border rounded-md overflow-hidden">
                          <button
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium transition-colors",
                              listRangeMode === "day" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                            )}
                            onClick={() => setListRangeMode("day")}
                          >
                            Dia
                          </button>
                          <button
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium transition-colors border-l",
                              listRangeMode === "period" ? "bg-primary text-primary-foreground" : "bg-background hover:bg-accent",
                            )}
                            onClick={() => {
                              setListRangeMode("period");
                              if (!listDateFrom) setListDateFrom(format(monthStart, "yyyy-MM-dd"));
                              if (!listDateTo) setListDateTo(format(monthEnd, "yyyy-MM-dd"));
                            }}
                          >
                            Período
                          </button>
                        </div>
                      ) : (
                        <div />
                      )}
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCreateTaskOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Nova
                      </Button>
                    </div>

                    {/* Date selector */}
                    {activeMetric ? null : listRangeMode === "day" ? (
                      <div className="flex items-center gap-1 mb-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(prev => addDays(prev, -1))}>
                          <ChevronLeft className="h-3.5 w-3.5" />
                        </Button>
                        <button
                          onClick={goToday}
                          className={cn(
                            "text-sm font-semibold px-2 py-1 rounded-md transition-colors hover:bg-accent",
                            isToday(selectedDate) && "text-primary",
                          )}
                        >
                          {isToday(selectedDate)
                            ? "Hoje"
                            : format(selectedDate, "dd MMM", { locale: ptBR })}
                        </button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedDate(prev => addDays(prev, 1))}>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <input
                          type="date"
                          className="h-7 text-xs border rounded px-1.5 bg-background ml-1 w-[120px]"
                          value={format(selectedDate, "yyyy-MM-dd")}
                          onChange={e => {
                            const d = new Date(e.target.value + "T12:00:00");
                            if (!isNaN(d.getTime())) {
                              setSelectedDate(d);
                              setCurrentMonth(d);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 mb-1">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">De</label>
                          <input
                            type="date"
                            className="h-7 text-xs border rounded px-1.5 bg-background w-full"
                            value={listDateFrom}
                            onChange={e => setListDateFrom(e.target.value)}
                          />
                        </div>
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground">Até</label>
                          <input
                            type="date"
                            className="h-7 text-xs border rounded px-1.5 bg-background w-full"
                            value={listDateTo}
                            onChange={e => setListDateTo(e.target.value)}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs mt-3.5 px-2"
                          onClick={() => {
                            setListDateFrom(format(monthStart, "yyyy-MM-dd"));
                            setListDateTo(format(monthEnd, "yyyy-MM-dd"));
                          }}
                          title="Mês inteiro"
                        >
                          Mês
                        </Button>
                      </div>
                    )}

                    {activeMetric ? (
                      <div className="flex items-center gap-2 mb-3">
                        <Badge variant="secondary" className={cn("text-xs", {
                          "bg-red-100 text-red-700": activeMetric === 'overdue',
                          "bg-blue-100 text-blue-700": activeMetric === 'today',
                          "bg-violet-100 text-violet-700": activeMetric === 'week',
                          "bg-emerald-100 text-emerald-700": activeMetric === 'completed',
                        })}>
                          {activeMetric === 'overdue' && `Atrasadas (${listTasks.length})`}
                          {activeMetric === 'today' && `Reuniões hoje (${listTasks.length})`}
                          {activeMetric === 'week' && `Reuniões semana (${listTasks.length})`}
                          {activeMetric === 'completed' && `Concluídas (${listTasks.length})`}
                        </Badge>
                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setActiveMetric(null)}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground mb-3">
                        {listRangeMode === "day"
                          ? `${format(selectedDate, "EEEE", { locale: ptBR })} · `
                          : ""}
                        {pendingCount} pendente{pendingCount !== 1 ? "s" : ""}
                        {completedCount > 0 && ` · ${completedCount} concluída${completedCount !== 1 ? "s" : ""}`}
                      </p>
                    )}

                    {/* Filters */}
                    <div className="flex items-center gap-1.5 mb-3">
                      <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Tipo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos tipos</SelectItem>
                          {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                            <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={filterStatus} onValueChange={setFilterStatus}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          <SelectItem value="pending">Pendentes</SelectItem>
                          <SelectItem value="completed">Concluídas</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={filterPriority} onValueChange={setFilterPriority}>
                        <SelectTrigger className="h-7 text-xs flex-1">
                          <SelectValue placeholder="Prioridade" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          <SelectItem value="high">Alta</SelectItem>
                          <SelectItem value="medium">Média</SelectItem>
                          <SelectItem value="low">Baixa</SelectItem>
                        </SelectContent>
                      </Select>
                      {hasFilters && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          onClick={() => { setFilterType("all"); setFilterStatus("all"); setFilterPriority("all"); }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    {(() => {
                      const filtered = applyFilters(listTasks);
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">{hasFilters ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa neste período"}</p>
                            {!hasFilters && (
                              <Button variant="link" size="sm" className="mt-2" onClick={() => setCreateTaskOpen(true)}>
                                Criar tarefa
                              </Button>
                            )}
                          </div>
                        );
                      }

                      if (listRangeMode === "period" || activeMetric) {
                        const grouped = new Map<string, AgendaTask[]>();
                        for (const t of filtered) {
                          const dk = t.scheduled_at ? format(new Date(t.scheduled_at), "yyyy-MM-dd") : "sem-data";
                          if (!grouped.has(dk)) grouped.set(dk, []);
                          grouped.get(dk)!.push(t);
                        }
                        return (
                          <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                            {Array.from(grouped.entries()).map(([dateKey, tasks]) => (
                              <div key={dateKey}>
                                <div className="flex items-center gap-2 mb-1.5 sticky top-0 bg-card py-0.5 z-10">
                                  <span className="text-[10px] font-semibold text-muted-foreground uppercase">
                                    {dateKey === "sem-data"
                                      ? "Sem data"
                                      : format(new Date(dateKey + "T12:00:00"), "EEE, dd MMM", { locale: ptBR })}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground">({tasks.length})</span>
                                  <div className="flex-1 border-t border-border/50" />
                                </div>
                                <div className="space-y-1.5">
                                  {tasks.map(task => (
                                    <TaskCard
                                      key={task.id}
                                      task={task}
                                      onComplete={() => completeTask.mutate(task.id)}
                                      onDelete={handleDeleteTask}
                                      onClick={() => setSelectedTask(task)}
                                      confirmDelete={confirmDelete}
                                      onCall={handleCall}
                                      onOpenLead={handleOpenLead}
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }

                      return (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                          {filtered.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onComplete={() => completeTask.mutate(task.id)}
                              onDelete={handleDeleteTask}
                              onClick={() => setSelectedTask(task)}
                              confirmDelete={confirmDelete}
                              onCall={handleCall}
                              onOpenLead={handleOpenLead}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Overdue section */}
                <OverdueSection
                  allTasks={allTasks}
                  overdueCount={metrics.overdue}
                  overdueSort={overdueSort}
                  setOverdueSort={setOverdueSort}
                  overdueFilterType={overdueFilterType}
                  setOverdueFilterType={setOverdueFilterType}
                  overdueFilterScore={overdueFilterScore}
                  setOverdueFilterScore={setOverdueFilterScore}
                  hasOverdueFilters={hasOverdueFilters}
                  onClearOverdueFilters={() => { setOverdueSort("oldest"); setOverdueFilterType("all"); setOverdueFilterScore("all"); }}
                  onComplete={id => completeTask.mutate(id)}
                  onDelete={handleDeleteTask}
                  onTaskClick={task => setSelectedTask(task)}
                  confirmDelete={confirmDelete}
                  toggleConfirmDelete={toggleConfirmDelete}
                  onCall={handleCall}
                  onOpenLead={handleOpenLead}
                />
              </div>
            </div>
          </div>
        )}

        {/* ── View: Day ──────────────────────────────────────────── */}
        {viewMode === "day" && (
          <div className="flex-1 overflow-auto">
            {/* Grid filter bar */}
            <div className="px-4 pt-3 pb-0">
              <GridFilterBar
                activeGridTypes={activeGridTypes}
                toggleGridType={toggleGridType}
                onlyMeetingsActive={onlyMeetingsActive}
                allGridTypesActive={allGridTypesActive}
                setOnlyMeetings={setOnlyMeetings}
                setAllGridTypes={setAllGridTypes}
              />
            </div>

            {/* Day Grid + Task List */}
            <div className="flex flex-1 overflow-hidden p-4 pt-3 gap-4" style={{ height: 'calc(100vh - 340px)' }}>
              {/* Sidebar + Day grid */}
              <div className="flex flex-1 overflow-hidden border rounded-lg">
                <div className="w-52 border-r bg-muted/20 p-3 hidden lg:flex flex-col gap-4 overflow-y-auto shrink-0">
                  <MiniCalendarNav
                    selectedDate={selectedDate}
                    onSelectDate={d => setSelectedDate(d)}
                  />
                  <SidebarUpcoming tasks={allTasks} onTaskClick={handleTaskClick} />
                  <SidebarLegend />
                </div>
                <div className="flex-1 overflow-hidden p-2">
                  <DayViewGrid
                    selectedDate={selectedDate}
                    tasks={gridAppointments}
                    quickTasks={gridQuickTasks}
                    blocks={blocks}
                    googleEvents={googleEvents}
                    workingHours={workingHours}
                    onTaskClick={handleTaskClick}
                    onCreateTask={handleCreateTask}
                  />
                </div>
              </div>

              {/* Task List (Right) */}
              <div className="w-[340px] shrink-0 space-y-3 overflow-y-auto hidden xl:block">
                <Card className="border">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div />
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setCreateTaskOpen(true)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Nova
                      </Button>
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">
                      {format(selectedDate, "EEEE", { locale: ptBR })} ·{" "}
                      {allTasks.filter(t => !t.completed).length} pendente{allTasks.filter(t => !t.completed).length !== 1 ? "s" : ""}
                    </p>

                    {(() => {
                      const filtered = applyFilters(allTasks.filter(t => {
                        const sa = t.scheduled_at ? new Date(t.scheduled_at) : null;
                        return sa && isSameDay(sa, selectedDate);
                      }));
                      if (filtered.length === 0) {
                        return (
                          <div className="text-center py-8 text-muted-foreground">
                            <CalendarDays className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p className="text-sm">Nenhuma tarefa neste dia</p>
                            <Button variant="link" size="sm" className="mt-2" onClick={() => setCreateTaskOpen(true)}>
                              Criar tarefa
                            </Button>
                          </div>
                        );
                      }
                      return (
                        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                          {filtered.map(task => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              onComplete={() => completeTask.mutate(task.id)}
                              onDelete={handleDeleteTask}
                              onClick={() => setSelectedTask(task)}
                              confirmDelete={confirmDelete}
                              onCall={handleCall}
                              onOpenLead={handleOpenLead}
                            />
                          ))}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>

                {/* Overdue section */}
                <OverdueSection
                  allTasks={allTasks}
                  overdueCount={metrics.overdue}
                  overdueSort={overdueSort}
                  setOverdueSort={setOverdueSort}
                  overdueFilterType={overdueFilterType}
                  setOverdueFilterType={setOverdueFilterType}
                  overdueFilterScore={overdueFilterScore}
                  setOverdueFilterScore={setOverdueFilterScore}
                  hasOverdueFilters={hasOverdueFilters}
                  onClearOverdueFilters={() => { setOverdueSort("oldest"); setOverdueFilterType("all"); setOverdueFilterScore("all"); }}
                  onComplete={id => completeTask.mutate(id)}
                  onDelete={handleDeleteTask}
                  onTaskClick={task => setSelectedTask(task)}
                  confirmDelete={confirmDelete}
                  toggleConfirmDelete={toggleConfirmDelete}
                  onCall={handleCall}
                  onOpenLead={handleOpenLead}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals & Sheets ──────────────────────────────────────── */}
      <CalendarSettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} />

      <CreateTaskModal
        open={createTaskOpen}
        onOpenChange={(o) => { if (!o) { setCreateTaskOpen(false); setCreateTaskDate(null); } }}
        onSuccess={refetchAll}
        defaultValues={
          createTaskDate
            ? { due_datetime: format(createTaskDate, "yyyy-MM-dd'T'HH:mm"), team: "sales" as const }
            : { due_datetime: format(selectedDate, "yyyy-MM-dd'T'10:00"), team: "sales" as const }
        }
      />

      <TaskDetailModal
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(o) => { if (!o) setSelectedTask(null); }}
        onUpdate={refetchAll}
      />
    </>
  );
}

export default function SalesAgendaV2() {
  return (
    <AppLayout>
      <AgendaViewContent />
    </AppLayout>
  );
}

// ── Grid Filter Bar (week/day views) ─────────────────────────────────

function GridFilterBar({
  activeGridTypes,
  toggleGridType,
  onlyMeetingsActive,
  allGridTypesActive,
  setOnlyMeetings,
  setAllGridTypes,
}: {
  activeGridTypes: Set<string>;
  toggleGridType: (type: string) => void;
  onlyMeetingsActive: boolean;
  allGridTypesActive: boolean;
  setOnlyMeetings: () => void;
  setAllGridTypes: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mr-1">Filtros:</span>
      {GRID_FILTER_TYPES.map(({ key, label, dotColor }) => {
        const active = activeGridTypes.has(key);
        return (
          <button
            key={key}
            onClick={() => toggleGridType(key)}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all",
              active
                ? "bg-background border-border shadow-sm"
                : "bg-muted/40 border-transparent text-muted-foreground opacity-50",
            )}
          >
            <div className={cn("w-2 h-2 rounded-full", dotColor, !active && "opacity-40")} />
            {label}
          </button>
        );
      })}
      <div className="w-px h-4 bg-border mx-1" />
      <button
        onClick={setOnlyMeetings}
        className={cn(
          "px-2 py-0.5 rounded-full text-[11px] font-medium border transition-all",
          onlyMeetingsActive
            ? "bg-indigo-100 text-indigo-700 border-indigo-200"
            : "bg-muted/40 border-transparent text-muted-foreground hover:bg-accent",
        )}
      >
        Só reuniões
      </button>
      {!allGridTypesActive && (
        <button
          onClick={setAllGridTypes}
          className="px-2 py-0.5 rounded-full text-[11px] font-medium text-muted-foreground hover:bg-accent border border-transparent transition-all"
        >
          Todos
        </button>
      )}
    </div>
  );
}

// ── Sidebar components (shared by week/day views) ────────────────────

function SidebarUpcoming({ tasks, onTaskClick }: { tasks: AgendaTask[]; onTaskClick: (t: AgendaTask) => void }) {
  const upcoming = useMemo(() => {
    const now = new Date();
    return tasks
      .filter(t => !t.completed && t.scheduled_at && new Date(t.scheduled_at) >= now)
      .slice(0, 5);
  }, [tasks]);

  const ICONS: Record<string, React.ElementType> = { meeting: Video, call: Phone, whatsapp: MessageSquare };

  return (
    <div>
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Próximos</h3>
      {upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum evento próximo</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(task => {
            const Icon = ICONS[task.task_type] || Clock;
            const start = new Date(task.scheduled_at!);
            return (
              <button key={task.id} className="w-full text-left p-2 rounded-md hover:bg-accent transition-colors" onClick={() => onTaskClick(task)}>
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium truncate">{task.name}</span>
                </div>
                <div className="text-[10px] text-muted-foreground pl-4.5 mt-0.5">
                  {isToday(start) ? "Hoje" : format(start, "EEE d", { locale: ptBR })} · {format(start, "HH:mm")}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SidebarLegend() {
  return (
    <div className="mt-auto">
      <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Legenda</h3>
      <div className="space-y-1">
        {[
          { label: "Reunião", color: "bg-indigo-500" },
          { label: "Ligação", color: "bg-blue-500" },
          { label: "WhatsApp", color: "bg-green-500" },
          { label: "Bloqueio", color: "bg-slate-400" },
          { label: "Google Calendar", color: "bg-amber-400" },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-sm", item.color)} />
            <span className="text-[10px] text-muted-foreground">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Task Card (from original SalesAgenda) ────────────────────────────

function TaskCard({ task, onComplete, onDelete, onClick, isOverdue, confirmDelete = true, onCall, onOpenLead }: {
  task: AgendaTask;
  onComplete: () => void;
  onDelete: (id: string) => void;
  onClick: () => void;
  isOverdue?: boolean;
  confirmDelete?: boolean;
  onCall?: (phone: string, leadId?: string) => void;
  onOpenLead?: (leadId: string) => void;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const config = getTaskConfig(task.task_type);
  const Icon = config.icon;
  const time = task.scheduled_at ? format(new Date(task.scheduled_at), "HH:mm") : "--:--";

  const leadScore = task.lead && "sales_score" in task.lead ? task.lead.sales_score : null;
  const leadStage = task.lead && "sales_stage" in task.lead ? task.lead.sales_stage : null;

  const handleTrashClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirmDelete) {
      setDeleteOpen(true);
    } else {
      onDelete(task.id);
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "group flex items-start gap-3 p-3 rounded-lg border transition-all hover:shadow-md hover:ring-1 hover:ring-primary/20 cursor-pointer relative",
        task.completed ? "opacity-60 bg-muted/30" : "bg-card",
        isOverdue && !task.completed && "border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/30",
      )}
    >
      <button
        onClick={e => { e.stopPropagation(); onComplete(); }}
        className={cn(
          "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
          task.completed
            ? "bg-emerald-500 border-emerald-500 text-white"
            : "border-muted-foreground/30 hover:border-emerald-400 hover:bg-emerald-50",
        )}
      >
        {task.completed && <Check className="h-3 w-3" />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">{time}</span>
          <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0", config.color)}>
            <Icon className="h-2.5 w-2.5 mr-0.5" />
            {config.label}
          </Badge>
          {task.priority === "high" && (
            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Alta</Badge>
          )}
        </div>
        <p className={cn(
          "text-sm font-medium mt-0.5 truncate",
          task.completed && "line-through text-muted-foreground",
        )}>
          {task.name}
        </p>
        {task.lead && (
          <div className="mt-0.5">
            <p className="text-xs text-muted-foreground truncate">{task.lead.name}</p>
            {(leadScore != null || leadStage) && (
              <div className="flex items-center gap-1.5 mt-1">
                {leadScore != null && <LeadScoreBadge score={leadScore} size="sm" showLabel={false} />}
                {leadStage && <SalesStageBadge stage={leadStage} size="sm" showIcon={false} />}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Hover action buttons */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {onCall && task.lead?.phone && (
          <button
            onClick={e => { e.stopPropagation(); onCall(task.lead!.phone!, task.lead!.id); }}
            className="p-1 rounded-md hover:bg-blue-50 dark:hover:bg-blue-950 text-muted-foreground hover:text-blue-600"
            title="Ligar"
          >
            <Phone className="h-3.5 w-3.5" />
          </button>
        )}
        {onOpenLead && task.lead?.id && (
          <button
            onClick={e => { e.stopPropagation(); onOpenLead(task.lead!.id); }}
            className="p-1 rounded-md hover:bg-violet-50 dark:hover:bg-violet-950 text-muted-foreground hover:text-violet-600"
            title="Ver lead"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        )}
      {confirmDelete ? (
        <Popover open={deleteOpen} onOpenChange={setDeleteOpen}>
          <PopoverTrigger asChild>
            <button
              onClick={handleTrashClick}
              className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-500"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto p-3"
            align="end"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-sm font-medium mb-2">Excluir tarefa?</p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                size="sm"
                className="h-7 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  onDelete(task.id);
                  setDeleteOpen(false);
                }}
              >
                Excluir
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={e => {
                  e.stopPropagation();
                  setDeleteOpen(false);
                }}
              >
                Cancelar
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      ) : (
        <button
          onClick={handleTrashClick}
          className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950 text-muted-foreground hover:text-red-500"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
      </div>
    </div>
  );
}

// ── Overdue section with dedicated filters ────────────────────────────

function OverdueSection({
  allTasks,
  overdueCount,
  overdueSort,
  setOverdueSort,
  overdueFilterType,
  setOverdueFilterType,
  overdueFilterScore,
  setOverdueFilterScore,
  hasOverdueFilters,
  onClearOverdueFilters,
  onComplete,
  onDelete,
  onTaskClick,
  confirmDelete,
  toggleConfirmDelete,
  onCall,
  onOpenLead,
}: {
  allTasks: AgendaTask[];
  overdueCount: number;
  overdueSort: string;
  setOverdueSort: (v: string) => void;
  overdueFilterType: string;
  setOverdueFilterType: (v: string) => void;
  overdueFilterScore: string;
  setOverdueFilterScore: (v: string) => void;
  hasOverdueFilters: boolean;
  onClearOverdueFilters: () => void;
  onComplete: (id: string) => void;
  onDelete: (id: string) => void;
  onTaskClick: (t: AgendaTask) => void;
  confirmDelete: boolean;
  toggleConfirmDelete: () => void;
  onCall?: (phone: string, leadId?: string) => void;
  onOpenLead?: (leadId: string) => void;
}) {
  const [showAllOverdue, setShowAllOverdue] = useState(false);

  const overdueTasks = useMemo(() => {
    const now = startOfDay(new Date());
    let tasks = allTasks.filter(
      t => !t.completed && t.scheduled_at && isBefore(new Date(t.scheduled_at), now)
    );

    // Filter by type
    if (overdueFilterType !== "all") {
      tasks = tasks.filter(t => t.task_type === overdueFilterType);
    }

    // Filter by score/temperature
    if (overdueFilterScore !== "all") {
      tasks = tasks.filter(t => {
        const score = t.lead && "sales_score" in t.lead ? (t.lead.sales_score ?? 0) : 0;
        switch (overdueFilterScore) {
          case "hot": return score >= 80;
          case "warm": return score >= 50 && score < 80;
          case "cold": return score < 50;
          case "no_lead": return !t.lead_id;
          default: return true;
        }
      });
    }

    // Sort
    switch (overdueSort) {
      case "oldest":
        tasks.sort((a, b) => new Date(a.scheduled_at!).getTime() - new Date(b.scheduled_at!).getTime());
        break;
      case "newest":
        tasks.sort((a, b) => new Date(b.scheduled_at!).getTime() - new Date(a.scheduled_at!).getTime());
        break;
      case "score_desc":
        tasks.sort((a, b) => {
          const sa = a.lead && "sales_score" in a.lead ? (a.lead.sales_score ?? 0) : 0;
          const sb = b.lead && "sales_score" in b.lead ? (b.lead.sales_score ?? 0) : 0;
          return sb - sa;
        });
        break;
      case "priority":
        tasks.sort((a, b) => {
          const pMap: Record<string, number> = { high: 0, medium: 1, low: 2 };
          return (pMap[a.priority] ?? 1) - (pMap[b.priority] ?? 1);
        });
        break;
    }

    return tasks;
  }, [allTasks, overdueFilterType, overdueFilterScore, overdueSort]);

  if (overdueCount === 0 && !hasOverdueFilters) return null;

  const displayTasks = showAllOverdue ? overdueTasks : overdueTasks.slice(0, 8);

  return (
    <Card className="border border-red-200 dark:border-red-900 bg-red-50/30 dark:bg-red-950/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="font-semibold text-red-700 dark:text-red-400 text-sm">
              Atrasadas ({overdueTasks.length}{hasOverdueFilters ? ` de ${overdueCount}` : ""})
            </h3>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={toggleConfirmDelete}
              className={cn(
                "text-[10px] px-1.5 py-0.5 rounded border transition-colors",
                confirmDelete
                  ? "bg-amber-50 border-amber-200 text-amber-700"
                  : "bg-muted border-border text-muted-foreground",
              )}
              title={confirmDelete ? "Confirmação de exclusão: LIGADA" : "Confirmação de exclusão: DESLIGADA"}
            >
              <Shield className="h-3 w-3 inline mr-0.5" />
              {confirmDelete ? "Confirmar" : "Direto"}
            </button>
          </div>
        </div>

        {/* Overdue Filters */}
        <div className="flex items-center gap-1.5 mb-3">
          <Select value={overdueSort} onValueChange={setOverdueSort}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="oldest">Mais antiga</SelectItem>
              <SelectItem value="newest">Mais recente</SelectItem>
              <SelectItem value="score_desc">Maior score</SelectItem>
              <SelectItem value="priority">Prioridade</SelectItem>
            </SelectContent>
          </Select>
          <Select value={overdueFilterType} onValueChange={setOverdueFilterType}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos tipos</SelectItem>
              {Object.entries(TASK_TYPE_CONFIG).map(([key, cfg]) => (
                <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={overdueFilterScore} onValueChange={setOverdueFilterScore}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Temperatura</SelectItem>
              <SelectItem value="hot">Quente (80+)</SelectItem>
              <SelectItem value="warm">Morno (50-79)</SelectItem>
              <SelectItem value="cold">Frio (&lt;50)</SelectItem>
              <SelectItem value="no_lead">Sem lead</SelectItem>
            </SelectContent>
          </Select>
          {hasOverdueFilters && (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onClearOverdueFilters}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {overdueTasks.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nenhuma tarefa com esses filtros</p>
        ) : (
          <>
            <div className="space-y-2">
              {displayTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={() => onComplete(task.id)}
                  onDelete={onDelete}
                  onClick={() => onTaskClick(task)}
                  isOverdue
                  confirmDelete={confirmDelete}
                  onCall={onCall}
                  onOpenLead={onOpenLead}
                />
              ))}
            </div>
            {overdueTasks.length > 8 && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full mt-2 text-xs text-red-600 hover:text-red-700"
                onClick={() => setShowAllOverdue(prev => !prev)}
              >
                {showAllOverdue ? "Mostrar menos" : `Ver todas (${overdueTasks.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
