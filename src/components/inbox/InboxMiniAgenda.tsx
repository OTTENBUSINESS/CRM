import { useState, useMemo } from "react";
import { format, isToday, isTomorrow, startOfDay, endOfDay, addDays, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CalendarDays,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  Users,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Task } from "@/hooks/useTasks";

const TASK_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  meeting: Video,
  whatsapp: MessageSquare,
  email: Mail,
  onboarding: Building2,
};

const TASK_COLORS: Record<string, string> = {
  call: "text-blue-500 bg-blue-50",
  meeting: "text-indigo-500 bg-indigo-50",
  whatsapp: "text-green-500 bg-green-50",
  email: "text-purple-500 bg-purple-50",
  onboarding: "text-orange-500 bg-orange-50",
};

// Hook flexível: busca tasks de um período para um responsável
const useAgendaTasks = (memberId: string | undefined, baseDate: Date) => {
  const start = startOfDay(baseDate);
  const end = endOfDay(addDays(baseDate, 2)); // 3 dias a partir da data selecionada

  return useQuery({
    queryKey: ["agenda-tasks", memberId, format(start, "yyyy-MM-dd")],
    queryFn: async () => {
      if (!memberId) return [];

      const { data: activities, error } = await supabase
        .from("company_activities")
        .select("*")
        .eq("responsavel_id", memberId)
        .in("task_type", ["call", "meeting", "onboarding", "whatsapp", "email"])
        .gte("scheduled_at", start.toISOString())
        .lte("scheduled_at", end.toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(30);

      if (error) throw error;
      if (!activities || activities.length === 0) return [];

      const leadIds = activities.map((a) => a.lead_id).filter(Boolean);
      let leadsMap = new Map<string, { id: string; name: string }>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from("leads")
          .select("id, name")
          .in("id", leadIds);
        if (leads) leadsMap = new Map(leads.map((l) => [l.id, l]));
      }

      return activities.map((a) => ({
        ...a,
        lead: a.lead_id ? leadsMap.get(a.lead_id) || null : null,
      })) as Task[];
    },
    enabled: !!memberId,
  });
};

interface InboxMiniAgendaProps {
  className?: string;
}

export function InboxMiniAgenda({ className }: InboxMiniAgendaProps) {
  const { teamMember } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | undefined>(undefined);
  const [baseDate, setBaseDate] = useState(() => new Date());

  const { data: members = [] } = useTeamMembers();

  const activeMemberId = selectedMemberId || teamMember?.id;
  const activeMemberName = selectedMemberId
    ? members.find((m) => m.id === selectedMemberId)?.name?.split(" ")[0] || "?"
    : "Minha";
  const isOwnAgenda = !selectedMemberId || selectedMemberId === teamMember?.id;

  const { data: tasks = [] } = useAgendaTasks(activeMemberId, baseDate);

  // Tarefas do primeiro dia (para slots livres)
  const firstDayTasks = useMemo(
    () => tasks.filter((t) => {
      const d = new Date(t.scheduled_at || t.due_datetime || "");
      return format(d, "yyyy-MM-dd") === format(baseDate, "yyyy-MM-dd");
    }),
    [tasks, baseDate]
  );

  // Agrupar por dia
  const groupedTasks = useMemo(() => {
    const groups = new Map<string, { label: string; tasks: Task[] }>();

    for (const task of tasks) {
      const date = new Date(task.scheduled_at || task.due_datetime || "");
      const key = format(date, "yyyy-MM-dd");

      if (!groups.has(key)) {
        let label = format(date, "EEEE, dd/MM", { locale: ptBR });
        if (isToday(date)) label = "Hoje";
        else if (isTomorrow(date)) label = "Amanhã";
        groups.set(key, { label, tasks: [] });
      }
      groups.get(key)!.tasks.push(task);
    }

    return Array.from(groups.entries());
  }, [tasks]);

  // Calcular slots livres do primeiro dia
  const freeSlots = useMemo(() => {
    const now = new Date();
    const isBaseToday = isToday(baseDate);
    const currentHour = isBaseToday ? now.getHours() : 7; // Se não é hoje, mostra a partir das 8h
    const slots: string[] = [];

    const busyTimes = new Set<number>();
    for (const task of firstDayTasks) {
      const date = new Date(task.scheduled_at || task.due_datetime || "");
      busyTimes.add(date.getHours());
      busyTimes.add(date.getHours() + 1);
    }

    for (let h = 8; h <= 17; h++) {
      if (h <= currentHour) continue;
      if (!busyTimes.has(h) && !busyTimes.has(h - 1)) {
        slots.push(`${String(h).padStart(2, "0")}:00`);
      }
    }

    return slots.slice(0, 6);
  }, [firstDayTasks, baseDate]);

  const todayCount = firstDayTasks.filter((t) => !t.completed).length;

  const goBack = () => setBaseDate((d) => subDays(d, 1));
  const goForward = () => setBaseDate((d) => addDays(d, 1));
  const goToday = () => setBaseDate(new Date());

  const baseDateIsToday = isToday(baseDate);

  // Label do dia selecionado
  const dateLabel = baseDateIsToday
    ? "Hoje"
    : isTomorrow(baseDate)
    ? "Amanhã"
    : format(baseDate, "EEE, dd/MM", { locale: ptBR });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn("relative h-8 px-2 gap-1.5", className)}
        >
          <CalendarDays className="h-4 w-4" />
          <span className="text-xs hidden sm:inline">Agenda</span>
          {todayCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[9px] bg-amber-500 border-0">
              {todayCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[340px] p-0 z-[200]"
        align="end"
        sideOffset={8}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b bg-gradient-to-r from-blue-50 to-indigo-50">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
              <span className="font-semibold text-sm text-blue-900 truncate">
                {isOwnAgenda ? "Minha Agenda" : `Agenda de ${activeMemberName}`}
              </span>
            </div>
            <Badge variant="outline" className="text-[10px] h-5 shrink-0">
              {todayCount} {baseDateIsToday ? "hoje" : dateLabel.toLowerCase()}
            </Badge>
          </div>

          {/* Seletor de membro + navegação de data */}
          <div className="mt-2 flex items-center gap-2">
            <Select
              value={selectedMemberId || teamMember?.id || ""}
              onValueChange={(val) => {
                setSelectedMemberId(val === teamMember?.id ? undefined : val);
              }}
            >
              <SelectTrigger className="h-7 text-xs bg-white/80 border-blue-200 flex-1">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-blue-500" />
                  <SelectValue placeholder="Responsável" />
                </div>
              </SelectTrigger>
              <SelectContent className="z-[250]">
                {members.map((m) => (
                  <SelectItem key={m.id} value={m.id} className="text-xs">
                    {m.name}
                    {m.id === teamMember?.id ? " (eu)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Navegação de data */}
            <div className="flex items-center bg-white/80 border border-blue-200 rounded-md h-7">
              <button
                onClick={goBack}
                className="px-1.5 h-full hover:bg-blue-50 rounded-l-md transition-colors"
              >
                <ChevronLeft className="h-3 w-3 text-blue-600" />
              </button>
              <button
                onClick={goToday}
                className={cn(
                  "px-2 h-full text-[11px] font-medium transition-colors capitalize",
                  baseDateIsToday
                    ? "text-blue-700 bg-blue-50"
                    : "text-blue-600 hover:bg-blue-50"
                )}
              >
                {dateLabel}
              </button>
              <button
                onClick={goForward}
                className="px-1.5 h-full hover:bg-blue-50 rounded-r-md transition-colors"
              >
                <ChevronRight className="h-3 w-3 text-blue-600" />
              </button>
            </div>
          </div>
        </div>

        <div className="max-h-[400px] overflow-y-auto">
          {/* Slots livres */}
          {freeSlots.length > 0 && (
            <div className="px-4 py-3 border-b bg-green-50/50">
              <p className="text-[10px] font-semibold text-green-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Horários livres {baseDateIsToday ? "hoje" : dateLabel.toLowerCase()}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {freeSlots.map((slot) => (
                  <span
                    key={slot}
                    className="text-xs font-mono px-2.5 py-1 rounded-md bg-green-100 text-green-700 border border-green-200"
                  >
                    {slot}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Compromissos por dia */}
          {groupedTasks.length > 0 ? (
            groupedTasks.map(([key, { label, tasks: dayTasks }]) => (
              <div key={key} className="border-b last:border-b-0">
                <div className="px-4 py-2 bg-muted/30">
                  <span
                    className={cn(
                      "text-xs font-semibold capitalize",
                      label === "Hoje" ? "text-blue-700" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </span>
                  <Badge variant="secondary" className="ml-2 text-[9px] h-4 px-1.5">
                    {dayTasks.length}
                  </Badge>
                </div>
                <div className="px-3 py-1.5 space-y-1">
                  {dayTasks.map((task) => {
                    const Icon = TASK_ICONS[task.task_type] || Clock;
                    const colorClass =
                      TASK_COLORS[task.task_type] || "text-gray-500 bg-gray-50";
                    const time = task.scheduled_at
                      ? format(new Date(task.scheduled_at), "HH:mm")
                      : task.due_datetime
                      ? format(new Date(task.due_datetime), "HH:mm")
                      : "--:--";

                    return (
                      <div
                        key={task.id}
                        className={cn(
                          "flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors hover:bg-muted/50",
                          task.completed && "opacity-50"
                        )}
                      >
                        <div className={cn("p-1.5 rounded-md shrink-0", colorClass)}>
                          <Icon className="h-3.5 w-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-mono text-muted-foreground">
                              {time}
                            </span>
                            {task.completed && (
                              <CheckCircle2 className="h-3 w-3 text-green-500" />
                            )}
                          </div>
                          <p
                            className={cn(
                              "text-sm font-medium truncate",
                              task.completed && "line-through text-muted-foreground"
                            )}
                          >
                            {task.name}
                          </p>
                          {task.lead?.name && (
                            <p className="text-[11px] text-muted-foreground truncate">
                              {task.lead.name}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="px-4 py-8 text-center text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum compromisso nos próximos dias</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t bg-muted/20">
          <a
            href="/comercial/agenda"
            className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            <CalendarDays className="h-3 w-3" />
            Ver agenda completa
          </a>
        </div>
      </PopoverContent>
    </Popover>
  );
}
