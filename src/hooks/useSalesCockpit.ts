import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// --- Metas hardcoded ---
const META_ANUAL = 12_000_000;
const META_MENSAL = META_ANUAL / 12;
const META_SEMANAL = META_MENSAL / 4.33;
const TARGET_APPROACHES = 30;

// --- Helpers ---
function todayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function weekRange() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 7);
  return { start: monday.toISOString(), end: sunday.toISOString() };
}

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function yearRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const end = new Date(now.getFullYear() + 1, 0, 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

// === Main cockpit metrics hook ===
export function useCockpitExecution(salesRepId?: string) {
  return useQuery({
    queryKey: ['cockpit-execution', salesRepId],
    queryFn: async () => {
      const today = todayRange();
      const week = weekRange();
      const month = monthRange();
      const year = yearRange();

      // Get pipeline stages for won/lost identification
      const { data: pipelineStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, is_won, is_lost');
      const wonStageIds = pipelineStages?.filter(s => s.is_won).map(s => s.id) || [];

      // --- 1. Calls scheduled/realized/no-show today ---
      let callsQuery = supabase
        .from('company_activities')
        .select('id, status, task_type, completed')
        .in('task_type', ['call', 'meeting'])
        .gte('scheduled_at', today.start)
        .lt('scheduled_at', today.end);
      if (salesRepId) callsQuery = callsQuery.eq('responsavel_id', salesRepId);
      const { data: todayCalls } = await callsQuery;

      const callsScheduled = todayCalls?.length || 0;
      const callsRealized = todayCalls?.filter(c =>
        c.status === 'completed' || c.status === 'realized' || c.completed
      ).length || 0;
      const callsNoShow = todayCalls?.filter(c => c.status === 'no_show').length || 0;
      const showUpRate = callsScheduled > 0
        ? Math.round(((callsScheduled - callsNoShow) / callsScheduled) * 100)
        : 0;

      // --- 2. Leads contacted today (unique lead_ids from whatsapp + calls) ---
      let msgQuery = supabase
        .from('whatsapp_messages')
        .select('lead_id')
        .eq('is_from_me', true)
        .gte('created_at', today.start)
        .lt('created_at', today.end);
      // Note: whatsapp_messages may not have sales_rep_id filter directly

      const { data: todayMessages } = await msgQuery;

      let callHistQuery = supabase
        .from('call_history')
        .select('lead_id')
        .gte('started_at', today.start)
        .lt('started_at', today.end);
      if (salesRepId) callHistQuery = callHistQuery.eq('team_member_id', salesRepId);
      const { data: todayCallHistory } = await callHistQuery;

      const contactedLeadIds = new Set<string>();
      todayMessages?.forEach(m => { if (m.lead_id) contactedLeadIds.add(m.lead_id); });
      todayCallHistory?.forEach(c => { if (c.lead_id) contactedLeadIds.add(c.lead_id); });
      const leadsContacted = contactedLeadIds.size;

      // --- 3. Follow-ups today ---
      let followUpQuery = supabase
        .from('company_activities')
        .select('id')
        .eq('task_type', 'follow_up')
        .gte('scheduled_at', today.start)
        .lt('scheduled_at', today.end)
        .eq('completed', false);
      if (salesRepId) followUpQuery = followUpQuery.eq('responsavel_id', salesRepId);
      const { data: followUps } = await followUpQuery;

      // --- 4. Conversas hoje (unique lead_ids in whatsapp_messages today) ---
      const conversasHoje = contactedLeadIds.size;

      // --- 5. Faturado hoje ---
      let wonTodayQuery = (supabase
        .from('deals' as any)
        .select('negotiated_price, won_at, pipeline_stage_id') as any)
        .gte('won_at', today.start)
        .lt('won_at', today.end);
      if (salesRepId) wonTodayQuery = wonTodayQuery.eq('sales_rep_id', salesRepId);
      const { data: wonToday } = await wonTodayQuery;
      const faturadoHoje = wonToday?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0;

      // --- 6. Won values for meta progress ---
      // Month
      let wonMonthQuery = (supabase
        .from('deals' as any)
        .select('negotiated_price, won_at, pipeline_stage_id') as any)
        .gte('won_at', month.start)
        .lt('won_at', month.end);
      if (salesRepId) wonMonthQuery = wonMonthQuery.eq('sales_rep_id', salesRepId);
      const { data: wonMonth } = await wonMonthQuery;

      // Also include deals in won pipeline stages that don't have won_at set
      let wonByStageMonthQuery = (supabase
        .from('deals' as any)
        .select('negotiated_price, updated_at, pipeline_stage_id') as any)
        .in('pipeline_stage_id', wonStageIds)
        .gte('updated_at', month.start)
        .lt('updated_at', month.end)
        .is('won_at', null);
      if (salesRepId) wonByStageMonthQuery = wonByStageMonthQuery.eq('sales_rep_id', salesRepId);
      const { data: wonByStageMonth } = await wonByStageMonthQuery;

      const faturadoMes = (wonMonth?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0) +
        (wonByStageMonth?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0);

      // Week
      let wonWeekQuery = (supabase
        .from('deals' as any)
        .select('negotiated_price, won_at') as any)
        .gte('won_at', week.start)
        .lt('won_at', week.end);
      if (salesRepId) wonWeekQuery = wonWeekQuery.eq('sales_rep_id', salesRepId);
      const { data: wonWeek } = await wonWeekQuery;
      const faturadoSemana = wonWeek?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0;

      // Year
      let wonYearQuery = (supabase
        .from('deals' as any)
        .select('negotiated_price, won_at') as any)
        .gte('won_at', year.start)
        .lt('won_at', year.end);
      if (salesRepId) wonYearQuery = wonYearQuery.eq('sales_rep_id', salesRepId);
      const { data: wonYear } = await wonYearQuery;
      const faturadoAno = wonYear?.reduce((s: number, d: any) => s + (Number(d.negotiated_price) || 0), 0) || 0;

      // Conversion rates (simplified)
      // Total deals + won deals for conversion
      let allDealsQuery = (supabase
        .from('deals' as any)
        .select('id, status, pipeline_stage_id') as any);
      if (salesRepId) allDealsQuery = allDealsQuery.eq('sales_rep_id', salesRepId);
      const { data: allDeals } = await allDealsQuery;

      const totalDeals = allDeals?.length || 0;
      const wonDeals = allDeals?.filter((d: any) =>
        d.status === 'won' || wonStageIds.includes(d.pipeline_stage_id)
      ).length || 0;
      const conversionOverall = totalDeals > 0 ? Math.round((wonDeals / totalDeals) * 100) : 0;
      const conversaoHoje = wonToday?.length && callsRealized > 0
        ? Math.round((wonToday.length / callsRealized) * 100)
        : 0;

      // --- 7. Checklist: pending tasks (overdue + today + upcoming 7 days) ---
      const nextWeek = new Date();
      nextWeek.setDate(nextWeek.getDate() + 7);
      const nextWeekEnd = new Date(nextWeek.getFullYear(), nextWeek.getMonth(), nextWeek.getDate() + 1).toISOString();

      let pendingQuery = supabase
        .from('company_activities')
        .select('id, name, description, task_type, lead_id, scheduled_at, completed')
        .eq('completed', false)
        .lte('scheduled_at', nextWeekEnd)
        .order('scheduled_at', { ascending: true })
        .limit(50);
      if (salesRepId) pendingQuery = pendingQuery.eq('responsavel_id', salesRepId);
      const { data: pendingTasks } = await pendingQuery;

      // Fetch lead names for pending tasks
      const pendingLeadIds = pendingTasks?.map(t => t.lead_id).filter(Boolean) || [];
      let pendingLeadsMap = new Map<string, string>();
      if (pendingLeadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name')
          .in('id', [...new Set(pendingLeadIds)]);
        leads?.forEach(l => pendingLeadsMap.set(l.id, l.name));
      }

      // Group into overdue / today / upcoming
      const overdueTasks: any[] = [];
      const todayTasks: any[] = [];
      const upcomingTasks: any[] = [];

      pendingTasks?.forEach(t => {
        const enriched = {
          ...t,
          lead_name: t.lead_id ? pendingLeadsMap.get(t.lead_id) || null : null,
        };
        if (!t.scheduled_at) {
          todayTasks.push(enriched);
          return;
        }
        const taskDate = new Date(t.scheduled_at);
        const todayStart = new Date(today.start);
        const todayEnd = new Date(today.end);
        if (taskDate < todayStart) {
          overdueTasks.push(enriched);
        } else if (taskDate < todayEnd) {
          todayTasks.push(enriched);
        } else {
          upcomingTasks.push(enriched);
        }
      });

      const tasksWithLeadNames = [...overdueTasks, ...todayTasks, ...upcomingTasks];

      // --- 8. New approaches today ---
      // Count leads that received first contact today (first whatsapp message from us)
      // Simplified: count of unique leads we messaged today that were created recently
      const newApproachesToday = leadsContacted; // approximate: all contacts today

      return {
        // Calls
        callsScheduled,
        callsRealized,
        callsNoShow,
        showUpRate,
        // Contacts
        leadsContacted,
        followUps: followUps?.length || 0,
        conversasHoje,
        // Conversion
        conversionOverall,
        conversaoHoje,
        // Revenue today
        faturadoHoje,
        wonTodayCount: wonToday?.length || 0,
        // Metas
        meta: {
          anual: META_ANUAL,
          mensal: META_MENSAL,
          semanal: META_SEMANAL,
          faturadoAno,
          faturadoMes,
          faturadoSemana,
          progressoAnual: META_ANUAL > 0 ? Math.round((faturadoAno / META_ANUAL) * 100) : 0,
          progressoMensal: META_MENSAL > 0 ? Math.round((faturadoMes / META_MENSAL) * 100) : 0,
          progressoSemanal: META_SEMANAL > 0 ? Math.round((faturadoSemana / META_SEMANAL) * 100) : 0,
        },
        // Checklist
        pendingTasks: tasksWithLeadNames,
        overdueTasks,
        todayTasks,
        upcomingTasks,
        newApproachesToday,
        targetApproaches: TARGET_APPROACHES,
      };
    },
    refetchInterval: 60_000, // refresh every minute
  });
}
