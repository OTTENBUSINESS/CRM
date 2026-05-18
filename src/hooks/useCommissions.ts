import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from "@/lib/undoable-delete";
import type {
  Commission,
  CommissionRule,
  CommissionFilters,
  CommissionRuleFilters,
  CreateCommissionRuleInput,
  UpdateCommissionRuleInput,
  UpdateCommissionInput,
  CommissionSummary,
  SalesRepCommissionSummary,
} from '@/types/commission.types';

// List commissions with filters
export const useCommissions = (filters?: CommissionFilters) => {
  return useQuery({
    queryKey: ['commissions', filters],
    queryFn: async () => {
      let query = supabase
        .from('commissions')
        .select(`
          *,
          deal:deals(
            id,
            negotiated_price,
            product:products(id, name),
            lead:leads(id, name)
          ),
          deal_payment:deal_payments(id, amount, billing_type),
          sales_rep:team_members(id, name),
          commission_rule:commission_rules(id, name, commission_type, commission_value)
        `)
        .order('reference_date', { ascending: false, nullsFirst: false });

      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.from_date) {
        query = query.gte('reference_date', filters.from_date);
      }

      if (filters?.deal_ids && filters.deal_ids.length > 0) {
        query = query.in('deal_id', filters.deal_ids);
      }

      if (filters?.to_date) {
        query = query.lte('reference_date', filters.to_date);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as Commission[];
    },
  });
};

// Get commission by ID
export const useCommission = (id: string) => {
  return useQuery({
    queryKey: ['commission', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          deal:deals(
            id,
            negotiated_price,
            product:products(id, name),
            lead:leads(id, name)
          ),
          deal_payment:deal_payments(id, amount, billing_type),
          sales_rep:team_members(id, name),
          commission_rule:commission_rules(id, name, commission_type, commission_value)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Commission;
    },
    enabled: !!id,
  });
};

// Get commissions for a sales rep
export const useSalesRepCommissions = (repId: string) => {
  return useQuery({
    queryKey: ['commissions', 'sales-rep', repId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commissions')
        .select(`
          *,
          deal:deals(
            id,
            negotiated_price,
            product:products(id, name)
          ),
          commission_rule:commission_rules(id, name)
        `)
        .eq('sales_rep_id', repId)
        .order('reference_date', { ascending: false, nullsFirst: false });

      if (error) throw error;
      return data as Commission[];
    },
    enabled: !!repId,
  });
};

// Commission summary
export const useCommissionSummary = (filters?: { sales_rep_id?: string }) => {
  return useQuery({
    queryKey: ['commission-summary', filters],
    queryFn: async () => {
      let query = supabase.from('commissions').select('commission_amount, gateway_fee_amount, net_amount, status');

      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const summary: CommissionSummary = {
        total_pending: 0,
        total_approved: 0,
        total_paid: 0,
        total_cancelled: 0,
        pending_count: 0,
        approved_count: 0,
        paid_count: 0,
      };

      for (const comm of data || []) {
        switch (comm.status) {
          case 'pending':
            summary.total_pending += comm.commission_amount;
            summary.pending_count++;
            break;
          case 'approved':
            summary.total_approved += comm.commission_amount;
            summary.approved_count++;
            break;
          case 'paid':
            summary.total_paid += comm.commission_amount;
            summary.paid_count++;
            break;
          case 'cancelled':
            summary.total_cancelled += comm.commission_amount;
            break;
        }
      }

      return summary;
    },
  });
};

// Update commission (mark as approved/paid)
export const useUpdateCommission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateCommissionInput) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          ...updates,
          paid_at: updates.status === 'paid' ? new Date().toISOString() : undefined,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Commission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
};

// Pay commission
export const usePayCommission = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      payment_reference,
      notes,
    }: {
      id: string;
      payment_reference?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('commissions')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_reference,
          notes,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Commission;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
};

// Commission Rules

// List commission rules
export const useCommissionRules = (filters?: CommissionRuleFilters) => {
  return useQuery({
    queryKey: ['commission-rules', filters],
    queryFn: async () => {
      let query = supabase
        .from('commission_rules')
        .select(`
          *,
          sales_rep:team_members(id, name),
          product:products(id, name)
        `)
        .order('priority', { ascending: false });

      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }

      if (filters?.product_id) {
        query = query.eq('product_id', filters.product_id);
      }

      if (filters?.is_active !== undefined) {
        query = query.eq('is_active', filters.is_active);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as CommissionRule[];
    },
  });
};

// Get commission rule by ID
export const useCommissionRule = (id: string) => {
  return useQuery({
    queryKey: ['commission-rule', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('commission_rules')
        .select(`
          *,
          sales_rep:team_members(id, name),
          product:products(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as CommissionRule;
    },
    enabled: !!id,
  });
};

// Create commission rule
export const useCreateCommissionRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateCommissionRuleInput) => {
      const { data, error } = await supabase
        .from('commission_rules')
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
    },
  });
};

// Update commission rule
export const useUpdateCommissionRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdateCommissionRuleInput) => {
      const { data, error } = await supabase
        .from('commission_rules')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CommissionRule;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['commission-rules'] });
      queryClient.invalidateQueries({ queryKey: ['commission-rule', data.id] });
    },
  });
};

// Delete commission rule (soft delete - deactivate)
export const useDeleteCommissionRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWithUndo({
        table: 'commission_rules',
        id,
        label: 'Regra de comissão',
        queryClient,
        queryKeys: [['commission-rules']],
        softDelete: true,
      });
    },
  });
};

// Trigger commission calculation manually
export const useTriggerCommissionCalculation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deal_id,
      deal_payment_id,
      trigger,
    }: {
      deal_id: string;
      deal_payment_id?: string;
      trigger: 'deal_won' | 'payment' | 'full_payment';
    }) => {
      const { data, error } = await supabase.functions.invoke('calculate-commission', {
        body: { deal_id, deal_payment_id, trigger },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['commission-summary'] });
    },
  });
};
