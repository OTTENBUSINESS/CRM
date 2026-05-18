import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Calendar, Clock, MessageSquare, Phone, Video, AlertTriangle,
  Eye, ExternalLink, Mail, RotateCcw, CheckCircle2, User,
} from 'lucide-react';
import { Task } from '@/hooks/useTasks';
import { useInboxConversations } from '@/hooks/useCSInbox';
import { useAuth } from '@/contexts/AuthContext';
import { useFocusMode } from '@/contexts/FocusModeContext';
import { supabase } from '@/lib/supabase';
import { cn, ensureHttps } from '@/lib/utils';

function useCountdown() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

function getCountdownText(scheduledAt: string | null, now: Date): { text: string; level: 'normal' | 'warning' | 'critical' } {
  if (!scheduledAt) return { text: '', level: 'normal' };
  const target = new Date(scheduledAt);
  const diffMs = target.getTime() - now.getTime();
  const diffMin = Math.floor(diffMs / 60000);

  if (diffMin < 0) {
    const pastMin = Math.abs(diffMin);
    if (pastMin < 60) return { text: `${pastMin}min atrás`, level: 'critical' };
    const pastHours = Math.floor(pastMin / 60);
    if (pastHours < 24) return { text: `${pastHours}h atrás`, level: 'critical' };
    return { text: `${Math.floor(pastHours / 24)}d atrás`, level: 'critical' };
  }
  if (diffMin <= 10) return { text: `EM ${diffMin} MIN!`, level: 'critical' };
  if (diffMin <= 30) return { text: `em ${diffMin}min`, level: 'warning' };
  if (diffMin < 60) return { text: `em ${diffMin}min`, level: 'normal' };
  const hours = Math.floor(diffMin / 60);
  const mins = diffMin % 60;
  return { text: `em ${hours}h${mins > 0 ? `${mins}m` : ''}`, level: 'normal' };
}

const TASK_TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  call: { label: 'Ligação', color: 'text-green-600' },
  meeting: { label: 'Reunião', color: 'text-blue-600' },
  whatsapp: { label: 'WhatsApp', color: 'text-green-500' },
  email: { label: 'E-mail', color: 'text-gray-500' },
  follow_up: { label: 'Follow-up', color: 'text-orange-500' },
  onboarding: { label: 'Onboarding', color: 'text-purple-500' },
  support: { label: 'Suporte', color: 'text-cyan-500' },
  internal: { label: 'Interna', color: 'text-gray-400' },
  checkin: { label: 'Check-in', color: 'text-teal-500' },
  review: { label: 'Revisão', color: 'text-indigo-500' },
  renewal: { label: 'Renovação', color: 'text-amber-500' },
  upsell: { label: 'Upsell', color: 'text-emerald-500' },
  rescue: { label: 'Resgate', color: 'text-red-500' },
  nps: { label: 'NPS', color: 'text-sky-500' },
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: 'Pendente', className: 'bg-gray-500/10 text-gray-500 border-gray-500/20' },
  scheduled: { label: 'Agendada', className: 'bg-blue-500/10 text-blue-500 border-blue-500/20' },
  confirmed: { label: 'Confirmada', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  in_progress: { label: 'Em andamento', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' },
  monitoring_7d: { label: 'Monitorando', className: 'bg-purple-500/10 text-purple-500 border-purple-500/20' },
  ongoing: { label: 'Contínua', className: 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' },
  completed: { label: 'Concluída', className: 'bg-green-500/10 text-green-600 border-green-500/20' },
  cancelled: { label: 'Cancelada', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  no_show: { label: 'No-show', className: 'bg-red-500/10 text-red-500 border-red-500/20' },
  rescheduled: { label: 'Reagendada', className: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20' },
};

function getTaskIcon(type: string) {
  switch (type) {
    case 'call': return <Phone className="h-3 w-3" />;
    case 'meeting': return <Video className="h-3 w-3" />;
    case 'whatsapp': return <MessageSquare className="h-3 w-3" />;
    case 'email': return <Mail className="h-3 w-3" />;
    case 'follow_up': return <RotateCcw className="h-3 w-3" />;
    default: return <Calendar className="h-3 w-3" />;
  }
}

function formatTime(dateStr: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(dateStr: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function TaskRow({
  task,
  now,
  showDate,
  onViewLead,
}: {
  task: Task;
  now: Date;
  showDate?: boolean;
  onViewLead?: (leadId: string) => void;
}) {
  const scheduledAt = task.scheduled_at;
  const countdown = getCountdownText(scheduledAt, now);
  const typeConf = TASK_TYPE_CONFIG[task.task_type] || { label: task.task_type, color: 'text-muted-foreground' };
  const statusConf = STATUS_CONFIG[task.status] || STATUS_CONFIG.not_started;
  const isCompleted = task.completed || task.status === 'completed';
  const isCancelled = task.status === 'cancelled' || task.status === 'no_show';
  const isDone = isCompleted || isCancelled;

  return (
    <div
      className={cn(
        'p-2 rounded-lg text-xs transition-all space-y-1',
        isDone
          ? 'bg-muted/30 opacity-50'
          : countdown.level === 'critical'
            ? 'bg-red-500/10 border border-red-500/20'
            : countdown.level === 'warning'
              ? 'bg-yellow-500/10 border border-yellow-500/20'
              : 'bg-muted/50'
      )}
    >
      {/* Line 1: Type icon + label + time + countdown */}
      <div className="flex items-center gap-1.5">
        <span className={cn('flex-shrink-0', typeConf.color)}>
          {getTaskIcon(task.task_type)}
        </span>
        <span className={cn('text-[10px] font-medium flex-shrink-0', typeConf.color)}>
          {typeConf.label}
        </span>
        <span className="text-muted-foreground ml-auto flex-shrink-0">
          {showDate ? formatDateShort(scheduledAt) : formatTime(scheduledAt)}
        </span>
        {countdown.text && !isDone && (
          <span className={cn(
            'font-bold text-[10px] flex-shrink-0',
            countdown.level === 'critical' && 'text-red-500 animate-pulse',
            countdown.level === 'warning' && 'text-yellow-500',
          )}>
            {countdown.text}
          </span>
        )}
      </div>

      {/* Line 2: Task name */}
      <p className={cn('font-medium truncate', isDone && 'line-through')}>
        {task.name}
      </p>

      {/* Line 3: Lead name + status badge */}
      <div className="flex items-center gap-1.5">
        {task.lead?.name ? (
          <span className="flex items-center gap-1 text-muted-foreground truncate flex-1">
            <User className="h-2.5 w-2.5 flex-shrink-0" />
            {task.lead.name}
          </span>
        ) : (
          <span className="flex-1" />
        )}
        <Badge variant="outline" className={cn('text-[9px] h-4 px-1 border flex-shrink-0', statusConf.className)}>
          {statusConf.label}
        </Badge>
      </div>

      {/* Line 4: Action buttons (only for active tasks) */}
      {!isDone && (
        <div className="flex items-center gap-1 pt-0.5">
          {task.lead_id && onViewLead && (
            <button
              onClick={() => onViewLead(task.lead_id!)}
              className="flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
            >
              <Eye className="h-2.5 w-2.5" /> Ver lead
            </button>
          )}
          {(task.task_type === 'meeting' || task.task_type === 'call') && task.meeting_link && (
            <button
              onClick={() => window.open(ensureHttps(task.meeting_link), '_blank')}
              className="flex items-center gap-0.5 text-[10px] text-blue-500 hover:text-blue-600 transition-colors px-1.5 py-0.5 rounded hover:bg-blue-500/10 ml-auto"
            >
              <ExternalLink className="h-2.5 w-2.5" /> Entrar
            </button>
          )}
          {isCompleted && (
            <span className="flex items-center gap-0.5 text-[10px] text-green-500 ml-auto">
              <CheckCircle2 className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export const FocusSidePanel = () => {
  const { teamMember } = useAuth();
  const { showInlineChat, showLeadDetail } = useFocusMode();
  const now = useCountdown();
  const [taskTab, setTaskTab] = useState<'today' | 'overdue'>('today');

  const { data: taskData = { today: [], overdue: [] } } = useQuery({
    queryKey: ['focus-side-tasks-v2', teamMember?.id],
    queryFn: async () => {
      if (!teamMember?.id) return { today: [], overdue: [] };

      const todayDate = new Date();
      const startOfDay = new Date(todayDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(todayDate);
      endOfDay.setHours(23, 59, 59, 999);

      // Today's tasks - only active (not completed/cancelled)
      const { data: todayData } = await supabase
        .from('company_activities')
        .select('*')
        .eq('responsavel_id', teamMember.id)
        .eq('completed', false)
        .not('scheduled_at', 'is', null)
        .neq('status', 'cancelled')
        .neq('status', 'no_show')
        .gte('scheduled_at', startOfDay.toISOString())
        .lte('scheduled_at', endOfDay.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(50);

      // Overdue tasks - only active (not completed/cancelled)
      const { data: overdueData } = await supabase
        .from('company_activities')
        .select('*')
        .eq('responsavel_id', teamMember.id)
        .eq('completed', false)
        .not('scheduled_at', 'is', null)
        .lt('scheduled_at', startOfDay.toISOString())
        .neq('status', 'cancelled')
        .neq('status', 'no_show')
        .order('scheduled_at', { ascending: false })
        .limit(30);

      // Fetch leads for all tasks
      const allTasksArr = [...(todayData || []), ...(overdueData || [])];
      const leadIds = [...new Set(allTasksArr.map(t => t.lead_id).filter(Boolean))];
      let leadMap = new Map<string, { id: string; name: string; phone: string }>();

      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, phone')
          .in('id', leadIds);
        if (leads) {
          leadMap = new Map(leads.map(l => [l.id, l]));
        }
      }

      const attachLead = (t: any) => ({
        ...t,
        lead: t.lead_id ? leadMap.get(t.lead_id) || null : null,
      });

      return {
        today: (todayData || []).map(attachLead) as Task[],
        overdue: (overdueData || []).map(attachLead) as Task[],
      };
    },
    enabled: !!teamMember?.id,
    refetchInterval: 60000,
  });

  const todayTasks = taskData.today;
  const overdueTasks = taskData.overdue;

  const { data: pendingConversations = [] } = useInboxConversations(
    {
      instanceId: teamMember?.whatsapp_instance_id || undefined,
      onlyPending: true,
      hideHandled: true,
      sortMode: 'priority',
    },
    20
  );

  const visibleTasks = taskTab === 'today' ? todayTasks : overdueTasks;

  return (
    <div className="h-full flex flex-col gap-2 overflow-hidden">
      {/* Tabs: Agenda do Dia | Atrasadas */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center border-b flex-shrink-0">
          <button
            onClick={() => setTaskTab('today')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors',
              taskTab === 'today'
                ? 'border-orange-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <Calendar className="h-3.5 w-3.5" />
            Agenda
            {todayTasks.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                {todayTasks.length}
              </Badge>
            )}
          </button>
          <button
            onClick={() => setTaskTab('overdue')}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium border-b-2 transition-colors',
              taskTab === 'overdue'
                ? 'border-red-500 text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Atrasadas
            {overdueTasks.length > 0 && (
              <Badge variant="secondary" className="text-[10px] h-4 px-1.5 bg-red-500/10 text-red-600">
                {overdueTasks.length}
              </Badge>
            )}
          </button>
        </div>

        {/* Task list */}
        {visibleTasks.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-6">
            {taskTab === 'today' ? 'Sem tarefas hoje' : 'Nenhuma atrasada'}
          </p>
        ) : (
          <ScrollArea className="flex-1 min-h-0 pt-1.5">
            <div className="space-y-1.5 px-0.5">
              {visibleTasks.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  now={now}
                  showDate={taskTab === 'overdue'}
                  onViewLead={(leadId) => showLeadDetail(leadId)}
                />
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Divider */}
      <div className="border-t" />

      {/* WhatsApp Pendente */}
      <div className="flex flex-col min-h-0 flex-1">
        <div className="flex items-center gap-2 px-1 py-1.5 flex-shrink-0">
          <MessageSquare className="h-3.5 w-3.5 text-green-500" />
          <span className="text-xs font-semibold">WhatsApp Pendente</span>
          {pendingConversations.length > 0 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 ml-auto bg-green-500/10 text-green-600">
              {pendingConversations.length}
            </Badge>
          )}
        </div>
        {pendingConversations.length === 0 ? (
          <p className="text-[11px] text-muted-foreground text-center py-4">Nenhuma pendente</p>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="space-y-1 px-0.5">
              {pendingConversations.map(conv => {
                const waitText = conv.wait_minutes < 60
                  ? `${conv.wait_minutes}min`
                  : `${Math.floor(conv.wait_minutes / 60)}h`;
                const getInitials = (name: string) => name?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??';

                return (
                  <button
                    key={conv.conversation_id}
                    onClick={() => {
                      if (conv.lead_id) {
                        showInlineChat(conv.lead_id, conv.conversation_name, conv.contact_phone);
                      }
                    }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg text-xs hover:bg-muted/80 transition-all text-left"
                  >
                    <Avatar className="h-6 w-6 flex-shrink-0">
                      <AvatarFallback className="text-[9px] bg-green-500/10 text-green-600">
                        {getInitials(conv.conversation_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{conv.conversation_name}</p>
                      <p className="truncate text-muted-foreground">
                        {conv.last_message?.slice(0, 35) || 'Mensagem'}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] flex-shrink-0',
                        conv.sla_status === 'critical' && 'border-red-500 text-red-500',
                        conv.sla_status === 'warning' && 'border-yellow-500 text-yellow-500',
                      )}
                    >
                      <Clock className="h-2.5 w-2.5 mr-0.5" />
                      {waitText}
                    </Badge>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
};
