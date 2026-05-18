import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { deleteWithUndo } from "@/lib/undoable-delete";
import { useAuth } from "@/contexts/AuthContext";

export interface SalesMaterial {
  id: string;
  name: string;
  description: string | null;
  type: 'image' | 'video' | 'document' | 'audio';
  file_url: string;
  thumbnail_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  tags: string[];
  usage_hint: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  creator?: { id: string; name: string } | null;
}

// Hook para buscar todos os materiais ativos
export function useSalesMaterials(type?: string) {
  return useQuery({
    queryKey: ['sales-materials', type],
    queryFn: async () => {
      let query = (supabase
        .from('sales_materials' as any)
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false }) as any);

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching materials');
        throw error;
      }

      return (data || []) as SalesMaterial[];
    },
  });
}

// Hook para buscar materiais por tags
export function useSalesMaterialsByTags(tags: string[]) {
  return useQuery({
    queryKey: ['sales-materials-by-tags', tags],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('sales_materials' as any)
        .select(`
          *,
          creator:team_members!created_by(id, name)
        `)
        .eq('is_active', true)
        .overlaps('tags', tags)
        .order('created_at', { ascending: false }) as any);

      if (error) {
        console.error('Error fetching materials by tags');
        throw error;
      }

      return (data || []) as SalesMaterial[];
    },
    enabled: tags.length > 0,
  });
}

// Hook para criar material
export function useCreateSalesMaterial() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async (material: {
      name: string;
      description?: string;
      type: 'image' | 'video' | 'document' | 'audio';
      file_url: string;
      thumbnail_url?: string;
      file_size?: number;
      mime_type?: string;
      tags?: string[];
      usage_hint?: string;
    }) => {
      const { data, error } = await (supabase
        .from('sales_materials' as any)
        .insert({
          ...material,
          tags: material.tags || [],
          created_by: teamMember?.id,
        })
        .select()
        .single() as any);

      if (error) {
        console.error('Error creating material');
        throw error;
      }

      return data as SalesMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-materials'] });
    },
  });
}

// Hook para atualizar material
export function useUpdateSalesMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesMaterial> & { id: string }) => {
      const { data, error } = await (supabase
        .from('sales_materials' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single() as any);

      if (error) {
        console.error('Error updating material');
        throw error;
      }

      return data as SalesMaterial;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-materials'] });
    },
  });
}

// Hook para deletar material (soft delete)
export function useDeleteSalesMaterial() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWithUndo({
        table: 'sales_materials',
        id,
        label: 'Material',
        queryClient,
        queryKeys: [['sales-materials']],
        softDelete: true,
      });
    },
  });
}

// Hook para upload de arquivo para o storage
export function useUploadMaterialFile() {
  return useMutation({
    mutationFn: async ({ file, folder = 'materials' }: { file: File; folder?: string }) => {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { data, error } = await supabase.storage
        .from('sales-materials')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (error) {
        console.error('Error uploading file');
        throw error;
      }

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('sales-materials')
        .getPublicUrl(filePath);

      return {
        path: data.path,
        url: urlData.publicUrl,
        size: file.size,
        mimeType: file.type,
      };
    },
  });
}
