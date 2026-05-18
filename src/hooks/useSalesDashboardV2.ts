import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useDemoMode } from '@/contexts/DemoModeContext';
import {
  startOfDay, endOfDay, subDays, startOfMonth, endOfMonth,
  subMonths, eachDayOfInterval, format, startOfWeek, endOfWeek,
} from 'date-fns';

// ==================== TYPES ====================

export interface DateRange {
  from: Date;
  to: Date;
}

export interface DashboardFilters {
  dateRange: DateRange;
  salesRepId?: string;
  pipelineId?: string;
}

export interface RevenueKPI {
  revenue: number;
  goal: number;
  remaining: number;
  goalPercent: number;
  dealCount: number;
  avgTicket: number;
  prevRevenue: number;
  revenueChange: number; // % change vs previous period
  sparkline: number[]; // last 7 days
}

export interface DailySales {
  date: string; // YYYY-MM-DD
  label: string; // "01 Jan"
  revenue: number;
  accumulated: number;
  goalLine: number; // accumulated proportional daily goal
  deals: number;
}

export interface PaymentBreakdown {
  type: string;
  label: string;
  value: number;
  count: number;
  percent: number;
  color: string;
}

export interface FunnelStage {
  name: string;
  stageId: string;
  color: string;
  count: number;
  value: number;
  isWon: boolean;
  isLost: boolean;
  conversionFromPrev: number; // %
  dropoff: number; // % lost from previous
}

export interface LeadOriginResult {
  total: number;
  origins: LeadOrigin[];
}

export interface LeadOrigin {
  source: string;
  count: number;
  percent: number;
}

export interface MeetingMetrics {
  marcadas: number;    // meetings CREATED in period (someone booked a meeting on this day)
  agendadas: number;   // meetings SCHEDULED FOR this period (supposed to happen this day)
  realized: number;    // meetings that STARTED in period (actually happened)
  noShow: number;      // meetings scheduled for period with status no_show
  noShowRate: number;
  byScheduler: { name: string; count: number; isAgent: boolean }[];
}

export interface RecentSale {
  id: string;
  leadId: string | null;
  dealTitle: string;
  leadName: string;
  leadCompany: string | null;
  leadAvatar: string | null;
  productName: string;
  productId: string | null;
  value: number;
  paymentMethod: string;
  salesRepName: string;
  salesRepAvatar: string | null;
  wonAt: string;
}

export interface SellerRanking {
  id: string;
  name: string;
  avatarUrl: string | null;
  dealsWon: number;
  revenue: number;
  avgTicket: number;
  conversionRate: number;
  totalDeals: number;
}

export interface SalesGoal {
  id: string;
  teamMemberId: string | null;
  periodStart: string;
  periodEnd: string;
  targetRevenue: number;
  targetDeals: number;
}

// ==================== HELPERS ====================

const PAYMENT_LABELS: Record<string, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  credit_card: 'Cartão de Crédito',
  credit_card_no_anticipation: 'Cartão (s/ antecipação)',
  credit_card_recurring: 'Cartão Recorrente',
  manual: 'Manual',
  other: 'Outros',
};

const PAYMENT_COLORS: Record<string, string> = {
  pix: '#22c55e',
  boleto: '#f59e0b',
  credit_card: '#6366f1',
  credit_card_no_anticipation: '#8b5cf6',
  credit_card_recurring: '#3b82f6',
  manual: '#94a3b8',
  other: '#64748b',
};

function getPrevPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const diff = to.getTime() - from.getTime();
  return {
    from: new Date(from.getTime() - diff),
    to: new Date(from.getTime() - 1),
  };
}

// ==================== DATE RANGE PRESETS ====================

export type DatePreset = 'today' | 'yesterday' | 'this_week' | 'last7' | 'last30' | 'this_month' | 'last_month' | 'custom';

export function getDateRange(preset: DatePreset): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y) };
    }
    case 'this_week': {
      const monday = startOfWeek(now, { weekStartsOn: 1 });
      const saturday = new Date(monday);
      saturday.setDate(monday.getDate() + 5);
      return { from: startOfDay(monday), to: endOfDay(saturday > now ? now : saturday) };
    }
    case 'last7':
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case 'last30':
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now) };
    case 'this_month':
      return { from: startOfMonth(now), to: endOfDay(now) };
    case 'last_month': {
      const lm = subMonths(now, 1);
      return { from: startOfMonth(lm), to: endOfMonth(lm) };
    }
    default:
      return { from: startOfMonth(now), to: endOfDay(now) };
  }
}

// ==================== HOOKS ====================

/**
 * Main Revenue KPIs: Faturado, Meta, Falta, Ticket Médio
 * Uses the date filter from the dashboard
 */
export function useRevenueKPIs(filters: DashboardFilters) {
  const { from: filterFrom, to: filterTo } = filters.dateRange;
  const { isDemoMode } = useDemoMode();

  return useQuery({
    queryKey: ['dashboard-v2-revenue', filterFrom.toISOString(), filterTo.toISOString(), filters.salesRepId, isDemoMode],
    queryFn: async (): Promise<RevenueKPI> => {
      const from = startOfDay(filterFrom);
      const to = endOfDay(filterTo);

      // Get won pipeline stages
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = stages?.filter(s => s.is_won).map(s => s.id) || [];

      // Get all deals
      const { data: allDeals } = await (supabase
        .from('deals' as any)
        .select('id, negotiated_price, won_at, pipeline_stage_id, status, sales_rep_id') as any);

      // Filter won deals in CURRENT MONTH
      const wonDeals = (allDeals || []).filter((d: any) => {
        const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
        if (!isWon || !d.won_at) return false;
        const wonDate = new Date(d.won_at);
        if (wonDate < from || wonDate > to) return false;
        if (filters.salesRepId && d.sales_rep_id !== filters.salesRepId) return false;
        return true;
      });

      const revenue = wonDeals.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);
      const dealCount = wonDeals.length;
      const avgTicket = dealCount > 0 ? revenue / dealCount : 0;

      // Get goal for the selected month
      const monthStartStr = format(startOfMonth(from), 'yyyy-MM-dd');
      let goalQuery = supabase
        .from('sales_goals')
        .select('target_revenue')
        .eq('period_start', monthStartStr);

      if (filters.salesRepId) {
        goalQuery = goalQuery.eq('team_member_id', filters.salesRepId);
      } else {
        goalQuery = goalQuery.is('team_member_id', null);
      }

      const { data: goalData } = await goalQuery.limit(1).maybeSingle();
      const goal = goalData?.target_revenue || 0;
      const remaining = Math.max(0, goal - revenue);
      const goalPercent = goal > 0 ? Math.min(100, (revenue / goal) * 100) : 0;

      // Previous period comparison (same number of elapsed days)
      const prevMonthStart = startOfMonth(subMonths(from, 1));
      const daysElapsed = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
      const prevMonthEnd = endOfDay(new Date(prevMonthStart.getTime() + (daysElapsed - 1) * 24 * 60 * 60 * 1000));

      const prevWonDeals = (allDeals || []).filter((d: any) => {
        const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
        if (!isWon || !d.won_at) return false;
        const wonDate = new Date(d.won_at);
        if (wonDate < prevMonthStart || wonDate > prevMonthEnd) return false;
        if (filters.salesRepId && d.sales_rep_id !== filters.salesRepId) return false;
        return true;
      });
      const prevRevenue = prevWonDeals.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);
      const revenueChange = prevRevenue > 0 ? ((revenue - prevRevenue) / prevRevenue) * 100 : 0;

      // Sparkline: last 7 days revenue
      const sparkDays = eachDayOfInterval({ start: subDays(to, 6), end: to });
      const sparkline = sparkDays.map(day => {
        const dayStart = startOfDay(day);
        const dayEnd = endOfDay(day);
        return (allDeals || [])
          .filter((d: any) => {
            const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
            if (!isWon || !d.won_at) return false;
            const wonDate = new Date(d.won_at);
            if (wonDate < dayStart || wonDate > dayEnd) return false;
            if (filters.salesRepId && d.sales_rep_id !== filters.salesRepId) return false;
            return true;
          })
          .reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);
      });

      return { revenue, goal, remaining, goalPercent, dealCount, avgTicket, prevRevenue, revenueChange, sparkline };
    },
    staleTime: 60000,
    // Demo mode multiplier is applied in dashboard components (shared.tsx), NOT here
  });
}

/**
 * Daily sales evolution — uses the date filter from the dashboard
 */
export function useSalesEvolution(filters: DashboardFilters) {
  const { from: filterFrom, to: filterTo } = filters.dateRange;
  const { isDemoMode } = useDemoMode();

  return useQuery({
    queryKey: ['dashboard-v2-evolution', filterFrom.toISOString(), filterTo.toISOString(), filters.salesRepId, isDemoMode],
    queryFn: async (): Promise<DailySales[]> => {
      const from = startOfDay(filterFrom);
      const to = endOfDay(filterTo);

      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = stages?.filter(s => s.is_won).map(s => s.id) || [];

      let query = supabase
        .from('deals' as any)
        .select('negotiated_price, won_at, pipeline_stage_id, status, sales_rep_id') as any;

      const { data: allDeals } = await query;

      const wonDeals = (allDeals || []).filter((d: any) => {
        const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
        if (!isWon || !d.won_at) return false;
        const wonDate = new Date(d.won_at);
        if (wonDate < from || wonDate > to) return false;
        if (filters.salesRepId && d.sales_rep_id !== filters.salesRepId) return false;
        return true;
      });

      // Get monthly goal for proportional daily goal line
      const monthStart = format(startOfMonth(from), 'yyyy-MM-dd');
      let goalQuery = supabase
        .from('sales_goals')
        .select('target_revenue')
        .eq('period_start', monthStart);

      if (filters.salesRepId) {
        goalQuery = goalQuery.eq('team_member_id', filters.salesRepId);
      } else {
        goalQuery = goalQuery.is('team_member_id', null);
      }

      const { data: goalData } = await goalQuery.limit(1).maybeSingle();
      const monthGoal = goalData?.target_revenue || 0;

      // Build daily data
      const days = eachDayOfInterval({ start: from, end: to });
      const totalDays = days.length;
      const dailyGoal = monthGoal > 0 ? monthGoal / totalDays : 0;

      let accumulated = 0;
      return days.map((day, idx) => {
        const dayStr = format(day, 'yyyy-MM-dd');
        const dayRevenue = wonDeals
          .filter((d: any) => format(new Date(d.won_at), 'yyyy-MM-dd') === dayStr)
          .reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);

        accumulated += dayRevenue;

        return {
          date: dayStr,
          label: format(day, 'dd MMM'),
          revenue: dayRevenue,
          accumulated,
          goalLine: dailyGoal * (idx + 1),
          deals: wonDeals.filter((d: any) => format(new Date(d.won_at), 'yyyy-MM-dd') === dayStr).length,
        };
      });
    },
    staleTime: 60000,
    // Demo multiplier applied in components
  });
}

/**
 * Sales by payment method (from deal_payments)
 */
export function usePaymentBreakdown(filters: DashboardFilters) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['dashboard-v2-payments', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId, isDemoMode],
    queryFn: async (): Promise<PaymentBreakdown[]> => {
      const { from, to } = filters.dateRange;

      // Get won deals in period
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = stages?.filter(s => s.is_won).map(s => s.id) || [];

      let dealsQuery = supabase
        .from('deals' as any)
        .select('id, won_at, pipeline_stage_id, status, sales_rep_id, payment_method') as any;

      const { data: allDeals } = await dealsQuery;
      const wonDealIds = (allDeals || [])
        .filter((d: any) => {
          const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
          if (!isWon || !d.won_at) return false;
          const wonDate = new Date(d.won_at);
          if (wonDate < from || wonDate > to) return false;
          if (filters.salesRepId && d.sales_rep_id !== filters.salesRepId) return false;
          return true;
        })
        .map((d: any) => d.id);

      if (wonDealIds.length === 0) return [];

      // Get deal_payments for these deals
      const { data: payments } = await supabase
        .from('deal_payments')
        .select('deal_id, billing_type, amount')
        .in('deal_id', wonDealIds);

      // Group by billing_type
      const byType: Record<string, { value: number; count: number }> = {};
      let total = 0;

      // First check deal_payments
      if (payments && payments.length > 0) {
        for (const p of payments) {
          const type = p.billing_type || 'other';
          if (!byType[type]) byType[type] = { value: 0, count: 0 };
          byType[type].value += Number(p.amount) || 0;
          byType[type].count++;
          total += Number(p.amount) || 0;
        }
      } else {
        // Fallback: use payment_method from deals
        const wonDeals = (allDeals || []).filter((d: any) => wonDealIds.includes(d.id));
        for (const d of wonDeals) {
          const type = d.payment_method || 'other';
          if (!byType[type]) byType[type] = { value: 0, count: 0 };
          byType[type].value += Number(d.negotiated_price) || 0;
          byType[type].count++;
          total += Number(d.negotiated_price) || 0;
        }
      }

      return Object.entries(byType)
        .map(([type, data]) => ({
          type,
          label: PAYMENT_LABELS[type] || type,
          value: data.value,
          count: data.count,
          percent: total > 0 ? (data.value / total) * 100 : 0,
          color: PAYMENT_COLORS[type] || '#64748b',
        }))
        .sort((a, b) => b.value - a.value);
    },
    staleTime: 60000,
    // Demo multiplier applied in components
  });
}

/**
 * Conversion funnel with drop-off analysis — filterable by pipeline
 */
export function useConversionFunnelV2(filters: DashboardFilters, pipelineId?: string) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['dashboard-v2-funnel', filters.salesRepId, pipelineId, isDemoMode],
    queryFn: async (): Promise<FunnelStage[]> => {
      let stagesQuery = supabase
        .from('sales_pipeline_stages')
        .select('id, name, position, color, is_won, is_lost')
        .order('position', { ascending: true });

      if (pipelineId) {
        stagesQuery = stagesQuery.eq('pipeline_id', pipelineId);
      }

      const { data: stages } = await stagesQuery;

      let dealsQuery = supabase
        .from('deals' as any)
        .select('id, pipeline_stage_id, negotiated_price, sales_rep_id') as any;

      if (filters.salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: deals } = await dealsQuery;

      const countByStage = new Map<string, { count: number; value: number }>();
      (deals || []).forEach((d: any) => {
        if (!d.pipeline_stage_id) return;
        const existing = countByStage.get(d.pipeline_stage_id) || { count: 0, value: 0 };
        existing.count++;
        existing.value += Number(d.negotiated_price) || 0;
        countByStage.set(d.pipeline_stage_id, existing);
      });

      const funnel = (stages || []).map((stage, idx) => {
        const data = countByStage.get(stage.id) || { count: 0, value: 0 };
        const prevCount = idx > 0
          ? (countByStage.get(stages![idx - 1].id) || { count: 0 }).count
          : data.count;
        const conversionFromPrev = idx > 0 && prevCount > 0 ? Math.round((data.count / prevCount) * 100) : 100;
        const dropoff = idx > 0 && prevCount > 0 ? Math.round(((prevCount - data.count) / prevCount) * 100) : 0;

        return {
          name: stage.name,
          stageId: stage.id,
          color: stage.color || '#6366f1',
          count: data.count,
          value: data.value,
          isWon: stage.is_won,
          isLost: stage.is_lost,
          conversionFromPrev,
          dropoff,
        };
      });

      return funnel;
    },
    staleTime: 60000,
    // Demo multiplier applied in components
  });
}

/**
 * Leads by origin (utm_source) — returns total + breakdown
 */
export function useLeadsByOrigin(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-v2-origins', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId],
    queryFn: async (): Promise<LeadOriginResult> => {
      const { from, to } = filters.dateRange;

      // Get deals created in period — this is the base filter
      let dealsQuery = supabase
        .from('deals' as any)
        .select('lead_id, sales_rep_id, created_at') as any;

      dealsQuery = dealsQuery
        .not('lead_id', 'is', null)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString());

      if (filters.salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: deals } = await dealsQuery;
      if (!deals || deals.length === 0) return { total: 0, origins: [] };

      // Unique lead IDs from deals created in period
      const leadIds = [...new Set((deals as any[]).map(d => d.lead_id).filter(Boolean))] as string[];
      if (leadIds.length === 0) return { total: 0, origins: [] };

      // Fetch lead info (utm_source) for these leads
      const { data: leads } = await supabase
        .from('leads')
        .select('id, utm_source')
        .in('id', leadIds);

      if (!leads || leads.length === 0) return { total: 0, origins: [] };

      const bySource: Record<string, number> = {};
      leads.forEach(l => {
        const src = l.utm_source || 'Direto / Orgânico';
        bySource[src] = (bySource[src] || 0) + 1;
      });

      const total = leads.length;
      const origins = Object.entries(bySource)
        .map(([source, count]) => ({
          source,
          count,
          percent: (count / total) * 100,
        }))
        .sort((a, b) => b.count - a.count);

      return { total, origins };
    },
    staleTime: 60000,
  });
}

/**
 * Meeting metrics — all from meetings table (only with lead_id = sales meetings)
 * Marcadas = created_at in period (someone booked a meeting on this day)
 * Agendadas = company_activities.scheduled_at in period via activity_id (supposed to happen this day)
 * Realizadas = started_at in period (actually happened this day)
 * No-show = scheduled for period + status no_show
 *
 * NOTE: meetings table does NOT have scheduled_at. The scheduled date lives in
 * company_activities.scheduled_at, linked via meetings.activity_id.
 */
export function useMeetingMetrics(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-v2-meetings', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId],
    queryFn: async (): Promise<MeetingMetrics> => {
      const { from, to } = filters.dateRange;
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const repFilter = filters.salesRepId || null;

      // Get sales team member IDs (comercial + admin roles) — meetings.team field is unreliable
      const { data: salesMembers } = await supabase
        .from('team_members')
        .select('id, name, role')
        .eq('is_active', true)
        .in('role', ['comercial', 'admin']);
      const salesMemberIds = (salesMembers || []).map(m => m.id);
      const membersMap = new Map((salesMembers || []).map(m => [m.id, m.name]));

      if (salesMemberIds.length === 0) {
        return { marcadas: 0, agendadas: 0, realized: 0, noShow: 0, noShowRate: 0, byScheduler: [] };
      }

      // Filter by created_by IN salesMemberIds (or specific rep)
      const filterIds = repFilter ? [repFilter] : salesMemberIds;

      // Marcadas: meetings created in period by sales team members
      // Uses company_activities because meetings table only has records for started meetings
      // Only task_type='meeting' — calls are tracked separately
      const marcadasQ = supabase
        .from('company_activities')
        .select('id, responsavel_id')
        .eq('task_type', 'meeting')
        .not('lead_id', 'is', null)
        .in('responsavel_id', filterIds)
        .gte('created_at', fromISO)
        .lte('created_at', toISO);

      // Agendadas: meetings with scheduled_at in period by sales team members
      const agendadasActivityQ = supabase
        .from('company_activities')
        .select('id, scheduled_at, responsavel_id, status')
        .not('lead_id', 'is', null)
        .gte('scheduled_at', fromISO)
        .lte('scheduled_at', toISO)
        .eq('task_type', 'meeting')
        .in('responsavel_id', filterIds);

      // Realizadas: meetings that started in period by sales team members
      const realizadasQ = supabase
        .from('meetings')
        .select('id, created_by')
        .not('lead_id', 'is', null)
        .in('created_by', filterIds)
        .not('started_at', 'is', null)
        .eq('status', 'completed')
        .gte('started_at', fromISO)
        .lte('started_at', toISO);

      const [marcadasRes, agendadasActRes, realizadasRes] = await Promise.all([
        marcadasQ,
        agendadasActivityQ,
        realizadasQ,
      ]);

      const marcadasData = marcadasRes.data || [];
      const realizadasData = realizadasRes.data || [];

      // Agendadas: count directly from company_activities (not all have a meetings record)
      const agendadasData = agendadasActRes.data || [];
      const agendadas = agendadasData.length;
      const noShow = agendadasData.filter((a: any) => a.status === 'no_show').length;

      const marcadas = marcadasData.length;
      const realized = realizadasData.length;
      const noShowRate = agendadas > 0 ? (noShow / agendadas) * 100 : 0;

      // Who booked meetings (based on marcadas — from company_activities)
      const schedulerCounts: Record<string, { count: number; isAgent: boolean }> = {};
      for (const m of marcadasData) {
        const repName = m.responsavel_id ? (membersMap.get(m.responsavel_id) || 'Vendedor') : 'Sistema';
        if (!schedulerCounts[repName]) schedulerCounts[repName] = { count: 0, isAgent: false };
        schedulerCounts[repName].count++;
      }

      const byScheduler = Object.entries(schedulerCounts)
        .map(([name, data]) => ({ name, count: data.count, isAgent: data.isAgent }))
        .sort((a, b) => b.count - a.count);

      return { marcadas, agendadas, realized, noShow, noShowRate, byScheduler };
    },
    staleTime: 60000,
  });
}

/**
 * Recent sales — ATEMPORAL (always shows latest won deals, no date filter)
 */
export function useRecentSales(limit = 10) {
  const { isDemoMode } = useDemoMode();
  return useQuery({
    queryKey: ['dashboard-v2-recent-sales', limit, isDemoMode],
    queryFn: async (): Promise<RecentSale[]> => {
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = stages?.filter(s => s.is_won).map(s => s.id) || [];

      if (wonStageIds.length === 0) return [];

      // Fetch most recent won deals directly with order + limit
      const { data: wonDeals } = await (supabase
        .from('deals' as any)
        .select('id, title, negotiated_price, won_at, payment_method, lead_id, product_id, sales_rep_id, pipeline_stage_id, status')
        .or(`status.eq.won,pipeline_stage_id.in.(${wonStageIds.join(',')})`)
        .not('won_at', 'is', null)
        .order('won_at', { ascending: false })
        .limit(limit) as any);

      if (!wonDeals || wonDeals.length === 0) return [];

      // Batch fetch related data
      const leadIds = [...new Set(wonDeals.map((d: any) => d.lead_id).filter(Boolean))];
      const productIds = [...new Set(wonDeals.map((d: any) => d.product_id).filter(Boolean))];
      const repIds = [...new Set(wonDeals.map((d: any) => d.sales_rep_id).filter(Boolean))];
      const dealIds = wonDeals.map((d: any) => d.id);

      const [leadsRes, productsRes, repsRes, paymentsRes] = await Promise.all([
        leadIds.length > 0
          ? supabase.from('leads').select('id, name, company_name, photo_url').in('id', leadIds)
          : { data: [] },
        productIds.length > 0
          ? supabase.from('products').select('id, name').in('id', productIds)
          : { data: [] },
        repIds.length > 0
          ? supabase.from('team_members').select('id, name, avatar_url').in('id', repIds)
          : { data: [] },
        dealIds.length > 0
          ? supabase.from('deal_payments').select('deal_id, billing_type').in('deal_id', dealIds)
          : { data: [] },
      ]);

      const leadsMap = new Map((leadsRes.data || []).map(l => [l.id, l]));
      const productsMap = new Map((productsRes.data || []).map(p => [p.id, p]));
      const repsMap = new Map((repsRes.data || []).map(r => [r.id, r]));
      const paymentsMap = new Map<string, string>();
      (paymentsRes.data || []).forEach((p: any) => {
        if (!paymentsMap.has(p.deal_id)) paymentsMap.set(p.deal_id, p.billing_type);
      });

      return wonDeals.map((deal: any) => {
        const lead = leadsMap.get(deal.lead_id);
        const product = productsMap.get(deal.product_id);
        const rep = repsMap.get(deal.sales_rep_id);
        const paymentType = paymentsMap.get(deal.id) || deal.payment_method || 'manual';

        return {
          id: deal.id,
          leadId: deal.lead_id || null,
          dealTitle: deal.title || 'Deal',
          leadName: lead?.name || 'Lead',
          leadCompany: lead?.company_name || null,
          leadAvatar: lead?.photo_url || null,
          productName: product?.name || '-',
          productId: deal.product_id || null,
          value: Number(deal.negotiated_price) || 0,
          paymentMethod: PAYMENT_LABELS[paymentType] || paymentType,
          salesRepName: rep?.name || 'Vendedor',
          salesRepAvatar: rep?.avatar_url || null,
          wonAt: deal.won_at,
        };
      });
    },
    staleTime: 60000,
    // Demo multiplier applied in components
  });
}

/**
 * Seller ranking — uses the date filter from the dashboard
 */
export function useSellerRanking(filters: DashboardFilters) {
  const { from: filterFrom, to: filterTo } = filters.dateRange;
  const { isDemoMode } = useDemoMode();

  return useQuery({
    queryKey: ['dashboard-v2-ranking', filterFrom.toISOString(), filterTo.toISOString(), isDemoMode],
    queryFn: async (): Promise<SellerRanking[]> => {
      const from = startOfDay(filterFrom);
      const to = endOfDay(filterTo);

      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = stages?.filter(s => s.is_won).map(s => s.id) || [];

      const { data: allDeals } = await (supabase
        .from('deals' as any)
        .select('id, negotiated_price, won_at, pipeline_stage_id, status, sales_rep_id, created_at') as any);

      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('id, name, avatar_url')
        .eq('is_active', true)
        .eq('team', 'comercial');

      const membersMap = new Map((teamMembers || []).map(m => [m.id, m]));

      // Group deals by sales_rep
      const byRep: Record<string, { won: number; wonValue: number; total: number }> = {};

      (allDeals || []).forEach((d: any) => {
        if (!d.sales_rep_id) return;
        const createdDate = new Date(d.created_at);
        // Count total deals created in period
        if (createdDate >= from && createdDate <= to) {
          if (!byRep[d.sales_rep_id]) byRep[d.sales_rep_id] = { won: 0, wonValue: 0, total: 0 };
          byRep[d.sales_rep_id].total++;
        }

        // Count won deals in period
        const isWon = d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id);
        if (isWon && d.won_at) {
          const wonDate = new Date(d.won_at);
          if (wonDate >= from && wonDate <= to) {
            if (!byRep[d.sales_rep_id]) byRep[d.sales_rep_id] = { won: 0, wonValue: 0, total: 0 };
            byRep[d.sales_rep_id].won++;
            byRep[d.sales_rep_id].wonValue += Number(d.negotiated_price) || 0;
          }
        }
      });

      return Object.entries(byRep)
        .map(([repId, data]) => {
          const member = membersMap.get(repId);
          return {
            id: repId,
            name: member?.name || 'Vendedor',
            avatarUrl: member?.avatar_url || null,
            dealsWon: data.won,
            revenue: data.wonValue,
            avgTicket: data.won > 0 ? data.wonValue / data.won : 0,
            conversionRate: data.total > 0 ? Math.round((data.won / data.total) * 100) : 0,
            totalDeals: data.total,
          };
        })
        .filter(r => r.revenue > 0 || r.totalDeals > 0)
        .sort((a, b) => b.revenue - a.revenue);
    },
    staleTime: 60000,
    // Demo multiplier applied in components
  });
}

// ==================== SALES GOALS CRUD ====================

export function useSalesGoals(periodStart: string) {
  return useQuery({
    queryKey: ['sales-goals', periodStart],
    queryFn: async (): Promise<SalesGoal[]> => {
      const { data, error } = await supabase
        .from('sales_goals')
        .select('*')
        .eq('period_start', periodStart);
      if (error) throw error;
      return (data || []).map(g => ({
        id: g.id,
        teamMemberId: g.team_member_id,
        periodStart: g.period_start,
        periodEnd: g.period_end,
        targetRevenue: Number(g.target_revenue),
        targetDeals: g.target_deals,
      }));
    },
  });
}

export function useUpsertSalesGoal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      teamMemberId: string | null;
      periodStart: string;
      periodEnd: string;
      targetRevenue: number;
      targetDeals: number;
      createdBy?: string;
    }) => {
      const { data, error } = await supabase
        .from('sales_goals')
        .upsert({
          team_member_id: input.teamMemberId,
          period_start: input.periodStart,
          period_end: input.periodEnd,
          target_revenue: input.targetRevenue,
          target_deals: input.targetDeals,
          created_by: input.createdBy,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'team_member_id,period_start',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-goals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-v2-revenue'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-v2-evolution'] });
    },
  });
}

// ==================== PIPELINES LIST (for funnel filter) ====================

export interface PipelineOption {
  id: string;
  name: string;
  isDefault: boolean;
}

export function usePipelinesForFilter() {
  return useQuery({
    queryKey: ['dashboard-v2-pipelines'],
    queryFn: async (): Promise<PipelineOption[]> => {
      const { data, error } = await supabase
        .from('sales_pipelines')
        .select('id, name, is_default')
        .eq('is_active', true)
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []).map(p => ({
        id: p.id,
        name: p.name,
        isDefault: p.is_default || false,
      }));
    },
    staleTime: 300000,
  });
}

// ==================== SALES FORECAST ====================

export interface SalesForecast {
  dailyVelocity: number;
  businessDaysElapsed: number;
  businessDaysRemaining: number;
  projectedRevenue: number;
  onTrack: boolean;
  daysToGoal: number | null;
  weightedPipeline: number;
  openDealsCount: number;
  avgWinProbability: number;
  avgCycleDays: number;
}

function countBusinessDays(from: Date, to: Date): number {
  let count = 0;
  const current = new Date(from);
  current.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (current <= end) {
    const day = current.getDay();
    if (day !== 0 && day !== 6) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

/**
 * Forecast: projection, weighted pipeline, cycle time
 * Receives revenue/goal from useRevenueKPIs to avoid duplicate queries
 */
export function useSalesForecast(
  filters: DashboardFilters,
  kpis: { revenue: number; goal: number } | undefined
) {
  const { from: filterFrom, to: filterTo } = filters.dateRange;
  const { isDemoMode } = useDemoMode();

  return useQuery({
    queryKey: ['dashboard-v2-forecast', filterFrom.toISOString(), filterTo.toISOString(), filters.salesRepId, isDemoMode],
    queryFn: async (): Promise<SalesForecast> => {
      const now = new Date();
      const monthStart = startOfMonth(filterFrom);
      const monthEnd = endOfMonth(filterFrom);

      const revenue = kpis?.revenue || 0;
      const goal = kpis?.goal || 0;

      // Business days
      const businessDaysElapsed = countBusinessDays(monthStart, now > filterTo ? filterTo : now);
      const businessDaysRemaining = countBusinessDays(
        now > filterTo ? filterTo : new Date(now.getTime() + 86400000),
        monthEnd
      );

      // Velocity & projection
      const dailyVelocity = businessDaysElapsed > 0 ? revenue / businessDaysElapsed : 0;
      const projectedRevenue = revenue + dailyVelocity * businessDaysRemaining;
      const onTrack = goal > 0 ? projectedRevenue >= goal : true;
      const daysToGoal = goal > 0 && dailyVelocity > 0 && revenue < goal
        ? Math.ceil((goal - revenue) / dailyVelocity)
        : null;

      // Open deals for weighted pipeline
      let dealsQuery = supabase
        .from('deals' as any)
        .select('id, negotiated_price, ai_win_probability, created_at, status') as any;

      dealsQuery = dealsQuery
        .not('status', 'in', '("won","lost")')
        .not('negotiated_price', 'is', null);

      if (filters.salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: openDeals } = await dealsQuery;
      const deals = (openDeals || []) as any[];

      const weightedPipeline = deals.reduce((sum: number, d: any) => {
        const price = Number(d.negotiated_price) || 0;
        const prob = Number(d.ai_win_probability) || 50;
        return sum + price * (prob / 100);
      }, 0);
      const openDealsCount = deals.length;
      const avgWinProbability = openDealsCount > 0
        ? deals.reduce((sum: number, d: any) => sum + (Number(d.ai_win_probability) || 50), 0) / openDealsCount
        : 0;

      // Avg cycle days (won deals in last 90 days)
      const ninetyDaysAgo = subDays(now, 90).toISOString();
      let cycleQuery = supabase
        .from('deals' as any)
        .select('created_at, won_at') as any;
      cycleQuery = cycleQuery
        .eq('status', 'won')
        .not('won_at', 'is', null)
        .gte('won_at', ninetyDaysAgo);

      if (filters.salesRepId) {
        cycleQuery = cycleQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: wonDealsForCycle } = await cycleQuery;
      const cycleDays = ((wonDealsForCycle || []) as any[])
        .map((d: any) => {
          const created = new Date(d.created_at).getTime();
          const won = new Date(d.won_at).getTime();
          return (won - created) / (1000 * 60 * 60 * 24);
        })
        .filter((days: number) => days >= 0 && days < 365);
      const avgCycleDays = cycleDays.length > 0
        ? Math.round(cycleDays.reduce((a: number, b: number) => a + b, 0) / cycleDays.length)
        : 0;

      return {
        dailyVelocity,
        businessDaysElapsed,
        businessDaysRemaining,
        projectedRevenue,
        onTrack,
        daysToGoal,
        weightedPipeline,
        openDealsCount,
        avgWinProbability,
        avgCycleDays,
      };
    },
    enabled: !!kpis,
    staleTime: 60000,
  });
}

// ==================== DETAIL LISTS FOR MODALS ====================

export interface LeadListItem {
  id: string;
  name: string;
  company: string | null;
  avatar: string | null;
  score: number;
  source: string | null;
  stageName: string | null;
  stageColor: string | null;
  createdAt: string;
}

export function useLeadsByOriginDetail(filters: DashboardFilters, source: string | null) {
  return useQuery({
    queryKey: ['dashboard-v2-leads-detail', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId, source],
    queryFn: async (): Promise<LeadListItem[]> => {
      if (!source) return [];
      const { from, to } = filters.dateRange;

      // Get deals created in period — same base as useLeadsByOrigin
      let dealsQuery = supabase
        .from('deals' as any)
        .select('lead_id, sales_rep_id, created_at') as any;

      dealsQuery = dealsQuery
        .not('lead_id', 'is', null)
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString());

      if (filters.salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: deals } = await dealsQuery;
      if (!deals || (deals as any[]).length === 0) return [];

      const dealLeadIds = [...new Set((deals as any[]).map(d => d.lead_id).filter(Boolean))] as string[];
      if (dealLeadIds.length === 0) return [];

      // Fetch leads for these deal lead_ids, filtered by source
      let query = supabase
        .from('leads')
        .select('id, name, company_name, photo_url, sales_score, utm_source, pipeline_stage_id, created_at')
        .in('id', dealLeadIds)
        .order('created_at', { ascending: false })
        .limit(100);

      if (source === 'Direto / Orgânico') {
        query = query.is('utm_source', null);
      } else {
        query = query.eq('utm_source', source);
      }

      const { data: filteredData } = await query;
      if (!filteredData || filteredData.length === 0) return [];

      // Fetch pipeline stage names
      const stageIds = [...new Set(filteredData.map(l => l.pipeline_stage_id).filter(Boolean))];
      const stagesMap = new Map<string, { name: string; color: string }>();
      if (stageIds.length > 0) {
        const { data: stages } = await supabase
          .from('sales_pipeline_stages')
          .select('id, name, color')
          .in('id', stageIds);
        (stages || []).forEach(s => stagesMap.set(s.id, { name: s.name, color: s.color || '#6366f1' }));
      }

      return filteredData.map(l => {
        const stage = l.pipeline_stage_id ? stagesMap.get(l.pipeline_stage_id) : null;
        return {
          id: l.id,
          name: l.name || 'Lead',
          company: l.company_name || null,
          avatar: l.photo_url || null,
          score: l.sales_score || 0,
          source: l.utm_source || 'Direto / Orgânico',
          stageName: stage?.name || null,
          stageColor: stage?.color || null,
          createdAt: l.created_at,
        };
      });
    },
    enabled: !!source,
    staleTime: 60000,
  });
}

export interface MeetingListItem {
  id: string;
  title: string;
  leadName: string | null;
  leadId: string | null;
  repName: string;
  scheduledAt: string;
  status: string;
  isAgent: boolean;
}

export function useMeetingsByStatus(filters: DashboardFilters, statusFilter: 'marcadas' | 'agendadas' | 'realized' | 'no_show' | null) {
  return useQuery({
    queryKey: ['dashboard-v2-meetings-detail', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId, statusFilter],
    queryFn: async (): Promise<MeetingListItem[]> => {
      if (!statusFilter) return [];
      const { from, to } = filters.dateRange;
      const fromISO = from.toISOString();
      const toISO = to.toISOString();
      const repFilter = filters.salesRepId || null;

      // Get sales team member IDs — filter by who created, not meetings.team
      const { data: salesMembers } = await supabase
        .from('team_members')
        .select('id')
        .eq('is_active', true)
        .in('role', ['comercial', 'admin']);
      const salesMemberIds = (salesMembers || []).map(m => m.id);
      if (salesMemberIds.length === 0) return [];
      const filterIds = repFilter ? [repFilter] : salesMemberIds;

      // For agendadas / no_show: based on company_activities.scheduled_at
      if (statusFilter === 'agendadas' || statusFilter === 'no_show') {
        let actQ = supabase
          .from('company_activities')
          .select('id, name, lead_id, scheduled_at, responsavel_id, status, metadata')
          .not('lead_id', 'is', null)
          .gte('scheduled_at', fromISO)
          .lte('scheduled_at', toISO)
          .eq('task_type', 'meeting')
          .in('responsavel_id', filterIds)
          .order('scheduled_at', { ascending: false })
          .limit(100);

        if (statusFilter === 'no_show') {
          actQ = actQ.eq('status', 'no_show');
        }

        const { data: activities } = await actQ;
        if (!activities || activities.length === 0) return [];

        const leadIds = [...new Set((activities as any[]).map(a => a.lead_id).filter(Boolean))];
        const repIds = [...new Set((activities as any[]).map(a => a.responsavel_id).filter(Boolean))];
        const [leadsRes, membersRes] = await Promise.all([
          leadIds.length > 0 ? supabase.from('leads').select('id, name').in('id', leadIds) : { data: [] },
          repIds.length > 0 ? supabase.from('team_members').select('id, name').in('id', repIds) : { data: [] },
        ]);
        const leadsMap = new Map((leadsRes.data || []).map(l => [l.id, l.name]));
        const membersMap = new Map((membersRes.data || []).map(m => [m.id, m.name]));

        return (activities as any[]).map(a => {
          const meta = a.metadata as any;
          const isAgent = meta?.created_by_agent === true;
          return {
            id: a.id,
            title: a.name || 'Reunião',
            leadName: a.lead_id ? (leadsMap.get(a.lead_id) || null) : null,
            leadId: a.lead_id || null,
            repName: a.responsavel_id ? (membersMap.get(a.responsavel_id) || 'Vendedor') : 'Sistema',
            scheduledAt: a.scheduled_at,
            status: statusFilter,
            isAgent,
          };
        });
      }

      if (statusFilter === 'marcadas') {
        // Marcadas: meetings from company_activities created in period
        const actQ = supabase
          .from('company_activities')
          .select('id, name, lead_id, responsavel_id, created_at, scheduled_at, metadata')
          .eq('task_type', 'meeting')
          .not('lead_id', 'is', null)
          .in('responsavel_id', filterIds)
          .gte('created_at', fromISO)
          .lte('created_at', toISO)
          .order('created_at', { ascending: false })
          .limit(100);

        const { data: tasks } = await actQ;
        if (!tasks || tasks.length === 0) return [];

        const leadIds = [...new Set(tasks.map(t => t.lead_id).filter(Boolean))];
        const repIds = [...new Set(tasks.map(t => t.responsavel_id).filter(Boolean))];
        const [leadsRes, membersRes] = await Promise.all([
          leadIds.length > 0 ? supabase.from('leads').select('id, name').in('id', leadIds) : { data: [] },
          repIds.length > 0 ? supabase.from('team_members').select('id, name').in('id', repIds) : { data: [] },
        ]);
        const leadsMap = new Map((leadsRes.data || []).map(l => [l.id, l.name]));
        const membersMap = new Map((membersRes.data || []).map(m => [m.id, m.name]));

        return tasks.map(t => {
          const meta = t.metadata as any;
          const isAgent = meta?.created_by_agent === true;
          return {
            id: t.id,
            title: t.name || 'Reunião',
            leadName: t.lead_id ? (leadsMap.get(t.lead_id) || null) : null,
            leadId: t.lead_id || null,
            repName: t.responsavel_id ? (membersMap.get(t.responsavel_id) || 'Vendedor') : 'Sistema',
            scheduledAt: t.scheduled_at || t.created_at,
            status: 'marcadas',
            isAgent,
          };
        });
      }

      // Realized: meetings that started in period (by sales team members, with lead_id)
      const query = supabase
        .from('meetings')
        .select('id, title, lead_id, created_by, created_at, status, started_at, ended_at')
        .not('lead_id', 'is', null)
        .in('created_by', filterIds)
        .not('started_at', 'is', null)
        .eq('status', 'completed')
        .gte('started_at', fromISO)
        .lte('started_at', toISO)
        .order('started_at', { ascending: false })
        .limit(100);

      const { data: meetings } = await query;
      if (!meetings || meetings.length === 0) return [];

      const leadIds = [...new Set(meetings.map(m => m.lead_id).filter(Boolean))];
      const creatorIds = [...new Set(meetings.map(m => m.created_by).filter(Boolean))];
      const [leadsRes, membersRes] = await Promise.all([
        leadIds.length > 0 ? supabase.from('leads').select('id, name').in('id', leadIds) : { data: [] },
        creatorIds.length > 0 ? supabase.from('team_members').select('id, name').in('id', creatorIds) : { data: [] },
      ]);
      const leadsMap = new Map((leadsRes.data || []).map(l => [l.id, l.name]));
      const membersMap = new Map((membersRes.data || []).map(m => [m.id, m.name]));

      return meetings.map(m => {
        let durationMinutes: number | null = null;
        if (m.started_at && m.ended_at) {
          durationMinutes = Math.round((new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 60000);
        }
        return {
          id: m.id,
          title: m.title || 'Reunião',
          leadName: m.lead_id ? (leadsMap.get(m.lead_id) || null) : null,
          leadId: m.lead_id || null,
          repName: m.created_by ? (membersMap.get(m.created_by) || 'Vendedor') : 'Sistema',
          scheduledAt: m.started_at || m.created_at,
          status: 'realized',
          isAgent: false,
          durationMinutes,
        };
      });
    },
    enabled: !!statusFilter,
    staleTime: 60000,
  });
}

// ==================== FIRST RESPONSE TIME ====================

export interface FirstResponseMetrics {
  avgMinutes: number;
  totalLeads: number;
  respondedLeads: number;
  responseRate: number; // %
}

/**
 * Average first response time — time between lead creation and first outgoing WhatsApp message
 */
export function useFirstResponseTime(filters: DashboardFilters) {
  return useQuery({
    queryKey: ['dashboard-v2-first-response', filters.dateRange.from.toISOString(), filters.dateRange.to.toISOString(), filters.salesRepId],
    queryFn: async (): Promise<FirstResponseMetrics> => {
      const { from, to } = filters.dateRange;

      // Get leads created in period
      let leadsQuery = supabase
        .from('leads')
        .select('id, created_at')
        .gte('created_at', from.toISOString())
        .lte('created_at', to.toISOString())
        .limit(300);

      if (filters.salesRepId) {
        leadsQuery = leadsQuery.eq('sales_rep_id', filters.salesRepId);
      }

      const { data: leads } = await leadsQuery;
      if (!leads || leads.length === 0) return { avgMinutes: 0, totalLeads: 0, respondedLeads: 0, responseRate: 0 };

      const leadIds = leads.map(l => l.id);
      const leadsCreatedMap = new Map(leads.map(l => [l.id, new Date(l.created_at).getTime()]));

      // Get first outgoing message per lead (is_from_me = true)
      const { data: messages } = await supabase
        .from('whatsapp_messages')
        .select('lead_id, created_at')
        .in('lead_id', leadIds)
        .eq('is_from_me', true)
        .order('created_at', { ascending: true });

      // Find first message per lead
      const firstMsgMap = new Map<string, number>();
      (messages || []).forEach((m: any) => {
        if (m.lead_id && !firstMsgMap.has(m.lead_id)) {
          firstMsgMap.set(m.lead_id, new Date(m.created_at).getTime());
        }
      });

      // Calculate response times
      const responseTimes: number[] = [];
      for (const leadId of leadIds) {
        const created = leadsCreatedMap.get(leadId);
        const firstMsg = firstMsgMap.get(leadId);
        if (created && firstMsg && firstMsg > created) {
          responseTimes.push((firstMsg - created) / (1000 * 60)); // in minutes
        }
      }

      const avgMinutes = responseTimes.length > 0
        ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
        : 0;

      return {
        avgMinutes,
        totalLeads: leads.length,
        respondedLeads: responseTimes.length,
        responseRate: leads.length > 0 ? (responseTimes.length / leads.length) * 100 : 0,
      };
    },
    staleTime: 120000,
  });
}
