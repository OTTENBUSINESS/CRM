import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type { SalesPipeline, PipelineStage, PipelineTransition } from '@/types/sales.types';

// =====================================================
// PIPELINES
// =====================================================

export const usePipelines = () => {
  return useQuery({
    queryKey: ['pipelines'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_pipelines')
        .select('*')
        .eq('is_active', true)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data || []) as SalesPipeline[];
    },
  });
};

export const useCreatePipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { name: string; description?: string }) => {
      // Get max position
      const { data: existing } = await supabase
        .from('sales_pipelines')
        .select('position')
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 0;

      const { data, error } = await supabase
        .from('sales_pipelines')
        .insert({
          name: input.name,
          description: input.description || null,
          position: nextPosition,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SalesPipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });
};

export const useUpdatePipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { id: string; name?: string; description?: string; position?: number; default_sales_rep_id?: string | null }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('sales_pipelines')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as SalesPipeline;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
    },
  });
};

export const useDeletePipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pipelineId: string) => {
      // Check if has deals
      const { data: deals } = await supabase
        .from('deals')
        .select('id')
        .eq('pipeline_id', pipelineId)
        .limit(1);

      if (deals && deals.length > 0) {
        throw new Error('Não é possível deletar um pipeline que possui deals. Mova os deals primeiro.');
      }

      // Delete stages first
      await supabase
        .from('sales_pipeline_stages')
        .delete()
        .eq('pipeline_id', pipelineId);

      // Delete transitions
      await supabase
        .from('sales_pipeline_transitions')
        .delete()
        .or(`source_pipeline_id.eq.${pipelineId},target_pipeline_id.eq.${pipelineId}`);

      const { error } = await supabase
        .from('sales_pipelines')
        .delete()
        .eq('id', pipelineId);

      if (error) throw error;

      toast('Pipeline excluído');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipelines'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
    },
  });
};

// =====================================================
// STAGES (by Pipeline)
// =====================================================

export const usePipelineStagesByPipeline = (pipelineId: string | undefined) => {
  return useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      if (!pipelineId) return [];

      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .select('*')
        .eq('pipeline_id', pipelineId)
        .order('position', { ascending: true });

      if (error) throw error;
      return (data || []) as PipelineStage[];
    },
    enabled: !!pipelineId,
  });
};

export const useCreatePipelineStageForPipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      pipeline_id: string;
      name: string;
      color?: string;
      is_won?: boolean;
      is_lost?: boolean;
    }) => {
      // Get max position for this pipeline
      const { data: existing } = await supabase
        .from('sales_pipeline_stages')
        .select('position')
        .eq('pipeline_id', input.pipeline_id)
        .order('position', { ascending: false })
        .limit(1);

      const nextPosition = existing && existing.length > 0 ? existing[0].position + 1 : 1;

      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .insert({
          pipeline_id: input.pipeline_id,
          name: input.name,
          position: nextPosition,
          color: input.color || 'slate',
          is_won: input.is_won || false,
          is_lost: input.is_lost || false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as PipelineStage;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages', variables.pipeline_id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
    },
  });
};

export const useUpdatePipelineStageConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      color?: string;
      is_won?: boolean;
      is_lost?: boolean;
    }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PipelineStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    },
  });
};

export const useDeletePipelineStageConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (stageId: string) => {
      // Check if has deals
      const { data: deals } = await supabase
        .from('deals')
        .select('id')
        .eq('pipeline_stage_id', stageId)
        .limit(1);

      if (deals && deals.length > 0) {
        throw new Error('Não é possível deletar uma etapa que possui deals.');
      }

      await deleteWithUndo({
        table: 'sales_pipeline_stages',
        id: stageId,
        label: 'Etapa',
        queryClient,
        queryKeys: [['pipeline-stages']],
      });
    },
  });
};

export const useReorderPipelineStagesConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedStageIds: string[]) => {
      const updates = orderedStageIds.map((id, index) =>
        supabase
          .from('sales_pipeline_stages')
          .update({ position: index + 1 })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    },
  });
};

// =====================================================
// TRANSITIONS
// =====================================================

export const usePipelineTransitions = () => {
  return useQuery({
    queryKey: ['pipeline-transitions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_pipeline_transitions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PipelineTransition[];
    },
  });
};

export const useCreateTransition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      source_pipeline_id: string;
      source_stage_id: string;
      target_pipeline_id: string;
      target_stage_id: string;
      action?: 'move' | 'duplicate';
    }) => {
      const { data, error } = await supabase
        .from('sales_pipeline_transitions')
        .insert({
          source_pipeline_id: input.source_pipeline_id,
          source_stage_id: input.source_stage_id,
          target_pipeline_id: input.target_pipeline_id,
          target_stage_id: input.target_stage_id,
          action: input.action || 'move',
        })
        .select()
        .single();

      if (error) throw error;
      return data as PipelineTransition;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-transitions'] });
    },
  });
};

export const useDeleteTransition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (transitionId: string) => {
      await deleteWithUndo({
        table: 'sales_pipeline_transitions',
        id: transitionId,
        label: 'Transição',
        queryClient,
        queryKeys: [['pipeline-transitions']],
      });
    },
  });
};
