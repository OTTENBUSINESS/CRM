import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type {
  PaymentGateway,
  PaymentGatewayFee,
  PaymentGatewayWithFees,
  CreatePaymentGatewayInput,
  UpdatePaymentGatewayInput,
} from '@/types/gateway.types';

// List active gateways with fees
export const usePaymentGateways = (onlyActive = true) => {
  return useQuery({
    queryKey: ['payment-gateways', onlyActive],
    queryFn: async () => {
      let query = supabase
        .from('payment_gateways')
        .select('*')
        .order('name', { ascending: true });

      if (onlyActive) {
        query = query.eq('is_active', true);
      }

      const { data: gateways, error } = await query;
      if (error) throw error;

      // Fetch fees for all gateways
      const gatewayIds = (gateways || []).map((g: PaymentGateway) => g.id);
      if (gatewayIds.length === 0) return [] as PaymentGatewayWithFees[];

      const { data: fees, error: feesError } = await supabase
        .from('payment_gateway_fees')
        .select('*')
        .in('gateway_id', gatewayIds);

      if (feesError) throw feesError;

      // Group fees by gateway
      return (gateways || []).map((gw: PaymentGateway) => ({
        ...gw,
        fees: (fees || []).filter((f: PaymentGatewayFee) => f.gateway_id === gw.id),
      })) as PaymentGatewayWithFees[];
    },
  });
};

// Create gateway + fees
export const useCreatePaymentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePaymentGatewayInput) => {
      const { data: gateway, error } = await supabase
        .from('payment_gateways')
        .insert({
          name: input.name,
          slug: input.slug,
          is_active: input.is_active ?? true,
        })
        .select()
        .single();

      if (error) throw error;

      // Insert fees
      if (input.fees.length > 0) {
        const feesToInsert = input.fees.map((f) => ({
          gateway_id: gateway.id,
          billing_type: f.billing_type,
          fee_percent: f.fee_percent,
          fee_fixed: f.fee_fixed,
        }));

        const { error: feesError } = await supabase
          .from('payment_gateway_fees')
          .insert(feesToInsert);

        if (feesError) throw feesError;
      }

      return gateway as PaymentGateway;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
  });
};

// Update gateway + fees
export const useUpdatePaymentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name, is_active, fees }: UpdatePaymentGatewayInput) => {
      // Update gateway itself
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (is_active !== undefined) updates.is_active = is_active;

      if (Object.keys(updates).length > 0) {
        const { error } = await supabase
          .from('payment_gateways')
          .update(updates)
          .eq('id', id);

        if (error) throw error;
      }

      // Update fees if provided
      if (fees) {
        // Delete existing fees
        const { error: delError } = await supabase
          .from('payment_gateway_fees')
          .delete()
          .eq('gateway_id', id);

        if (delError) throw delError;

        // Insert new fees
        if (fees.length > 0) {
          const feesToInsert = fees.map((f) => ({
            gateway_id: id,
            billing_type: f.billing_type,
            fee_percent: f.fee_percent,
            fee_fixed: f.fee_fixed,
          }));

          const { error: insertError } = await supabase
            .from('payment_gateway_fees')
            .insert(feesToInsert);

          if (insertError) throw insertError;
        }
      }

      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payment-gateways'] });
    },
  });
};

// Soft delete (deactivate)
export const useDeletePaymentGateway = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await deleteWithUndo({
        table: 'payment_gateways',
        id,
        label: 'Gateway',
        queryClient,
        queryKeys: [['payment-gateways']],
        softDelete: true,
      });
    },
  });
};

// Helper: get fee for a gateway slug + billing type
export function getGatewayFee(
  gateways: PaymentGatewayWithFees[] | undefined,
  gatewaySlug: string,
  billingType: string
): { fee_percent: number; fee_fixed: number } | null {
  if (!gateways) return null;

  const gw = gateways.find((g) => g.slug === gatewaySlug);
  if (!gw) return null;

  const fee = gw.fees.find((f) => f.billing_type === billingType);
  return fee ? { fee_percent: fee.fee_percent, fee_fixed: fee.fee_fixed } : null;
}

// Calculate fee amount for a given payment
export function calculateFeeAmount(
  feePercent: number,
  feeFixed: number,
  amount: number
): number {
  return (amount * feePercent) / 100 + feeFixed;
}
