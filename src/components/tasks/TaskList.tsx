import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Task, useCompleteTask, useDeleteTask, useCompleteRecurringTask, useResolveRecurringTask, useUpdateTask } from "@/hooks/useTasks";
import { supabase } from "@/lib/supabase";
import { TaskDetailModal } from "./TaskDetailModal";
import { useMeeting } from "@/contexts/MeetingContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Video, MessageSquare, Mail, Target, Clock, Users, Calendar,
  CheckCircle2, Circle, AlertCircle, ChevronRight, ExternalLink, Users2,
  Play, Loader2, MoreVertical, Trash2, Repeat, X
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface TaskListProps {
  tasks: Task[];
  showLinkedEntity?: boolean;
  emptyMessage?: string;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  productName?: string;
}

const taskTypeConfig: Record<string, { icon: any; color: string; label: string }> = {
  call: { icon: Phone, color: 'text-blue-500 bg-blue-500/10', label: 'Ligação' },
  whatsapp: { icon: MessageSquare, color: 'text-green-500 bg-green-500/10', label: 'WhatsApp' },
  email: { icon: Mail, color: 'text-purple-500 bg-purple-500/10', label: 'Email' },
  meeting: { icon: Video, color: 'text-indigo-500 bg-indigo-500/10', label: 'Reunião' },
  onboarding: { icon: Target, color: 'text-orange-500 bg-orange-500/10', label: 'Onboarding' },
  follow_up: { icon: Clock, color: 'text-yellow-500 bg-yellow-500/10', label: 'Follow-up' },
  checkin: { icon: Users, color: 'text-cyan-500 bg-cyan-500/10', label: 'Check-in' },
  support: { icon: MessageSquare, color: 'text-red-500 bg-red-500/10', label: 'Suporte' },
  internal: { icon: Calendar, color: 'text-gray-500 bg-gray-500/10', label: 'Interna' },
  review: { icon: Target, color: 'text-pink-500 bg-pink-500/10', label: 'Revisão' },
  renewal: { icon: Clock, color: 'text-emerald-500 bg-emerald-500/10', label: 'Renovação' },
  upsell: { icon: Target, color: 'text-amber-500 bg-amber-500/10', label: 'Upsell' },
  rescue: { icon: AlertCircle, color: 'text-red-500 bg-red-500/10', label: 'Resgate' },
  nps: { icon: Users, color: 'text-violet-500 bg-violet-500/10', label: 'NPS' },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  high: { color: 'bg-red-500', label: 'Alta' },
  medium: { color: 'bg-yellow-500', label: 'Média' },
  low: { color: 'bg-green-500', label: 'Baixa' },
};

const statusConfig: Record<string, { color: string; label: string }> = {
  not_started: { color: 'bg-gray-100 text-gray-700', label: 'Não iniciada' },
  scheduled: { color: 'bg-blue-100 text-blue-700', label: 'Agendada' },
  confirmed: { color: 'bg-green-100 text-green-700', label: 'Confirmada' },
  in_progress: { color: 'bg-yellow-100 text-yellow-700', label: 'Em andamento' },
  completed: { color: 'bg-emerald-100 text-emerald-700', label: 'Concluída' },
  cancelled: { color: 'bg-red-100 text-red-700', label: 'Cancelada' },
  no_show: { color: 'bg-orange-100 text-orange-700', label: 'Não compareceu' },
  rescheduled: { color: 'bg-purple-100 text-purple-700', label: 'Reagendada' },
};

function formatDateTime(dateString: string | null) {
  if (!dateString) return null;
  
  // Forçar timezone de Brasília (America/Sao_Paulo)
  const options: Intl.DateTimeFormatOptions = { timeZone: 'America/Sao_Paulo' };
  const date = new Date(dateString);
  const now = new Date();
  
  // Converter para Brasília para comparação
  const dateBrasilia = new Date(date.toLocaleString('en-US', options));
  const nowBrasilia = new Date(now.toLocaleString('en-US', options));
  
  // Calcular diferença em dias (considerando apenas a data, não hora)
  const dateOnly = new Date(dateBrasilia.getFullYear(), dateBrasilia.getMonth(), dateBrasilia.getDate());
  const nowOnly = new Date(nowBrasilia.getFullYear(), nowBrasilia.getMonth(), nowBrasilia.getDate());
  const diffDays = Math.floor((dateOnly.getTime() - nowOnly.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
  const dateStr = date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' });

  if (diffDays === 0) {
    return `Hoje ${timeStr}`;
  } else if (diffDays === 1) {
    return `Amanhã ${timeStr}`;
  } else if (diffDays === -1) {
    return `Ontem ${timeStr}`;
  } else if (diffDays < 0) {
    return `${dateStr} (atrasada)`;
  } else if (diffDays <= 7) {
    return `${dateStr} ${timeStr}`;
  } else {
    return dateStr;
  }
}

function isOverdue(dateString: string | null) {
  if (!dateString) return false;
  return new Date(dateString) < new Date();
}

function isToday(dateString: string | null) {
  if (!dateString) return false;
  const date = new Date(dateString);
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

function canEnterMeeting(task: Task) {
  // Pode entrar se: tem link, não está concluída, e tipo compatível
  return (
    task.meeting_link &&
    !task.completed &&
    ['not_started', 'scheduled', 'confirmed', 'in_progress'].includes(task.status) &&
    ['call', 'meeting', 'onboarding'].includes(task.task_type)
  );
}

export function TaskList({ tasks, showLinkedEntity = false, emptyMessage = "Nenhuma tarefa", clientName, clientPhone, clientEmail, productName }: TaskListProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const { activeMeeting, startMeeting, endMeeting, isLoading: isMeetingLoading, isTaskInMeeting, recoverSession, hasPendingSession } = useMeeting();
  const completeTask = useCompleteTask();
  const completeRecurring = useCompleteRecurringTask();
  const resolveRecurring = useResolveRecurringTask();
  const deleteTask = useDeleteTask();
  const updateTask = useUpdateTask();
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [taskToResolve, setTaskToResolve] = useState<Task | null>(null);
  const [taskToCancel, setTaskToCancel] = useState<Task | null>(null);
  const [cancelledReason, setCancelledReason] = useState('');

  // Próximo estágio para tasks de onboarding
  const getOnboardingNextStage = (currentStatus: string): string | null => {
    const flow: Record<string, string> = {
      not_started: 'monitoring_7d',
      scheduled: 'monitoring_7d',
      confirmed: 'monitoring_7d',
      in_progress: 'monitoring_7d',
      monitoring_7d: 'ongoing',
    };
    return flow[currentStatus] || null;
  };

  const handleComplete = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      // Se for onboarding, mover para o próximo estágio em vez de completar
      if (task.task_type === 'onboarding') {
        const nextStage = getOnboardingNextStage(task.status);
        if (nextStage) {
          const updatePayload: any = {
            id: task.id,
            status: nextStage,
            completed: false,
            completed_at: null,
          };
          // Salvar timestamp quando entra em monitoring_7d
          if (nextStage === 'monitoring_7d') {
            updatePayload.metadata = {
              ...((task as any).metadata || {}),
              monitoring_started_at: new Date().toISOString(),
            };
          }
          await updateTask.mutateAsync(updatePayload);

          // Sincronizar organization_products.journey_stage
          const STAGE_TO_JOURNEY: Record<string, string> = {
            monitoring_7d: 'monitoring_7d',
            ongoing: 'ongoing',
          };
          const journeyStage = STAGE_TO_JOURNEY[nextStage];
          if (journeyStage && task.organization_id && task.product_id) {
            await supabase
              .from('organization_products')
              .update({ journey_stage: journeyStage as any })
              .eq('organization_id', task.organization_id)
              .eq('product_id', task.product_id);
          }

          const stageNames: Record<string, string> = {
            monitoring_7d: 'Monitoramento 7 dias',
            ongoing: 'Acompanhamento 90 dias',
          };
          toast({ title: `Onboarding avançado para "${stageNames[nextStage] || nextStage}"` });
          return;
        }
      }
      if (task.is_recurring && !task.completed) {
        const result = await completeRecurring.mutateAsync({ taskId: task.id, completedBy: teamMember?.name });
        const nextDate = new Date(result.nextDate);
        const formatted = nextDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
        toast({ title: "Feito!", description: `Próxima pendência em ${task.recurrence_interval_days}d (${formatted})` });
      } else {
        await completeTask.mutateAsync(task.id);
        toast({ title: "Tarefa concluída!" });
      }
    } catch (error) {
      toast({ title: "Erro ao concluir tarefa", variant: "destructive" });
    }
  };

  const handleResolve = async () => {
    if (!taskToResolve) return;
    try {
      await resolveRecurring.mutateAsync(taskToResolve.id);
      toast({ title: "Tarefa resolvida 100%!", description: "Pendência encerrada definitivamente." });
    } catch (error) {
      toast({ title: "Erro ao resolver tarefa", variant: "destructive" });
    } finally {
      setTaskToResolve(null);
    }
  };

  // Iniciar ou continuar reunião com transcrição
  const handleStartMeeting = async (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();

    // Se já tem reunião ativa (mesmo que para outra tarefa), não criar nova
    if (activeMeeting) {
      toast({
        title: "Reunião em andamento",
        description: "Finalize a reunião atual antes de iniciar outra",
      });
      return;
    }

    // Se já tem sessão pendente para esta tarefa, recuperar ao invés de criar nova
    if (isTaskInMeeting(task.id) && hasPendingSession) {
      recoverSession();
      return;
    }

    await startMeeting(task, { phone: clientPhone, email: clientEmail });
  };

  const handleDelete = async () => {
    if (!taskToDelete) return;
    try {
      await deleteTask.mutateAsync(taskToDelete.id);
    } catch (error) {
      toast({ title: "Erro ao excluir tarefa", variant: "destructive" });
    } finally {
      setTaskToDelete(null);
    }
  };

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => {
        const typeConfig = taskTypeConfig[task.task_type] || taskTypeConfig.internal;
        const Icon = typeConfig.icon;
        const priority = priorityConfig[task.priority] || priorityConfig.medium;
        const status = statusConfig[task.status] || statusConfig.not_started;
        const overdue = !task.completed && isOverdue(task.scheduled_at);
        const inMeeting = isTaskInMeeting(task.id) && !task.completed && task.status !== 'no_show';
        
        // Usar scheduled_at se existir, senão due_datetime (evita duplicação)
        const displayDate = task.scheduled_at;

        return (
          <div
            key={task.id}
            className={cn(
              "group flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer hover:bg-muted/50",
              task.completed && "opacity-60",
              overdue && !task.completed && "border-red-200 bg-red-50/50",
              inMeeting && "border-green-400 bg-green-50 ring-2 ring-green-400/50"
            )}
            onClick={() => { setSelectedTask(task); setIsDetailOpen(true); }}
          >
            {/* Action button — onboarding shows "advance", recurring shows check-in */}
            {(() => {
              const isOnboarding = task.task_type === 'onboarding' && !task.completed;
              const nextStage = isOnboarding ? getOnboardingNextStage(task.status) : null;
              const stageLabels: Record<string, string> = { monitoring_7d: 'Avancar p/ Monitoramento', ongoing: 'Avancar p/ 90 dias' };
              return (
                <button
                  onClick={(e) => handleComplete(task, e)}
                  title={nextStage ? stageLabels[nextStage] || 'Avancar' : task.is_recurring ? 'Marcar check-in (renova automaticamente)' : task.completed ? 'Concluido' : 'Concluir'}
                  className={cn(
                    "h-5 w-5 rounded-full border-2 flex items-center justify-center transition-all flex-shrink-0",
                    task.completed
                      ? "bg-emerald-500 border-emerald-500 text-white"
                      : nextStage
                        ? "border-blue-400 hover:border-blue-500 hover:bg-blue-50"
                        : task.is_recurring
                          ? "border-teal-400 hover:border-teal-500 hover:bg-teal-50"
                          : "border-muted-foreground/30 hover:border-emerald-500"
                  )}
                >
                  {task.completed && <CheckCircle2 className="h-3 w-3" />}
                  {nextStage && <ChevronRight className="h-3 w-3 text-blue-500" />}
                </button>
              );
            })()}

            {/* Icon */}
            <div className={cn("p-1.5 rounded-lg flex-shrink-0", typeConfig.color)}>
              <Icon className="h-4 w-4" />
            </div>

            {/* Content - Layout compacto */}
            <div className="flex-1 min-w-0">
              {/* Linha 1: Título + Prioridade */}
              <div className="flex items-center gap-2">
                <span className={cn(
                  "font-medium text-sm truncate",
                  task.completed && "line-through text-muted-foreground"
                )}>
                  {task.name}
                </span>
                <div className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", priority.color)} title={priority.label} />
              </div>

              {/* Linha 2: Status + Data + Participantes (inline) */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {inMeeting ? (
                  <Badge className="text-[10px] px-2 py-0.5 bg-green-500 text-white animate-pulse whitespace-nowrap">
                    <span className="inline-block w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse"></span>
                    Em call
                  </Badge>
                ) : (
                  <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0", status.color)}>
                    {status.label}
                  </Badge>
                )}
                
                {task.is_recurring && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-teal-300 text-teal-700 bg-teal-50">
                    <Repeat className="h-2.5 w-2.5 mr-0.5" />
                    a cada {task.recurrence_interval_days}d
                  </Badge>
                )}

                {displayDate && (
                  <span className={cn(
                    "text-xs text-muted-foreground",
                    overdue && "text-red-500 font-medium"
                  )}>
                    {formatDateTime(displayDate)}
                  </span>
                )}

                {task.confirmed_by_client && (
                  <span className="text-[10px] text-green-600">✓ Confirmado</span>
                )}

                {(task.responsavel?.name || task.assignee) && (
                  <span className="text-[10px] text-violet-600 font-medium">
                    👤 {task.responsavel?.name || task.assignee}
                  </span>
                )}

                {task.participants && task.participants.length > 0 && (
                  <span className="text-[10px] text-blue-600 flex items-center gap-0.5">
                    <Users2 className="h-3 w-3" />
                    {task.participants.length}
                  </span>
                )}

                {showLinkedEntity && task.organization?.name && (
                  <span className="text-[10px] text-muted-foreground truncate">• {task.organization.name}</span>
                )}

                {showLinkedEntity && task.lead?.name && !task.organization?.name && (
                  <span className="text-[10px] text-muted-foreground truncate">• {task.lead.name}</span>
                )}
              </div>
            </div>

            {/* Botão Entrar/Continuar - abre painel de transcrição */}
            {canEnterMeeting(task) && (
              <Button
                variant={inMeeting ? "default" : isToday(task.scheduled_at) ? "default" : "outline"}
                size="sm"
                className={cn(
                  "h-7 px-2 flex-shrink-0 text-xs",
                  inMeeting && "bg-green-500 hover:bg-green-600 text-white",
                  !inMeeting && isToday(task.scheduled_at) && "bg-red-500 hover:bg-red-600 text-white"
                )}
                onClick={(e) => handleStartMeeting(task, e)}
                disabled={isMeetingLoading || (!!activeMeeting && !inMeeting)}
              >
                {isMeetingLoading ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Play className="h-3 w-3 mr-1" />
                )}
                {inMeeting ? 'Continuar' : 'Entrar'}
              </Button>
            )}

            {/* Menu de ações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <button className="h-7 w-7 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 hover:bg-muted">
                  <MoreVertical className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {task.is_recurring && !task.completed && (
                  <DropdownMenuItem
                    className="text-emerald-600 focus:text-emerald-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setTaskToResolve(task);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Resolver 100%
                  </DropdownMenuItem>
                )}
                {['call', 'meeting'].includes(task.task_type) &&
                 task.scheduled_at &&
                 !task.completed &&
                 task.status !== 'cancelled' &&
                 task.status !== 'no_show' && (
                  <DropdownMenuItem
                    className="text-orange-600 focus:text-orange-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCancelledReason('');
                      setTaskToCancel(task);
                    }}
                  >
                    <X className="h-4 w-4 mr-2" />
                    Cliente Desmarcou
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    setTaskToDelete(task);
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })}

      {/* Modal de Detalhes */}
      <TaskDetailModal
        task={selectedTask}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
        clientName={clientName}
        clientPhone={clientPhone}
        clientEmail={clientEmail}
        productName={productName}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a tarefa "{taskToDelete?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Dialog de cancelamento pelo cliente */}
      <Dialog open={!!taskToCancel} onOpenChange={(open) => { if (!open) setTaskToCancel(null); }}>
        <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle>Cliente desmarcou a reunião?</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              A tarefa será marcada como cancelada pelo cliente. O lead permanece no estágio atual para reagendamento.
            </p>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Motivo do cancelamento</Label>
              <Textarea
                placeholder="Ex: Cliente pediu para remarcar, surgiu imprevisto, viagem..."
                value={cancelledReason}
                onChange={(e) => setCancelledReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setTaskToCancel(null)}>
              Voltar
            </Button>
            <Button
              className="bg-orange-500 hover:bg-orange-600"
              onClick={() => {
                if (!taskToCancel) return;
                const notes = `⚠️ Cancelado pelo cliente em ${new Date().toLocaleDateString('pt-BR')}${cancelledReason ? ` — Motivo: ${cancelledReason}` : ''}`;
                updateTask.mutate({
                  id: taskToCancel.id,
                  status: 'cancelled',
                  completed: true,
                  completed_at: new Date().toISOString(),
                  notes,
                  metadata: {
                    ...(taskToCancel.metadata || {}),
                    cancelled_reason: cancelledReason || undefined,
                    cancelled_at: new Date().toISOString(),
                    cancelled_by: 'client',
                  },
                }, {
                  onSuccess: () => {
                    toast({ title: "Reunião cancelada", description: "Tarefa marcada como cancelada pelo cliente." });
                    setTaskToCancel(null);
                  }
                });
              }}
            >
              Confirmar Cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de resolver 100% */}
      <AlertDialog open={!!taskToResolve} onOpenChange={(open) => !open && setTaskToResolve(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Resolver 100%?</AlertDialogTitle>
            <AlertDialogDescription>
              A pendência "{taskToResolve?.name}" será encerrada definitivamente e não se renovará mais.
              {taskToResolve?.recurrence_count ? ` (${taskToResolve.recurrence_count} check-ins realizados)` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResolve}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Resolver 100%
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
