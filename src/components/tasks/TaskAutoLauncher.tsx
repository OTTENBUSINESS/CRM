/**
 * TaskAutoLauncher
 *
 * Monitora company_activities do usuário e, quando o horário agendado chega
 * (scheduled_at <= now, com janela de 5 min de tolerância), abre automaticamente
 * o painel/modal correto para executar a tarefa:
 *
 *   meeting / onboarding / checkin / review / internal → startMeeting()
 *   call    → initiateCall()
 *   outros  → navega para o lead / cliente
 *
 * Usa localStorage para não re-exibir a mesma tarefa em 24 h.
 * Também descarta o lembrete do TaskReminderOverlay para o mesmo task.
 */

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useMeeting } from "@/contexts/MeetingContext";
import { useCall } from "@/contexts/CallContext";
import { supabase } from "@/lib/supabase";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Video, Phone, MessageSquare, Mail, Users, RefreshCw,
  CalendarDays, AlertTriangle, ExternalLink, X, Loader2, Play,
} from "lucide-react";
import { cn, ensureHttps } from "@/lib/utils";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface LaunchTask {
  id: string;
  name: string;
  task_type: string;
  scheduled_at: string;
  meeting_link?: string | null;
  lead_id?: string | null;
  organization_id?: string | null;
  team?: string | null;
  is_critical?: boolean;
  lead?: { name: string; phone?: string | null; email?: string | null } | null;
  organization?: { name: string } | null;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 30_000;          // checar a cada 30 s
const GRACE_WINDOW_MS   = 5 * 60 * 1000;  // mostrar se atrasou até 5 min
const LAUNCHED_LS_KEY   = "task_auto_launched";
const REMINDER_LS_KEY   = "task_reminder_dismissed";

// Tipos que abrem o painel de reunião
const MEETING_TYPES = new Set(["meeting", "onboarding", "checkin", "review", "internal"]);

// ─── Configuração por tipo ────────────────────────────────────────────────────

type ColorKey = "blue" | "green" | "red" | "orange" | "indigo" | "purple" | "gray";

interface TaskTypeConfig {
  icon: React.ElementType;
  label: string;
  actionLabel: string;
  color: ColorKey;
}

const TYPE_CONFIG: Record<string, TaskTypeConfig> = {
  meeting:   { icon: Video,         label: "Reunião",          actionLabel: "Iniciar Reunião",   color: "blue"   },
  onboarding:{ icon: Users,         label: "Onboarding",       actionLabel: "Iniciar Sessão",    color: "blue"   },
  checkin:   { icon: CalendarDays,  label: "Check-in",         actionLabel: "Iniciar Reunião",   color: "blue"   },
  review:    { icon: Video,         label: "Review",           actionLabel: "Iniciar Review",    color: "indigo" },
  internal:  { icon: Users,         label: "Reunião Interna",  actionLabel: "Iniciar Reunião",   color: "indigo" },
  call:      { icon: Phone,         label: "Ligação",          actionLabel: "Ligar Agora",       color: "green"  },
  whatsapp:  { icon: MessageSquare, label: "WhatsApp",         actionLabel: "Abrir Conversa",    color: "green"  },
  email:     { icon: Mail,          label: "Email",            actionLabel: "Abrir Lead",        color: "purple" },
  follow_up: { icon: RefreshCw,     label: "Follow-up",        actionLabel: "Ver Lead",          color: "orange" },
  support:   { icon: Phone,         label: "Suporte",          actionLabel: "Atender Agora",     color: "orange" },
  rescue:    { icon: AlertTriangle, label: "Resgate",          actionLabel: "Ver Lead",          color: "red"    },
  renewal:   { icon: RefreshCw,     label: "Renovação",        actionLabel: "Ver Lead",          color: "blue"   },
  upsell:    { icon: RefreshCw,     label: "Upsell",           actionLabel: "Ver Lead",          color: "green"  },
  nps:       { icon: CalendarDays,  label: "NPS",              actionLabel: "Ver Lead",          color: "purple" },
};

const COLOR_CLASSES: Record<ColorKey, { bg: string; btn: string }> = {
  blue:   { bg: "bg-blue-600",    btn: "bg-blue-600 hover:bg-blue-700 text-white"    },
  green:  { bg: "bg-green-600",   btn: "bg-green-600 hover:bg-green-700 text-white"  },
  red:    { bg: "bg-red-600",     btn: "bg-red-600 hover:bg-red-700 text-white"      },
  orange: { bg: "bg-orange-500",  btn: "bg-orange-500 hover:bg-orange-600 text-white"},
  indigo: { bg: "bg-indigo-600",  btn: "bg-indigo-600 hover:bg-indigo-700 text-white"},
  purple: { bg: "bg-purple-600",  btn: "bg-purple-600 hover:bg-purple-700 text-white"},
  gray:   { bg: "bg-gray-600",    btn: "bg-gray-600 hover:bg-gray-700 text-white"   },
};

// ─── Helpers de localStorage ──────────────────────────────────────────────────

function getLaunched(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(LAUNCHED_LS_KEY) || "{}");
  } catch { return {}; }
}

function markLaunched(taskId: string) {
  try {
    const map = getLaunched();
    map[taskId] = Date.now();
    // Limpar entradas > 24 h
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const id of Object.keys(map)) {
      if (map[id] < cutoff) delete map[id];
    }
    localStorage.setItem(LAUNCHED_LS_KEY, JSON.stringify(map));

    // Também descarta do TaskReminderOverlay para evitar sobreposição
    try {
      const rem = JSON.parse(localStorage.getItem(REMINDER_LS_KEY) || "{}");
      rem[taskId] = Date.now();
      localStorage.setItem(REMINDER_LS_KEY, JSON.stringify(rem));
    } catch {}
  } catch {}
}

function isAlreadyLaunched(taskId: string): boolean {
  const map = getLaunched();
  const ts = map[taskId];
  return !!ts && Date.now() - ts < 24 * 60 * 60 * 1000;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function TaskAutoLauncher() {
  const { user, teamMember } = useAuth();
  const { startMeeting, activeMeeting } = useMeeting();
  const { initiateCall } = useCall();
  const navigate  = useNavigate();
  const { toast } = useToast();

  const [pendingTask, setPendingTask] = useState<LaunchTask | null>(null);
  const [open, setOpen]               = useState(false);
  const [loading, setLoading]         = useState(false);

  // ─── Busca periódica ──────────────────────────────────────────────────────

  const checkTasks = useCallback(async () => {
    if (!user || !teamMember?.id) return;

    const now        = new Date();
    const graceStart = new Date(now.getTime() - GRACE_WINDOW_MS);

    try {
      const { data: tasks } = await supabase
        .from("company_activities")
        .select(`
          id, name, task_type, scheduled_at, meeting_link,
          lead_id, organization_id, team, is_critical,
          lead:leads!company_activities_lead_id_fkey(name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(name)
        `)
        .eq("completed", false)
        .eq("responsavel_id", teamMember.id)
        .gte("scheduled_at", graceStart.toISOString())
        .lte("scheduled_at", now.toISOString())
        .order("scheduled_at", { ascending: true });

      if (!tasks || tasks.length === 0) return;

      for (const task of tasks) {
        if (isAlreadyLaunched(task.id)) continue;
        // Não abrir launcher se já está em reunião ativa para esta tarefa
        if (activeMeeting?.activityId === task.id) {
          markLaunched(task.id);
          continue;
        }
        // Mostrar uma tarefa por vez
        setPendingTask(task as LaunchTask);
        setOpen(true);
        return;
      }
    } catch (err) {
      console.error("[TaskAutoLauncher] Erro ao buscar tarefas:", err);
    }
  }, [user, teamMember?.id, activeMeeting?.activityId]);

  useEffect(() => {
    if (!user) return;
    checkTasks();
    const id = setInterval(checkTasks, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, checkTasks]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleDismiss = useCallback(() => {
    if (pendingTask) markLaunched(pendingTask.id);
    setOpen(false);
    setPendingTask(null);
    setLoading(false);
  }, [pendingTask]);

  const handleAction = useCallback(async () => {
    if (!pendingTask) return;
    setLoading(true);
    markLaunched(pendingTask.id);
    setOpen(false);

    try {
      const { task_type } = pendingTask;

      if (MEETING_TYPES.has(task_type)) {
        // Montar objeto Task mínimo que startMeeting() precisa
        const taskForMeeting = {
          id:              pendingTask.id,
          name:            pendingTask.name,
          task_type:       pendingTask.task_type,
          lead_id:         pendingTask.lead_id   ?? undefined,
          organization_id: pendingTask.organization_id ?? undefined,
          meeting_link:    pendingTask.meeting_link    ?? "",
          team:            pendingTask.team ?? "sales",
          lead:            pendingTask.lead         ?? undefined,
          organization:    pendingTask.organization  ?? undefined,
        } as any;
        await startMeeting(taskForMeeting);

      } else if (task_type === "call") {
        const phone = pendingTask.lead?.phone;
        if (phone) {
          await initiateCall(phone, pendingTask.lead_id ?? undefined);
        } else {
          // Sem telefone — navegar pro lead para ligar manualmente
          if (pendingTask.lead_id) navigate(`/comercial/leads/${pendingTask.lead_id}`);
          toast({ title: "Telefone não cadastrado", description: "Abra o lead para ligar" });
        }

      } else {
        // whatsapp, email, follow_up, support, rescue, renewal, upsell, nps
        if (pendingTask.lead_id) {
          navigate(`/comercial/leads/${pendingTask.lead_id}`);
        } else if (pendingTask.organization_id) {
          navigate(`/clientes/${pendingTask.organization_id}`);
        }
      }
    } catch (err: any) {
      toast({ title: "Erro ao executar tarefa", description: err?.message, variant: "destructive" });
    } finally {
      setLoading(false);
      setPendingTask(null);
    }
  }, [pendingTask, startMeeting, initiateCall, navigate, toast]);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!pendingTask) return null;

  const config  = TYPE_CONFIG[pendingTask.task_type] ?? { icon: Play, label: "Tarefa", actionLabel: "Executar", color: "gray" as ColorKey };
  const colors  = COLOR_CLASSES[config.color as ColorKey];
  const Icon    = config.icon;
  const client  = pendingTask.lead?.name ?? pendingTask.organization?.name ?? "";
  const time    = format(new Date(pendingTask.scheduled_at), "HH:mm", { locale: ptBR });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden gap-0">

        {/* ── Header colorido ── */}
        <div className={cn("px-6 py-4 flex items-center justify-between", colors.bg)}>
          <div className="flex items-center gap-3 text-white">
            <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
                É hora!
              </div>
              <div className="font-bold text-lg leading-tight">
                {config.label}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20 shrink-0"
            onClick={handleDismiss}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* ── Corpo ── */}
        <div className="px-6 py-5 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-xl leading-snug">
              {pendingTask.name}
            </DialogTitle>
            {(client || time) && (
              <DialogDescription className="text-sm text-muted-foreground">
                {[client, time].filter(Boolean).join(" · ")}
              </DialogDescription>
            )}
          </DialogHeader>

          {/* Link da reunião (se houver) */}
          {pendingTask.meeting_link && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted text-sm overflow-hidden">
              <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
              <a
                href={ensureHttps(pendingTask.meeting_link)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline truncate"
              >
                {pendingTask.meeting_link}
              </a>
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 pt-1">
            <Button
              className={cn("flex-1 gap-2 font-semibold", colors.btn)}
              onClick={handleAction}
              disabled={loading}
            >
              {loading
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Icon className="h-4 w-4" />
              }
              {config.actionLabel}
            </Button>
            <Button variant="outline" onClick={handleDismiss} disabled={loading}>
              Depois
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
