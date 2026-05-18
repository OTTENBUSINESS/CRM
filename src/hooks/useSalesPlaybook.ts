import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface SalesPlaybook {
  id: string;
  content: string;
  title: string;
  description?: string;
  version: number;
  last_edited_by?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Fetch the active playbook
export const useSalesPlaybook = () => {
  return useQuery({
    queryKey: ['sales-playbook'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_playbook')
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error; // PGRST116 = no rows
      return data as SalesPlaybook | null;
    },
  });
};

// Fetch playbook content only (for AI context)
export const usePlaybookContent = () => {
  return useQuery({
    queryKey: ['sales-playbook-content'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_playbook')
        .select('content')
        .eq('is_active', true)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.content || '';
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
};

// Update playbook
export const useUpdatePlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('sales_playbook')
        .update({
          content,
          version: supabase.rpc('increment_version', { row_id: id }), // Will be raw SQL
          last_edited_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) {
        // Fallback: update without version increment
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('sales_playbook')
          .update({
            content,
            last_edited_by: user?.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
          .select()
          .single();

        if (fallbackError) throw fallbackError;
        return fallbackData as SalesPlaybook;
      }

      return data as SalesPlaybook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-playbook'] });
      queryClient.invalidateQueries({ queryKey: ['sales-playbook-content'] });
    },
  });
};

// Create new playbook (if none exists)
export const useCreatePlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ content, title }: { content: string; title?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('sales_playbook')
        .insert({
          content,
          title: title || 'Playbook de Vendas',
          last_edited_by: user?.id,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SalesPlaybook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-playbook'] });
      queryClient.invalidateQueries({ queryKey: ['sales-playbook-content'] });
    },
  });
};

// Helper: Get playbook context for AI prompts
export const getPlaybookContext = (playbook: SalesPlaybook | null | undefined): string => {
  if (!playbook?.content) {
    return '';
  }

  return `
<playbook>
${playbook.content}
</playbook>

Use as informações do playbook acima como contexto para suas respostas.
Siga as diretrizes de tom, voz e metodologia descritas.
`;
};
