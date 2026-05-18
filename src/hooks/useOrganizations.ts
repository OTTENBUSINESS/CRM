import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Tables, TablesInsert, TablesUpdate } from '@/types/database.types';

export type Organization = Tables<'organizations'>;
export type OrganizationInsert = TablesInsert<'organizations'>;
export type OrganizationUpdate = TablesUpdate<'organizations'>;

export type OrganizationWithRelations = Organization & {
  primary_contact?: any;
  members?: any[];
  products?: any[];
};

export const useOrganizations = (filters?: {
  status?: 'active' | 'inactive' | 'churned';
  productId?: string;
}) => {
  return useQuery({
    queryKey: ['organizations', filters],
    queryFn: async () => {
      // Se tem filtro de produto, buscar via organization_products
      if (filters?.productId) {
        const { data: orgProducts, error: opError } = await supabase
          .from('organization_products')
          .select(`
            organization_id,
            organization:organizations(
              *,
              primary_contact:leads!organizations_primary_contact_id_fkey(*),
              members:organization_members(*),
              products:organization_products(
                *,
                product:products(*)
              )
            )
          `)
          .eq('product_id', filters.productId);

        if (opError) throw opError;

        // Extrair organizations únicas
        const orgsMap = new Map<string, OrganizationWithRelations>();
        orgProducts?.forEach(op => {
          if (op.organization && !orgsMap.has(op.organization_id)) {
            orgsMap.set(op.organization_id, op.organization as OrganizationWithRelations);
          }
        });

        let result = Array.from(orgsMap.values());
        
        // Filtrar por status se necessário
        if (filters?.status) {
          result = result.filter(org => org.status === filters.status);
        }

        return result;
      }

      // Sem filtro de produto, buscar apenas organizations que têm pelo menos um produto
      const { data: orgProducts, error: opError } = await supabase
        .from('organization_products')
        .select(`
          organization_id,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*),
            members:organization_members(*),
            products:organization_products(
              *,
              product:products(*)
            )
          )
        `);

      if (opError) throw opError;

      // Extrair organizations únicas
      const orgsMap = new Map<string, OrganizationWithRelations>();
      orgProducts?.forEach(op => {
        if (op.organization && !orgsMap.has(op.organization_id)) {
          orgsMap.set(op.organization_id, op.organization as OrganizationWithRelations);
        }
      });

      let result = Array.from(orgsMap.values());
      
      // Filtrar por status se necessário
      if (filters?.status) {
        result = result.filter(org => org.status === filters.status);
      }

      return result;
    },
  });
};

export const useOrganization = (id: string) => {
  return useQuery({
    queryKey: ['organization', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          primary_contact:leads!organizations_primary_contact_id_fkey(*),
          members:organization_members(*),
          products:organization_products(
            *,
            product:products(*)
          )
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as OrganizationWithRelations;
    },
    enabled: !!id,
  });
};

export const useCreateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organization: OrganizationInsert) => {
      const { data, error } = await supabase
        .from('organizations')
        .insert(organization)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
};

export const useUpdateOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: OrganizationUpdate & { id: string }) => {
      const { data, error } = await supabase
        .from('organizations')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization', data.id] });
    },
  });
};
