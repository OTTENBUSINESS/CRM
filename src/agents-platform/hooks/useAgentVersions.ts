/**
 * useAgentVersions — histórico + rollback de versões.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  system_prompt: string;
  settings: Record<string, any>;
  change_summary: string | null;
  is_published: boolean;
  published_at: string | null;
  created_at: string;
}

export function useAgentVersions(agentId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['agent-versions', agentId],
    queryFn: async (): Promise<AgentVersion[]> => {
      if (!agentId) return [];
      const { data } = await supabase
        .from('agents_versions')
        .select('*')
        .eq('agent_id', agentId)
        .order('version_number', { ascending: false })
        .limit(20);
      return (data as AgentVersion[]) || [];
    },
    enabled: !!agentId,
    staleTime: 30_000,
  });

  const rollbackTo = useMutation({
    mutationFn: async (versionId: string) => {
      const version = query.data?.find((v) => v.id === versionId);
      if (!version || !agentId) throw new Error('Versão não encontrada');

      // Restaura prompt + settings no registry
      await supabase
        .from('agents_registry')
        .update({
          system_prompt: version.system_prompt,
          settings: version.settings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', agentId);

      // Cria nova versão (não sobrescreve antiga, mantém histórico linear)
      const { data: newVer, error } = await supabase
        .from('agents_versions')
        .insert({
          agent_id: agentId,
          system_prompt: version.system_prompt,
          settings: version.settings,
          change_summary: `Rollback pra v${version.version_number}`,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      // Marca antigas como não publicadas
      await supabase
        .from('agents_versions')
        .update({ is_published: false })
        .eq('agent_id', agentId)
        .neq('id', newVer.id);

      await supabase
        .from('agents_registry')
        .update({ version: newVer.version_number })
        .eq('id', agentId);

      return newVer;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-versions', agentId] });
      qc.invalidateQueries({ queryKey: ['agent-config'] });
      toast({ title: '⏪ Rollback aplicado' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    },
  });

  return {
    versions: query.data || [],
    current: query.data?.find((v) => v.is_published) || null,
    loading: query.isLoading,
    rollbackTo: rollbackTo.mutate,
  };
}
