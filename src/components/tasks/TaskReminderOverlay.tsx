import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { format, differenceInMinutes, differenceInSeconds } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, Clock, Phone, MessageSquare, Mail, Video, Users, RefreshCw, CalendarDays, AlertTriangle, ExternalLink, User, Building2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn, ensureHttps } from "@/lib/utils";

interface UpcomingTask {
  id: string;
  name: string;
  description?: string | null;
  notes?: string | null;
  task_type: string;
  due_datetime: string;
  scheduled_at?: string | null;
  is_critical?: boolean;
  meeting_link?: string | null;
  participants?: string[] | null;
  lead_id?: string | null;
  organization_id?: string | null;
  lead?: { name: string; email?: string; phone?: string } | null;
  organization?: { name: string } | null;
  responsavel?: { id: string; nome: string; team_member_id: string | null } | null;
}

const taskTypeIcons: Record<string, any> = {
  call: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  meeting: Video,
  onboarding: Users,
  follow_up: RefreshCw,
  checkin: CalendarDays,
  rescue: AlertTriangle,
};

const taskTypeLabels: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Reunião",
  onboarding: "Onboarding",
  follow_up: "Follow-up",
  checkin: "Check-in",
  rescue: "Resgate",
};

// Minutos antes da tarefa para mostrar o alerta
const REMINDER_MINUTES = 30;
// Intervalo de verificação em ms (30 segundos)
const CHECK_INTERVAL = 30000;
// Dismiss duration for critical tasks (30 minutes)
const CRITICAL_DISMISS_MS = 30 * 60 * 1000;

// Chave do localStorage para persistir tarefas descartadas
const DISMISSED_TASKS_KEY = "task_reminder_dismissed";
const CRITICAL_DISMISSED_KEY = "task_critical_dismissed";

// Função para obter tarefas descartadas do localStorage
const getDismissedTasks = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(DISMISSED_TASKS_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

// Função para salvar tarefa descartada (com timestamp para expirar após 24h)
const saveDismissedTask = (taskId: string) => {
  try {
    const dismissed = getDismissedTasks();
    dismissed[taskId] = Date.now();
    // Limpar entradas antigas (mais de 24h)
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    Object.keys(dismissed).forEach(id => {
      if (dismissed[id] < oneDayAgo) {
        delete dismissed[id];
      }
    });
    localStorage.setItem(DISMISSED_TASKS_KEY, JSON.stringify(dismissed));
  } catch (e) {
    console.error("[TaskReminder] Error saving dismiss");
  }
};

// Função para verificar se tarefa foi descartada
const isTaskDismissed = (taskId: string): boolean => {
  const dismissed = getDismissedTasks();
  const dismissedAt = dismissed[taskId];
  if (!dismissedAt) return false;
  // Expirar após 24h
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return dismissedAt > oneDayAgo;
};

// Critical task dismiss: only 30 minutes
const getCriticalDismissed = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(CRITICAL_DISMISSED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveCriticalDismissed = (taskId: string) => {
  try {
    const dismissed = getCriticalDismissed();
    dismissed[taskId] = Date.now();
    localStorage.setItem(CRITICAL_DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {}
};

const isCriticalDismissed = (taskId: string): boolean => {
  const dismissed = getCriticalDismissed();
  const dismissedAt = dismissed[taskId];
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < CRITICAL_DISMISS_MS;
};

export function TaskReminderOverlay() {
  const { user, teamMember } = useAuth();
  const navigate = useNavigate();
  const [alertTask, setAlertTask] = useState<UpcomingTask | null>(null);
  const [isCriticalAlert, setIsCriticalAlert] = useState(false);
  const [timeLeft, setTimeLeft] = useState<string>("");

  // Busca tarefas próximas do usuário atual
  const checkUpcomingTasks = useCallback(async () => {
    if (!user) {
      return;
    }

    const teamMemberId = teamMember?.id;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + (REMINDER_MINUTES + 1) * 60 * 1000);

    try {
      // 1. Check critical overdue tasks FIRST (higher priority)
      const { data: criticalTasks } = await supabase
        .from("company_activities")
        .select(`
          id, name, description, notes, task_type, due_datetime, scheduled_at,
          is_critical, meeting_link, participants, lead_id, organization_id,
          lead:leads!company_activities_lead_id_fkey(name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq("completed", false)
        .eq("is_critical", true)
        .eq("responsavel_id", teamMemberId || "")
        .lte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true });

      // Find first non-dismissed critical task
      for (const task of criticalTasks || []) {
        if (!isCriticalDismissed(task.id)) {
          setAlertTask({ ...task, due_datetime: task.scheduled_at || task.due_datetime });
          setIsCriticalAlert(true);
          return;
        }
      }

      // 2. Regular upcoming task reminders (existing logic)
      const { data: tasks, error } = await supabase
        .from("company_activities")
        .select(`
          id, name, description, notes, task_type, due_datetime, scheduled_at,
          is_critical, meeting_link, participants, lead_id, organization_id,
          lead:leads!company_activities_lead_id_fkey(name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq("completed", false)
        .in("task_type", ["call", "meeting", "onboarding", "checkin"])
        .order("due_datetime", { ascending: true });

      if (error) {
        console.error("[TaskReminder] Failed to fetch tasks");
        return;
      }

      // Filtrar tarefas do usuário atual (responsável OU participante)
      const userTasks = (tasks || []).filter((task) => {
        const isResponsavel = teamMemberId && task.responsavel?.id === teamMemberId;
        const isParticipant = teamMemberId && task.participants?.includes(teamMemberId);

        const taskDate = task.scheduled_at;
        if (!taskDate) return false;

        const taskTime = new Date(taskDate);
        const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);
        const isInWindow = taskTime >= fiveMinAgo && taskTime <= windowEnd;

        return (isResponsavel || isParticipant) && isInWindow;
      });

      // Encontrar primeira tarefa não descartada
      for (const task of userTasks) {
        if (!isTaskDismissed(task.id)) {
          const taskDate = task.scheduled_at;
          if (!taskDate) continue;

          const dueDate = new Date(taskDate);
          const minutesLeft = differenceInMinutes(dueDate, now);

          if (minutesLeft <= REMINDER_MINUTES && minutesLeft >= -5) {
            setAlertTask({ ...task, due_datetime: taskDate });
            setIsCriticalAlert(false);
            return;
          }
        }
      }

      // Nenhuma tarefa para alertar
      setAlertTask(null);
      setIsCriticalAlert(false);
    } catch (err) {
      console.error("[TaskReminder] Error checking tasks");
    }
  }, [user, teamMember]);

  // Verificar tarefas periodicamente
  useEffect(() => {
    if (!user) return;

    checkUpcomingTasks();
    const interval = setInterval(checkUpcomingTasks, CHECK_INTERVAL);
    return () => clearInterval(interval);
  }, [user, checkUpcomingTasks]);

  // Atualizar tempo restante a cada segundo
  useEffect(() => {
    if (!alertTask) return;

    const updateTimeLeft = () => {
      const now = new Date();
      const taskDate = alertTask.scheduled_at;
      const dueDate = new Date(taskDate);
      const totalSeconds = differenceInSeconds(dueDate, now);

      if (totalSeconds <= 0) {
        if (isCriticalAlert) {
          const overdue = Math.abs(totalSeconds);
          const mins = Math.floor(overdue / 60);
          const hrs = Math.floor(mins / 60);
          if (hrs > 0) {
            setTimeLeft(`ATRASADA ${hrs}h${(mins % 60).toString().padStart(2, "0")}min`);
          } else {
            setTimeLeft(`ATRASADA ${mins}min`);
          }
        } else {
          setTimeLeft("AGORA!");
        }
        return;
      }

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;

      if (minutes > 0) {
        setTimeLeft(`${minutes}min ${seconds.toString().padStart(2, "0")}s`);
      } else {
        setTimeLeft(`${seconds}s`);
      }
    };

    updateTimeLeft();
    const interval = setInterval(updateTimeLeft, 1000);
    return () => clearInterval(interval);
  }, [alertTask, isCriticalAlert]);

  // Descartar alerta
  const handleDismiss = () => {
    if (alertTask) {
      if (isCriticalAlert) {
        saveCriticalDismissed(alertTask.id); // Only 30 min
      } else {
        saveDismissedTask(alertTask.id); // 24h
      }
      setAlertTask(null);
      setIsCriticalAlert(false);
    }
  };

  if (!alertTask) return null;

  const Icon = taskTypeIcons[alertTask.task_type] || Clock;
  const taskLabel = taskTypeLabels[alertTask.task_type] || "Tarefa";
  const clientName = alertTask.lead?.name || alertTask.organization?.name || "";
  const taskDateTime = alertTask.scheduled_at;
  const dueTime = format(new Date(taskDateTime), "HH:mm", { locale: ptBR });
  const isUrgent = isCriticalAlert || differenceInMinutes(new Date(taskDateTime), new Date()) <= 5;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 pointer-events-none">
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md mx-4 rounded-xl shadow-2xl border-2 overflow-hidden animate-in slide-in-from-top-5 duration-500",
          isCriticalAlert
            ? "bg-red-50 border-red-500 ring-2 ring-red-400/50"
            : isUrgent
              ? "bg-red-50 border-red-400"
              : "bg-amber-50 border-amber-400"
        )}
      >
        {/* Header animado */}
        <div
          className={cn(
            "px-4 py-3 flex items-center justify-between",
            isCriticalAlert ? "bg-red-600" : isUrgent ? "bg-red-500" : "bg-amber-500"
          )}
        >
          <div className="flex items-center gap-2 text-white">
            {isCriticalAlert ? (
              <AlertTriangle className="h-5 w-5 animate-pulse" />
            ) : (
              <Clock className="h-5 w-5 animate-pulse" />
            )}
            <span className="font-bold text-lg">
              {isCriticalAlert
                ? "TAREFA CRUCIAL PENDENTE!"
                : isUrgent
                  ? "TAREFA AGORA!"
                  : "Tarefa em breve!"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={handleDismiss}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Conteúdo */}
        <div className="p-4 space-y-3">
          {/* Tempo restante */}
          <div className="text-center">
            <div
              className={cn(
                "text-4xl font-bold tabular-nums",
                isCriticalAlert || isUrgent ? "text-red-600" : "text-amber-600"
              )}
            >
              {timeLeft}
            </div>
            <div className="text-sm text-muted-foreground">
              Horário: {dueTime}
            </div>
            {isCriticalAlert && (
              <div className="text-xs text-red-500 font-medium mt-1">
                Essa tarefa foi marcada como CRUCIAL e precisa ser feita hoje
              </div>
            )}
          </div>

          {/* Detalhes da tarefa */}
          <div className="bg-white rounded-lg p-3 border space-y-2">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "p-2 rounded-lg",
                  isCriticalAlert || isUrgent ? "bg-red-100" : "bg-amber-100"
                )}
              >
                <Icon
                  className={cn(
                    "h-6 w-6",
                    isCriticalAlert || isUrgent ? "text-red-600" : "text-amber-600"
                  )}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground flex items-center gap-2">
                  {alertTask.name}
                  {isCriticalAlert && (
                    <span className="text-[10px] font-bold bg-red-600 text-white px-1.5 py-0.5 rounded animate-pulse">
                      CRUCIAL
                    </span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {taskLabel}
                  {clientName && ` • ${clientName}`}
                </div>
              </div>
            </div>

            {/* Informações do cliente */}
            {alertTask.lead && (
              <div className="pt-2 border-t space-y-1">
                <div className="text-xs font-medium text-muted-foreground uppercase">Cliente</div>
                <div className="text-sm font-medium">{alertTask.lead.name}</div>
                {alertTask.lead.email && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {alertTask.lead.email}
                  </div>
                )}
                {alertTask.lead.phone && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {alertTask.lead.phone}
                  </div>
                )}
              </div>
            )}

            {/* Observações/Notas */}
            {(alertTask.notes || alertTask.description) && (
              <div className="pt-2 border-t">
                <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Observações</div>
                <div className="text-sm text-foreground bg-slate-50 p-2 rounded text-wrap break-words max-h-20 overflow-y-auto">
                  {alertTask.notes || alertTask.description}
                </div>
              </div>
            )}
          </div>

          {/* Botões de ação */}
          <div className="flex gap-2">
            {alertTask.lead_id && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => {
                  handleDismiss();
                  navigate(`/comercial/leads/${alertTask.lead_id}`);
                }}
              >
                <User className="h-4 w-4" />
                Ver Lead
              </Button>
            )}

            {alertTask.organization_id && (
              <Button
                variant="outline"
                className="flex-1 gap-2"
                onClick={() => {
                  handleDismiss();
                  navigate(`/clientes/${alertTask.organization_id}`);
                }}
              >
                <Building2 className="h-4 w-4" />
                Ver Cliente
              </Button>
            )}

            {alertTask.meeting_link && (
              <Button
                className="flex-1 gap-2"
                variant={isUrgent ? "destructive" : "default"}
                onClick={() => window.open(ensureHttps(alertTask.meeting_link), "_blank")}
              >
                <Video className="h-4 w-4" />
                Entrar
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </div>

          {/* Botão para descartar */}
          <Button
            variant="outline"
            className="w-full"
            onClick={handleDismiss}
          >
            {isCriticalAlert ? "Fechar (volta em 30 min)" : "Entendi, pode fechar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
