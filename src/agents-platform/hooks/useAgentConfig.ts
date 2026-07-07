/**
 * useAgentConfig — CRUD do agents_registry pra UI de configuração.
 * Salva rascunho (UPDATE direto) e Publica versão (INSERT em agents_versions).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface AgentConfig {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  emoji: string | null;
  provider: string;
  model: string;
  endpoint_url: string | null;
  system_prompt: string;
  settings: Record<string, any>;
  daily_token_limit: number | null;
  daily_cost_limit_brl: number | null;
  version: number;
  is_active: boolean;
  parent_agent_id: string | null;
  avatar_color: string;
  responsible_user_id: string | null;
  tier: 'ceo' | 'manager' | 'specialist';
  credential_id: string | null;
  is_template?: boolean;
  created_at: string;
  updated_at: string;
  /** Provider da credencial vinculada (fonte de verdade real, igual o runner usa) */
  credential?: { provider_type: string; label: string } | null;
}

/** Provider EFETIVO: o da credencial vinculada vence o campo estático (igual o agent-runner). */
export function effectiveProvider(a: Pick<AgentConfig, 'provider' | 'credential'>): string {
  return a.credential?.provider_type || a.provider;
}

export function useAgentConfig(slugOrId: string) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['agent-config', slugOrId],
    queryFn: async (): Promise<AgentConfig | null> => {
      const col = slugOrId.match(/^[0-9a-f-]{36}$/) ? 'id' : 'slug';
      const { data } = await supabase
        .from('agents_registry')
        .select('*')
        .eq(col, slugOrId)
        .single();
      return (data as AgentConfig) || null;
    },
    staleTime: 30_000,
  });

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<AgentConfig>) => {
      if (!query.data?.id) throw new Error('Sem ID');
      const { data, error } = await supabase
        .from('agents_registry')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', query.data.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-config', slugOrId] });
      qc.invalidateQueries({ queryKey: ['agents-platform-list'] });
      toast({ title: 'Rascunho salvo' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    },
  });

  const publishMutation = useMutation({
    // FIX: aceita draft + summary. Salva draft PRIMEIRO, depois cria versão.
    // Antes pegava query.data (estado antigo do banco) → ignorava mudanças do draft.
    mutationFn: async (payload: { draft: Partial<AgentConfig>; summary?: string }) => {
      if (!query.data?.id) throw new Error('Sem ID');
      const agentId = query.data.id;
      const { draft, summary } = payload;

      // 1. PRIMEIRO salva o draft no registry (UPDATE)
      const { id, slug, created_at, updated_at, version, ...patch } = draft as AgentConfig;
      const { error: updateErr, data: savedAgent } = await supabase
        .from('agents_registry')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', agentId)
        .select()
        .single();
      if (updateErr) throw updateErr;

      // 2. Desmarca versão anterior como publicada
      await supabase
        .from('agents_versions')
        .update({ is_published: false, published_at: null })
        .eq('agent_id', agentId)
        .eq('is_published', true);

      // 3. Cria nova versão com o conteúdo SALVO
      const { data, error } = await supabase
        .from('agents_versions')
        .insert({
          agent_id: agentId,
          system_prompt: savedAgent.system_prompt,
          settings: savedAgent.settings,
          change_summary: summary || `Publicado em ${new Date().toLocaleString('pt-BR')}`,
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      await supabase
        .from('agents_registry')
        .update({ version: data.version_number, updated_at: new Date().toISOString() })
        .eq('id', agentId);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-config', slugOrId] });
      qc.invalidateQueries({ queryKey: ['agent-versions'] });
      toast({ title: 'Versão publicada' });
    },
    onError: (e: Error) => {
      toast({ title: 'Erro ao publicar', description: e.message, variant: 'destructive' });
    },
  });

  return {
    config: query.data,
    loading: query.isLoading,
    saveDraft: updateMutation.mutate,
    isSaving: updateMutation.isPending,
    publish: publishMutation.mutate,
    isPublishing: publishMutation.isPending,
  };
}

/** Lista todos agentes (pra grid + organograma) */
export function useAgentsList() {
  return useQuery({
    queryKey: ['agents-platform-list'],
    queryFn: async (): Promise<AgentConfig[]> => {
      // Lista TODOS (incluindo templates is_active=false) — UI distingue por badge.
      // Traz a credencial vinculada pra derivar o provider EFETIVO (igual o runner).
      const { data } = await supabase
        .from('agents_registry')
        .select('*, credential:agents_provider_credentials(provider_type, label)')
        .order('is_template', { ascending: true })
        .order('display_name');
      return (data as AgentConfig[]) || [];
    },
    staleTime: 30_000,
  });
}
