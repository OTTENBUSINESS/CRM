import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ────────────────────────────────────────────────────────────

export interface EmailAutomation {
  id: string;
  name: string;
  description: string | null;
  trigger_event: string | null;
  trigger_filter: Record<string, any>;
  flow_json: any;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailFlowRun {
  id: string;
  automation_id: string | null;
  lead_id: string | null;
  current_node_id: string | null;
  scheduled_next_at: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  context: Record<string, any>;
}

const LIST_KEY = ['email-automations'];
const runsKey = (automationId?: string) => ['email-flow-runs', automationId];

// ── Queries ──────────────────────────────────────────────────────────

/** Lista todas as automações de email (mais recentes primeiro). */
export function useEmailAutomations() {
  return useQuery({
    queryKey: LIST_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_flow_automations')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EmailAutomation[];
    },
  });
}

/** Busca uma única automação por id. */
export function useEmailAutomation(id?: string) {
  return useQuery({
    queryKey: ['email-automation', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_flow_automations')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data as EmailAutomation;
    },
  });
}

/** Execuções (runs) de uma automação (mais recentes primeiro). */
export function useAutomationRunsList(automationId?: string) {
  return useQuery({
    queryKey: runsKey(automationId),
    enabled: !!automationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_flow_runs')
        .select('*')
        .eq('automation_id', automationId!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data || []) as EmailFlowRun[];
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────

type CreateAutomationInput = Partial<
  Pick<EmailAutomation, 'name' | 'description' | 'trigger_event' | 'trigger_filter' | 'flow_json' | 'is_active'>
> & { name: string };

/** Cria uma nova automação (created_by = teamMember?.id). */
export function useCreateEmailAutomation() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateAutomationInput) => {
      const { data, error } = await supabase
        .from('email_flow_automations')
        .insert({
          ...input,
          created_by: teamMember?.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data as EmailAutomation;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

type UpdateAutomationInput = { id: string } & Partial<
  Pick<EmailAutomation, 'name' | 'description' | 'trigger_event' | 'trigger_filter' | 'flow_json' | 'is_active'>
>;

/** Atualiza uma automação por id. */
export function useUpdateEmailAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: UpdateAutomationInput) => {
      const { data, error } = await supabase
        .from('email_flow_automations')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as EmailAutomation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['email-automation', data.id] });
    },
  });
}

/** Remove uma automação por id. */
export function useDeleteEmailAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('email_flow_automations')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
    },
  });
}

/** Liga/desliga uma automação (is_active). */
export function useToggleEmailAutomation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('email_flow_automations')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as EmailAutomation;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: LIST_KEY });
      qc.invalidateQueries({ queryKey: ['email-automation', data.id] });
    },
  });
}
