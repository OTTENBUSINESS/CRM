import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';

export interface SalesNote {
  id: string;
  lead_id: string | null;
  deal_id: string | null;
  content: string;
  note_type: 'note' | 'research' | 'call_summary' | 'objection' | 'follow_up' | 'meeting_notes';
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  creator?: {
    id: string;
    name: string;
  };
}

export const NOTE_TYPES = [
  { value: 'note', label: 'Nota', icon: '📝' },
  { value: 'research', label: 'Pesquisa', icon: '🔍' },
  { value: 'call_summary', label: 'Resumo de Ligação', icon: '📞' },
  { value: 'objection', label: 'Objeção', icon: '⚠️' },
  { value: 'follow_up', label: 'Follow-up', icon: '🔄' },
  { value: 'meeting_notes', label: 'Notas de Reunião', icon: '📋' },
] as const;

// Buscar notas de um lead
export const useLeadNotes = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['sales-notes', 'lead', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('sales_notes')
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesNote[];
    },
    enabled: !!leadId,
  });
};

// Buscar notas de um deal
export const useDealNotes = (dealId: string | undefined) => {
  return useQuery({
    queryKey: ['sales-notes', 'deal', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      
      const { data, error } = await supabase
        .from('sales_notes')
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesNote[];
    },
    enabled: !!dealId,
  });
};

// Buscar todas as notas de um lead E seus deals
export const useLeadAndDealNotes = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['sales-notes', 'lead-and-deals', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      // Buscar notas do lead
      const { data: leadNotes, error: leadError } = await supabase
        .from('sales_notes')
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (leadError) throw leadError;

      // Buscar deals do lead
      const { data: deals } = await supabase
        .from('deals')
        .select('id')
        .eq('lead_id', leadId);

      const dealIds = deals?.map(d => d.id) || [];

      // Buscar notas dos deals
      let dealNotes: any[] = [];
      if (dealIds.length > 0) {
        const { data, error } = await supabase
          .from('sales_notes')
          .select(`
            *,
            creator:team_members!created_by(id, name)
          `)
          .in('deal_id', dealIds)
          .is('lead_id', null) // Só notas exclusivas do deal
          .order('created_at', { ascending: false });

        if (!error) dealNotes = data || [];
      }

      // Combinar e ordenar por data
      const allNotes = [...(leadNotes || []), ...dealNotes].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      return allNotes as SalesNote[];
    },
    enabled: !!leadId,
  });
};

// Criar nota
export const useCreateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      dealId,
      content,
      noteType,
      createdBy,
    }: {
      leadId?: string;
      dealId?: string;
      content: string;
      noteType: string;
      createdBy?: string;
    }) => {
      const { data, error } = await supabase
        .from('sales_notes')
        .insert({
          lead_id: leadId || null,
          deal_id: dealId || null,
          content,
          note_type: noteType,
          created_by: createdBy || null,
        })
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .single();

      if (error) throw error;
      return data as SalesNote;
    },
    onSuccess: (data) => {
      if (data.lead_id) {
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'lead', data.lead_id] });
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'lead-and-deals', data.lead_id] });
      }
      if (data.deal_id) {
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'deal', data.deal_id] });
      }
    },
  });
};

// Atualizar nota
export const useUpdateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      noteId,
      content,
      noteType,
    }: {
      noteId: string;
      content?: string;
      noteType?: string;
    }) => {
      const updateData: any = {};
      if (content !== undefined) updateData.content = content;
      if (noteType !== undefined) updateData.note_type = noteType;

      const { data, error } = await supabase
        .from('sales_notes')
        .update(updateData)
        .eq('id', noteId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesNote;
    },
    onSuccess: (data) => {
      if (data.lead_id) {
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'lead', data.lead_id] });
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'lead-and-deals', data.lead_id] });
      }
      if (data.deal_id) {
        queryClient.invalidateQueries({ queryKey: ['sales-notes', 'deal', data.deal_id] });
      }
    },
  });
};

// Deletar nota
export const useDeleteNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      // Primeiro buscar a nota para saber os IDs (para invalidation)
      const { data: note } = await supabase
        .from('sales_notes')
        .select('lead_id, deal_id')
        .eq('id', noteId)
        .single();

      const queryKeys: string[][] = [['sales-notes']];
      if (note?.lead_id) {
        queryKeys.push(['sales-notes', 'lead', note.lead_id]);
        queryKeys.push(['sales-notes', 'lead-and-deals', note.lead_id]);
      }
      if (note?.deal_id) {
        queryKeys.push(['sales-notes', 'deal', note.deal_id]);
      }

      await deleteWithUndo({
        table: 'sales_notes',
        id: noteId,
        label: 'Nota',
        queryClient,
        queryKeys,
      });
    },
  });
};
