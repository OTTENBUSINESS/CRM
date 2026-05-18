import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { SalesDashboardStats, SalesForecast } from '@/types/sales.types';

// Main dashboard stats
export const useSalesDashboardStats = (salesRepId?: string, dateRange?: { start: string; end: string }) => {
  return useQuery({
    queryKey: ['sales-dashboard-stats', salesRepId, dateRange?.start, dateRange?.end],
    queryFn: async () => {
      // Get leads data from LEADS table (not contacts)
      let leadsQuery = supabase
        .from('leads')
        .select('id, sales_stage, sales_score, pipeline_stage_id');

      if (salesRepId) {
        leadsQuery = leadsQuery.eq('sales_rep_id', salesRepId);
      }

      const { data: leads, error: leadsError } = await leadsQuery;
      if (leadsError) throw leadsError;

      // Get deals data
      let dealsQuery = (supabase
        .from('deals' as any)
        .select('id, status, negotiated_price, won_at, lost_at, created_at, pipeline_stage_id, updated_at') as any);

      if (salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', salesRepId);
      }

      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // Get pipeline stages to identify won/lost
      const { data: pipelineStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won, is_lost');

      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];
      const lostStageIds = pipelineStages?.filter(s => s.is_lost).map(s => s.id) || [];

      // Get today's pending tasks from company_activities
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let activitiesQuery = supabase
        .from('company_activities')
        .select('id, completed, scheduled_at')
        .in('team', ['sales', 'comercial'])
        .eq('completed', false)
        .gte('scheduled_at', today.toISOString())
        .lt('scheduled_at', tomorrow.toISOString());

      if (salesRepId) {
        activitiesQuery = activitiesQuery.eq('responsavel_id', salesRepId);
      }

      const { data: todayActivities, error: activitiesError } = await activitiesQuery;
      if (activitiesError) console.error('Activities error:', activitiesError);

      // Get overdue activities
      let overdueQuery = supabase
        .from('company_activities')
        .select('id')
        .in('team', ['sales', 'comercial'])
        .eq('completed', false)
        .lt('scheduled_at', today.toISOString());

      if (salesRepId) {
        overdueQuery = overdueQuery.eq('responsavel_id', salesRepId);
      }

      const { data: overdueActivities, error: overdueError } = await overdueQuery;
      if (overdueError) console.error('Overdue error:', overdueError);

      // Get unread alerts
      let alertsQuery = supabase
        .from('sales_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

      if (salesRepId) {
        alertsQuery = alertsQuery.eq('sales_rep_id', salesRepId);
      }

      const { count: unreadAlerts } = await alertsQuery;

      // Calculate stats - exclude leads in won/lost pipeline stages
      const leadsByStage: Record<string, number> = {
        captura: 0,
        qualificacao: 0,
        agendamento: 0,
        negociacao: 0,
        fechado: 0,
        perdido: 0,
      };

      // Filter active leads (not in won/lost pipeline stages)
      const activeLeads = leads?.filter((lead) =>
        !wonStageIds.includes(lead.pipeline_stage_id) &&
        !lostStageIds.includes(lead.pipeline_stage_id)
      ) || [];

      let totalScore = 0;
      activeLeads.forEach((lead) => {
        if (lead.sales_stage && leadsByStage[lead.sales_stage] !== undefined) {
          leadsByStage[lead.sales_stage]++;
        }
        totalScore += lead.sales_score || 0;
      });

      // Classify deals by status or pipeline stage
      const wonDeals = deals?.filter((d: any) =>
        d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id)
      ) || [];
      const lostDeals = deals?.filter((d: any) =>
        d.status === 'lost' || lostStageIds.includes(d.pipeline_stage_id)
      ) || [];
      const activeDeals = deals?.filter((d: any) =>
        !['won', 'lost'].includes(d.status || '') &&
        !wonStageIds.includes(d.pipeline_stage_id) &&
        !lostStageIds.includes(d.pipeline_stage_id)
      ) || [];

      const wonValue = wonDeals.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);
      const activeValue = activeDeals.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);

      // Calculate avg sales cycle (days from created_at to won_at)
      const cyclesDays = wonDeals
        .filter((d: any) => d.won_at && d.created_at)
        .map((d: any) => {
          const created = new Date(d.created_at!);
          const won = new Date(d.won_at!);
          return Math.floor((won.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        });
      const avgCycle = cyclesDays.length > 0
        ? cyclesDays.reduce((a, b) => a + b, 0) / cyclesDays.length
        : 0;

      // Get hot leads count (score >= 70, excluding won/lost stages)
      const hotLeadsCount = activeLeads.filter(l => (l.sales_score || 0) >= 70).length;

      // Filter won deals for selected period (or current month by default)
      const periodStart = dateRange ? new Date(dateRange.start) : (() => {
        const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
      })();
      const periodEnd = dateRange ? new Date(dateRange.end) : new Date();

      const wonThisPeriod = wonDeals.filter((d: any) => {
        // Use won_at if available, otherwise fall back to updated_at for deals in won stages
        const wonDate = d.won_at ? new Date(d.won_at) :
          (wonStageIds.includes(d.pipeline_stage_id) && d.updated_at ? new Date(d.updated_at) : null);
        if (!wonDate) return false;
        return wonDate >= periodStart && wonDate <= periodEnd;
      });
      const wonValueThisPeriod = wonThisPeriod.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);

      const stats: SalesDashboardStats = {
        total_leads: activeLeads.length,
        leads_by_stage: leadsByStage as Record<string, number>,
        total_deals: activeDeals.length,
        deals_value: activeValue,
        won_deals: wonThisPeriod.length,
        won_value: wonValueThisPeriod,
        lost_deals: lostDeals.length,
        conversion_rate: deals && deals.length > 0
          ? (wonDeals.length / deals.length) * 100
          : 0,
        avg_deal_value: wonDeals.length > 0 ? wonValue / wonDeals.length : 0,
        avg_sales_cycle_days: Math.round(avgCycle),
        activities_today: todayActivities?.length || 0,
        activities_overdue: overdueActivities?.length || 0,
        calls_made: 0,
        proposals_sent: 0,
        hot_leads_count: hotLeadsCount,
        unread_alerts: unreadAlerts || 0,
        ai_score_avg: activeLeads.length > 0 ? Math.round(totalScore / activeLeads.length) : 0,
      };

      return stats;
    },
  });
};

// Sales forecast
export const useSalesForecast = (months: number = 3) => {
  return useQuery({
    queryKey: ['sales-forecast', months],
    queryFn: async () => {
      const { data: deals, error } = await (supabase
        .from('deals' as any)
        .select('negotiated_price, expected_close_date, ai_win_probability, status, pipeline_stage_id') as any);

      if (error) throw error;

      // Get won/lost stage ids
      const { data: pipelineStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won, is_lost');

      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];
      const lostStageIds = pipelineStages?.filter(s => s.is_lost).map(s => s.id) || [];

      // Filter only active deals
      const activeDeals = deals?.filter((d: any) =>
        !['won', 'lost'].includes(d.status || '') &&
        !wonStageIds.includes(d.pipeline_stage_id) &&
        !lostStageIds.includes(d.pipeline_stage_id) &&
        d.expected_close_date
      ) || [];

      // Group by month
      const forecast: SalesForecast[] = [];
      const now = new Date();

      for (let i = 0; i < months; i++) {
        const monthDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
        const monthStr = monthDate.toISOString().slice(0, 7); // YYYY-MM
        const monthName = monthDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

        const monthDeals = activeDeals.filter((d: any) => {
          if (!d.expected_close_date) return false;
          return d.expected_close_date.startsWith(monthStr);
        });

        const expectedRevenue = monthDeals.reduce(
          (sum: number, d: any) => sum + (Number(d.negotiated_price) || 0),
          0
        );

        const weightedValue = monthDeals.reduce(
          (sum: number, d: any) => sum + (Number(d.negotiated_price) || 0) * ((d.ai_win_probability || 50) / 100),
          0
        );

        forecast.push({
          period: monthName,
          expected_revenue: expectedRevenue,
          deals_count: monthDeals.length,
          probability_weighted_value: Math.round(weightedValue),
        });
      }

      return forecast;
    },
  });
};

// Urgent actions - separated by TODAY, OVERDUE, and UPCOMING
export const useSalesUrgentActions = (salesRepId?: string, limit: number = 10) => {
  return useQuery({
    queryKey: ['sales-urgent-actions', salesRepId, limit],
    queryFn: async () => {
      // Calcular início e fim do dia de HOJE em Brasília
      const now = new Date();
      const todayStart = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(todayStart);
      todayEnd.setHours(23, 59, 59, 999);

      // Próximos 7 dias
      const weekEnd = new Date(todayStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      weekEnd.setHours(23, 59, 59, 999);

      // Converter para UTC para comparar com o banco
      const todayStartUTC = new Date(todayStart.getTime() + 3 * 60 * 60 * 1000); // +3h para UTC
      const todayEndUTC = new Date(todayEnd.getTime() + 3 * 60 * 60 * 1000);
      const weekEndUTC = new Date(weekEnd.getTime() + 3 * 60 * 60 * 1000);

      // Agora responsavel_id é diretamente o team_member_id
      const responsavelId = salesRepId || null;

      // Query: ALL pending activities with scheduled_at (next 7 days or past)
      let query = supabase
        .from('company_activities')
        .select('*')
        .in('team', ['sales', 'comercial'])
        .eq('completed', false)
        .not('scheduled_at', 'is', null)
        .lte('scheduled_at', weekEndUTC.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(limit * 3);

      if (responsavelId) {
        query = query.eq('responsavel_id', responsavelId);
      }

      const { data: activities, error } = await query;
      if (error) throw error;

      if (!activities || activities.length === 0) {
        return { today: [], overdue: [], upcoming: [] };
      }

      // Fetch lead info for each activity
      const leadIds = activities.map(a => a.lead_id).filter(Boolean);
      let leadsMap = new Map();

      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, phone, sales_score')
          .in('id', leadIds);
        leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
      }

      // Map and categorize
      const mapped = activities.map(activity => ({
        ...activity,
        contact: leadsMap.get(activity.lead_id) || null,
        activity_type: activity.task_type || 'tarefa',
        title: activity.name,
      }));

      // Separate into TODAY, OVERDUE, and UPCOMING
      const today: typeof mapped = [];
      const overdue: typeof mapped = [];
      const upcoming: typeof mapped = [];

      mapped.forEach(task => {
        const taskDate = new Date(task.scheduled_at);
        if (taskDate < todayStartUTC) {
          overdue.push(task);
        } else if (taskDate <= todayEndUTC) {
          today.push(task);
        } else {
          upcoming.push(task);
        }
      });

      return {
        today: today.slice(0, limit),
        overdue: overdue.slice(0, limit),
        upcoming: upcoming.slice(0, limit),
      };
    },
  });
};

// Conversion funnel data (based on real pipeline stages + deals)
export const useConversionFunnel = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['conversion-funnel', salesRepId],
    queryFn: async () => {
      // Get real pipeline stages
      const { data: stages, error: stagesError } = await supabase
        .from('sales_pipeline_stages')
        .select('id, name, position, color, is_won, is_lost')
        .order('position', { ascending: true });
      if (stagesError) throw stagesError;

      // Get deals grouped by pipeline_stage_id
      let dealsQuery = (supabase
        .from('deals' as any)
        .select('id, pipeline_stage_id') as any);
      if (salesRepId) {
        dealsQuery = dealsQuery.eq('sales_rep_id', salesRepId);
      }
      const { data: deals, error: dealsError } = await dealsQuery;
      if (dealsError) throw dealsError;

      // Count deals per stage
      const countByStage = new Map<string, number>();
      deals?.forEach((d: any) => {
        if (d.pipeline_stage_id) {
          countByStage.set(d.pipeline_stage_id, (countByStage.get(d.pipeline_stage_id) || 0) + 1);
        }
      });

      const funnel = (stages || []).map((stage) => ({
        stage: stage.name,
        stage_id: stage.id,
        color: stage.color,
        is_won: stage.is_won,
        is_lost: stage.is_lost,
        count: countByStage.get(stage.id) || 0,
      }));

      // Calculate conversion rates between stages
      return funnel.map((item, index) => ({
        ...item,
        conversion_from_previous: index > 0 && funnel[index - 1].count > 0
          ? Math.round((item.count / funnel[index - 1].count) * 100)
          : 100,
      }));
    },
  });
};

// Performance by sales rep
export const useSalesRepPerformance = () => {
  return useQuery({
    queryKey: ['sales-rep-performance'],
    queryFn: async () => {
      const { data: deals, error } = await (supabase
        .from('deals' as any)
        .select('sales_rep_id, status, negotiated_price, pipeline_stage_id') as any);

      if (error) throw error;

      // Get won stage ids
      const { data: pipelineStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];

      // Get team members
      const { data: teamMembers } = await supabase
        .from('team_members')
        .select('id, name, avatar_url');
      const membersMap = new Map(teamMembers?.map(m => [m.id, m]) || []);

      // Group by sales rep
      const byRep: Record<string, {
        sales_rep_id: string;
        name: string;
        avatar_url?: string;
        total_deals: number;
        won_deals: number;
        won_value: number;
        conversion_rate: number;
      }> = {};

      deals?.forEach((deal: any) => {
        if (!deal.sales_rep_id) return;

        if (!byRep[deal.sales_rep_id]) {
          const member = membersMap.get(deal.sales_rep_id);
          byRep[deal.sales_rep_id] = {
            sales_rep_id: deal.sales_rep_id,
            name: member?.name || 'Desconhecido',
            avatar_url: member?.avatar_url,
            total_deals: 0,
            won_deals: 0,
            won_value: 0,
            conversion_rate: 0,
          };
        }

        byRep[deal.sales_rep_id].total_deals++;
        if (deal.status === 'won' || wonStageIds.includes(deal.pipeline_stage_id)) {
          byRep[deal.sales_rep_id].won_deals++;
          byRep[deal.sales_rep_id].won_value += Number(deal.negotiated_price) || 0;
        }
      });

      // Calculate conversion rates
      Object.values(byRep).forEach((rep) => {
        rep.conversion_rate = rep.total_deals > 0
          ? Math.round((rep.won_deals / rep.total_deals) * 100)
          : 0;
      });

      return Object.values(byRep).sort((a, b) => b.won_value - a.won_value);
    },
  });
};

// Recent wins
export const useRecentWins = (limit: number = 5) => {
  return useQuery({
    queryKey: ['recent-wins', limit],
    queryFn: async () => {
      // Get won stage ids
      const { data: pipelineStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won');
      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];

      // Get won deals
      const { data: deals, error } = await (supabase
        .from('deals' as any)
        .select('*')
        .or(`status.eq.won,pipeline_stage_id.in.(${wonStageIds.join(',')})`)
        .order('won_at', { ascending: false, nullsFirst: false })
        .limit(limit) as any);

      if (error) throw error;
      if (!deals || deals.length === 0) return [];

      // Fetch related data
      const leadIds = deals.map((d: any) => d.lead_id).filter(Boolean);
      const productIds = deals.map((d: any) => d.product_id).filter(Boolean);

      let leadsMap = new Map();
      let productsMap = new Map();

      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name')
          .in('id', leadIds);
        leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
      }

      if (productIds.length > 0) {
        const { data: products } = await supabase
          .from('products')
          .select('id, name')
          .in('id', productIds);
        productsMap = new Map(products?.map(p => [p.id, p]) || []);
      }

      return deals.map((deal: any) => ({
        ...deal,
        contact: leadsMap.get(deal.lead_id) || { name: 'Lead' },
        product: productsMap.get(deal.product_id) || null,
      }));
    },
  });
};
