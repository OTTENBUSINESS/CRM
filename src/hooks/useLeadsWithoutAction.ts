import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface LeadWithoutAction {
  id: string;
  name: string;
  phone: string | null;
  sales_stage: string | null;
  sales_score: number | null;
  last_interaction_at: string | null;
  hours_since_action: number;
}

export interface LeadsWithoutActionResult {
  over24h: LeadWithoutAction[];
  over48h: LeadWithoutAction[];
  over72h: LeadWithoutAction[];
  total: number;
}

export function useLeadsWithoutAction(salesRepId?: string) {
  return useQuery({
    queryKey: ['leads-without-action', salesRepId],
    queryFn: async (): Promise<LeadsWithoutActionResult> => {
      const now = new Date();
      const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
      const h72 = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();

      // Get active leads with open deals
      let query = supabase
        .from('leads')
        .select(`
          id, name, phone, sales_stage, sales_score, last_interaction_at,
          deals!deals_lead_id_fkey(id, status, sales_rep_id)
        `)
        .not('sales_stage', 'in', '(fechado,perdido)')
        .lt('last_interaction_at', h24)
        .not('last_interaction_at', 'is', null)
        .order('last_interaction_at', { ascending: true })
        .limit(200);

      const { data, error } = await query;
      if (error) throw error;

      const leads = (data || [])
        .filter((l: any) => {
          // Only leads with open deals
          const openDeals = (l.deals || []).filter((d: any) => d.status === 'open');
          if (openDeals.length === 0) return false;
          // Filter by rep if specified
          if (salesRepId) {
            return openDeals.some((d: any) => d.sales_rep_id === salesRepId);
          }
          return true;
        })
        .map((l: any) => {
          const hoursSince = (now.getTime() - new Date(l.last_interaction_at).getTime()) / (1000 * 60 * 60);
          return {
            id: l.id,
            name: l.name,
            phone: l.phone,
            sales_stage: l.sales_stage,
            sales_score: l.sales_score,
            last_interaction_at: l.last_interaction_at,
            hours_since_action: Math.round(hoursSince),
          } as LeadWithoutAction;
        });

      const over72h = leads.filter(l => l.hours_since_action >= 72);
      const over48h = leads.filter(l => l.hours_since_action >= 48 && l.hours_since_action < 72);
      const over24h = leads.filter(l => l.hours_since_action >= 24 && l.hours_since_action < 48);

      return {
        over24h,
        over48h,
        over72h,
        total: leads.length,
      };
    },
    staleTime: 60_000,
  });
}
