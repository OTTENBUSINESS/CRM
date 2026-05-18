import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCreateTask } from './useTasks';
import { useLoseDeal, useMoveDealStage } from './useSalesDeals';
import { toast } from 'sonner';

// Busca deal ativo mais recente para um lead
export const useActiveDealForLead = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['active-deal-for-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;
      const { data, error } = await supabase
        .from('deals')
        .select(`
          id, title, status, negotiated_price,
          pipeline_stage_id,
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(
            id, name, position, pipeline_id
          )
        `)
        .eq('lead_id', leadId)
        .in('status', ['open', 'negotiation'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!leadId,
  });
};

// Busca motivos de perda
export const useLossReasons = () => {
  return useQuery({
    queryKey: ['deal-loss-reasons'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_loss_reasons')
        .select('id, label, position, is_active')
        .eq('is_active', true)
        .order('position');
      if (error) throw error;
      return data || [];
    },
  });
};

// Salva outcome no call_history
async function saveCallOutcome(
  callId: string,
  outcome: 'schedule_partner_call' | 'schedule_payment' | 'lost',
  details?: Record<string, any>
) {
  const { error } = await supabase
    .from('call_history')
    .update({
      call_outcome: outcome,
      call_outcome_details: details || null,
    })
    .eq('id', callId);

  if (error) console.error('Erro ao salvar call_outcome:', error);
}

// Busca próximo estágio do pipeline
async function getNextStage(currentStageId: string): Promise<string | null> {
  const { data: currentStage } = await supabase
    .from('sales_pipeline_stages')
    .select('pipeline_id, position')
    .eq('id', currentStageId)
    .single();

  if (!currentStage) return null;

  const { data: nextStage } = await supabase
    .from('sales_pipeline_stages')
    .select('id')
    .eq('pipeline_id', currentStage.pipeline_id)
    .eq('is_won', false)
    .eq('is_lost', false)
    .gt('position', currentStage.position)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();

  return nextStage?.id || null;
}

// Busca estágio pré-won (último antes do won)
async function getPreWonStage(pipelineId: string): Promise<string | null> {
  const { data: stages } = await supabase
    .from('sales_pipeline_stages')
    .select('id, position')
    .eq('pipeline_id', pipelineId)
    .eq('is_won', false)
    .eq('is_lost', false)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();

  return stages?.id || null;
}

interface ScheduleActionParams {
  callId: string;
  leadId: string;
  leadName: string;
  scheduledDate: Date;
  dealId?: string;
  dealStageId?: string;
  dealPipelineId?: string;
}

// Agendar call com sócio
export const useSchedulePartnerCall = () => {
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const moveDealStage = useMoveDealStage();

  return useMutation({
    mutationFn: async (params: ScheduleActionParams) => {
      const { callId, leadId, leadName, scheduledDate, dealId, dealStageId } = params;

      // 1. Criar task
      await createTask.mutateAsync({
        name: `Call com sócio - ${leadName}`,
        description: `Agendar call com sócio/decisor do lead ${leadName}. Próximo passo definido após call de vendas.`,
        task_type: 'call',
        team: 'sales',
        priority: 'high',
        lead_id: leadId,
        scheduled_at: scheduledDate.toISOString(),
      });

      // 2. Mover deal para próximo estágio
      if (dealId && dealStageId) {
        const nextStageId = await getNextStage(dealStageId);
        if (nextStageId) {
          await moveDealStage.mutateAsync({ dealId, stageId: nextStageId });
        }
      }

      // 3. Salvar outcome
      await saveCallOutcome(callId, 'schedule_partner_call', {
        scheduled_date: scheduledDate.toISOString(),
        task_type: 'partner_call',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      toast.success('Call com sócio agendada!');
    },
    onError: (error) => {
      console.error('Erro ao agendar call:', error);
      toast.error('Erro ao agendar call com sócio');
    },
  });
};

// Agendar pagamento
export const useSchedulePayment = () => {
  const queryClient = useQueryClient();
  const createTask = useCreateTask();
  const moveDealStage = useMoveDealStage();

  return useMutation({
    mutationFn: async (params: ScheduleActionParams) => {
      const { callId, leadId, leadName, scheduledDate, dealId, dealPipelineId } = params;

      // 1. Criar task
      await createTask.mutateAsync({
        name: `Receber pagamento - ${leadName}`,
        description: `Acompanhar pagamento do lead ${leadName}. Próximo passo definido após call de vendas.`,
        task_type: 'follow_up',
        team: 'sales',
        priority: 'high',
        lead_id: leadId,
        scheduled_at: scheduledDate.toISOString(),
      });

      // 2. Mover deal para estágio pré-won
      if (dealId && dealPipelineId) {
        const preWonStageId = await getPreWonStage(dealPipelineId);
        if (preWonStageId) {
          await moveDealStage.mutateAsync({ dealId, stageId: preWonStageId });
        }
      }

      // 3. Salvar outcome
      await saveCallOutcome(callId, 'schedule_payment', {
        scheduled_date: scheduledDate.toISOString(),
        task_type: 'payment',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      toast.success('Pagamento agendado!');
    },
    onError: (error) => {
      console.error('Erro ao agendar pagamento:', error);
      toast.error('Erro ao agendar pagamento');
    },
  });
};

// Marcar como perdida
export const useMarkCallLost = () => {
  const queryClient = useQueryClient();
  const loseDeal = useLoseDeal();

  return useMutation({
    mutationFn: async ({
      callId,
      leadId,
      reason,
      dealId,
    }: {
      callId: string;
      leadId: string;
      reason: string;
      dealId?: string;
    }) => {
      // 1. Se tem deal → perder deal
      if (dealId) {
        await loseDeal.mutateAsync({ dealId, reason });
      } else {
        // Sem deal → atualizar lead direto
        await supabase
          .from('leads')
          .update({
            sales_stage: 'perdido',
            lost_reason: reason,
            lost_at: new Date().toISOString(),
          })
          .eq('id', leadId);
      }

      // 2. Salvar outcome
      await saveCallOutcome(callId, 'lost', { reason, had_deal: !!dealId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      toast.success('Marcado como perdido');
    },
    onError: (error) => {
      console.error('Erro ao marcar como perdido:', error);
      toast.error('Erro ao marcar como perdido');
    },
  });
};
