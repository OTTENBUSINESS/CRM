import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export interface ProcessAdherenceData {
  bantFillRate: number;      // % of leads with at least 3/4 BANT filled
  callsPerLead: number;      // avg calls per active lead
  proposalRate: number;      // % of leads that reached proposal stage
  followupCompletionRate: number; // % of follow-up tasks completed
  avgDaysToProposal: number; // avg days from lead creation to proposal
}

export function useProcessAdherence(teamMemberId?: string, dateFrom?: Date, dateTo?: Date) {
  const fromStr = dateFrom ? format(dateFrom, 'yyyy-MM-dd') : undefined;
  const toStr = dateTo ? format(dateTo, 'yyyy-MM-dd') : undefined;

  return useQuery({
    queryKey: ['process-adherence', teamMemberId, fromStr, toStr],
    queryFn: async (): Promise<ProcessAdherenceData> => {
      // Get active leads for this rep
      let leadsQuery = supabase
        .from('leads')
        .select('id, bant_budget, bant_authority, bant_need, bant_timeline, created_at')
        .not('sales_stage', 'in', '(fechado,perdido)');

      // Filter by deals with this sales_rep
      const { data: repDeals } = teamMemberId
        ? await supabase
            .from('deals')
            .select('lead_id')
            .eq('sales_rep_id', teamMemberId)
            .eq('status', 'open')
        : { data: null };

      const repLeadIds = repDeals?.map((d: any) => d.lead_id).filter(Boolean) || [];

      if (teamMemberId && repLeadIds.length === 0) {
        return { bantFillRate: 0, callsPerLead: 0, proposalRate: 0, followupCompletionRate: 0, avgDaysToProposal: 0 };
      }

      if (teamMemberId) {
        leadsQuery = leadsQuery.in('id', repLeadIds);
      }

      const { data: leads } = await leadsQuery.limit(500);
      const activeLeads = leads || [];
      const totalLeads = activeLeads.length;

      if (totalLeads === 0) {
        return { bantFillRate: 0, callsPerLead: 0, proposalRate: 0, followupCompletionRate: 0, avgDaysToProposal: 0 };
      }

      // BANT fill rate (at least 3 of 4 filled)
      const bantFilled = activeLeads.filter(l => {
        const filled = [l.bant_budget, l.bant_authority, l.bant_need, l.bant_timeline]
          .filter(v => v !== null && v !== undefined && v !== '').length;
        return filled >= 3;
      }).length;
      const bantFillRate = (bantFilled / totalLeads) * 100;

      // Calls per lead
      const leadIds = activeLeads.map(l => l.id);
      let callsQuery = supabase
        .from('call_history')
        .select('id, lead_id', { count: 'exact', head: true });

      if (teamMemberId) {
        callsQuery = callsQuery.eq('team_member_id', teamMemberId);
      }
      // We can't filter by lead_id array easily with count, so do a simpler approach
      const { data: callsData } = await supabase
        .from('call_history')
        .select('lead_id')
        .in('lead_id', leadIds.slice(0, 100));

      const totalCalls = callsData?.length || 0;
      const callsPerLead = totalLeads > 0 ? totalCalls / Math.min(totalLeads, 100) : 0;

      // Proposal rate: leads that have a deal in proposal stage
      const { data: proposalStages } = await supabase
        .from('sales_pipeline_stages')
        .select('id')
        .ilike('name', '%proposta%');

      const proposalStageIds = proposalStages?.map(s => s.id) || [];
      let proposalCount = 0;
      if (proposalStageIds.length > 0) {
        let pQuery = supabase
          .from('deals')
          .select('id', { count: 'exact', head: true })
          .in('pipeline_stage_id', proposalStageIds)
          .in('lead_id', leadIds.slice(0, 100));

        if (teamMemberId) {
          pQuery = pQuery.eq('sales_rep_id', teamMemberId);
        }
        const { count } = await pQuery;
        proposalCount = count || 0;
      }
      const proposalRate = (proposalCount / Math.min(totalLeads, 100)) * 100;

      // Follow-up completion rate
      let fuQuery = supabase
        .from('company_activities')
        .select('id, completed')
        .eq('task_type', 'follow_up')
        .eq('team', 'comercial');

      if (teamMemberId) {
        fuQuery = fuQuery.eq('responsavel_id', teamMemberId);
      }
      if (fromStr) fuQuery = fuQuery.gte('scheduled_at', fromStr);
      if (toStr) fuQuery = fuQuery.lte('scheduled_at', toStr + 'T23:59:59');

      const { data: followups } = await fuQuery.limit(500);
      const totalFu = followups?.length || 0;
      const completedFu = followups?.filter((f: any) => f.completed).length || 0;
      const followupCompletionRate = totalFu > 0 ? (completedFu / totalFu) * 100 : 0;

      return {
        bantFillRate: Math.round(bantFillRate),
        callsPerLead: Math.round(callsPerLead * 10) / 10,
        proposalRate: Math.round(proposalRate),
        followupCompletionRate: Math.round(followupCompletionRate),
        avgDaysToProposal: 0, // TODO: calculate when needed
      };
    },
    staleTime: 120_000,
  });
}
