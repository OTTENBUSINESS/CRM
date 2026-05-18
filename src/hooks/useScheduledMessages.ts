import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';

export interface ScheduledMessage {
  id: string;
  lead_id: string | null;
  phone: string;
  content: string;
  scheduled_at: string;
  status: 'pending' | 'sent' | 'failed' | 'cancelled';
  sent_at: string | null;
  error_message: string | null;
  instance_id: string | null;
  created_by: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  // Joined
  lead?: { id: string; name: string; phone: string } | null;
}

export interface CreateScheduledMessageInput {
  lead_id?: string | null;
  phone: string;
  content: string;
  scheduled_at: string;
  instance_id?: string | null;
  created_by?: string | null;
  metadata?: Record<string, unknown>;
}

const QUERY_KEY = 'scheduled-messages';

/** List scheduled messages for a lead */
export const useScheduledMessages = (leadId: string | undefined) => {
  return useQuery({
    queryKey: [QUERY_KEY, leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('scheduled_messages')
        .select('*, lead:leads(id, name, phone)')
        .eq('lead_id', leadId)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true });

      if (error) throw error;
      return (data || []) as ScheduledMessage[];
    },
    enabled: !!leadId,
  });
};

/** Create a scheduled message */
export const useCreateScheduledMessage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateScheduledMessageInput) => {
      const { data, error } = await supabase
        .from('scheduled_messages')
        .insert(input)
        .select('*')
        .single();

      if (error) throw error;
      return data as ScheduledMessage;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY, data.lead_id] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEY] });
    },
  });
};

/** Cancel a scheduled message */
export const useCancelScheduledMessage = (leadId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (messageId: string) => {
      await deleteWithUndo({
        table: 'scheduled_messages',
        id: messageId,
        label: 'Mensagem agendada',
        queryClient,
        queryKeys: [[QUERY_KEY, leadId || ''], [QUERY_KEY]],
      });
    },
  });
};
