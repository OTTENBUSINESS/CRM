import { useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCall } from '@/contexts/CallContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCompleteTask } from '@/hooks/useTasks';
import { useWorkingHours, useCalendarBlocks, useGoogleCalendarEvents, defaultWorkingHours } from '@/hooks/useCalendarSettings';
import { useDailyActivitySummary } from '@/hooks/useDailyActivitySummary';
import { supabase } from '@/lib/supabase';
import { DayViewGrid } from '@/components/agenda/DayViewGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { format, startOfDay, endOfDay, addDays, isBefore, isToday, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Phone, Video, MessageSquare, Clock, CheckCircle2, ExternalLink, Calendar, AlertTriangle,
} from 'lucide-react';
import type { Task } from '@/hooks/useTasks';

const TASK_TYPE_ICON: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  call: { icon: Phone, color: 'text-blue-500', label: 'Call' },
  meeting: { icon: Video, color: 'text-indigo-500', label: 'Reunião' },
  whatsapp: { icon: MessageSquare, color: 'text-green-500', label: 'WhatsApp' },
  follow_up: { icon: Clock, color: 'text-yellow-500', label: 'Follow-up' },
};

const isAppointment = (t: { task_type: string; meeting_link?: string | null }) =>
  t.task_type === 'meeting' || t.task_type === 'onboarding' || (t.task_type === 'call' && !!t.meeting_link);

export function CockpitTabMeuDia() {
  const { teamMember } = useAuth();
  const { initiateCall } = useCall();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const completeTask = useCompleteTask();
  const memberId = teamMember?.id;

  const today = useMemo(() => new Date(), []);
  const todayStart = startOfDay(today).toISOString();
  const todayEnd = endOfDay(today).toISOString();
  const tomorrowEnd = endOfDay(addDays(today, 3)).toISOString();

  // Tasks: today + overdue + upcoming (next 3 days)
  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['cockpit-meu-dia-tasks', memberId],
    queryFn: async () => {
      if (!memberId) return [];
      const selectFields = `*, lead:leads!company_activities_lead_id_fkey(id, name, phone, sales_score, sales_stage)`;

      const { data } = await supabase
        .from('company_activities')
        .select(selectFields)
        .eq('responsavel_id', memberId)
        .eq('completed', false)
        .lte('scheduled_at', tomorrowEnd)
        .order('scheduled_at', { ascending: true });

      return (data || []) as (Task & { lead?: { id: string; name: string; phone?: string; sales_score?: number; sales_stage?: string } })[];
    },
    enabled: !!memberId,
    refetchInterval: 30_000,
  });

  // Calendar settings for DayViewGrid
  const { data: whSettings } = useWorkingHours(memberId || undefined);
  const workingHours = whSettings?.working_hours || defaultWorkingHours();
  const { data: blocks = [] } = useCalendarBlocks(memberId || undefined, todayStart, todayEnd);
  const { data: googleEvents = [] } = useGoogleCalendarEvents(memberId || undefined, todayStart, todayEnd);

  // Activity summary
  const { data: activityRows } = useDailyActivitySummary(today, memberId);
  const activity = activityRows?.[0];

  // Split tasks
  const { overdue, todayTasks, upcoming, gridAppointments, gridQuickTasks } = useMemo(() => {
    const now = startOfDay(new Date());
    const todayEndDate = endOfDay(new Date());
    const ov: typeof allTasks = [];
    const td: typeof allTasks = [];
    const up: typeof allTasks = [];
    const appts: typeof allTasks = [];
    const quick: typeof allTasks = [];

    for (const t of allTasks) {
      const sa = t.scheduled_at ? new Date(t.scheduled_at) : null;
      if (!sa) continue;

      if (isBefore(sa, now)) {
        ov.push(t);
      } else if (sa >= now && sa <= todayEndDate) {
        td.push(t);
        if (isAppointment(t)) appts.push(t);
        else quick.push(t);
      } else {
        up.push(t);
      }
    }

    return { overdue: ov, todayTasks: td, upcoming: up, gridAppointments: appts, gridQuickTasks: quick };
  }, [allTasks]);

  const handleComplete = useCallback((taskId: string) => {
    completeTask.mutate(taskId, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cockpit-meu-dia-tasks'] }),
    });
  }, [completeTask, queryClient]);

  const handleOpenLead = useCallback((leadId: string) => {
    navigate(`/comercial/leads/${leadId}`);
  }, [navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <div className="animate-pulse">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-w-0">
      {/* Summary bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/30 shrink-0 flex-wrap">
        <SummaryBadge icon={Video} label="reuniões" count={todayTasks.filter(t => isAppointment(t)).length} color="bg-indigo-100 text-indigo-700" />
        <SummaryBadge icon={Clock} label="follow-ups" count={todayTasks.filter(t => t.task_type === 'follow_up' || t.task_type === 'whatsapp').length} color="bg-yellow-100 text-yellow-700" />
        <SummaryBadge icon={AlertTriangle} label="atrasadas" count={overdue.length} color={overdue.length > 0 ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"} />
        <SummaryBadge icon={Phone} label="calls" count={activity?.calls_made ?? 0} color="bg-blue-100 text-blue-700" />
      </div>

      {/* Main content: 2 columns */}
      <div className="flex flex-1 overflow-hidden min-w-0">
        {/* Left: Timeline */}
        <div className="flex-1 overflow-auto border-r min-w-0">
          <div className="p-2">
            <DayViewGrid
              selectedDate={today}
              tasks={gridAppointments}
              quickTasks={gridQuickTasks}
              blocks={blocks}
              googleEvents={googleEvents}
              workingHours={workingHours}
            />
          </div>
        </div>

        {/* Right: Pending queue */}
        <div className="w-[360px] shrink-0 flex flex-col overflow-hidden">
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-4">
              {/* Overdue */}
              {overdue.length > 0 && (
                <TaskGroup
                  title={`Atrasadas (${overdue.length})`}
                  titleColor="text-red-600"
                  dotColor="bg-red-500"
                  tasks={overdue}
                  onComplete={handleComplete}
                  onOpenLead={handleOpenLead}
                  onCall={(phone) => initiateCall(phone)}
                  isOverdue
                />
              )}

              {/* Today */}
              <TaskGroup
                title={`Hoje (${todayTasks.length})`}
                titleColor="text-foreground"
                dotColor="bg-blue-500"
                tasks={todayTasks}
                onComplete={handleComplete}
                onOpenLead={handleOpenLead}
                onCall={(phone) => initiateCall(phone)}
              />

              {/* Upcoming */}
              {upcoming.length > 0 && (
                <TaskGroup
                  title={`Próximos dias (${upcoming.length})`}
                  titleColor="text-muted-foreground"
                  dotColor="bg-zinc-400"
                  tasks={upcoming}
                  onComplete={handleComplete}
                  onOpenLead={handleOpenLead}
                  onCall={(phone) => initiateCall(phone)}
                />
              )}

              {allTasks.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Nenhuma tarefa pendente</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

// ── Summary Badge ────────────────────────────────────────────────────
function SummaryBadge({ icon: Icon, label, count, color }: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
}) {
  return (
    <div className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium', color)}>
      <Icon className="h-3.5 w-3.5" />
      <span>{count} {label}</span>
    </div>
  );
}

// ── Task Group ───────────────────────────────────────────────────────
function TaskGroup({ title, titleColor, dotColor, tasks, onComplete, onOpenLead, onCall, isOverdue }: {
  title: string;
  titleColor: string;
  dotColor: string;
  tasks: any[];
  onComplete: (id: string) => void;
  onOpenLead: (leadId: string) => void;
  onCall: (phone: string) => void;
  isOverdue?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn('w-2 h-2 rounded-full', dotColor)} />
        <span className={cn('text-xs font-semibold uppercase tracking-wide', titleColor)}>{title}</span>
      </div>
      <div className="space-y-1">
        {tasks.map(task => (
          <PendingTaskCard
            key={task.id}
            task={task}
            onComplete={() => onComplete(task.id)}
            onOpenLead={() => task.lead_id && onOpenLead(task.lead_id)}
            onCall={() => task.lead?.phone && onCall(task.lead.phone)}
            isOverdue={isOverdue}
          />
        ))}
      </div>
    </div>
  );
}

// ── Pending Task Card ────────────────────────────────────────────────
function PendingTaskCard({ task, onComplete, onOpenLead, onCall, isOverdue }: {
  task: any;
  onComplete: () => void;
  onOpenLead: () => void;
  onCall: () => void;
  isOverdue?: boolean;
}) {
  const config = TASK_TYPE_ICON[task.task_type] || { icon: CheckCircle2, color: 'text-muted-foreground', label: task.task_type };
  const Icon = config.icon;
  const time = task.scheduled_at ? format(new Date(task.scheduled_at), 'HH:mm') : '--:--';

  return (
    <div className={cn(
      'flex items-start gap-2 p-2 rounded-lg border transition-colors hover:bg-muted/50 group',
      isOverdue && 'border-red-200 bg-red-50/50',
    )}>
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', isOverdue ? 'text-red-500' : config.color)} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{task.name}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={cn('text-xs', isOverdue ? 'text-red-500' : 'text-muted-foreground')}>{time}</span>
          {task.lead?.name && (
            <button onClick={onOpenLead} className="text-xs text-blue-600 hover:underline truncate">
              {task.lead.name}
            </button>
          )}
        </div>
        {isOverdue && task.scheduled_at && (
          <p className="text-[10px] text-red-500 mt-0.5">
            {formatDistanceToNow(new Date(task.scheduled_at), { addSuffix: true, locale: ptBR })}
          </p>
        )}
      </div>
      {/* Quick actions */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {task.lead?.phone && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onCall} title="Ligar">
            <Phone className="h-3 w-3" />
          </Button>
        )}
        {task.lead_id && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onOpenLead} title="Ver lead">
            <ExternalLink className="h-3 w-3" />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6 text-green-600" onClick={onComplete} title="Concluir">
          <CheckCircle2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
