/**
 * useAgentTools — CRUD tools com usage_mode 3-state.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export type UsageMode = 'always' | 'with_approval' | 'disabled';

export interface AgentTool {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  parameters_schema: Record<string, any>;
  action_type: 'sql' | 'http' | 'webhook' | 'edge_function';
  action_config: Record<string, any>;
  usage_mode: UsageMode;
  is_active: boolean;
  created_at: string;
}

export function useAgentTools(agentId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['agent-tools', agentId],
    queryFn: async (): Promise<AgentTool[]> => {
      if (!agentId) return [];
      const { data } = await supabase
        .from('agents_tools')
        .select('*')
        .eq('agent_id', agentId)
        .order('name');
      return (data as AgentTool[]) || [];
    },
    enabled: !!agentId,
    staleTime: 30_000,
  });

  const updateMode = useMutation({
    mutationFn: async ({ toolId, mode }: { toolId: string; mode: UsageMode }) => {
      const { error } = await supabase
        .from('agents_tools')
        .update({
          usage_mode: mode,
          is_active: mode !== 'disabled',
        })
        .eq('id', toolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-tools', agentId] });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  const saveTool = useMutation({
    mutationFn: async (tool: Partial<AgentTool> & { agent_id: string }) => {
      if (tool.id) {
        const { id, agent_id, created_at, ...patch } = tool as AgentTool;
        const { error } = await supabase
          .from('agents_tools')
          .update(patch)
          .eq('id', id);
        if (error) throw error;
        return { id };
      } else {
        const { data, error } = await supabase
          .from('agents_tools')
          .insert({
            agent_id: tool.agent_id,
            name: tool.name,
            description: tool.description,
            parameters_schema: tool.parameters_schema || {},
            action_type: tool.action_type,
            action_config: tool.action_config || {},
            usage_mode: tool.usage_mode || 'always',
          })
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      toast({ title: 'Tool salva' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  const deleteTool = useMutation({
    mutationFn: async (toolId: string) => {
      const { error } = await supabase.from('agents_tools').delete().eq('id', toolId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-tools', agentId] });
      toast({ title: 'Tool removida' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  return {
    tools: query.data || [],
    loading: query.isLoading,
    setMode: updateMode.mutate,
    saveTool: saveTool.mutate,
    isSaving: saveTool.isPending,
    deleteTool: deleteTool.mutate,
  };
}
