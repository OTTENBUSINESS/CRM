import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';

export interface AnalysisTemplate {
  id: string;
  name: string;
  description: string | null;
  prompt: string;
  category: 'call_analysis' | 'lead_insights' | 'message_generation' | 'proposal';
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  name: string;
  description?: string;
  prompt: string;
  category: AnalysisTemplate['category'];
  is_default?: boolean;
}

export interface UpdateTemplateInput {
  id: string;
  name?: string;
  description?: string;
  prompt?: string;
  category?: AnalysisTemplate['category'];
  is_default?: boolean;
  is_active?: boolean;
}

// Fetch all templates
export const useAnalysisTemplates = (category?: AnalysisTemplate['category']) => {
  return useQuery({
    queryKey: ['analysis-templates', category],
    queryFn: async () => {
      let query = supabase
        .from('analysis_templates')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AnalysisTemplate[];
    },
  });
};

// Fetch all templates (including inactive) for admin
export const useAllAnalysisTemplates = () => {
  return useQuery({
    queryKey: ['analysis-templates-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_templates')
        .select('*')
        .order('category', { ascending: true })
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as AnalysisTemplate[];
    },
  });
};

// Fetch single template
export const useAnalysisTemplate = (templateId: string | undefined) => {
  return useQuery({
    queryKey: ['analysis-template', templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data, error } = await supabase
        .from('analysis_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (error) throw error;
      return data as AnalysisTemplate;
    },
    enabled: !!templateId,
  });
};

// Get default template for category
export const useDefaultTemplate = (category: AnalysisTemplate['category']) => {
  return useQuery({
    queryKey: ['analysis-template-default', category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('analysis_templates')
        .select('*')
        .eq('category', category)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as AnalysisTemplate | null;
    },
  });
};

// Create template
export const useCreateAnalysisTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTemplateInput) => {
      // If setting as default, unset other defaults in same category
      if (input.is_default) {
        await supabase
          .from('analysis_templates')
          .update({ is_default: false })
          .eq('category', input.category);
      }

      const { data, error } = await supabase
        .from('analysis_templates')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as AnalysisTemplate;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['analysis-templates'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-template-default'] });
    },
  });
};

// Update template
export const useUpdateAnalysisTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTemplateInput) => {
      const { id, ...updates } = input;

      // If setting as default, unset other defaults in same category
      if (updates.is_default && updates.category) {
        await supabase
          .from('analysis_templates')
          .update({ is_default: false })
          .eq('category', updates.category);
      }

      const { data, error } = await supabase
        .from('analysis_templates')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as AnalysisTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['analysis-templates'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-templates-all'] });
      queryClient.invalidateQueries({ queryKey: ['analysis-template', data.id] });
      queryClient.invalidateQueries({ queryKey: ['analysis-template-default'] });
    },
  });
};

// Delete template (soft delete - set inactive)
export const useDeleteAnalysisTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      await deleteWithUndo({
        table: 'analysis_templates',
        id: templateId,
        label: 'Template',
        queryClient,
        queryKeys: [['analysis-templates'], ['analysis-templates-all']],
        softDelete: true,
      });
    },
  });
};

// Category labels
export const templateCategoryLabels: Record<AnalysisTemplate['category'], string> = {
  call_analysis: 'Análise de Ligação',
  lead_insights: 'Insights de Lead',
  message_generation: 'Geração de Mensagem',
  proposal: 'Proposta',
};
