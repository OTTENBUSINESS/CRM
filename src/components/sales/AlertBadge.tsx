import { AlertTriangle, Clock, PhoneOff, CalendarX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useActiveAlertsForLead } from '@/hooks/useSalesAlerts';

interface AlertBadgeProps {
  leadId: string;
  className?: string;
  compact?: boolean;
}

const ALERT_CONFIG: Record<string, { icon: typeof AlertTriangle; label: string; color: string }> = {
  no_followup_critical: {
    icon: AlertTriangle,
    label: 'Sem follow-up (crítico)',
    color: 'bg-red-500',
  },
  no_followup_medium: {
    icon: Clock,
    label: 'Sem follow-up 48h+',
    color: 'bg-orange-500',
  },
  overdue_task: {
    icon: Clock,
    label: 'Tarefa atrasada',
    color: 'bg-yellow-500',
  },
  overdue_task_escalated: {
    icon: AlertTriangle,
    label: 'Tarefa escalonada',
    color: 'bg-red-500',
  },
  unconfirmed_meeting: {
    icon: CalendarX,
    label: 'Reunião não confirmada',
    color: 'bg-amber-500',
  },
  unconfirmed_meeting_escalated: {
    icon: PhoneOff,
    label: 'Reunião escalonada',
    color: 'bg-red-500',
  },
};

export function AlertBadge({ leadId, className, compact = false }: AlertBadgeProps) {
  const { data: alerts } = useActiveAlertsForLead(leadId);

  if (!alerts || alerts.length === 0) return null;

  // Get highest priority alert for display
  const topAlert = alerts[0];
  const config = ALERT_CONFIG[topAlert.alert_type] || {
    icon: AlertTriangle,
    label: topAlert.alert_type,
    color: 'bg-red-500',
  };
  const Icon = config.icon;

  const tooltipText = alerts.length === 1
    ? config.label
    : `${alerts.length} alertas ativos`;

  if (compact) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              'w-2.5 h-2.5 rounded-full animate-pulse',
              config.color,
              className
            )}
          />
        </TooltipTrigger>
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium text-white',
            config.color,
            className
          )}
        >
          <Icon className="w-3 h-3" />
          {alerts.length > 1 && <span>{alerts.length}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          {alerts.map((a) => {
            const c = ALERT_CONFIG[a.alert_type];
            return (
              <div key={a.id} className="text-xs">
                {c?.label || a.alert_type}: {a.title}
              </div>
            );
          })}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
