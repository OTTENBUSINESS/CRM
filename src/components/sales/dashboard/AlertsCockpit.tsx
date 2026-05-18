import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Clock,
  MessageSquareWarning,
  CalendarX,
  ExternalLink,
} from 'lucide-react';
import { cn, navigateTo } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { SalesAlert, AlertType } from '@/types/sales.types';

interface AlertGroup {
  key: string;
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Clock;
  types: AlertType[];
}

const ALERT_GROUPS: AlertGroup[] = [
  {
    key: 'overdue',
    label: 'Tarefas Atrasadas',
    color: 'text-red-600 dark:text-red-400',
    bgColor: 'bg-red-50 dark:bg-red-950/30',
    icon: Clock,
    types: ['overdue_task', 'overdue_task_escalated'],
  },
  {
    key: 'no_followup',
    label: 'Sem Follow-up',
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950/30',
    icon: MessageSquareWarning,
    types: ['no_followup_critical', 'no_followup_medium'],
  },
  {
    key: 'meeting',
    label: 'Reunião Não Confirmada',
    color: 'text-amber-600 dark:text-amber-400',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    icon: CalendarX,
    types: ['unconfirmed_meeting', 'unconfirmed_meeting_escalated'],
  },
];

interface Props {
  alerts: SalesAlert[] | undefined;
  isLoading: boolean;
  onMarkActioned?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
}

export function AlertsCockpit({ alerts, isLoading, onMarkActioned, onDismiss }: Props) {
  const navigate = useNavigate();
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const grouped = ALERT_GROUPS.map(group => {
    const items = (alerts ?? []).filter(a => group.types.includes(a.alert_type));
    return { ...group, items };
  }).filter(g => g.items.length > 0);

  const totalAlerts = grouped.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Cockpit de Atrasos
          </CardTitle>
          {totalAlerts > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {totalAlerts}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : grouped.length > 0 ? (
          <div className="space-y-1.5">
            {grouped.map(group => {
              const Icon = group.icon;
              const isExpanded = expandedGroup === group.key;
              return (
                <div key={group.key}>
                  <button
                    onClick={() => setExpandedGroup(isExpanded ? null : group.key)}
                    className={cn(
                      'w-full flex items-center gap-2 rounded-lg px-2.5 py-2 transition-all',
                      group.bgColor,
                      'hover:opacity-80'
                    )}
                  >
                    <Icon className={cn('h-3.5 w-3.5 shrink-0', group.color)} />
                    <span className={cn('text-[11px] font-semibold flex-1 text-left', group.color)}>
                      {group.label}
                    </span>
                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                      {group.items.length}
                    </Badge>
                    {isExpanded
                      ? <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                    }
                  </button>

                  {isExpanded && (
                    <div className="mt-1 space-y-1 pl-2">
                      {group.items.map(alert => {
                        const leadId = alert.lead_id || alert.contact_id;
                        const dealId = alert.deal_id || (alert.metadata?.deal_id as string);
                        const repName = (alert.metadata?.sales_rep_name as string) || '';
                        const targetUrl = dealId
                          ? `/comercial/deals/${dealId}`
                          : leadId
                          ? `/comercial/leads/${leadId}`
                          : null;

                        return (
                          <div
                            key={alert.id}
                            className="flex items-center gap-2 rounded-md border border-border/50 px-2 py-1.5 bg-background"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium truncate">
                                {alert.contact?.name || alert.title}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {repName && (
                                  <span className="text-[9px] text-muted-foreground truncate">
                                    {repName}
                                  </span>
                                )}
                                <span className="text-[9px] text-muted-foreground/60">
                                  {formatDistanceToNow(new Date(alert.created_at), {
                                    addSuffix: true,
                                    locale: ptBR,
                                  })}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {onMarkActioned && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Marcar como resolvido"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onMarkActioned(alert.id);
                                  }}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                </Button>
                              )}
                              {targetUrl && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  title="Abrir"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigateTo(e, targetUrl, navigate);
                                  }}
                                >
                                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="h-[80px] flex flex-col items-center justify-center gap-1">
            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            <span className="text-[11px] text-muted-foreground">Tudo em dia!</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
