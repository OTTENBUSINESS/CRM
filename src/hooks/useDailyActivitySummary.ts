import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';

export interface ActivitySummaryRow {
  team_member_id: string;
  team_member_name: string;
  calls_made: number;
  calls_connected: number;
  calls_avg_duration_sec: number;
  followups_done: number;
  meetings_scheduled: number;
  meetings_done: number;
  proposals_sent: number;
  messages_sent: number;
  leads_contacted: number;
}

export function useDailyActivitySummary(date: Date, teamMemberId?: string) {
  return useQuery({
    queryKey: ['daily-activity-summary', format(date, 'yyyy-MM-dd'), teamMemberId],
    queryFn: async (): Promise<ActivitySummaryRow[]> => {
      const { data, error } = await supabase.rpc('get_daily_activity_summary', {
        p_date: format(date, 'yyyy-MM-dd'),
        p_team_member_id: teamMemberId || null,
      });
      if (error) throw error;
      return (data ?? []) as ActivitySummaryRow[];
    },
    staleTime: 30_000,
  });
}

/** Aggregated totals across all members */
export function useDailyActivityTotals(date: Date) {
  const { data, ...rest } = useDailyActivitySummary(date);

  const totals = data?.reduce(
    (acc, row) => ({
      calls_made: acc.calls_made + Number(row.calls_made),
      calls_connected: acc.calls_connected + Number(row.calls_connected),
      followups_done: acc.followups_done + Number(row.followups_done),
      meetings_scheduled: acc.meetings_scheduled + Number(row.meetings_scheduled),
      meetings_done: acc.meetings_done + Number(row.meetings_done),
      proposals_sent: acc.proposals_sent + Number(row.proposals_sent),
      messages_sent: acc.messages_sent + Number(row.messages_sent),
      leads_contacted: acc.leads_contacted + Number(row.leads_contacted),
    }),
    {
      calls_made: 0, calls_connected: 0, followups_done: 0,
      meetings_scheduled: 0, meetings_done: 0, proposals_sent: 0,
      messages_sent: 0, leads_contacted: 0,
    }
  );

  return { data: totals, rows: data, ...rest };
}
