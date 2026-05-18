import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface LastActivity {
  act_type: 'area_membros' | 'whatsapp' | 'suporte';
  act_description: string;
  act_at: string;
}

export const useLastActivity = (organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['last-activity', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const { data, error } = await (supabase.rpc as any)('get_client_last_activity', {
        p_organization_id: organizationId
      });

      if (error) {
        console.error('Error fetching last activity:', error);
        return null;
      }
      
      return (data && data.length > 0) ? data[0] as LastActivity : null;
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
};

// Hook para buscar última atividade de múltiplas organizações (batch RPC)
export const useLastActivities = (organizationIds: string[]) => {
  return useQuery({
    queryKey: ['last-activities', organizationIds],
    queryFn: async () => {
      if (!organizationIds.length) return {};

      const { data, error } = await (supabase.rpc as any)('get_batch_last_activities', {
        p_organization_ids: organizationIds
      });

      if (error) {
        console.error('Error fetching batch last activities:', error);
        return {};
      }

      const results: Record<string, LastActivity | null> = {};
      for (const row of (data || [])) {
        results[row.organization_id] = {
          act_type: row.act_type,
          act_description: row.act_description,
          act_at: row.act_at,
        };
      }
      // Orgs sem resultado → null
      for (const orgId of organizationIds) {
        if (!(orgId in results)) {
          results[orgId] = null;
        }
      }
      return results;
    },
    enabled: organizationIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });
};
