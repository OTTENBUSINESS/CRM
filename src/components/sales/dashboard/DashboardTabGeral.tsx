import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DollarSign, Target, TrendingUp, BarChart3, Trophy, Crown,
  Phone, CalendarCheck, MessageSquare, Users, AlertTriangle, Filter,
  ExternalLink, Gauge, Clock, Briefcase, CheckCircle2,
} from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn, navigateTo } from '@/lib/utils';
import { format } from 'date-fns';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

import {
  useRevenueKPIs,
  useConversionFunnelV2,
  usePipelinesForFilter,
  useSellerRanking,
  useSalesForecast,
  type DashboardFilters,
} from '@/hooks/useSalesDashboardV2';
import { useSalesPerformance } from '@/hooks/useSalesPerformance';
import { useDailyActivityTotals, useDailyActivitySummary } from '@/hooks/useDailyActivitySummary';
import { useLeadsWithoutAction } from '@/hooks/useLeadsWithoutAction';
import {
  KPICard, HorizontalFunnel, ActivityProgressBar, TrafficLightBadge,
  formatCurrency, formatCurrencyFull, formatPercent,
  useDemoMultiplier, dv,
} from './shared';
import { useSessionState } from './shared';

// Activity targets (hardcoded phase 1)
const DAILY_TARGETS = {
  calls: 15,
  followups: 10,
  meetings: 3,
  messages: 20,
};

// Hook to fetch won deals for the ticket medio drill-down
function useWonDeals(dateRange: { from: Date; to: Date }, salesRepId?: string, enabled?: boolean) {
  return useQuery({
    queryKey: ['won-deals-drilldown', dateRange.from.toISOString(), dateRange.to.toISOString(), salesRepId],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select('id, title, negotiated_price, won_at, status, lead_id, lead:leads(id, name), sales_rep:team_members(id, name)')
        .eq('status', 'won')
        .not('won_at', 'is', null)
        .gte('won_at', dateRange.from.toISOString())
        .lte('won_at', dateRange.to.toISOString())
        .order('won_at', { ascending: false });

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: enabled !== false,
    staleTime: 30_000,
  });
}

interface Props {
  filters: DashboardFilters;
  dateRange: { from: Date; to: Date };
}

export function DashboardTabGeral({ filters, dateRange }: Props) {
  const navigate = useNavigate();
  const dm = useDemoMultiplier();
  const [funnelPipelineId, setFunnelPipelineId] = useSessionState<string | undefined>('dashv3-funnel-pipeline', undefined);
  const [showRevenueDrillDown, setShowRevenueDrillDown] = useState(false);

  // Data hooks
  const { data: kpis, isLoading: kpisLoading } = useRevenueKPIs(filters);
  const { data: ranking, isLoading: rankingLoading } = useSellerRanking(filters);
  const { data: pipelines } = usePipelinesForFilter();
  const { data: forecast, isLoading: forecastLoading } = useSalesForecast(filters, kpis ? { revenue: kpis.revenue, goal: kpis.goal } : undefined);

  const activeFunnelPipelineId = useMemo(() => {
    if (funnelPipelineId) return funnelPipelineId;
    if (pipelines && pipelines.length > 0) {
      const def = pipelines.find(p => p.isDefault);
      return def?.id || pipelines[0].id;
    }
    return undefined;
  }, [funnelPipelineId, pipelines]);

  const { data: funnel, isLoading: funnelLoading } = useConversionFunnelV2(filters, activeFunnelPipelineId);

  // Activity summary (today)
  const today = useMemo(() => new Date(), []);
  const { data: activityTotals, rows: activityRows, isLoading: activityLoading } = useDailyActivityTotals(today);

  // Leads without action
  const { data: leadsNoAction, isLoading: leadsNoActionLoading } = useLeadsWithoutAction(filters.salesRepId);

  // Performance (semaforo)
  const { data: performanceData, isLoading: performanceLoading } = useSalesPerformance({
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
  });

  // Won deals for drill-down (shared between Faturado and Ticket Medio)
  const { data: wonDeals, isLoading: wonDealsLoading } = useWonDeals(
    dateRange, filters.salesRepId, showRevenueDrillDown
  );

  // Ticket medio calculation details
  const ticketDetails = useMemo(() => {
    if (!wonDeals) return null;
    const total = wonDeals.reduce((sum, d: any) => sum + (Number(d.negotiated_price) || 0), 0);
    const count = wonDeals.length;
    return { total, count, avg: count > 0 ? total / count : 0 };
  }, [wonDeals]);

  // Forecast subtitle for "Falta" KPI
  const faltaSubtitle = useMemo(() => {
    if (!forecast || !kpis?.goal) return '-';
    const projLabel = `Proj: ${formatCurrency(dv(forecast.projectedRevenue, dm))}`;
    if (forecast.daysToGoal !== null) {
      return `${projLabel} · ~${forecast.daysToGoal}d uteis p/ meta`;
    }
    return projLabel;
  }, [forecast, kpis]);

  const faltaOnTrack = forecast?.onTrack ?? true;

  // Projection bar percentages
  const projectionPct = useMemo(() => {
    if (!kpis?.goal || !forecast) return { faturado: 0, projected: 0 };
    const faturado = Math.min(100, (kpis.revenue / kpis.goal) * 100);
    const projected = Math.min(100, (forecast.projectedRevenue / kpis.goal) * 100);
    return { faturado, projected };
  }, [kpis, forecast]);

  return (
    <div className="space-y-5">
      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpisLoading ? (
          Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[140px] rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="Faturado"
              value={formatCurrency(dv(kpis?.revenue || 0, dm))}
              subtitle={`${dv(kpis?.dealCount || 0, dm)} vendas`}
              change={kpis?.revenueChange}
              icon={<DollarSign className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
              sparkline={kpis?.sparkline?.map(v => dv(v, dm))}
              onClick={() => setShowRevenueDrillDown(true)}
            />
            <KPICard
              title="Meta do Mes"
              value={formatCurrency(dv(kpis?.goal || 0, dm))}
              subtitle={kpis?.goal ? `${formatPercent(kpis?.goalPercent || 0)} atingido` : 'Nao definida'}
              icon={<Target className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-blue-500 to-blue-700"
              progress={kpis?.goalPercent}
            />
            <KPICard
              title="Falta"
              value={formatCurrency(dv(kpis?.remaining || 0, dm))}
              subtitle={faltaSubtitle}
              icon={kpis && kpis.remaining === 0 ? <Trophy className="h-5 w-5 text-white" /> : <TrendingUp className="h-5 w-5 text-white" />}
              gradient={kpis && kpis.remaining === 0
                ? 'bg-gradient-to-br from-amber-500 to-amber-700'
                : faltaOnTrack
                  ? 'bg-gradient-to-br from-emerald-600 to-teal-700'
                  : 'bg-gradient-to-br from-rose-500 to-rose-700'
              }
            />
            <KPICard
              title="Ticket Medio"
              value={formatCurrency(dv(kpis?.avgTicket || 0, dm))}
              subtitle={`${dv(kpis?.dealCount || 0, dm)} vendas no periodo`}
              icon={<BarChart3 className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-violet-500 to-violet-700"
              onClick={() => setShowRevenueDrillDown(true)}
            />
          </>
        )}
      </div>

      {/* Row 2: Forecast + Funil Pipeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Projecao do Mes */}
        <Card className="lg:col-span-5 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Gauge className="h-4 w-4 text-blue-500" />
                Projecao do Mes
              </CardTitle>
              {forecast && !forecastLoading && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-bold border-0',
                    forecast.onTrack
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400'
                  )}
                >
                  {forecast.onTrack ? <CheckCircle2 className="h-3 w-3 mr-1" /> : <AlertTriangle className="h-3 w-3 mr-1" />}
                  {forecast.onTrack ? 'On Track' : 'Off Track'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {forecastLoading || !forecast ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <TrendingUp className="h-3.5 w-3.5 text-blue-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Velocidade</span>
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(dv(forecast.dailyVelocity, dm))}<span className="text-[10px] font-normal text-muted-foreground">/dia util</span></p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Target className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Projecao</span>
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(dv(forecast.projectedRevenue, dm))}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Briefcase className="h-3.5 w-3.5 text-violet-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Pipeline Ponderado</span>
                    </div>
                    <p className="text-sm font-bold">{formatCurrency(dv(forecast.weightedPipeline, dm))}</p>
                    <p className="text-[10px] text-muted-foreground">{dv(forecast.openDealsCount, dm)} deals · {Math.round(forecast.avgWinProbability)}% prob</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Clock className="h-3.5 w-3.5 text-orange-500" />
                      <span className="text-[10px] text-muted-foreground font-medium">Ciclo Medio</span>
                    </div>
                    <p className="text-sm font-bold">{forecast.avgCycleDays}<span className="text-[10px] font-normal text-muted-foreground"> dias</span></p>
                    <p className="text-[10px] text-muted-foreground">criacao → fechamento</p>
                  </div>
                </div>

                {/* Projection bar */}
                {kpis?.goal ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{formatPercent(projectionPct.faturado)} faturado</span>
                      <span>Meta: {formatCurrency(dv(kpis.goal, dm))}</span>
                    </div>
                    <div className="relative h-3 rounded-full bg-muted overflow-hidden">
                      {/* Projected (transparent behind) */}
                      <div
                        className={cn(
                          'absolute inset-y-0 left-0 rounded-full transition-all duration-700',
                          forecast.onTrack ? 'bg-emerald-500/25' : 'bg-red-500/25'
                        )}
                        style={{ width: `${projectionPct.projected}%` }}
                      />
                      {/* Actual revenue (solid) */}
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all duration-700"
                        style={{ width: `${projectionPct.faturado}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">
                        {forecast.businessDaysElapsed}d uteis passados
                      </span>
                      <span className="text-muted-foreground">
                        {forecast.businessDaysRemaining}d uteis restantes
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Funil Pipeline */}
        <Card className="lg:col-span-7 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-500" />
                Funil Pipeline
              </CardTitle>
              {pipelines && pipelines.length > 1 && (
                <Select value={activeFunnelPipelineId || ''} onValueChange={setFunnelPipelineId}>
                  <SelectTrigger className="w-[130px] h-7 text-[11px]">
                    <Filter className="h-3 w-3 mr-1 text-violet-500" />
                    <SelectValue placeholder="Pipeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map(p => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            <HorizontalFunnel stages={funnel} isLoading={funnelLoading} />
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Semaforo do Time + Atividades do Dia */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Semaforo do Time */}
        <Card className="lg:col-span-7 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              Semaforo do Time
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {performanceLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
            ) : performanceData && performanceData.length > 0 ? (
              <div className="space-y-1.5">
                {performanceData.map((member) => {
                  const goalPct = kpis?.goal
                    ? Math.min(100, (member.deals_won_value / (kpis.goal / performanceData.length)) * 100)
                    : member.completion_rate;
                  return (
                    <div
                      key={member.sales_rep_id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-muted/40 transition-all cursor-pointer"
                      onClick={(e) => navigateTo(e, `/comercial?rep=${member.sales_rep_id}`, navigate)}
                    >
                      <div className={cn(
                        'w-3 h-3 rounded-full shrink-0',
                        goalPct >= 80 ? 'bg-emerald-500' : goalPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                      )} />
                      <span className="text-xs font-medium flex-1 min-w-0 truncate">{member.sales_rep_name}</span>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] text-muted-foreground">
                        <span>{member.deals_won}v</span>
                        <span>{formatCurrency(dv(member.deals_won_value, dm))}</span>
                        <span>{member.calls_connected} calls</span>
                      </div>
                      <TrafficLightBadge percent={goalPct} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            )}
          </CardContent>
        </Card>

        {/* Atividades do Dia */}
        <Card className="lg:col-span-5 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-orange-500" />
              Atividades Hoje
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {activityLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : activityTotals ? (
              <div className="space-y-3">
                <ActivityProgressBar
                  label="Ligacoes"
                  current={activityTotals.calls_made}
                  target={DAILY_TARGETS.calls}
                  icon={<Phone className="h-3.5 w-3.5 text-blue-500" />}
                />
                <ActivityProgressBar
                  label="Follow-ups"
                  current={activityTotals.followups_done}
                  target={DAILY_TARGETS.followups}
                  icon={<MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
                />
                <ActivityProgressBar
                  label="Reunioes"
                  current={activityTotals.meetings_done}
                  target={DAILY_TARGETS.meetings}
                  icon={<CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />}
                />
                <ActivityProgressBar
                  label="Mensagens"
                  current={activityTotals.messages_sent}
                  target={DAILY_TARGETS.messages}
                  icon={<MessageSquare className="h-3.5 w-3.5 text-cyan-500" />}
                />
                {/* Per-member breakdown */}
                {activityRows && activityRows.length > 1 && (
                  <div className="pt-2 border-t space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Por vendedor</p>
                    {activityRows.map(row => (
                      <div key={row.team_member_id} className="flex items-center justify-between text-[10px]">
                        <span className="truncate flex-1 min-w-0">{row.team_member_name}</span>
                        <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                          <span>{Number(row.calls_made)}c</span>
                          <span>{Number(row.followups_done)}f</span>
                          <span>{Number(row.meetings_done)}r</span>
                          <span>{Number(row.messages_sent)}m</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Row 4: Leads sem acao + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Leads sem acao */}
        <Card className="lg:col-span-5 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                Leads sem Acao
              </CardTitle>
              {leadsNoAction && (
                <Badge variant="secondary" className="text-xs font-bold">{leadsNoAction.total}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {leadsNoActionLoading ? (
              <Skeleton className="h-[120px]" />
            ) : leadsNoAction ? (
              <div className="space-y-2.5">
                {[
                  { label: '> 72h (Critico)', leads: leadsNoAction.over72h, color: 'bg-red-500', textColor: 'text-red-600 dark:text-red-400' },
                  { label: '> 48h (Alerta)', leads: leadsNoAction.over48h, color: 'bg-amber-500', textColor: 'text-amber-600 dark:text-amber-400' },
                  { label: '> 24h', leads: leadsNoAction.over24h, color: 'bg-blue-500', textColor: 'text-blue-600 dark:text-blue-400' },
                ].map(bucket => (
                  <div key={bucket.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn('w-2 h-2 rounded-full', bucket.color)} />
                        <span className="text-xs font-medium">{bucket.label}</span>
                      </div>
                      <span className={cn('text-sm font-bold', bucket.textColor)}>{bucket.leads.length}</span>
                    </div>
                    {bucket.leads.length > 0 && (
                      <div className="pl-4 space-y-0.5">
                        {bucket.leads.slice(0, 3).map(lead => (
                          <div
                            key={lead.id}
                            className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground transition-colors truncate"
                            onClick={(e) => navigateTo(e, `/comercial/leads/${lead.id}`, navigate)}
                          >
                            {lead.name} — {lead.hours_since_action}h
                          </div>
                        ))}
                        {bucket.leads.length > 3 && (
                          <span className="text-[9px] text-muted-foreground/60">+{bucket.leads.length - 3} mais</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Ranking */}
        <Card className="lg:col-span-7 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              Ranking de Vendedores
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {rankingLoading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : ranking && ranking.length > 0 ? (
              <div className="space-y-1.5">
                {ranking.slice(0, 5).map((seller, i) => (
                  <div
                    key={seller.id}
                    className={cn(
                      'flex items-center gap-3 rounded-lg px-3 py-2 transition-all',
                      i === 0 ? 'bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-950/30 dark:to-yellow-950/20' : 'hover:bg-muted/40'
                    )}
                  >
                    <div className={cn(
                      'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0',
                      i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-slate-400 text-white' : i === 2 ? 'bg-amber-700 text-white' : 'bg-muted text-muted-foreground'
                    )}>
                      {i + 1}
                    </div>
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={seller.avatarUrl || undefined} />
                      <AvatarFallback className="text-[9px] bg-primary/10 text-primary">{seller.name.slice(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{seller.name}</p>
                      <p className="text-[10px] text-muted-foreground">{seller.dealsWon}v | {seller.conversionRate}%</p>
                    </div>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 shrink-0">{formatCurrency(dv(seller.revenue, dm))}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Won Deals Drill-Down Sheet (shared by Faturado and Ticket Medio) */}
      <Sheet open={showRevenueDrillDown} onOpenChange={setShowRevenueDrillDown}>
        <SheetContent className="w-[440px] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-emerald-500" />
              Vendas Fechadas
            </SheetTitle>
          </SheetHeader>

          {/* Calculation summary */}
          {ticketDetails && (
            <div className="mt-4 rounded-lg bg-muted/50 p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total faturado</span>
                <span className="font-bold text-emerald-600">{formatCurrencyFull(dv(ticketDetails.total, dm))}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Vendas fechadas</span>
                <span className="font-bold">{dv(ticketDetails.count, dm)}</span>
              </div>
              <div className="border-t pt-2 flex items-center justify-between text-sm">
                <span className="font-medium">Ticket medio</span>
                <span className="font-bold text-violet-600 text-base">{formatCurrencyFull(dv(ticketDetails.avg, dm))}</span>
              </div>
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                {formatCurrencyFull(dv(ticketDetails.total, dm))} / {dv(ticketDetails.count, dm)} = {formatCurrencyFull(dv(ticketDetails.avg, dm))}
              </p>
            </div>
          )}

          <ScrollArea className="h-[calc(100vh-280px)] mt-4">
            <div className="space-y-1 pr-4">
              {wonDealsLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
              ) : wonDeals && wonDeals.length > 0 ? (
                wonDeals.map((deal: any) => {
                  const leadName = deal.lead?.name || 'Lead';
                  const leadId = deal.lead?.id || deal.lead_id;
                  const repName = deal.sales_rep?.name;
                  const price = Number(deal.negotiated_price) || 0;
                  const wonDate = deal.won_at ? format(new Date(deal.won_at), 'dd/MM HH:mm') : '';

                  return (
                    <div
                      key={deal.id}
                      className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60 cursor-pointer group border border-transparent hover:border-border transition-colors"
                      onClick={() => {
                        setShowRevenueDrillDown(false);
                        if (leadId) navigate(`/comercial/leads/${leadId}`);
                      }}
                    >
                      <DollarSign className="h-4 w-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{deal.title || leadName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-muted-foreground truncate">{leadName}</span>
                          {repName && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0">{repName}</Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-0.5 shrink-0 ml-1">
                        <span className="text-xs font-bold text-emerald-600">{formatCurrencyFull(dv(price, dm))}</span>
                        <span className="text-[10px] text-muted-foreground">{wonDate}</span>
                      </div>
                      <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </div>
                  );
                })
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma venda no periodo</div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );
}
