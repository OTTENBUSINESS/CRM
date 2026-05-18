import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate, Enums } from '@/types/database.types';

export type OrganizationProduct = Tables<'organization_products'>;
export type OrganizationProductInsert = TablesInsert<'organization_products'>;
export type OrganizationProductUpdate = TablesUpdate<'organization_products'>;

export type OrganizationProductWithRelations = OrganizationProduct & {
  organization?: Tables<'organizations'> & {
    primary_contact?: any;
  };
  product?: Tables<'products'>;
};

export const useOrganizationProducts = (filters?: {
  organizationId?: string;
  productId?: string;
  journeyStage?: Enums<'journey_stage'>;
  onboardingStatus?: Enums<'onboarding_status'>;
}) => {
  return useQuery({
    queryKey: ['organization-products', filters],
    queryFn: async () => {
      let query = supabase
        .from('organization_products')
        .select(`
          *,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          ),
          product:products(*)
        `)
        .order('created_at', { ascending: false });

      if (filters?.organizationId) {
        query = query.eq('organization_id', filters.organizationId);
      }
      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.journeyStage) {
        query = query.eq('journey_stage', filters.journeyStage);
      }
      if (filters?.onboardingStatus) {
        query = query.eq('onboarding_status', filters.onboardingStatus);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as OrganizationProductWithRelations[];
    },
  });
};

export const useOrganizationProduct = (organizationId: string, productId: string) => {
  return useQuery({
    queryKey: ['organization-product', organizationId, productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organization_products')
        .select(`
          *,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          ),
          product:products(*)
        `)
        .eq('organization_id', organizationId)
        .eq('product_id', productId)
        .single();

      if (error) throw error;
      return data as OrganizationProductWithRelations;
    },
    enabled: !!organizationId && !!productId,
  });
};

export const useCreateOrganizationProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orgProduct: OrganizationProductInsert) => {
      const { data, error } = await supabase
        .from('organization_products')
        .insert(orgProduct)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-products'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
};

export const useUpdateOrganizationProduct = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: OrganizationProductUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('organization_products')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-products'] });
      queryClient.invalidateQueries({ queryKey: ['organization-product', data.organization_id, data.product_id] });
    },
  });
};

export const useUpdateJourneyStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id,
      organizationId, 
      productId, 
      journeyStage 
    }: { 
      id?: string;
      organizationId: string; 
      productId: string; 
      journeyStage: string;
    }) => {
      let query = supabase
        .from('organization_products')
        .update({ journey_stage: journeyStage as any })
        .select();

      // Usar id se disponível, senão usar organization_id + product_id
      if (id) {
        query = query.eq('id', id);
      } else {
        query = query.eq('organization_id', organizationId).eq('product_id', productId);
      }

      const { data, error } = await query.single();

      if (error) {
        console.error('Error updating journey stage:', error);
        throw error;
      }
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-products'] });
      queryClient.invalidateQueries({ queryKey: ['organization-product', data.organization_id, data.product_id] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
};
