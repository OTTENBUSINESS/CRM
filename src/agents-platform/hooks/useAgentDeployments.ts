/**
 * useAgentDeployments — CRUD canais onde o agente aparece.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export type Channel = 'whatsapp' | 'chat_web' | 'floating' | 'sidebar' | 'inbox' | 'telegram' | 'instagram' | 'email' | 'cron';

export interface AgentDeployment {
  id: string;
  agent_id: string;
  channel: Channel;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

export function useAgentDeployments(agentId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['agent-deployments', agentId],
    queryFn: async (): Promise<AgentDeployment[]> => {
      if (!agentId) return [];
      const { data } = await supabase
        .from('agents_deployments')
        .select('*')
        .eq('agent_id', agentId)
        .order('channel');
      return (data as AgentDeployment[]) || [];
    },
    enabled: !!agentId,
    staleTime: 30_000,
  });

  const upsert = useMutation({
    mutationFn: async (d: Partial<AgentDeployment> & { agent_id: string; channel: Channel }) => {
      if (d.id) {
        const { error } = await supabase
          .from('agents_deployments')
          .update({ config: d.config || {}, is_active: d.is_active ?? true })
          .eq('id', d.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agents_deployments')
          .insert({
            agent_id: d.agent_id,
            channel: d.channel,
            config: d.config || {},
            is_active: d.is_active ?? true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-deployments', agentId] });
      toast({ title: 'Canal salvo' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (deploymentId: string) => {
      const { error } = await supabase.from('agents_deployments').delete().eq('id', deploymentId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-deployments', agentId] });
    },
  });

  return {
    deployments: query.data || [],
    loading: query.isLoading,
    upsert: upsert.mutate,
    remove: remove.mutate,
  };
}
