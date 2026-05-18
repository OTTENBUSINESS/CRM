import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: 'task_created' | 'task_completed' | 'deal_created' | 'deal_stage_changed' | 'lead_score_changed' | 'days_in_stage' | 'lead_replied' | 'meeting_scheduled' | 'meeting_completed' | 'meeting_no_show';
  trigger_conditions: {
    task_types?: string[];
    has_scheduled_date?: boolean;
    stage_ids?: string[];
    days?: number;
    exclude_stages?: string[];
  };
  action_type: 'move_deal_stage' | 'create_task' | 'send_notification' | 'update_lead_field' | 'send_webhook';
  action_config: {
    target_stage_id?: string;
    only_if_position_less_than?: number;
    task_template?: {
      name: string;
      task_type: string;
      days_offset?: number;
    };
    type?: string;
    message?: string;
    webhook_url?: string;
  };
  is_active: boolean;
  team: 'sales' | 'cs' | 'marketing' | 'all';
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationRuleInput {
  name: string;
  description?: string;
  trigger_type: AutomationRule['trigger_type'];
  trigger_conditions?: AutomationRule['trigger_conditions'];
  action_type: AutomationRule['action_type'];
  action_config?: AutomationRule['action_config'];
  is_active?: boolean;
  team?: AutomationRule['team'];
  priority?: number;
}

export interface UpdateAutomationRuleInput extends Partial<CreateAutomationRuleInput> {
  id: string;
}

// Buscar todas as regras de automação
export const useSalesAutomationRules = (team?: string) => {
  return useQuery({
    queryKey: ['sales-automation-rules', team],
    queryFn: async () => {
      let query = supabase
        .from('sales_automation_rules')
        .select('*')
        .order('priority', { ascending: true });

      if (team && team !== 'all') {
        query = query.or(`team.eq.${team},team.eq.all`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AutomationRule[];
    },
  });
};

// Buscar regras ativas por trigger
export const useActiveRulesByTrigger = (triggerType: AutomationRule['trigger_type'], team?: string) => {
  return useQuery({
    queryKey: ['active-automation-rules', triggerType, team],
    queryFn: async () => {
      let query = supabase
        .from('sales_automation_rules')
        .select('*')
        .eq('trigger_type', triggerType)
        .eq('is_active', true)
        .order('priority', { ascending: true });

      if (team) {
        query = query.or(`team.eq.${team},team.eq.all`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AutomationRule[];
    },
    enabled: !!triggerType,
  });
};

// Criar regra
export const useCreateAutomationRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateAutomationRuleInput) => {
      const { data, error } = await supabase
        .from('sales_automation_rules')
        .insert({
          ...input,
          trigger_conditions: input.trigger_conditions || {},
          action_config: input.action_config || {},
        })
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['active-automation-rules'] });
    },
  });
};

// Atualizar regra
export const useUpdateAutomationRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateAutomationRuleInput) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('sales_automation_rules')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['active-automation-rules'] });
    },
  });
};

// Deletar regra
export const useDeleteAutomationRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWithUndo({
        table: 'sales_automation_rules',
        id,
        label: 'Regra',
        queryClient,
        queryKeys: [['sales-automation-rules'], ['active-automation-rules']],
      });
    },
  });
};

// Toggle ativo/inativo
export const useToggleAutomationRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('sales_automation_rules')
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AutomationRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-automation-rules'] });
      queryClient.invalidateQueries({ queryKey: ['active-automation-rules'] });
    },
  });
};

// Labels para exibição
export const TRIGGER_TYPE_LABELS: Record<AutomationRule['trigger_type'], string> = {
  task_created: 'Tarefa Criada',
  task_completed: 'Tarefa Completada',
  deal_created: 'Deal Criado',
  deal_stage_changed: 'Deal Mudou de Estágio',
  lead_score_changed: 'Score do Lead Mudou',
  days_in_stage: 'Dias no Estágio',
  lead_replied: 'Lead Respondeu (WhatsApp)',
  meeting_scheduled: 'Reunião Agendada',
  meeting_completed: 'Reunião Realizada',
  meeting_no_show: 'No-show em Reunião',
};

export const ACTION_TYPE_LABELS: Record<AutomationRule['action_type'], string> = {
  move_deal_stage: 'Mover Deal para Estágio',
  create_task: 'Criar Tarefa',
  send_notification: 'Enviar Notificação',
  update_lead_field: 'Atualizar Campo do Lead',
  send_webhook: 'Chamar Webhook',
};

export const TEAM_LABELS: Record<AutomationRule['team'], string> = {
  sales: 'Comercial',
  cs: 'Customer Success',
  marketing: 'Marketing',
  all: 'Todos',
};
