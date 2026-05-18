import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type Checkin = Tables<'cs_checkins'>;
export type CheckinInsert = TablesInsert<'cs_checkins'>;
export type CheckinUpdate = TablesUpdate<'cs_checkins'>;

export const useCheckins = (clientId?: string) => {
  return useQuery({
    queryKey: ['checkins', clientId],
    queryFn: async () => {
      let query = supabase
        .from('cs_checkins')
        .select(`
          *,
          assignee:profiles(*)
        `)
        .order('scheduled_date', { ascending: false });

      if (clientId) {
        query = query.eq('client_id', clientId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data;
    },
  });
};

export const useCreateCheckin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: CheckinInsert) => {
      const { data: created, error } = await supabase
        .from('cs_checkins')
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkins'] });
    },
  });
};

export const useUpdateCheckin = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: CheckinUpdate }) => {
      const { data: updated, error } = await supabase
        .from('cs_checkins')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checkins'] });
    },
  });
};
