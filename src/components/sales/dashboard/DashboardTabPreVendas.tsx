import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Phone, CalendarCheck, Users, Target, Zap, MessageSquare, Bot, UserPlus,
  ExternalLink, Clock, Mic, Brain, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Play, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

import {
  useMeetingMetrics, useLeadsByOrigin,
  type DashboardFilters,
} from '@/hooks/useSalesDashboardV2';
import { useDailyActivitySummary } from '@/hooks/useDailyActivitySummary';
import { formatDuration } from '@/hooks/useWavoip';
import { LeadScoreBadge } from '@/components/sales/LeadScoreBadge';
import { CallDetailModal } from '@/components/calls/CallDetailModal';
import {
  KPICard, ActivityProgressBar, formatPercent,
} from './shared';

// ==================== INLINE HOOKS ====================

function useCallStats(dateFrom: string, dateTo: string, teamMemberId?: string) {
  return useQuery({
    queryKey: ['call-stats-prevendas', dateFrom, dateTo, teamMemberId],
    queryFn: async () => {
      let query = supabase
        .from('call_history')
        .select('id, status, duration_seconds')
        .gte('started_at', dateFrom)
        .lte('started_at', dateTo + 'T23:59:59');

      if (teamMemberId) {
        query = query.eq('team_member_id', teamMemberId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const calls = data || [];
      return {
        total: calls.length,
        connected: calls.filter(c => c.status === 'ENDED' && (c.duration_seconds || 0) > 0).length,
      };
    },
    staleTime: 30_000,
  });
}

function useNewLeads(dateFrom: string, dateTo: string) {
  return useQuery({
    queryKey: ['new-leads-prevendas', dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('id, name, phone, company, email, sales_stage, sales_score, utm_source, created_at')
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

function useLeadCallCounts(leadIds: string[]) {
  return useQuery({
    queryKey: ['lead-call-counts', leadIds],
    queryFn: async () => {
      if (leadIds.length === 0) return {};
      const { data, error } = await supabase
        .from('call_history')
        .select('lead_id')
        .in('lead_id', leadIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach(c => {
        if (c.lead_id) counts[c.lead_id] = (counts[c.lead_id] || 0) + 1;
      });
      return counts;
    },
    enabled: leadIds.length > 0,
    staleTime: 30_000,
  });
}

function useCallsDrilldown(dateFrom: string, dateTo: string, teamMemberId?: string, enabled?: boolean) {
  return useQuery({
    queryKey: ['calls-drilldown', dateFrom, dateTo, teamMemberId],
    queryFn: async () => {
      let query = supabase
        .from('call_history')
        .select('id, direction, status, duration_seconds, peer_phone, peer_name, started_at, record_url, ai_summary, ai_sentiment, ai_key_points, transcriptions, lead_id, lead:leads(id, name), team_member:team_members(id, name)')
        .gte('started_at', dateFrom)
        .lte('started_at', dateTo + 'T23:59:59')
        .order('started_at', { ascending: false })
        .limit(100);

      if (teamMemberId) {
        query = query.eq('team_member_id', teamMemberId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: enabled !== false,
    staleTime: 30_000,
  });
}

function useScheduledMeetings(dateFrom: string, dateTo: string, teamMemberId?: string) {
  return useQuery({
    queryKey: ['scheduled-meetings-prevendas', dateFrom, dateTo, teamMemberId],
    queryFn: async () => {
      let query = supabase
        .from('company_activities')
        .select('id, title, scheduled_at, status, responsavel_id, lead_id, lead:leads(id, name, phone, sales_score)')
        .eq('task_type', 'meeting')
        .not('lead_id', 'is', null)
        .gte('scheduled_at', dateFrom)
        .lte('scheduled_at', dateTo + 'T23:59:59')
        .order('scheduled_at', { ascending: true });

      if (teamMemberId) {
        query = query.eq('responsavel_id', teamMemberId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

// Meetings CRIADAS no período (marcadas) — para o drill-down do KPI card
function useBookedMeetings(dateFrom: string, dateTo: string, teamMemberId?: string) {
  return useQuery({
    queryKey: ['booked-meetings-prevendas', dateFrom, dateTo, teamMemberId],
    queryFn: async () => {
      let query = supabase
        .from('company_activities')
        .select('id, title, scheduled_at, created_at, status, responsavel_id, lead_id, lead:leads(id, name, phone, sales_score)')
        .eq('task_type', 'meeting')
        .not('lead_id', 'is', null)
        .gte('created_at', dateFrom)
        .lte('created_at', dateTo + 'T23:59:59')
        .order('scheduled_at', { ascending: true });

      if (teamMemberId) {
        query = query.eq('responsavel_id', teamMemberId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 30_000,
  });
}

function useMeetingLeadLastCalls(leadIds: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['meeting-lead-last-calls', leadIds],
    queryFn: async () => {
      if (leadIds.length === 0) return {};
      // Get the most recent call for each lead
      const { data, error } = await supabase
        .from('call_history')
        .select('id, lead_id, duration_seconds, status, record_url, ai_sentiment, ai_summary, started_at, direction, peer_phone, peer_name, ai_key_points, transcriptions')
        .in('lead_id', leadIds)
        .order('started_at', { ascending: false })
        .limit(leadIds.length * 3); // get a few per lead, we'll dedupe

      if (error) throw error;

      const byLead: Record<string, any> = {};
      (data || []).forEach(call => {
        if (call.lead_id && !byLead[call.lead_id]) {
          byLead[call.lead_id] = call;
        }
      });
      return byLead;
    },
    enabled: enabled && leadIds.length > 0,
    staleTime: 30_000,
  });
}

// ==================== CONSTANTS ====================

const SDR_TARGETS = {
  calls: 30,
  meetings: 4,
  followups: 10,
  messages: 20,
};

const STAGE_LABELS: Record<string, string> = {
  captura: 'Captura',
  qualificacao: 'Qualificacao',
  agendamento: 'Agendamento',
  negociacao: 'Negociacao',
  fechado: 'Fechado',
  perdido: 'Perdido',
};

const STAGE_COLORS: Record<string, string> = {
  captura: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  qualificacao: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  agendamento: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300',
  negociacao: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  fechado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300',
  perdido: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const SENTIMENT_CONFIG: Record<string, { icon: string; color: string }> = {
  positive: { icon: '\u{1F60A}', color: 'text-emerald-500' },
  neutral: { icon: '\u{1F610}', color: 'text-gray-500' },
  negative: { icon: '\u{1F61F}', color: 'text-red-500' },
};

// ==================== COMPONENT ====================

type DrillDown = 'leads' | 'meetings' | 'calls' | null;

interface Props {
  filters: DashboardFilters;
  dateRange: { from: Date; to: Date };
  teamMemberId?: string;
}

export function DashboardTabPreVendas({ filters, dateRange, teamMemberId }: Props) {
  const navigate = useNavigate();
  const fromStr = format(dateRange.from, 'yyyy-MM-dd');
  const toStr = format(dateRange.to, 'yyyy-MM-dd');
  const [drillDown, setDrillDown] = useState<DrillDown>(null);
  const [selectedCall, setSelectedCall] = useState<any>(null);

  // Data hooks
  const { data: meetings, isLoading: meetingsLoading } = useMeetingMetrics(filters);
  const { data: origins, isLoading: originsLoading } = useLeadsByOrigin(filters);
  const { data: callStats, isLoading: callsLoading } = useCallStats(fromStr, toStr, teamMemberId);
  const { data: newLeads, isLoading: newLeadsLoading } = useNewLeads(fromStr, toStr);
  const { data: scheduledMeetings } = useScheduledMeetings(fromStr, toStr, teamMemberId);
  const { data: bookedMeetings } = useBookedMeetings(fromStr, toStr, teamMemberId);

  // Lead call counts for leads drill-down
  const leadIds = useMemo(() => (newLeads || []).map(l => l.id), [newLeads]);
  const { data: leadCallCounts } = useLeadCallCounts(leadIds);

  // Calls drill-down data (only fetch when sheet is open)
  const { data: callsDrilldown, isLoading: callsDrilldownLoading } = useCallsDrilldown(
    fromStr, toStr, teamMemberId, drillDown === 'calls'
  );

  // Last calls per lead for meetings drill-down (use booked meetings = marcadas)
  const meetingLeadIds = useMemo(
    () => (bookedMeetings || []).map((m: any) => m.lead?.id || m.lead_id).filter(Boolean),
    [bookedMeetings]
  );
  const { data: meetingLastCalls } = useMeetingLeadLastCalls(meetingLeadIds, drillDown === 'meetings');

  // Calls grouped by lead for drill-down
  const callsByLead = useMemo(() => {
    if (!callsDrilldown) return [];
    const groups: Record<string, { leadId: string | null; leadName: string; calls: any[] }> = {};
    callsDrilldown.forEach((call: any) => {
      const key = call.lead_id || 'no-lead';
      if (!groups[key]) {
        groups[key] = {
          leadId: call.lead_id,
          leadName: call.lead?.name || call.peer_name || call.peer_phone || 'Desconhecido',
          calls: [],
        };
      }
      groups[key].calls.push(call);
    });
    return Object.values(groups).sort((a, b) => b.calls.length - a.calls.length);
  }, [callsDrilldown]);

  // Today activity — aggregate all rows when viewing "Todos" (no teamMemberId)
  const today = useMemo(() => new Date(), []);
  const { data: activityRows, isLoading: activityLoading } = useDailyActivitySummary(today, teamMemberId);

  const activity = useMemo(() => {
    if (!activityRows || activityRows.length === 0) return null;
    if (activityRows.length === 1) return activityRows[0];
    return activityRows.reduce(
      (acc, row) => ({
        ...acc,
        calls_made: acc.calls_made + Number(row.calls_made),
        calls_connected: acc.calls_connected + Number(row.calls_connected),
        followups_done: acc.followups_done + Number(row.followups_done),
        meetings_scheduled: acc.meetings_scheduled + Number(row.meetings_scheduled),
        meetings_done: acc.meetings_done + Number(row.meetings_done),
        proposals_sent: acc.proposals_sent + Number(row.proposals_sent),
        messages_sent: acc.messages_sent + Number(row.messages_sent),
        leads_contacted: acc.leads_contacted + Number(row.leads_contacted),
      }),
      {
        team_member_id: '', team_member_name: 'Todos',
        calls_made: 0, calls_connected: 0, calls_avg_duration_sec: 0,
        followups_done: 0, meetings_scheduled: 0, meetings_done: 0,
        proposals_sent: 0, messages_sent: 0, leads_contacted: 0,
      }
    );
  }, [activityRows]);

  // Derived
  const totalCalls = callStats?.total || 0;
  const connectedCalls = callStats?.connected || 0;
  const followupsDone = Number(activity?.followups_done || 0);
  const messagesSent = Number(activity?.messages_sent || 0);
  const newLeadsCount = newLeads?.length || 0;

  const aiMeetings = useMemo(() => {
    return meetings?.byScheduler?.filter(s => s.isAgent).reduce((sum, s) => sum + s.count, 0) || 0;
  }, [meetings?.byScheduler]);

  const kpiLoading = meetingsLoading || callsLoading || activityLoading || newLeadsLoading;

  return (
    <div className="space-y-5">
      {/* Row 1: 6 KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiLoading ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[130px] rounded-xl" />)
        ) : (
          <>
            <KPICard
              title="Reunioes Marcadas"
              value={String(meetings?.marcadas || 0)}
              subtitle={`meta: ${SDR_TARGETS.meetings}/dia`}
              icon={<CalendarCheck className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-blue-500 to-blue-700"
              progress={meetings ? (meetings.marcadas / (SDR_TARGETS.meetings * 20)) * 100 : 0}
              onClick={() => setDrillDown('meetings')}
            />
            <KPICard
              title="Ligacoes"
              value={`${totalCalls}`}
              subtitle={`${connectedCalls} atendidas`}
              icon={<Phone className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-violet-500 to-violet-700"
              onClick={() => setDrillDown('calls')}
            />
            <KPICard
              title="Leads Novos"
              value={String(newLeadsCount)}
              subtitle="criados no periodo"
              icon={<UserPlus className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-cyan-500 to-cyan-700"
              onClick={() => setDrillDown('leads')}
            />
            <KPICard
              title="Follow-ups"
              value={String(followupsDone)}
              subtitle={`meta: ${SDR_TARGETS.followups}/dia`}
              icon={<Target className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-amber-500 to-amber-700"
            />
            <KPICard
              title="Msgs Enviadas"
              value={String(messagesSent)}
              subtitle={`meta: ${SDR_TARGETS.messages}/dia`}
              icon={<MessageSquare className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-emerald-500 to-emerald-700"
            />
            <KPICard
              title="Agendados IA"
              value={String(aiMeetings)}
              subtitle="pela assistente"
              icon={<Bot className="h-5 w-5 text-white" />}
              gradient="bg-gradient-to-br from-rose-500 to-rose-700"
            />
          </>
        )}
      </div>

      {/* Row 2: Atividades Hoje + Reunioes Agendadas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Atividades hoje */}
        <Card className="lg:col-span-7 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Zap className="h-4 w-4 text-blue-500" />
              Atividades Hoje
              {!teamMemberId && activityRows && activityRows.length > 1 && (
                <Badge variant="secondary" className="text-[9px] ml-1">Todos</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {activityLoading ? (
              <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}</div>
            ) : activity ? (
              <div className="space-y-3">
                <ActivityProgressBar
                  label="Ligacoes"
                  current={Number(activity.calls_made)}
                  target={SDR_TARGETS.calls}
                  icon={<Phone className="h-3.5 w-3.5 text-blue-500" />}
                />
                <ActivityProgressBar
                  label="Reunioes agendadas"
                  current={Number(activity.meetings_scheduled)}
                  target={SDR_TARGETS.meetings}
                  icon={<CalendarCheck className="h-3.5 w-3.5 text-emerald-500" />}
                />
                <ActivityProgressBar
                  label="Follow-ups"
                  current={followupsDone}
                  target={SDR_TARGETS.followups}
                  icon={<Target className="h-3.5 w-3.5 text-amber-500" />}
                />
                <ActivityProgressBar
                  label="Mensagens enviadas"
                  current={messagesSent}
                  target={SDR_TARGETS.messages}
                  icon={<MessageSquare className="h-3.5 w-3.5 text-violet-500" />}
                />
                <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Leads contatados</span>
                    <span className="font-bold text-foreground">{Number(activity.leads_contacted)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Calls conectadas</span>
                    <span className="font-bold text-foreground">{Number(activity.calls_connected)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Nenhuma atividade</div>
            )}
          </CardContent>
        </Card>

        {/* Reunioes agendadas com leads */}
        <Card className="lg:col-span-5 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-orange-500" />
                Reunioes
              </CardTitle>
              {meetings && (
                <Badge variant="outline" className={cn(
                  'text-[10px] px-1.5 py-0',
                  meetings.noShowRate < 10 ? 'border-emerald-300 text-emerald-600' :
                  meetings.noShowRate < 20 ? 'border-amber-300 text-amber-600' :
                  'border-red-300 text-red-600'
                )}>
                  No-show: {formatPercent(meetings.noShowRate)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {meetingsLoading ? (
              <Skeleton className="h-[100px]" />
            ) : meetings ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                  <div className="rounded-lg bg-purple-50 dark:bg-purple-950/30 p-2 text-center">
                    <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{meetings.marcadas}</p>
                    <p className="text-[8px] text-purple-500/70">Marcadas</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 p-2 text-center">
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{meetings.agendadas}</p>
                    <p className="text-[8px] text-blue-500/70">Agendadas</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 p-2 text-center">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{meetings.realized}</p>
                    <p className="text-[8px] text-emerald-500/70">Realizadas</p>
                  </div>
                  <div className="rounded-lg bg-red-50 dark:bg-red-950/30 p-2 text-center">
                    <p className="text-lg font-bold text-red-600 dark:text-red-400">{meetings.noShow}</p>
                    <p className="text-[8px] text-red-500/70">No-show</p>
                  </div>
                </div>
                {/* Lista de reunioes agendadas com nome do lead */}
                {scheduledMeetings && scheduledMeetings.length > 0 && (
                  <div className="space-y-1 pt-1 border-t">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Agendadas</p>
                    {scheduledMeetings.slice(0, 5).map((m: any) => {
                      const leadName = m.lead?.name || 'Lead';
                      const leadId = m.lead?.id || m.lead_id;
                      const time = m.scheduled_at ? format(new Date(m.scheduled_at), 'HH:mm') : '';
                      const isNoShow = m.status === 'no_show';
                      const isDone = m.status === 'completed';
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40 cursor-pointer group"
                          onClick={() => navigate(`/comercial/leads/${leadId}`)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="text-xs font-medium truncate">{leadName}</span>
                            {isNoShow && <Badge variant="destructive" className="text-[8px] px-1 py-0">no-show</Badge>}
                            {isDone && <Badge className="text-[8px] px-1 py-0 bg-emerald-500">feita</Badge>}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[11px] font-mono text-muted-foreground">{time}</span>
                            <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        </div>
                      );
                    })}
                    {scheduledMeetings.length > 5 && (
                      <button
                        className="text-[10px] text-blue-500 hover:underline pl-2"
                        onClick={() => setDrillDown('meetings')}
                      >
                        Ver todas ({scheduledMeetings.length})
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Agendamentos por Pessoa + Leads por Origem */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Agendamentos por pessoa */}
        <Card className="lg:col-span-6 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarCheck className="h-4 w-4 text-violet-500" />
                Agendamentos por Pessoa
              </CardTitle>
              {meetings?.byScheduler && meetings.byScheduler.length > 0 && (
                <Badge variant="secondary" className="text-xs font-bold">
                  {meetings.byScheduler.reduce((s, b) => s + b.count, 0)} total
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {meetingsLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-7" />)}</div>
            ) : meetings?.byScheduler && meetings.byScheduler.length > 0 ? (
              <div className="space-y-1">
                {meetings.byScheduler.map((scheduler) => (
                  <div key={scheduler.name} className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-muted/40">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={cn(
                        'h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                        scheduler.isAgent ? 'bg-gradient-to-br from-rose-500 to-rose-600' : 'bg-gradient-to-br from-blue-500 to-blue-600'
                      )}>
                        {scheduler.isAgent ? <Bot className="h-3.5 w-3.5" /> : scheduler.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-xs font-medium truncate">{scheduler.name}</span>
                      {scheduler.isAgent && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-rose-300 text-rose-500 shrink-0">IA</Badge>
                      )}
                    </div>
                    <span className="text-sm font-bold tabular-nums shrink-0 ml-2">{scheduler.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Sem agendamentos</div>
            )}
          </CardContent>
        </Card>

        {/* Leads por origem */}
        <Card className="lg:col-span-6 border shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500" />
                Leads por Origem
              </CardTitle>
              {origins && origins.total > 0 && (
                <Badge variant="secondary" className="text-xs font-bold">{origins.total} total</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4 pt-0">
            {originsLoading ? (
              <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6" />)}</div>
            ) : origins && origins.origins.length > 0 ? (
              <div className="space-y-2">
                {origins.origins.slice(0, 8).map((origin, i) => {
                  const colors = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
                  const color = colors[i % colors.length];
                  return (
                    <div key={origin.source} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-medium text-foreground truncate">{origin.source}</span>
                        <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{origin.count} ({formatPercent(origin.percent)})</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${origin.percent}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="h-[100px] flex items-center justify-center text-muted-foreground text-sm">Sem leads</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ==================== DRILL-DOWN SHEETS ==================== */}

      {/* Leads Novos - Rich */}
      <Sheet open={drillDown === 'leads'} onOpenChange={(open) => !open && setDrillDown(null)}>
        <SheetContent className="w-[440px] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-cyan-500" />
              Leads Novos ({newLeadsCount})
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-1 pr-4">
              {newLeads?.map((lead: any) => {
                const callCount = leadCallCounts?.[lead.id] || 0;
                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/60 cursor-pointer group border border-transparent hover:border-border transition-colors"
                    onClick={() => { setDrillDown(null); navigate(`/comercial/leads/${lead.id}`); }}
                  >
                    <div className="shrink-0">
                      <LeadScoreBadge score={lead.sales_score || 0} size="sm" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{lead.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        {lead.company && (
                          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                            <Building2 className="h-2.5 w-2.5" />
                            {lead.company}
                          </span>
                        )}
                        {lead.sales_stage && (
                          <Badge variant="secondary" className={cn('text-[9px] px-1 py-0', STAGE_COLORS[lead.sales_stage])}>
                            {STAGE_LABELS[lead.sales_stage] || lead.sales_stage}
                          </Badge>
                        )}
                        {lead.utm_source && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{lead.utm_source}</Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0 ml-1">
                      <span className="text-[10px] text-muted-foreground">{format(new Date(lead.created_at), 'dd/MM HH:mm')}</span>
                      <div className="flex items-center gap-1.5">
                        {callCount > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-violet-500 font-medium">
                            <Phone className="h-2.5 w-2.5" />
                            {callCount}
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                );
              })}
              {(!newLeads || newLeads.length === 0) && (
                <div className="py-8 text-center text-muted-foreground text-sm">Nenhum lead novo no periodo</div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Ligacoes - Rich */}
      <Sheet open={drillDown === 'calls'} onOpenChange={(open) => !open && setDrillDown(null)}>
        <SheetContent className="w-[440px] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-violet-500" />
              Ligacoes ({callsDrilldown?.length || totalCalls})
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-4 pr-4">
              {callsDrilldownLoading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>
              ) : callsByLead.length > 0 ? (
                callsByLead.map((group) => (
                  <div key={group.leadId || 'no-lead'}>
                    {/* Lead header */}
                    <div
                      className={cn(
                        'flex items-center justify-between px-2 py-1.5 rounded-md mb-1',
                        group.leadId ? 'hover:bg-muted/40 cursor-pointer' : ''
                      )}
                      onClick={() => {
                        if (group.leadId) {
                          setDrillDown(null);
                          navigate(`/comercial/leads/${group.leadId}`);
                        }
                      }}
                    >
                      <span className="text-xs font-semibold text-foreground truncate">{group.leadName}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                          {group.calls.length} {group.calls.length === 1 ? 'ligacao' : 'ligacoes'}
                        </Badge>
                        {group.leadId && (
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    {/* Call items */}
                    <div className="space-y-0.5 ml-1 border-l-2 border-muted pl-3">
                      {group.calls.map((call: any) => {
                        const isConnected = call.status === 'ENDED' && (call.duration_seconds || 0) > 0;
                        const isMissed = call.status === 'MISSED' || call.status === 'FAILED' || (!isConnected && call.status !== 'ENDED');
                        const sentiment = call.ai_sentiment ? SENTIMENT_CONFIG[call.ai_sentiment] : null;

                        return (
                          <div
                            key={call.id}
                            className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/60 cursor-pointer group border border-transparent hover:border-border transition-colors"
                            onClick={() => setSelectedCall(call)}
                          >
                            <div className="shrink-0">
                              {call.direction === 'INCOMING' ? (
                                <PhoneIncoming className={cn('h-3.5 w-3.5', isConnected ? 'text-blue-500' : 'text-red-400')} />
                              ) : isMissed ? (
                                <PhoneMissed className="h-3.5 w-3.5 text-red-400" />
                              ) : (
                                <PhoneOutgoing className={cn('h-3.5 w-3.5', isConnected ? 'text-emerald-500' : 'text-muted-foreground')} />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[11px] font-mono text-muted-foreground">
                                  {format(new Date(call.started_at), 'dd/MM HH:mm')}
                                </span>
                                {isConnected && (
                                  <span className="text-[11px] font-medium tabular-nums">
                                    {formatDuration(call.duration_seconds)}
                                  </span>
                                )}
                                {isMissed && (
                                  <Badge variant="destructive" className="text-[8px] px-1 py-0">perdida</Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {call.record_url && (
                                <Mic className="h-3 w-3 text-violet-400" title="Gravacao" />
                              )}
                              {call.ai_summary && (
                                <Brain className="h-3 w-3 text-blue-400" title="Analise IA" />
                              )}
                              {sentiment && (
                                <span className={cn('text-xs', sentiment.color)} title={`Sentimento: ${call.ai_sentiment}`}>
                                  {sentiment.icon}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma ligacao no periodo</div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Reunioes Marcadas - Rich (criadas no período) */}
      <Sheet open={drillDown === 'meetings'} onOpenChange={(open) => !open && setDrillDown(null)}>
        <SheetContent className="w-[440px] sm:w-[520px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <CalendarCheck className="h-5 w-5 text-blue-500" />
              Reunioes Marcadas ({bookedMeetings?.length || 0})
            </SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-120px)] mt-4">
            <div className="space-y-1 pr-4">
              {bookedMeetings?.map((m: any) => {
                const leadName = m.lead?.name || 'Lead';
                const leadId = m.lead?.id || m.lead_id;
                const leadScore = m.lead?.sales_score || 0;
                const time = m.scheduled_at ? format(new Date(m.scheduled_at), 'dd/MM HH:mm') : '';
                const isNoShow = m.status === 'no_show';
                const isDone = m.status === 'completed';
                const lastCall = meetingLastCalls?.[leadId];
                const lastCallSentiment = lastCall?.ai_sentiment ? SENTIMENT_CONFIG[lastCall.ai_sentiment] : null;

                return (
                  <div
                    key={m.id}
                    className="rounded-lg px-3 py-2.5 hover:bg-muted/60 cursor-pointer group border border-transparent hover:border-border transition-colors"
                    onClick={() => { setDrillDown(null); navigate(`/comercial/leads/${leadId}`); }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        {leadScore > 0 && <LeadScoreBadge score={leadScore} size="sm" />}
                        <span className="text-sm font-medium truncate">{leadName}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{time}</span>
                        <ExternalLink className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10px] text-muted-foreground truncate">{m.title || 'Reuniao'}</span>
                      {isNoShow && <Badge variant="destructive" className="text-[9px] px-1 py-0">no-show</Badge>}
                      {isDone && <Badge className="text-[9px] px-1 py-0 bg-emerald-500">realizada</Badge>}
                    </div>
                    {/* Last call info */}
                    {lastCall && (
                      <div className="flex items-center gap-2 mt-1.5 pt-1.5 border-t border-dashed border-muted">
                        <Phone className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                        <span className="text-[10px] text-muted-foreground">
                          Ultima ligacao: {formatDuration(lastCall.duration_seconds || 0)}
                        </span>
                        {lastCall.record_url && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 px-1 text-[9px] text-violet-500 hover:text-violet-700"
                            onClick={(e) => { e.stopPropagation(); setSelectedCall(lastCall); }}
                          >
                            <Play className="h-2.5 w-2.5 mr-0.5" />
                            gravacao
                          </Button>
                        )}
                        {lastCallSentiment && (
                          <span className={cn('text-xs', lastCallSentiment.color)}>
                            {lastCallSentiment.icon}
                          </span>
                        )}
                        {lastCall.ai_summary && (
                          <Brain className="h-2.5 w-2.5 text-blue-400" title="Tem analise IA" />
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {(!bookedMeetings || bookedMeetings.length === 0) && (
                <div className="py-8 text-center text-muted-foreground text-sm">Nenhuma reuniao marcada no periodo</div>
              )}
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Call Detail Modal */}
      {selectedCall && (
        <CallDetailModal
          open={!!selectedCall}
          onOpenChange={(open) => !open && setSelectedCall(null)}
          call={selectedCall}
        />
      )}
    </div>
  );
}
