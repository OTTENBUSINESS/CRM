import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface CallAnalyticsData {
  total_calls: number;
  by_outcome: Record<string, number>;
  by_gender: Record<string, number>;
  by_business_type: Record<string, number>;
  by_revenue_range: Record<string, number>;
  icp_rate: number;
  conversion_by_outcome: Record<string, number>;
}

export const useCallAnalytics = (
  dateFrom?: string,
  dateTo?: string,
  teamMemberId?: string
) => {
  return useQuery({
    queryKey: ['call-analytics', dateFrom, dateTo, teamMemberId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_call_analytics', {
        p_date_from: dateFrom || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        p_date_to: dateTo || new Date().toISOString().split('T')[0],
        p_team_member_id: teamMemberId || null,
      });

      if (error) throw error;
      return data as CallAnalyticsData;
    },
  });
};
