import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type {
  SalesActivity,
  ActivityFilters,
  CreateActivityInput,
  UpdateActivityInput,
  ActivityStatus
} from '@/types/sales.types';

// Fetch all activities with filters
export const useSalesActivities = (filters?: ActivityFilters) => {
  return useQuery({
    queryKey: ['sales-activities', filters],
    queryFn: async () => {
      let query = supabase
        .from('sales_activities')
        .select(`
          *,
          contact:contacts(id, name, phone, avatar_url),
          deal:deals(id, negotiated_price, status),
          sales_rep:profiles!sales_activities_sales_rep_id_fkey(id, full_name, avatar_url)
        `)
        .order('scheduled_at', { ascending: true, nullsFirst: false });

      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }
      if (filters?.activity_type) {
        query = query.eq('activity_type', filters.activity_type);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.contact_id) {
        query = query.eq('contact_id', filters.contact_id);
      }
      if (filters?.deal_id) {
        query = query.eq('deal_id', filters.deal_id);
      }
      if (filters?.from_date) {
        query = query.gte('scheduled_at', filters.from_date);
      }
      if (filters?.to_date) {
        query = query.lte('scheduled_at', filters.to_date);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
  });
};

// Fetch pending activities
export const usePendingActivities = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['pending-activities', salesRepId],
    queryFn: async () => {
      let query = supabase
        .from('sales_activities')
        .select(`
          *,
          contact:contacts(id, name, phone, avatar_url, sales_score),
          deal:deals(id, negotiated_price, status)
        `)
        .in('status', ['pending', 'scheduled'])
        .order('scheduled_at', { ascending: true });

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
  });
};

// Fetch today's activities
export const useTodayActivities = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['today-activities', salesRepId],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      let query = supabase
        .from('sales_activities')
        .select(`
          *,
          contact:contacts(id, name, phone, avatar_url, sales_score),
          deal:deals(id, negotiated_price, status)
        `)
        .gte('scheduled_at', today.toISOString())
        .lt('scheduled_at', tomorrow.toISOString())
        .order('scheduled_at', { ascending: true });

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
  });
};

// Fetch overdue activities
export const useOverdueActivities = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['overdue-activities', salesRepId],
    queryFn: async () => {
      const now = new Date();

      let query = supabase
        .from('sales_activities')
        .select(`
          *,
          contact:contacts(id, name, phone, avatar_url, sales_score),
          deal:deals(id, negotiated_price, status)
        `)
        .lt('scheduled_at', now.toISOString())
        .in('status', ['pending', 'scheduled'])
        .order('scheduled_at', { ascending: true });

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
  });
};

// Fetch activities for specific contact
export const useContactActivities = (contactId: string | undefined) => {
  return useQuery({
    queryKey: ['contact-activities', contactId],
    queryFn: async () => {
      if (!contactId) return [];

      const { data, error } = await supabase
        .from('sales_activities')
        .select(`
          *,
          sales_rep:profiles!sales_activities_sales_rep_id_fkey(id, full_name)
        `)
        .eq('contact_id', contactId)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
    enabled: !!contactId,
  });
};

// Fetch activities for specific deal
export const useDealActivities = (dealId: string | undefined) => {
  return useQuery({
    queryKey: ['deal-activities', dealId],
    queryFn: async () => {
      if (!dealId) return [];

      const { data, error } = await supabase
        .from('sales_activities')
        .select(`
          *,
          contact:contacts(id, name, phone),
          sales_rep:profiles!sales_activities_sales_rep_id_fkey(id, full_name)
        `)
        .eq('deal_id', dealId)
        .order('scheduled_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesActivity[];
    },
    enabled: !!dealId,
  });
};

// Create activity
export const useCreateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateActivityInput) => {
      const { data, error } = await supabase
        .from('sales_activities')
        .insert({
          ...input,
          status: 'pending',
          ai_generated: false,
        })
        .select(`
          *,
          contact:contacts(id, name, phone),
          deal:deals(id, negotiated_price)
        `)
        .single();

      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-activities'] });
      queryClient.invalidateQueries({ queryKey: ['pending-activities'] });
      queryClient.invalidateQueries({ queryKey: ['today-activities'] });
      if (data.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contact-activities', data.contact_id] });
      }
      if (data.deal_id) {
        queryClient.invalidateQueries({ queryKey: ['deal-activities', data.deal_id] });
      }
    },
  });
};

// Update activity
export const useUpdateActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateActivityInput) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('sales_activities')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-activities'] });
      queryClient.invalidateQueries({ queryKey: ['pending-activities'] });
      queryClient.invalidateQueries({ queryKey: ['today-activities'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-activities'] });
      if (data.contact_id) {
        queryClient.invalidateQueries({ queryKey: ['contact-activities', data.contact_id] });
      }
    },
  });
};

// Complete activity
export const useCompleteActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      outcome,
      outcomeType,
      notes,
      durationMinutes,
    }: {
      activityId: string;
      outcome?: string;
      outcomeType?: 'positive' | 'neutral' | 'negative' | 'no_answer' | 'rescheduled';
      notes?: string;
      durationMinutes?: number;
    }) => {
      const { data, error } = await supabase
        .from('sales_activities')
        .update({
          status: 'completed' as ActivityStatus,
          completed_at: new Date().toISOString(),
          outcome,
          outcome_type: outcomeType,
          notes,
          duration_minutes: durationMinutes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activityId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-activities'] });
      queryClient.invalidateQueries({ queryKey: ['pending-activities'] });
      queryClient.invalidateQueries({ queryKey: ['today-activities'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-activities'] });
      queryClient.invalidateQueries({ queryKey: ['contact-activities'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });
    },
  });
};

// Cancel activity
export const useCancelActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ activityId, reason }: { activityId: string; reason?: string }) => {
      const { data, error } = await supabase
        .from('sales_activities')
        .update({
          status: 'cancelled' as ActivityStatus,
          notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activityId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-activities'] });
      queryClient.invalidateQueries({ queryKey: ['pending-activities'] });
      queryClient.invalidateQueries({ queryKey: ['today-activities'] });
    },
  });
};

// Reschedule activity
export const useRescheduleActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      activityId,
      newScheduledAt,
      reason,
    }: {
      activityId: string;
      newScheduledAt: string;
      reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('sales_activities')
        .update({
          scheduled_at: newScheduledAt,
          status: 'scheduled' as ActivityStatus,
          notes: reason,
          updated_at: new Date().toISOString(),
        })
        .eq('id', activityId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesActivity;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-activities'] });
      queryClient.invalidateQueries({ queryKey: ['pending-activities'] });
      queryClient.invalidateQueries({ queryKey: ['today-activities'] });
      queryClient.invalidateQueries({ queryKey: ['overdue-activities'] });
    },
  });
};

// Delete activity
export const useDeleteActivity = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (activityId: string) => {
      await deleteWithUndo({
        table: 'sales_activities',
        id: activityId,
        label: 'Atividade',
        queryClient,
        queryKeys: [['sales-activities'], ['pending-activities'], ['today-activities'], ['contact-activities'], ['deal-activities']],
      });
    },
  });
};

// Get activity summary by type
export const useActivitySummary = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['activity-summary', salesRepId],
    queryFn: async () => {
      let query = supabase
        .from('sales_activities')
        .select('activity_type, status, outcome_type');

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const summary = {
        total: data?.length || 0,
        by_type: {} as Record<string, number>,
        by_status: {} as Record<string, number>,
        by_outcome: {} as Record<string, number>,
      };

      data?.forEach((activity) => {
        // By type
        if (activity.activity_type) {
          summary.by_type[activity.activity_type] = (summary.by_type[activity.activity_type] || 0) + 1;
        }
        // By status
        if (activity.status) {
          summary.by_status[activity.status] = (summary.by_status[activity.status] || 0) + 1;
        }
        // By outcome
        if (activity.outcome_type) {
          summary.by_outcome[activity.outcome_type] = (summary.by_outcome[activity.outcome_type] || 0) + 1;
        }
      });

      return summary;
    },
  });
};
