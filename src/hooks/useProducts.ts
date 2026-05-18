import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type Product = Tables<'products'> & {
  price?: number;
  category?: string;
  sku?: string;
  nfse_service_code?: string | null;
  nfse_cnae?: string | null;
  nfse_item_lista_servico?: string | null;
  nfse_aliquota_iss?: number | null;
  nfse_description?: string | null;
  nfse_codigo_tributacao_nacional?: string | null;
  nfse_codigo_nbs?: string | null;
};
export type ProductInsert = TablesInsert<'products'>;
export type ProductUpdate = TablesUpdate<'products'>;

export interface ProductFilters {
  is_active?: boolean;
  category?: string;
  search?: string;
}

// List products with optional filters
export const useProducts = (filters?: ProductFilters) => {
  return useQuery({
    queryKey: ['products', filters],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select('*')
        .order('name');

      // By default, show only active products unless specified otherwise
      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      } else {
        query = query.eq('is_active', true);
      }

      if (filters?.category) {
        query = query.eq('category', filters.category);
      }

      if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Product[];
    },
  });
};

// Get all products including inactive (for admin)
export const useAllProducts = () => {
  return useQuery({
    queryKey: ['products', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');

      if (error) throw error;
      return data as Product[];
    },
  });
};

// Get single product by ID
export const useProduct = (id: string) => {
  return useQuery({
    queryKey: ['product', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Product;
    },
    enabled: !!id,
  });
};

// Create product
export const useCreateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (product: ProductInsert & { price?: number; category?: string; sku?: string }) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
    },
  });
};

// Update product
export const useUpdateProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: ProductUpdate & {
      id: string;
      price?: number;
      category?: string;
      sku?: string;
      nfse_service_code?: string | null;
      nfse_cnae?: string | null;
      nfse_item_lista_servico?: string | null;
      nfse_aliquota_iss?: number | null;
      nfse_description?: string | null;
      nfse_codigo_tributacao_nacional?: string | null;
      nfse_codigo_nbs?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', data.id] });
    },
  });
};

// Toggle product active status
export const useToggleProductActive = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('products')
        .update({ is_active })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Product;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['product', data.id] });
    },
  });
};

// Delete product (soft delete - just deactivate)
export const useDeleteProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWithUndo({
        table: 'products',
        id,
        label: 'Produto',
        queryClient,
        queryKeys: [['products']],
        softDelete: true,
      });
    },
  });
};

// Get unique categories for filter dropdown
export const useProductCategories = () => {
  return useQuery({
    queryKey: ['product-categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('category')
        .not('category', 'is', null)
        .order('category');

      if (error) throw error;

      // Extract unique categories
      const categories = [...new Set(data?.map(p => p.category).filter(Boolean))] as string[];
      return categories;
    },
  });
};
