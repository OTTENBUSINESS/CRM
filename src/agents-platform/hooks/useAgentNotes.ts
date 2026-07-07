/**
 * useAgentNotes — CRUD de notas + busca semântica.
 *
 * Backend:
 *   - Tabela: agent_notes (com embedding pra RAG)
 *   - RPCs: agent_save_note, agent_read_note, agent_list_notes, agent_search_notes
 *   - Versions: agent_note_versions (snapshot automático via trigger)
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

export interface AgentNote {
  id: string;
  agent_id: string;
  owner_user_id: string | null;
  title: string;
  slug: string;
  content: string;
  tags: string[];
  metadata: Record<string, any>;
  archived: boolean;
  embedding_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentNoteVersion {
  id: string;
  note_id: string;
  content: string;
  title: string | null;
  author: 'agent' | 'human';
  author_id: string | null;
  created_at: string;
}

export function useAgentNotes(agentId: string | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const list = useQuery({
    queryKey: ['agent-notes', agentId],
    queryFn: async (): Promise<AgentNote[]> => {
      if (!agentId) return [];
      const { data } = await supabase
        .from('agent_notes')
        .select('*')
        .eq('agent_id', agentId)
        .eq('archived', false)
        .order('updated_at', { ascending: false });
      return (data as AgentNote[]) || [];
    },
    enabled: !!agentId,
    staleTime: 10_000,
  });

  const save = useMutation({
    mutationFn: async (input: {
      id?: string;
      title: string;
      content: string;
      tags?: string[];
      author?: 'agent' | 'human';
    }) => {
      if (!agentId) throw new Error('agent_id obrigatório');
      if (input.id) {
        const { error } = await supabase
          .from('agent_notes')
          .update({
            title: input.title,
            content: input.content,
            tags: input.tags ?? [],
            metadata: { last_author: input.author || 'human' },
          })
          .eq('id', input.id);
        if (error) throw error;
        return input.id;
      } else {
        const slug = slugify(input.title);
        const { data, error } = await supabase
          .from('agent_notes')
          .insert({
            agent_id: agentId,
            title: input.title,
            slug,
            content: input.content,
            tags: input.tags ?? [],
            metadata: { last_author: input.author || 'human' },
          })
          .select('id')
          .single();
        if (error) throw error;
        return data.id;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['agent-notes', agentId] });
      toast({ title: 'Nota salva' });
    },
    onError: (e: Error) => toast({ title: 'Erro', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agent-notes', agentId] }),
  });

  return {
    notes: list.data || [],
    loading: list.isLoading,
    save: save.mutate,
    isSaving: save.isPending,
    remove: remove.mutate,
  };
}

export function useNoteVersions(noteId: string | undefined) {
  return useQuery({
    queryKey: ['agent-note-versions', noteId],
    queryFn: async (): Promise<AgentNoteVersion[]> => {
      if (!noteId) return [];
      const { data } = await supabase
        .from('agent_note_versions')
        .select('*')
        .eq('note_id', noteId)
        .order('created_at', { ascending: false })
        .limit(20);
      return (data as AgentNoteVersion[]) || [];
    },
    enabled: !!noteId,
    staleTime: 30_000,
  });
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || `nota-${Date.now()}`;
}
