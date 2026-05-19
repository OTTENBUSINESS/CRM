import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Video, Phone, ExternalLink, Flame,
  TrendingUp, BarChart3, Users,
} from 'lucide-react';
import { cn, navigateTo } from '@/lib/utils';
import { format, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency, useDemoMultiplier, dv } from './shared';
import { useSessionState } from './shared';

// ==================== TYPES ====================

interface MeetingWithContext {
  id: string;
  title: string;
  scheduled_at: string;
  status: string;
  completed: boolean;
  task_type: string;
  lead_id: string | null;
  responsavel_id: string | null;
  lead_name: string;
  lead_phone: string | null;
  deal_id: string | null;
  deal_value: number | null;
  deal_status: string | null;
  product_name: string | null;
  stage_name: string | null;
  stage_is_won: boolean;
  stage_is_lost: boolean;
  closer_name: string;
  closer_id: string;
  duration_min: number;
  is_hot: boolean;
  outcome: string | null;
}

interface CloserSummary {
  id: string;
  name: string;
  totalMeetings: number;
  byProduct: { name: string; count: number; won: number; value: number }[];
  conversionRate: number;
  totalValue: number;
  wonCount: number;
  hotCount: number;
}

// ==================== HOOK ====================

function useWeeklyMeetings(weekStart: Date, weekEnd: Date, closerId?: string) {
  const fromStr = format(weekStart, 'yyyy-MM-dd');
  const toStr = format(weekEnd, 'yyyy-MM-dd');

  return useQuery({
    queryKey: ['weekly-meetings-performance', fromStr, toStr, closerId],
    queryFn: async () => {
      // 1. Get actual meeting sessions from `meetings` table
      let query = supabase
        .from('meetings')
        .select(`
          id, title, started_at, ended_at, status, meeting_type,
          lead_id, activity_id, created_by,
          lead:leads!meetings_lead_id_fkey(id, name, phone),
          creator:team_members!meetings_created_by_fkey(id, name)
        `)
        .eq('team', 'sales')
        .in('status', ['completed', 'processed', 'no_show'])
        .gte('started_at', fromStr)
        .lte('started_at', toStr + 'T23:59:59')
        .order('started_at', { ascending: true });

      if (closerId) {
        query = query.eq('created_by', closerId);
      }

      const { data: rawMeetings, error } = await query;
      if (error) throw error;
      if (!rawMeetings || rawMeetings.length === 0) return [];

      // 2. Deduplicate by activity_id — keep longest session per activity
      const byActivity: Record<string, any> = {};
      for (const m of rawMeetings) {
        const key = m.activity_id || m.id;
        const duration = m.ended_at && m.started_at
          ? new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()
          : 0;
        if (!byActivity[key] || duration > (byActivity[key]._duration || 0)) {
          byActivity[key] = { ...m, _duration: duration };
        }
      }
      const meetings = Object.values(byActivity);

      // 3. Get lead IDs to find related deals + follow-ups
      const leadIds = [...new Set(meetings.map((m: any) => m.lead_id).filter(Boolean))] as string[];

      let dealsMap: Record<string, any> = {};
      if (leadIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select(`
            id, lead_id, negotiated_price, status,
            product:products!deals_product_id_fkey(id, name),
            pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, is_won, is_lost, position),
            sales_rep:team_members!deals_sales_rep_id_fkey(id, name)
          `)
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false });

        if (deals) {
          for (const deal of deals) {
            if (!dealsMap[deal.lead_id]) {
              dealsMap[deal.lead_id] = deal;
            }
          }
        }
      }

      // 4. Get sales_alerts for hot lead indicator
      let hotLeadIds = new Set<string>();
      if (leadIds.length > 0) {
        const { data: alerts } = await supabase
          .from('sales_alerts')
          .select('lead_id')
          .in('lead_id', leadIds)
          .gte('created_at', fromStr)
          .lte('created_at', toStr + 'T23:59:59');

        if (alerts) {
          for (const a of alerts) {
            hotLeadIds.add(a.lead_id);
          }
        }
      }

      // 5. Get follow-up activities for these leads (to detect "2a reunião marcada", "follow-up agendado")
      let followUpMap: Record<string, { type: string; date: string }> = {};
      if (leadIds.length > 0) {
        const { data: followUps } = await supabase
          .from('company_activities')
          .select('lead_id, task_type, name, scheduled_at, completed')
          .in('lead_id', leadIds)
          .eq('team', 'comercial')
          .gte('scheduled_at', fromStr)
          .in('task_type', ['meeting', 'follow_up', 'proposal'])
          .order('scheduled_at', { ascending: true });

        if (followUps) {
          // For each lead, find the NEXT activity after their meeting
          for (const fu of followUps) {
            if (!fu.lead_id) continue;
            // We'll refine this per-meeting below
            if (!followUpMap[fu.lead_id]) {
              followUpMap[fu.lead_id] = { type: fu.task_type, date: fu.scheduled_at };
            }
          }
        }
      }

      // 6. Track which leads have multiple meetings this week (to show "→ 2ª call" on earlier ones)
      const meetingsByLead: Record<string, any[]> = {};
      for (const m of meetings) {
        if (m.lead_id) {
          if (!meetingsByLead[m.lead_id]) meetingsByLead[m.lead_id] = [];
          meetingsByLead[m.lead_id].push(m);
        }
      }
      // Sort each lead's meetings by date
      for (const leadId of Object.keys(meetingsByLead)) {
        meetingsByLead[leadId].sort((a: any, b: any) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
        );
      }

      // 7. Combine and format
      return meetings
        .map((m: any): MeetingWithContext => {
          const deal = m.lead_id ? dealsMap[m.lead_id] : null;
          const isHot = m.lead_id ? hotLeadIds.has(m.lead_id) : false;
          const durationMin = Math.round((m._duration || 0) / 60000);
          const followUp = m.lead_id ? followUpMap[m.lead_id] : null;

          // Check if this lead has multiple meetings this week
          const leadMeetings = m.lead_id ? meetingsByLead[m.lead_id] || [] : [];
          const isLastMeetingForLead = leadMeetings.length <= 1 ||
            leadMeetings[leadMeetings.length - 1].id === m.id ||
            leadMeetings[leadMeetings.length - 1].activity_id === (m.activity_id || m.id);

          // Determine outcome
          let outcome: string | null = null;
          if (m.status === 'no_show') {
            outcome = 'No-show';
          } else if (!isLastMeetingForLead) {
            // Earlier meeting for this lead — show that there was a follow-up call
            outcome = '→ 2ª call';
          } else if (deal?.pipeline_stage) {
            const stage = deal.pipeline_stage;
            if (stage.is_won) {
              outcome = 'Ganho';
            } else if (stage.is_lost) {
              outcome = 'Perdido';
            } else {
              const stageName = (stage.name || '').toLowerCase();
              if (stageName.includes('fechamento')) outcome = 'Em fechamento';
              else if (stageName.includes('proposta') || stageName.includes('negociação') || stageName.includes('negociacao')) outcome = 'Proposta enviada';
              else if (stageName.includes('call agendada') || stageName.includes('reunião agendada') || stageName.includes('reuniao agendada')) outcome = '2ª reunião marcada';
              else if (stageName.includes('call realizada')) outcome = 'Call realizada';
              else if (stageName.includes('follow up') || stageName.includes('follow_up')) outcome = 'Follow-up';
              else if (stageName.includes('no-show') || stageName.includes('noshow')) outcome = 'No-show';
              else if (stageName.includes('farming')) outcome = 'Farming';
              else if (stage.position >= 8) outcome = stage.name;
            }
          }
          // If no deal outcome but there's a follow-up activity scheduled after this meeting
          if (!outcome && followUp) {
            const fuDate = new Date(followUp.date);
            const meetingDate = new Date(m.started_at);
            if (fuDate > meetingDate) {
              if (followUp.type === 'meeting') outcome = '2ª reunião marcada';
              else if (followUp.type === 'follow_up') outcome = 'Follow-up agendado';
              else if (followUp.type === 'proposal') outcome = 'Proposta enviada';
            }
          }

          return {
            id: m.id,
            title: m.title || 'Reunião',
            scheduled_at: m.started_at,
            status: m.status,
            completed: true,
            task_type: m.meeting_type === 'sales_call' ? 'call' : 'meeting',
            lead_id: m.lead_id,
            responsavel_id: m.created_by,
            lead_name: m.lead?.name || 'Lead',
            lead_phone: m.lead?.phone || null,
            deal_id: deal?.id || null,
            deal_value: deal?.negotiated_price || null,
            deal_status: deal?.status || null,
            product_name: deal?.product?.name || null,
            stage_name: deal?.pipeline_stage?.name || null,
            stage_is_won: deal?.pipeline_stage?.is_won || false,
            stage_is_lost: deal?.pipeline_stage?.is_lost || false,
            closer_name: m.creator?.name || 'Sem responsável',
            closer_id: m.created_by || '',
            duration_min: durationMin,
            is_hot: isHot,
            outcome,
          };
        })
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
    },
    staleTime: 30_000,
  });
}

function useClosers() {
  return useQuery({
    queryKey: ['closers-list-performance'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name')
        .eq('team', 'comercial')
        .eq('is_active', true)
        .in('role', ['admin', 'diretor', 'gerente', 'vendedor', 'social_seller', 'comercial', 'closer', 'sdr'])
        .order('name');
      return data || [];
    },
    staleTime: 60_000,
  });
}

// ==================== HELPERS ====================

const OUTCOME_STYLES: Record<string, { color: string }> = {
  'Ganho': { color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' },
  'Perdido': { color: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400' },
  'Em fechamento': { color: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' },
  'Proposta enviada': { color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' },
  '2ª reunião marcada': { color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
  'Call realizada': { color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' },
  'Follow-up': { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400' },
  'Follow-up agendado': { color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-400' },
  'No-show': { color: 'bg-red-100 text-red-600 dark:bg-red-950/30 dark:text-red-400' },
  'Farming': { color: 'bg-lime-100 text-lime-700 dark:bg-lime-950/40 dark:text-lime-400' },
  '→ 2ª call': { color: 'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400' },
};

function getOutcomeStyle(outcome: string) {
  return OUTCOME_STYLES[outcome] || { color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400' };
}

// ==================== COMPONENT ====================

interface Props {
  teamMemberId: string;
  dateRange: { from: Date; to: Date };
}

export function WeeklyMeetingPerformance({ teamMemberId, dateRange }: Props) {
  const navigate = useNavigate();
  const dm = useDemoMultiplier();

  // Week selector
  const [weekOffset, setWeekOffset] = useSessionState<number>('dashv3-week-offset', 0);
  const [selectedCloser, setSelectedCloser] = useSessionState<string>('dashv3-perf-closer', '_current');

  const weekStart = useMemo(() => startOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset]);
  const weekEnd = useMemo(() => endOfWeek(subWeeks(new Date(), weekOffset), { weekStartsOn: 1 }), [weekOffset]);

  const effectiveCloserId = selectedCloser === '_all' ? undefined : selectedCloser === '_current' ? teamMemberId : selectedCloser;

  const { data: meetings, isLoading } = useWeeklyMeetings(weekStart, weekEnd, effectiveCloserId);
  const { data: closers } = useClosers();

  // Group by day
  const dayGroups = useMemo(() => {
    if (!meetings) return [];
    const groups: Record<string, MeetingWithContext[]> = {};
    for (const m of meetings) {
      const day = format(new Date(m.scheduled_at), 'yyyy-MM-dd');
      if (!groups[day]) groups[day] = [];
      groups[day].push(m);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [meetings]);

  // Summary stats
  const summary = useMemo((): CloserSummary | null => {
    if (!meetings || meetings.length === 0) return null;

    const productMap: Record<string, { count: number; won: number; value: number }> = {};
    for (const m of meetings) {
      const pName = m.product_name || 'Sem produto';
      if (!productMap[pName]) productMap[pName] = { count: 0, won: 0, value: 0 };
      productMap[pName].count++;
      if (m.stage_is_won) {
        productMap[pName].won++;
        productMap[pName].value += m.deal_value || 0;
      }
    }

    const byProduct = Object.entries(productMap)
      .map(([name, stats]) => ({ name, ...stats }))
      .sort((a, b) => b.count - a.count);

    const wonCount = meetings.filter(m => m.stage_is_won).length;
    const totalValue = meetings.filter(m => m.stage_is_won).reduce((s, m) => s + (m.deal_value || 0), 0);
    const hotCount = meetings.filter(m => m.is_hot).length;

    return {
      id: effectiveCloserId || 'all',
      name: selectedCloser === '_all' ? 'Todos' : meetings[0]?.closer_name || '',
      totalMeetings: meetings.length,
      byProduct,
      conversionRate: meetings.length > 0 ? (wonCount / meetings.length) * 100 : 0,
      totalValue,
      wonCount,
      hotCount,
    };
  }, [meetings, effectiveCloserId, selectedCloser]);

  const weekLabel = `${format(weekStart, "dd MMM", { locale: ptBR })} — ${format(weekEnd, "dd MMM", { locale: ptBR })}`;

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-violet-500" />
            Raio-X de Reuniões
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Week navigator */}
            <div className="flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => setWeekOffset(weekOffset + 1)}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
              >
                ←
              </button>
              <span className="px-2 py-1 text-xs font-medium whitespace-nowrap">{weekLabel}</span>
              <button
                onClick={() => setWeekOffset(Math.max(0, weekOffset - 1))}
                disabled={weekOffset === 0}
                className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-background transition-colors disabled:opacity-30"
              >
                →
              </button>
            </div>

            {/* Closer selector */}
            <Select value={selectedCloser} onValueChange={setSelectedCloser}>
              <SelectTrigger className="w-[140px] h-7 text-xs">
                <Users className="h-3.5 w-3.5 mr-1 text-violet-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_current">Eu</SelectItem>
                <SelectItem value="_all">Todos</SelectItem>
                {closers?.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="px-4 pb-4 pt-0">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20" />
            <Skeleton className="h-40" />
          </div>
        ) : !meetings || meetings.length === 0 ? (
          <div className="h-[120px] flex items-center justify-center text-muted-foreground text-sm">
            Nenhuma reunião na semana
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2.5 text-center">
                  <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{dv(summary.totalMeetings, dm)}</p>
                  <p className="text-[9px] text-blue-500/70">Reuniões</p>
                </div>
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2.5 text-center">
                  <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{dv(summary.wonCount, dm)}</p>
                  <p className="text-[9px] text-emerald-500/70">Vendas</p>
                </div>
                <div className="rounded-lg bg-violet-50 dark:bg-violet-950/30 p-2.5 text-center">
                  <p className="text-lg font-bold text-violet-600 dark:text-violet-400">
                    {Math.round(summary.conversionRate)}%
                  </p>
                  <p className="text-[9px] text-violet-500/70">Conversão</p>
                </div>
                <div className="rounded-lg bg-orange-50 dark:bg-orange-950/30 p-2.5 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <Flame className="h-4 w-4 text-orange-500" />
                    <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{summary.hotCount}</p>
                  </div>
                  <p className="text-[9px] text-orange-500/70">Leads quentes</p>
                </div>
              </div>
            )}

            {/* Product breakdown */}
            {summary && summary.byProduct.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {summary.byProduct.map(p => (
                  <div key={p.name} className="flex items-center gap-1.5 rounded-full border px-2.5 py-1">
                    <span className="text-[11px] font-medium">{p.name}</span>
                    <Badge variant="secondary" className="text-[9px] px-1 py-0">{p.count}</Badge>
                    {p.won > 0 && (
                      <Badge className="text-[9px] px-1 py-0 bg-emerald-500">{p.won} ganho{p.won > 1 ? 's' : ''}</Badge>
                    )}
                    {p.value > 0 && (
                      <span className="text-[9px] font-semibold text-emerald-600">{formatCurrency(dv(p.value, dm))}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Agenda by day */}
            <div className="space-y-3">
                {dayGroups.map(([day, dayMeetings]) => (
                  <div key={day}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {format(new Date(day + 'T12:00:00'), "EEEE, dd/MM", { locale: ptBR })}
                      </span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0">{dayMeetings.length}</Badge>
                    </div>
                    <div className="space-y-1">
                      {dayMeetings.map(m => {
                        const time = format(new Date(m.scheduled_at), 'HH:mm');
                        const outcomeStyle = m.outcome ? getOutcomeStyle(m.outcome) : null;

                        return (
                          <div
                            key={m.id}
                            className={cn(
                              'flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/50 cursor-pointer group border transition-colors',
                              m.stage_is_won ? 'border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/30 dark:bg-emerald-950/10' :
                              m.stage_is_lost ? 'border-red-200 bg-red-50/30 dark:border-red-900/30 dark:bg-red-950/10' :
                              m.status === 'no_show' ? 'border-red-200/50 bg-red-50/20 dark:border-red-900/20 dark:bg-red-950/10' :
                              'border-transparent'
                            )}
                            onClick={(e) => m.lead_id && navigateTo(e, `/comercial/leads/${m.lead_id}`, navigate)}
                          >
                            {/* Time */}
                            <span className="text-[11px] font-mono text-muted-foreground w-10 shrink-0">{time}</span>

                            {/* Icon */}
                            <div className={cn(
                              'w-6 h-6 rounded-full flex items-center justify-center shrink-0',
                              m.task_type === 'call' ? 'bg-blue-100 dark:bg-blue-950/40' : 'bg-violet-100 dark:bg-violet-950/40'
                            )}>
                              {m.task_type === 'call'
                                ? <Phone className="h-3 w-3 text-blue-600 dark:text-blue-400" />
                                : <Video className="h-3 w-3 text-violet-600 dark:text-violet-400" />
                              }
                            </div>

                            {/* Lead info */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium truncate">{m.lead_name}</span>
                                {m.is_hot && <Flame className="h-3 w-3 text-orange-500 shrink-0" />}
                                {selectedCloser === '_all' && (
                                  <span className="text-[9px] text-muted-foreground">({m.closer_name})</span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                {m.product_name && (
                                  <span className="text-[9px] text-muted-foreground font-medium">{m.product_name}</span>
                                )}
                                {m.deal_value != null && m.deal_value > 0 && (
                                  <span className="text-[9px] font-semibold text-foreground/70">{formatCurrency(dv(m.deal_value!, dm))}</span>
                                )}
                                {m.duration_min > 0 && (
                                  <span className="text-[9px] text-muted-foreground">{m.duration_min}min</span>
                                )}
                              </div>
                            </div>

                            {/* Outcome badge */}
                            <div className="flex items-center gap-1.5 shrink-0">
                              {m.outcome && outcomeStyle && (
                                <span className={cn('text-[9px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap', outcomeStyle.color)}>
                                  {m.outcome}
                                </span>
                              )}
                              <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
            </div>

            {/* Total value footer */}
            {summary && summary.totalValue > 0 && (
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
                  <span className="text-xs font-medium">Vendas da semana</span>
                </div>
                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(dv(summary.totalValue, dm))}
                </span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
