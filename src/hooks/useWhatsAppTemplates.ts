import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

// ── Types ────────────────────────────────────────────────────────────

export type CloudTemplateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | string;
export type CloudTemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string;

export interface WhatsAppCloudTemplate {
  id: string;
  meta_template_id: string | null;
  meta_waba_id: string | null;
  name: string;
  language: string;
  category: CloudTemplateCategory | null;
  status: CloudTemplateStatus;
  components: any[];
  variables_count: number;
  rejection_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const QUERY_KEY = ['whatsapp-cloud-templates'];

// ── Query ────────────────────────────────────────────────────────────

/** Lista templates Meta Cloud API (filtrados por RLS/tenant). */
export function useWhatsAppTemplates() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_cloud_templates')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as WhatsAppCloudTemplate[];
    },
  });
}

// ── Mutations ────────────────────────────────────────────────────────

interface CreateCloudTemplateInput {
  name: string;
  category: CloudTemplateCategory;
  language: string;
  components: any[];
}

/** Cria template na Meta via edge function `create-whatsapp-template`. */
export function useCreateCloudTemplate() {
  const qc = useQueryClient();
  const { teamMember } = useAuth();
  return useMutation({
    mutationFn: async (input: CreateCloudTemplateInput) => {
      const { data, error } = await supabase.functions.invoke('create-whatsapp-template', {
        body: {
          name: input.name,
          category: input.category,
          language: input.language,
          components: input.components,
          created_by: teamMember?.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Sincroniza templates da Meta pro banco local via `sync-whatsapp-templates`. */
export function useSyncCloudTemplates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('sync-whatsapp-templates', {
        body: {},
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}

/** Remove o registro local do template por id. */
export function useDeleteCloudTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('whatsapp_cloud_templates')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QUERY_KEY });
    },
  });
}
