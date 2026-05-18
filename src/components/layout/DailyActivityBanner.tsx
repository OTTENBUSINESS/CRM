import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useDailyActivitySummary } from "@/hooks/useDailyActivitySummary";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  Phone,
  PhoneIncoming,
  MessageSquare,
  Users,
  Send,
  Video,
  FileText,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  ListChecks,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const STORAGE_KEY = "daily-activity-banner-expanded";

// Same neon palette as FocusBanner
const N = {
  bg: "from-[#ff6b00]/8 via-[#ff8c00]/5 to-[#ff6b00]/8",
  border: "border-[#ff6b00]/15",
  text: "text-[#ff6b00]",
  muted: "text-[#ff6b00]/60",
  num: "text-[#ff8c00]",
};

interface PendingTask {
  id: string;
  name: string;
  task_type: string;
  scheduled_at: string | null;
  is_critical: boolean;
  lead?: { name: string } | null;
  organization?: { name: string } | null;
}

export function DailyActivityBanner() {
  const { teamMember, isComercial } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded));
    } catch {}
  }, [expanded]);

  // Only show for comercial roles
  if (!isComercial || !teamMember?.id) return null;

  const role = teamMember.role;
  const isSDR = role === "sdr";

  const { data: rows } = useDailyActivitySummary(new Date(), teamMember.id);
  const stats = rows?.[0];

  // Pending tasks for today
  const today = format(new Date(), "yyyy-MM-dd");
  const { data: pendingTasks } = useQuery({
    queryKey: ["daily-pending-tasks", teamMember.id, today],
    queryFn: async () => {
      const startOfDay = `${today}T00:00:00`;
      const endOfDay = `${today}T23:59:59`;

      const { data, error } = await supabase
        .from("company_activities")
        .select(`
          id, name, task_type, scheduled_at, is_critical,
          lead:leads!company_activities_lead_id_fkey(name),
          organization:organizations!company_activities_organization_id_fkey(name)
        `)
        .eq("completed", false)
        .eq("responsavel_id", teamMember.id)
        .gte("scheduled_at", startOfDay)
        .lte("scheduled_at", endOfDay)
        .order("is_critical", { ascending: false })
        .order("scheduled_at", { ascending: true })
        .limit(10);

      if (error) throw error;
      return (data || []) as PendingTask[];
    },
    staleTime: 30_000,
  });

  const totalPending = pendingTasks?.length || 0;
  const criticalCount = pendingTasks?.filter((t) => t.is_critical).length || 0;
  const nextTasks = (pendingTasks || []).slice(0, 4);

  // Stats config by role
  const statItems = isSDR
    ? [
        { icon: Phone, label: "Ligações", value: stats?.calls_made ?? 0 },
        { icon: PhoneIncoming, label: "Atendidas", value: stats?.calls_connected ?? 0 },
        { icon: MessageSquare, label: "Follow-ups", value: stats?.followups_done ?? 0 },
        { icon: Users, label: "Contatados", value: stats?.leads_contacted ?? 0 },
        { icon: Send, label: "Msgs", value: stats?.messages_sent ?? 0 },
      ]
    : [
        { icon: Phone, label: "Ligações", value: stats?.calls_made ?? 0 },
        { icon: Video, label: "Calls", value: stats?.meetings_done ?? 0 },
        { icon: FileText, label: "Propostas", value: stats?.proposals_sent ?? 0 },
        { icon: Users, label: "Contatados", value: stats?.leads_contacted ?? 0 },
        { icon: Video, label: "Reuniões", value: stats?.meetings_scheduled ?? 0 },
      ];

  return (
    <div className={cn("border-b bg-gradient-to-r", N.border, N.bg)}>
      {/* Main row — always visible */}
      <div className="px-4 py-1 flex items-center gap-1">
        {/* Stats */}
        <div className="flex items-center gap-3 min-w-0 flex-1 overflow-x-auto">
          {statItems.map((s, i) => (
            <div key={i} className="flex items-center gap-1 shrink-0">
              <s.icon className={cn("h-3 w-3", N.muted)} />
              <span className={cn("text-[11px]", N.muted)}>{s.label}</span>
              <span className={cn("text-xs font-black tabular-nums", N.num)}>
                {s.value}
              </span>
            </div>
          ))}
        </div>

        {/* Task badges + expand */}
        <div className="flex items-center gap-2 shrink-0">
          {criticalCount > 0 && (
            <button
              onClick={() => navigate("/gestao/tarefas")}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/20 hover:bg-red-500/30 transition-colors"
            >
              <AlertTriangle className="h-3 w-3 text-red-500 animate-pulse" />
              <span className="text-[11px] font-black text-red-500">
                {criticalCount}
              </span>
            </button>
          )}
          {totalPending > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "flex items-center gap-1 px-1.5 py-0.5 rounded transition-colors",
                "hover:bg-[#ff6b00]/10"
              )}
            >
              <ListChecks className={cn("h-3 w-3", N.text)} />
              <span className={cn("text-[11px] font-bold", N.text)}>
                {totalPending}
              </span>
              {expanded ? (
                <ChevronUp className={cn("h-3 w-3", N.muted)} />
              ) : (
                <ChevronDown className={cn("h-3 w-3", N.muted)} />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Expanded — next tasks */}
      {expanded && nextTasks.length > 0 && (
        <div className="px-4 pb-1.5 flex items-center gap-3 overflow-x-auto">
          {nextTasks.map((task) => {
            const time = task.scheduled_at
              ? format(new Date(task.scheduled_at), "HH:mm", { locale: ptBR })
              : "";
            const client = task.lead?.name || task.organization?.name;
            const label = client
              ? `${task.name} · ${client}`
              : task.name;

            return (
              <button
                key={task.id}
                onClick={() => navigate("/gestao/tarefas")}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 text-[11px] transition-colors",
                  task.is_critical
                    ? "text-red-500 font-bold"
                    : "text-foreground/70 hover:text-foreground"
                )}
              >
                {task.is_critical && (
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                )}
                <span className={cn("font-mono tabular-nums", task.is_critical ? "text-red-400" : N.muted)}>
                  {time}
                </span>
                <span className="truncate max-w-[200px]">{label}</span>
              </button>
            );
          })}
          {totalPending > 4 && (
            <button
              onClick={() => navigate("/gestao/tarefas")}
              className={cn("text-[11px] font-bold shrink-0 hover:underline", N.text)}
            >
              +{totalPending - 4} mais
            </button>
          )}
        </div>
      )}
    </div>
  );
}
