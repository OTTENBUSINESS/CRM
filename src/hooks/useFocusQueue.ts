import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface FocusItem {
  type: 'meeting_prep' | 'new_lead' | 'overdue_task';
  id: string;
  leadId: string;
  title: string;
  subtitle: string;
  score?: number;
  urgency: string;
  data: any;
}

function formatUrgency(date: string | null, type: 'future' | 'past'): string {
  if (!date) return '';
  const now = new Date();
  const target = new Date(date);
  const diffMs = type === 'future' ? target.getTime() - now.getTime() : now.getTime() - target.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (type === 'future') {
    if (diffMin <= 0) return 'Agora!';
    if (diffMin < 60) return `Em ${diffMin} min!`;
    if (diffHours < 24) return `Em ${diffHours}h`;
    return `Em ${diffDays}d`;
  }
  // past
  if (diffMin < 60) return `Há ${diffMin} min`;
  if (diffHours < 24) return `Há ${diffHours}h`;
  return `Atrasada ${diffDays}d`;
}

export const useFocusQueue = (salesRepId: string | undefined) => {
  const queryClient = useQueryClient();

  // Realtime: refetch imediato quando novo deal ou mudança em tarefas
  useEffect(() => {
    if (!salesRepId) return;

    const channel = supabase
      .channel(`focus-queue-rt-${salesRepId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'deals' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['focus-queue', salesRepId] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'company_activities' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['focus-queue', salesRepId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [salesRepId, queryClient]);

  return useQuery({
    queryKey: ['focus-queue', salesRepId],
    queryFn: async (): Promise<FocusItem[]> => {
      if (!salesRepId) return [];

      const now = new Date();
      const items: FocusItem[] = [];

      // 1. Meeting prep - tasks with scheduled_at between now and +10min
      const in10min = new Date(now.getTime() + 10 * 60000).toISOString();
      const { data: upcomingMeetings } = await supabase
        .from('company_activities')
        .select('*')
        .eq('responsavel_id', salesRepId)
        .eq('completed', false)
        .in('task_type', ['call', 'meeting'])
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', in10min)
        .order('scheduled_at', { ascending: true });

      if (upcomingMeetings && upcomingMeetings.length > 0) {
        // Fetch leads for these tasks
        const meetingLeadIds = upcomingMeetings.map(t => t.lead_id).filter(Boolean);
        const { data: meetingLeads } = meetingLeadIds.length > 0
          ? await supabase.from('leads').select('id, name, email, phone, sales_score, company_name').in('id', meetingLeadIds)
          : { data: [] };
        const leadMap = new Map((meetingLeads || []).map(l => [l.id, l]));

        for (const task of upcomingMeetings) {
          const lead = task.lead_id ? leadMap.get(task.lead_id) : null;
          if (lead) {
            items.push({
              type: 'meeting_prep',
              id: `meeting-${task.id}`,
              leadId: lead.id,
              title: lead.name || task.name,
              subtitle: lead.company_name || 'Preparação para reunião',
              score: lead.sales_score,
              urgency: formatUrgency(task.scheduled_at, 'future'),
              data: { task, lead },
            });
          }
        }
      }

      // 2. Leads with deals in "Novo" stage of the default pipeline (Closer)
      const { data: defaultPipeline } = await supabase
        .from('sales_pipelines')
        .select('id')
        .eq('is_default', true)
        .maybeSingle();


      if (defaultPipeline) {
        const { data: novoStage } = await supabase
          .from('sales_pipeline_stages')
          .select('id')
          .eq('pipeline_id', defaultPipeline.id)
          .eq('position', 1)
          .maybeSingle();


        if (novoStage) {
          // Query busca por sales_rep_id OU sdr_id (atribuição compartilhada SDR/Closer)
          const { data: rawDeals } = await supabase
            .from('deals')
            .select('id, lead_id, title, created_at, status, pipeline_stage_id')
            .or(`sales_rep_id.eq.${salesRepId},sdr_id.eq.${salesRepId}`)
            .eq('pipeline_stage_id', novoStage.id)
            .order('created_at', { ascending: true });
          // Filtrar won/lost no JS
          const novoDeals = (rawDeals || []).filter(d => d.status !== 'won' && d.status !== 'lost');

          if (novoDeals.length > 0) {
            // Fetch leads separately
            const dealLeadIds = novoDeals.map(d => d.lead_id).filter(Boolean);
            const { data: dealLeads } = dealLeadIds.length > 0
              ? await supabase.from('leads').select('id, name, email, phone, sales_score, company_name, sales_stage, bant_budget, bant_authority, bant_need, bant_timeline, utm_source, utm_medium, utm_campaign, utm_content, utm_term').in('id', dealLeadIds)
              : { data: [] };
            const leadMap = new Map((dealLeads || []).map(l => [l.id, l]));

            // Fetch pain_registrations for monthly_revenue
            const dealEmails = (dealLeads || []).map(l => l.email).filter(Boolean);
            let painMap = new Map<string, string>();
            if (dealEmails.length > 0) {
              const { data: painRegs } = await supabase
                .from('pain_registrations')
                .select('email, monthly_revenue')
                .in('email', dealEmails);
              if (painRegs) {
                painMap = new Map(painRegs.map(p => [p.email, p.monthly_revenue]));
              }
            }

            for (const deal of novoDeals) {
              const lead = deal.lead_id ? leadMap.get(deal.lead_id) : null;
              if (!lead) continue;
              // Skip if already in meeting prep
              if (items.some(i => i.leadId === lead.id)) continue;
              const monthlyRevenue = lead.email ? painMap.get(lead.email) : null;
              items.push({
                type: 'new_lead',
                id: `lead-${lead.id}`,
                leadId: lead.id,
                title: lead.name || 'Lead sem nome',
                subtitle: lead.company_name || deal.title || '',
                score: lead.sales_score,
                urgency: formatUrgency(deal.created_at, 'past'),
                data: { ...lead, deal, monthly_revenue: monthlyRevenue },
              });
            }
          }
        }
      }

      // 3. Overdue tasks (scheduled_at < now, not completed)
      const { data: overdueTasks } = await supabase
        .from('company_activities')
        .select('*')
        .eq('responsavel_id', salesRepId)
        .eq('completed', false)
        .eq('team', 'sales')
        .lt('scheduled_at', now.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(20);

      if (overdueTasks && overdueTasks.length > 0) {
        const overdueLeadIds = overdueTasks.map(t => t.lead_id).filter(Boolean);
        const { data: overdueLeads } = overdueLeadIds.length > 0
          ? await supabase.from('leads').select('id, name, email, phone, sales_score, company_name').in('id', overdueLeadIds)
          : { data: [] };
        const leadMap = new Map((overdueLeads || []).map(l => [l.id, l]));

        for (const task of overdueTasks) {
          // Skip if already in meeting prep
          if (items.some(i => i.id === `meeting-${task.id}`)) continue;
          const lead = task.lead_id ? leadMap.get(task.lead_id) : null;
          items.push({
            type: 'overdue_task',
            id: `task-${task.id}`,
            leadId: lead?.id || task.lead_id || '',
            title: task.name,
            subtitle: lead?.name || '',
            score: lead?.sales_score,
            urgency: formatUrgency(task.scheduled_at, 'past'),
            data: { task, lead },
          });
        }
      }

      return items;
    },
    enabled: !!salesRepId,
    refetchInterval: 60000,
  });
};
