import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { WACommunityMessageType } from './useCommunityScheduledMessages';

// ── Types ────────────────────────────────────────────────────────────

export type SequenceTrigger = 'manual' | 'on_join';
export type DelayUnit = 'minutes' | 'hours' | 'days';
export type EnrollmentStatus = 'active' | 'completed' | 'cancelled' | 'failed';

export interface MessageSequence {
  id: string;
  community_id: string;
  name: string;
  description: string | null;
  trigger: SequenceTrigger;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  steps?: SequenceStep[];
  enrollments_count?: number;
}

export interface SequenceStep {
  id: string;
  sequence_id: string;
  step_order: number;
  delay_value: number;
  delay_unit: DelayUnit;
  target_group_id: string | null;
  message_type: WACommunityMessageType;
  content: string | null;
  media_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence_id: string;
  member_phone: string | null;
  member_jid: string | null;
  member_name: string | null;
  current_step: number;
  status: EnrollmentStatus;
  next_run_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  metadata: Record<string, any>;
}

// ── Sequences ────────────────────────────────────────────────────────

export function useMessageSequences(community_id?: string) {
  return useQuery({
    queryKey: ['wa-sequences', community_id],
    enabled: !!community_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_message_sequences')
        .select('*, steps:wa_sequence_steps(*)')
        .eq('community_id', community_id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as MessageSequence[];
    },
  });
}

export function useMessageSequence(id: string | undefined) {
  return useQuery({
    queryKey: ['wa-sequence', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_message_sequences')
        .select('*, steps:wa_sequence_steps(*)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      // Ordena steps por step_order
      if (data?.steps) {
        (data as any).steps.sort((a: any, b: any) => a.step_order - b.step_order);
      }
      return data as MessageSequence;
    },
  });
}

export function useCreateMessageSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      community_id: string;
      name: string;
      description?: string;
      trigger?: SequenceTrigger;
    }) => {
      const { data, error } = await supabase
        .from('wa_message_sequences')
        .insert({
          community_id: input.community_id,
          name: input.name,
          description: input.description,
          trigger: input.trigger || 'manual',
        })
        .select()
        .single();
      if (error) throw error;
      return data as MessageSequence;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wa-sequences', vars.community_id] });
    },
  });
}

export function useUpdateMessageSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      trigger?: SequenceTrigger;
    }) => {
      const { id, ...patch } = input;
      const { data, error } = await supabase
        .from('wa_message_sequences')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as MessageSequence;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['wa-sequences', data.community_id] });
      qc.invalidateQueries({ queryKey: ['wa-sequence', data.id] });
    },
  });
}

export function useDeleteMessageSequence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('wa_message_sequences').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-sequences'] });
    },
  });
}

// ── Steps ────────────────────────────────────────────────────────────

export function useUpsertSequenceSteps() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sequence_id: string;
      steps: Omit<SequenceStep, 'id' | 'sequence_id' | 'created_at' | 'metadata'>[];
    }) => {
      // Estratégia simples: deletar tudo e reinserir
      const { error: delErr } = await supabase
        .from('wa_sequence_steps')
        .delete()
        .eq('sequence_id', input.sequence_id);
      if (delErr) throw delErr;

      if (input.steps.length === 0) return [];

      const rows = input.steps.map((s) => ({
        sequence_id: input.sequence_id,
        step_order: s.step_order,
        delay_value: s.delay_value,
        delay_unit: s.delay_unit,
        target_group_id: s.target_group_id,
        message_type: s.message_type,
        content: s.content,
        media_url: s.media_url,
      }));

      const { data, error } = await supabase.from('wa_sequence_steps').insert(rows).select();
      if (error) throw error;
      return data as SequenceStep[];
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wa-sequence', vars.sequence_id] });
      qc.invalidateQueries({ queryKey: ['wa-sequences'] });
    },
  });
}

// ── Enrollments ──────────────────────────────────────────────────────

export function useSequenceEnrollments(sequence_id?: string) {
  return useQuery({
    queryKey: ['wa-enrollments', sequence_id],
    enabled: !!sequence_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wa_sequence_enrollments')
        .select('*')
        .eq('sequence_id', sequence_id!)
        .order('enrolled_at', { ascending: false });
      if (error) throw error;
      return (data || []) as SequenceEnrollment[];
    },
  });
}

export function useEnrollMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sequence_id: string;
      member_phone: string;
      member_name?: string;
    }) => {
      // Inicializa next_run_at = now (vai disparar primeiro step na próxima rodada do worker)
      const { data, error } = await supabase
        .from('wa_sequence_enrollments')
        .insert({
          sequence_id: input.sequence_id,
          member_phone: input.member_phone,
          member_name: input.member_name,
          current_step: 0,
          status: 'active',
          next_run_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return data as SequenceEnrollment;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wa-enrollments', vars.sequence_id] });
    },
  });
}

export function useCancelEnrollment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('wa_sequence_enrollments')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wa-enrollments'] });
    },
  });
}
