import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Given a leadId, resolves the full cluster of linked leads (parent + children + siblings).
 * Returns an array of all lead IDs in the cluster.
 */
export const usePartnerLeadIds = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['partner-lead-ids', leadId],
    queryFn: async () => {
      if (!leadId) return [leadId!];

      // 1. Check if this lead has a parent (is a child)
      const { data: thisLead } = await supabase
        .from('leads')
        .select('partner_lead_id')
        .eq('id', leadId)
        .single();

      // 2. Fetch children of this lead
      const { data: children } = await supabase
        .from('leads')
        .select('id')
        .eq('partner_lead_id', leadId);

      // 3. If this lead is a child, also fetch siblings
      const parentId = thisLead?.partner_lead_id;
      let siblings: { id: string }[] = [];
      if (parentId) {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('partner_lead_id', parentId)
          .neq('id', leadId);
        siblings = data || [];
      }

      const allIds = new Set<string>([leadId]);
      if (parentId) allIds.add(parentId);
      children?.forEach(c => allIds.add(c.id));
      siblings?.forEach(s => allIds.add(s.id));

      return Array.from(allIds);
    },
    enabled: !!leadId,
  });
};
