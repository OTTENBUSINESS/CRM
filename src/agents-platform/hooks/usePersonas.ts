/**
 * usePersonas — personas de teste do playground.
 * Templates (compartilhadas) + per-agent (custom).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface Persona {
  id: string;
  agent_id: string | null;
  name: string;
  description: string | null;
  color: string;
  persona_prompt: string | null;
  is_template: boolean;
  created_at: string;
}

export function usePersonas(agentId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['personas', agentId],
    queryFn: async (): Promise<Persona[]> => {
      const q = supabase.from('agents_personas').select('*');
      const { data } = agentId
        ? await q.or(`is_template.eq.true,agent_id.eq.${agentId}`).order('is_template', { ascending: false })
        : await q.eq('is_template', true);
      return (data as Persona[]) || [];
    },
    staleTime: 60_000,
  });

  const upsert = useMutation({
    mutationFn: async (p: Partial<Persona> & { name: string }) => {
      if (p.id) {
        const { error } = await supabase
          .from('agents_personas')
          .update({
            name: p.name, description: p.description, color: p.color,
            persona_prompt: p.persona_prompt,
          })
          .eq('id', p.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('agents_personas')
          .insert({
            agent_id: agentId,
            name: p.name,
            description: p.description,
            color: p.color || 'gray',
            persona_prompt: p.persona_prompt,
            is_template: false,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['personas', agentId] });
      toast({ title: 'Persona salva' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agents_personas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['personas', agentId] }),
  });

  return {
    personas: query.data || [],
    loading: query.isLoading,
    upsert: upsert.mutate,
    remove: remove.mutate,
  };
}
