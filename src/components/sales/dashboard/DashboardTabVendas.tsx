import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  DollarSign, Phone, CalendarCheck, MessageSquare,
  CheckCircle2, ListTodo, TrendingUp, Clock,
  ChevronUp, Ticket, Award,
  CreditCard, Wallet,
} from 'lucide-react';
import { cn, navigateTo } from '@/lib/utils';
import { format, startOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import {
  useRevenueKPIs, useSellerRanking,
  useRecentSales, usePaymentBreakdown, useSalesGoals,
  type DashboardFilters,
} from '@/hooks/useSalesDashboardV2';
import { useDailyActivitySummary } from '@/hooks/useDailyActivitySummary';
import { useSalesDayPriorities } from '@/hooks/useSalesDayPriorities';
import {
  KPICard, ActivityProgressBar, formatCurrency, formatPercent,
  useDemoMultiplier, dv,
} from './shared';
import { useSessionState } from './shared';
import { WeeklyMeetingPerformance } from './WeeklyMeetingPerformance';

const DAILY_TARGETS = {
  calls: 15,
  followups: 10,
  meetings: 3,
};

interface Props {
  filters: DashboardFilters;
  teamMemberId: string;
  dateRange: { from: Date; to: Date };
}

export function DashboardTabVendas({ filters, teamMemberId, dateRange }: Props) {
  const navigate = useNavigate();
  const dm = useDemoMultiplier();

  const memberFilters: DashboardFilters = useMemo(() => ({
    ...filters,
    salesRepId: teamMemberId,
  }), [filters, teamMemberId]);

  // KPIs
  const { data: kpis, isLoading: kpisLoading } = useRevenueKPIs(memberFilters);
  const { data: sellerRanking, isLoading: rankingLoading } = useSellerRanking(filters);
  const { data: recentSales } = useRecentSales();

  // Payment breakdown
  const { data: paymentBreakdown, isLoading: paymentsLoading } = usePaymentBreakdown(memberFilters);

  // Goals
  const monthStart = format(startOfMonth(dateRange.from), 'yyyy-MM-dd');
  const { data: goals } = useSalesGoals(monthStart);
  const memberGoal = goals?.find(g => g.teamMemberId === teamMemberId);

  // Activity today
  const today = useMemo(() => new Date(), []);
  const { data: activityRows, isLoading: activityLoading } = useDailyActivitySummary(today, teamMemberId);
  const myActivity = activityRows?.[0];

  // Fila de leads
  const { data: priorities, isLoading: prioritiesLoading } = useSalesDayPriorities(teamMemberId);

  // Follow-ups pendentes
  const { data: pendingFollowups, isLoading: fuLoading } = useQuery({
    queryKey: ['pending-followups-vendas', teamMemberId],
    queryFn: async () => {
      const { data } = await supabase
        .from('company_activities')
        .select('id, title, scheduled_at, lead:leads!company_activities_lead_id_fkey(id, name)')
        .eq('assigned_to', teamMemberId)
        .eq('task_type', 'follow_up')
        .eq('completed', false)
        .eq('team', 'comercial')
        .order('scheduled_at', { ascending: true })
        .limit(10);
      return data || [];
    },
  });

  // Expanded KPI state
  const [expandedKPI, setExpandedKPI] = useSessionState<string | null>('dashv3-vendas-expanded-kpi', null);
  const toggleKPI = (key: string) => setExpandedKPI(expandedKPI === key ? null : key);

  const isAnyLoading = kpisLoading;

  return (
    <div className="space-y-5">
      {/* KPI Cards Row — 5 cards */}
      <div className="grid grid-cols-2 gap-3">
        {isAnyLoading ? (
          Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-[130px] rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="Faturado"
              value={formatCurrency(dv(kpis?.revenue || 0, dm))}
              subtitle={kpis?.goal ? `${formatPercent(kpis.goalPercent)} da meta` : `${dv(kpis?.dealCount || 0, dm)} vendas`}
              change={kpis?.revenueChange}
              icon={<DollarSign className="h-5 w-5 text-white" />}
              gradient={cn(
                'bg-gradient-to-br from-emerald-500 to-emerald-700',
                expandedKPI === 'faturado' && 'ring-2 ring-white/40'
              )}
              sparkline={kpis?.sparkline}
              onClick={() => toggleKPI('faturado')}
            />
            <KPICard
              title="Ticket Médio"
              value={formatCurrency(dv(kpis?.avgTicket || 0, dm))}
              subtitle={`${dv(kpis?.dealCount || 0, dm)} vendas`}
              icon={<Ticket className="h-5 w-5 text-white" />}
              gradient={cn(
                'bg-gradient-to-br from-blue-500 to-blue-700',
                expandedKPI === 'ticket' && 'ring-2 ring-white/40'
              )}
              onClick={() => toggleKPI('ticket')}
            />
          </>
        )}
      </div>

      {/* Conversão bar (always visible) */}
      {kpis && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-muted/50 border">
          <TrendingUp className="h-5 w-5 text-emerald-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium">{dv(kpis.dealCount, dm)} deals ganhos</span>
              <span className="text-sm font-bold">
                {kpis.goal > 0 ? `${formatPercent(kpis.goalPercent)} da meta` : formatCurrency(dv(kpis.revenue, dm))}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${Math.min(100, kpis.goal > 0 ? kpis.goalPercent : 50)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Expanded KPI Detail */}
      {expandedKPI && (
        <Card className="border-primary/20 shadow-sm">
          <CardContent className="pt-4 pb-4">
            {expandedKPI === 'faturado' && kpis && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Detalhamento de Faturamento</h3>
                  <button onClick={() => setExpandedKPI(null)} className="text-muted-foreground hover:text-foreground">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                {kpis.goal > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium">Meta: {formatCurrency(dv(kpis.goal, dm))}</span>
                      <span className="text-xs font-bold">{formatPercent(kpis.goalPercent)} ({formatCurrency(dv(kpis.revenue, dm))})</span>
                    </div>
                    <div className="h-3 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-500 transition-all"
                        style={{ width: `${Math.min(100, kpis.goalPercent)}%` }}
                      />
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xl font-bold">{formatCurrency(dv(kpis.revenue, dm))}</p>
                    <p className="text-[10px] text-muted-foreground">Faturado</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xl font-bold">{formatCurrency(dv(kpis.prevRevenue, dm))}</p>
                    <p className="text-[10px] text-muted-foreground">Período anterior</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xl font-bold">{formatCurrency(dv(kpis.remaining, dm))}</p>
                    <p className="text-[10px] text-muted-foreground">Falta p/ meta</p>
                  </div>
                </div>
                {/* Sparkline 7 days */}
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1.5">Últimos 7 dias</p>
                  <div className="flex items-end gap-1 h-10">
                    {kpis.sparkline.map((v, i) => {
                      const max = Math.max(...kpis.sparkline, 1);
                      return (
                        <div
                          key={i}
                          className="flex-1 rounded-t bg-emerald-500/80 transition-all"
                          style={{ height: `${Math.max(8, (v / max) * 100)}%` }}
                          title={formatCurrency(v)}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {expandedKPI === 'ticket' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">Ticket Médio — Vendas Recentes</h3>
                  <button onClick={() => setExpandedKPI(null)} className="text-muted-foreground hover:text-foreground">
                    <ChevronUp className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xl font-bold">{formatCurrency(dv(kpis?.avgTicket || 0, dm))}</p>
                    <p className="text-[10px] text-muted-foreground">Ticket Médio</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <p className="text-xl font-bold">{kpis?.dealCount || 0}</p>
                    <p className="text-[10px] text-muted-foreground">Vendas no período</p>
                  </div>
                </div>
                {recentSales && recentSales.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">Últimas vendas</p>
                    {recentSales.slice(0, 5).map((sale) => (
                      <div
                        key={sale.id}
                        className="flex items-center justify-between py-1.5 border-b last:border-0 cursor-pointer hover:bg-muted/30 rounded px-1 transition-colors"
                        onClick={(e) => sale.leadId && navigateTo(e, `/comercial/leads/${sale.leadId}`, navigate)}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{sale.leadName}</p>
                          <p className="text-[10px] text-muted-foreground">{sale.productName} — {sale.salesRepName}</p>
                        </div>
                        <span className="text-xs font-semibold shrink-0 ml-2">{formatCurrency(dv(sale.value, dm))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

          </CardContent>
        </Card>
      )}

      {/* Row 2: Raio-X de Reuniões */}
      <WeeklyMeetingPerformance teamMemberId={teamMemberId} dateRange={dateRange} />

      {/* Row 3: Atividades Hoje + Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Checklist atividades */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              Atividades Hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {activityLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : myActivity ? (
              <div className="space-y-3">
                <ActivityProgressBar
                  label="Ligações"
                  current={Number(myActivity.calls_made)}
                  target={DAILY_TARGETS.calls}
                  icon={<Phone className="h-3.5 w-3.5 text-blue-500" />}
                />
                <ActivityProgressBar
                  label="Follow-ups"
                  current={Number(myActivity.followups_done)}
                  target={DAILY_TARGETS.followups}
                  icon={<MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
                />
                <ActivityProgressBar
                  label="Reuniões"
                  current={Number(myActivity.meetings_done)}
                  target={DAILY_TARGETS.meetings}
                  icon={<CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />}
                />
                <div className="flex items-center justify-between pt-2 border-t text-xs text-muted-foreground">
                  <span>Leads contatados</span>
                  <span className="font-bold text-foreground">{Number(myActivity.leads_contacted)}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Mensagens enviadas</span>
                  <span className="font-bold text-foreground">{Number(myActivity.messages_sent)}</span>
                </div>
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Nenhuma atividade hoje</div>
            )}
          </CardContent>
        </Card>

        {/* Follow-ups pendentes */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Follow-ups Pendentes
              </CardTitle>
              {pendingFollowups && <Badge variant="secondary" className="text-xs">{pendingFollowups.length}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {fuLoading ? (
              <Skeleton className="h-[120px]" />
            ) : pendingFollowups && pendingFollowups.length > 0 ? (
              <ScrollArea className="h-[160px]">
                <div className="space-y-1.5">
                  {pendingFollowups.map((fu: any) => {
                    const isOverdue = fu.scheduled_at && new Date(fu.scheduled_at) < new Date();
                    return (
                      <div
                        key={fu.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 cursor-pointer transition-colors"
                        onClick={(e) => {
                          const leadId = fu.lead?.id;
                          if (leadId) navigateTo(e, `/comercial/leads/${leadId}`, navigate);
                        }}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', isOverdue ? 'bg-red-500' : 'bg-amber-500')} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium truncate">{fu.title || fu.lead?.name || 'Follow-up'}</p>
                          <p className="text-[9px] text-muted-foreground">
                            {fu.scheduled_at ? format(new Date(fu.scheduled_at), "dd/MM HH:mm", { locale: ptBR }) : '-'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[80px] flex items-center justify-center text-muted-foreground text-sm">Nenhum pendente</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Formas de Pagamento + Oportunidades em Aberto */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Breakdown de Pagamento */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-indigo-500" />
              Formas de Pagamento
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {paymentsLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : paymentBreakdown && paymentBreakdown.length > 0 ? (
              <div className="space-y-2.5">
                {paymentBreakdown.map((pm) => {
                  const totalValue = paymentBreakdown.reduce((s, p) => s + p.value, 0);
                  return (
                    <div key={pm.type}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: pm.color }} />
                          <span className="text-xs font-medium">{pm.label}</span>
                          <span className="text-[10px] text-muted-foreground">({pm.count}x)</span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] text-muted-foreground">{Math.round(pm.percent)}%</span>
                          <span className="text-xs font-bold">{formatCurrency(dv(pm.value, dm))}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${pm.percent}%`, backgroundColor: pm.color }}
                        />
                      </div>
                    </div>
                  );
                })}
                {/* Total cash collected */}
                <div className="flex items-center justify-between pt-2 mt-1 border-t">
                  <div className="flex items-center gap-1.5">
                    <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                    <span className="text-xs font-medium">Total recebido</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(dv(paymentBreakdown.reduce((s, p) => s + p.value, 0), dm))}
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-[80px] flex items-center justify-center text-muted-foreground text-sm">Sem vendas no período</div>
            )}
          </CardContent>
        </Card>

        {/* Oportunidades em Aberto */}
        <Card className="border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-blue-500" />
              Oportunidades em Aberto
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {prioritiesLoading ? (
              <Skeleton className="h-[180px]" />
            ) : priorities ? (
              <ScrollArea className="h-[240px]">
                <div className="space-y-1">
                  {[
                    { label: 'Em Fechamento', deals: priorities.emFechamento, color: 'text-emerald-600' },
                    { label: 'Call Realizada', deals: priorities.callRealizada, color: 'text-blue-600' },
                    { label: 'No-show', deals: priorities.noShow, color: 'text-orange-600' },
                    { label: 'Call Agendada', deals: priorities.callAgendada, color: 'text-violet-600' },
                  ].filter(g => g.deals.length > 0).map(group => (
                    <div key={group.label}>
                      <p className={cn('text-[10px] font-bold uppercase tracking-wider mt-2 mb-1', group.color)}>{group.label} ({group.deals.length})</p>
                      {group.deals.map((deal: any) => (
                        <div
                          key={deal.id}
                          className="flex items-center justify-between rounded-md px-2 py-1 hover:bg-muted/40 cursor-pointer text-xs"
                          onClick={(e) => navigateTo(e, `/comercial/leads/${deal.lead_id || deal.lead?.id}`, navigate)}
                        >
                          <span className="truncate flex-1 min-w-0">{deal.lead?.name || '-'}</span>
                          <span className="shrink-0 font-medium text-muted-foreground">{formatCurrency(dv(deal.negotiated_price || 0, dm))}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Sem oportunidades</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Ranking de Vendedores */}
      <Card className="border shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4 text-amber-500" />
            Ranking de Vendedores
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 pt-0">
          {rankingLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : sellerRanking && sellerRanking.length > 0 ? (
            <div className="space-y-1.5">
              {sellerRanking.slice(0, 5).map((rep, idx) => {
                const maxValue = sellerRanking[0]?.revenue || 1;
                return (
                  <div key={rep.id} className="flex items-center gap-3 px-2 py-1.5">
                    <span className={cn(
                      'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                      idx === 0 ? 'bg-amber-500 text-white' :
                      idx === 1 ? 'bg-slate-400 text-white' :
                      idx === 2 ? 'bg-amber-700 text-white' :
                      'bg-muted text-muted-foreground'
                    )}>
                      {idx + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs font-medium truncate">{rep.name}</span>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground shrink-0">
                          <span>{rep.dealsWon}v</span>
                          <span>TM {formatCurrency(dv(rep.avgTicket, dm))}</span>
                          <span>{rep.conversionRate}%</span>
                          <span className="font-bold text-foreground">{formatCurrency(dv(rep.revenue, dm))}</span>
                        </div>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            idx === 0 ? 'bg-amber-500' : idx === 1 ? 'bg-slate-400' : idx === 2 ? 'bg-orange-400' : 'bg-muted-foreground/30'
                          )}
                          style={{ width: `${(rep.revenue / maxValue) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-[60px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
