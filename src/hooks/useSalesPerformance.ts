import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SalesPerformanceRow {
  sales_rep_id: string;
  sales_rep_name: string;
  total_tasks: number;
  completed_tasks: number;
  overdue_tasks: number;
  completion_rate: number;
  meetings_total: number;
  meetings_done: number;
  meetings_noshow: number;
  noshow_rate: number;
  followups_total: number;
  followups_done: number;
  calls_total: number;
  calls_connected: number;
  calls_duration_min: number;
  deals_moved: number;
  deals_won: number;
  deals_won_value: number;
  new_contacts: number;
  streak_days: number;
}

export function useSalesPerformance(filters: { dateFrom: Date; dateTo: Date }) {
  return useQuery({
    queryKey: [
      'dashboard-v2-performance',
      filters.dateFrom.toISOString(),
      filters.dateTo.toISOString(),
    ],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_sales_performance', {
        p_date_from: filters.dateFrom.toISOString().split('T')[0],
        p_date_to: filters.dateTo.toISOString().split('T')[0],
      });

      if (error) throw error;
      return (data ?? []) as SalesPerformanceRow[];
    },
    staleTime: 60_000,
  });
}
