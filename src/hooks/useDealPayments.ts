import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from "@/lib/undoable-delete";
import type {
  DealPayment,
  DealPaymentInstallment,
  DealPaymentAuditEntry,
  CreateDealPaymentInput,
  UpdateDealPaymentInput,
  FinancialSummary,
} from '@/types/payment.types';

// List payments for a deal
export const useDealPayments = (dealId: string) => {
  return useQuery({
    queryKey: ['deal-payments', dealId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_payments')
        .select(`
          *,
          payer_lead:leads!deal_payments_payer_lead_id_fkey(id, name),
          deal:deals!deal_payments_deal_id_fkey(
            id,
            negotiated_price,
            lead:leads!deals_lead_id_fkey(id, name, email, phone),
            product:products!deals_product_id_fkey(id, name)
          )
        `)
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data as DealPayment[];
    },
    enabled: !!dealId,
  });
};

// Get a single payment with installments
export const useDealPayment = (paymentId: string) => {
  return useQuery({
    queryKey: ['deal-payment', paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_payments')
        .select(`
          *,
          payer_lead:leads!deal_payments_payer_lead_id_fkey(id, name),
          deal:deals!deal_payments_deal_id_fkey(
            id,
            negotiated_price,
            lead:leads!deals_lead_id_fkey(id, name, email, phone),
            product:products!deals_product_id_fkey(id, name)
          ),
          installments_list:deal_payment_installments(*)
        `)
        .eq('id', paymentId)
        .single();

      if (error) throw error;
      return data as DealPayment;
    },
    enabled: !!paymentId,
  });
};

// List installments for a payment
export const usePaymentInstallments = (paymentId: string) => {
  return useQuery({
    queryKey: ['payment-installments', paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_payment_installments')
        .select('*')
        .eq('deal_payment_id', paymentId)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      return data as DealPaymentInstallment[];
    },
    enabled: !!paymentId,
  });
};

// Create deal payment
export const useCreateDealPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDealPaymentInput) => {
      const installmentValue = input.installments && input.installments > 1
        ? input.amount / input.installments
        : input.amount;

      const insertData: Record<string, any> = {
          deal_id: input.deal_id,
          description: input.description,
          billing_type: input.billing_type,
          gateway: input.gateway || 'manual',
          amount: input.amount,
          installments: input.installments || 1,
          installment_value: installmentValue,
          due_date: input.due_date,
          status: 'pending',
        };
      if (input.payer_lead_id) {
        insertData.payer_lead_id = input.payer_lead_id;
      }

      const { data, error } = await supabase
        .from('deal_payments')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Auto-create installment rows if installments > 1
      if (data && data.installments > 1) {
        await generateInstallmentRows(data.id, data.installments, data.installment_value || data.amount / data.installments, data.due_date);
      }

      return data as DealPayment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deal-payments', data.deal_id] });
      queryClient.invalidateQueries({ queryKey: ['payment-installments', data.id] });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deals'] });
      }, 300);
    },
  });
};

// Helper: generate installment rows for a payment
async function generateInstallmentRows(paymentId: string, count: number, value: number, firstDueDate: string) {
  const rows = [];
  const baseDate = new Date(firstDueDate + 'T12:00:00');

  for (let i = 0; i < count; i++) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    rows.push({
      deal_payment_id: paymentId,
      installment_number: i + 1,
      amount: value,
      due_date: dueDate.toISOString().split('T')[0],
      status: 'pending' as const,
    });
  }

  await supabase.from('deal_payment_installments').insert(rows);
}

// Create multiple payments at once (for deal closing)
export const useCreateDealPaymentsBatch = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (inputs: CreateDealPaymentInput[]) => {
      const paymentsToInsert = inputs.map((input) => {
        const installmentValue = input.installments && input.installments > 1
          ? input.amount / input.installments
          : input.amount;

        const row: Record<string, any> = {
          deal_id: input.deal_id,
          description: input.description,
          billing_type: input.billing_type,
          gateway: input.gateway || 'manual',
          amount: input.amount,
          installments: input.installments || 1,
          installment_value: installmentValue,
          due_date: input.due_date,
          status: 'pending',
        };
        if (input.payer_lead_id) {
          row.payer_lead_id = input.payer_lead_id;
        }
        return row;
      });

      const { data, error } = await supabase
        .from('deal_payments')
        .insert(paymentsToInsert)
        .select();

      if (error) throw error;

      // Auto-create installment rows for parcelados
      for (const payment of (data || [])) {
        if (payment.installments > 1) {
          await generateInstallmentRows(payment.id, payment.installments, payment.installment_value || payment.amount / payment.installments, payment.due_date);
        }
      }

      return data as DealPayment[];
    },
    onSuccess: (data) => {
      if (data.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['deal-payments', data[0].deal_id] });
        queryClient.invalidateQueries({ queryKey: ['deals'] });
      }
    },
  });
};

// Update deal payment (with audit trail for paid payments)
export const useUpdateDealPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, audit_reason, audit_changed_by, audit_previous_values, ...updates }: UpdateDealPaymentInput) => {
      const { data, error } = await supabase
        .from('deal_payments')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Insert audit log if reason is provided (editing paid payment)
      if (audit_reason && audit_previous_values) {
        const changes: Array<{ field: string; old_value: any; new_value: any }> = [];
        for (const [field, oldVal] of Object.entries(audit_previous_values)) {
          const newVal = (updates as Record<string, any>)[field];
          if (newVal !== undefined && newVal !== oldVal) {
            changes.push({ field, old_value: oldVal, new_value: newVal });
          }
        }

        if (changes.length > 0) {
          await supabase.from('deal_payment_audit_log').insert({
            deal_payment_id: id,
            deal_id: data.deal_id,
            changed_by: audit_changed_by || null,
            change_type: 'edit',
            changes,
            reason: audit_reason,
          });
        }
      }

      return data as DealPayment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deal-payments', data.deal_id] });
      queryClient.invalidateQueries({ queryKey: ['deal-payment', data.id] });
      queryClient.invalidateQueries({ queryKey: ['payment-audit-log', data.id] });
      // Defer non-critical invalidations to avoid cascading re-renders
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        queryClient.invalidateQueries({ queryKey: ['lead-payments'] });
        queryClient.invalidateQueries({ queryKey: ['lead-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['commissions'] });
      }, 500);
    },
  });
};

// Delete deal payment
export const useDeleteDealPayment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dealId }: { id: string; dealId: string }) => {
      await deleteWithUndo({
        table: 'deal_payments',
        id,
        label: 'Pagamento',
        queryClient,
        queryKeys: [['deal-payments', dealId], ['deals']],
      });
      return { id, dealId };
    },
  });
};

// Generate payment link (calls edge function)
export const useGeneratePaymentLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ paymentId, dealId, cpfCnpj }: { paymentId: string; dealId?: string; cpfCnpj?: string }) => {
      const { data, error } = await supabase.functions.invoke('asaas-create-charge', {
        body: { deal_payment_id: paymentId, cpf_cnpj: cpfCnpj },
      });

      if (error) throw error;
      return { ...data, _dealId: dealId } as { payment_link?: string; asaas_payment_id?: string; _dealId?: string };
    },
    onSuccess: (data, { paymentId }) => {
      queryClient.invalidateQueries({ queryKey: ['deal-payment', paymentId] });
      if (data._dealId) {
        queryClient.invalidateQueries({ queryKey: ['deal-payments', data._dealId] });
      }
    },
  });
};

// Get payments by lead (across all deals)
export const useLeadPayments = (leadId: string) => {
  return useQuery({
    queryKey: ['lead-payments', leadId],
    queryFn: async () => {
      // First get all deals for this lead
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id')
        .eq('lead_id', leadId);

      if (dealsError) throw dealsError;
      if (!deals || deals.length === 0) return [];

      const dealIds = deals.map(d => d.id);

      // Then get all payments for these deals
      const { data, error } = await supabase
        .from('deal_payments')
        .select(`
          *,
          payer_lead:leads!deal_payments_payer_lead_id_fkey(id, name),
          deal:deals!deal_payments_deal_id_fkey(
            id,
            negotiated_price,
            product:products!deals_product_id_fkey(id, name)
          )
        `)
        .in('deal_id', dealIds)
        .order('due_date', { ascending: true });

      if (error) throw error;
      return data as DealPayment[];
    },
    enabled: !!leadId,
  });
};

// Financial summary for a lead
export const useLeadFinancialSummary = (leadId: string) => {
  return useQuery({
    queryKey: ['lead-financial-summary', leadId],
    queryFn: async () => {
      // Get all deals for this lead
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, negotiated_price, total_paid, payment_status, status')
        .eq('lead_id', leadId);

      if (dealsError) throw dealsError;

      if (!deals || deals.length === 0) {
        return {
          total_deals: 0,
          total_value: 0,
          total_paid: 0,
          total_pending: 0,
          total_overdue: 0,
          payment_status: 'pending' as const,
        };
      }

      const dealIds = deals.map(d => d.id);

      // Get all payments
      const { data: payments, error: paymentsError } = await supabase
        .from('deal_payments')
        .select('amount, status, due_date')
        .in('deal_id', dealIds);

      if (paymentsError) throw paymentsError;

      const today = new Date().toISOString().split('T')[0];

      const totalValue = deals
        .filter(d => d.status === 'won')
        .reduce((sum, d) => sum + (d.negotiated_price || 0), 0);

      const totalPaid = (payments || [])
        .filter(p => p.status === 'received' || p.status === 'confirmed')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const totalPending = (payments || [])
        .filter(p => p.status === 'pending' || p.status === 'link_generated')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const totalOverdue = (payments || [])
        .filter(p =>
          (p.status === 'pending' || p.status === 'link_generated' || p.status === 'overdue') &&
          p.due_date < today
        )
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      let paymentStatus: 'pending' | 'partial' | 'paid' = 'pending';
      if (totalPaid >= totalValue && totalValue > 0) {
        paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      return {
        total_deals: deals.filter(d => d.status === 'won').length,
        total_value: totalValue,
        total_paid: totalPaid,
        total_pending: totalPending,
        total_overdue: totalOverdue,
        payment_status: paymentStatus,
      } as FinancialSummary;
    },
    enabled: !!leadId,
  });
};

// Mark payment as paid (manual confirmation)
export const useMarkPaymentAsPaid = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      paymentId,
      paidAt,
      asaasPaymentId,
      asaasInvoiceNumber,
    }: {
      paymentId: string;
      paidAt?: string;
      asaasPaymentId?: string;
      asaasInvoiceNumber?: string;
    }) => {
      // 1. Update the payment
      const updateData: Record<string, any> = {
        status: 'received',
        paid_at: paidAt || new Date().toISOString(),
      };

      if (asaasPaymentId) {
        updateData.asaas_payment_id = asaasPaymentId;
      }

      if (asaasInvoiceNumber) {
        updateData.asaas_invoice_number = asaasInvoiceNumber;
      }

      const { data: payment, error: paymentError } = await supabase
        .from('deal_payments')
        .update(updateData)
        .eq('id', paymentId)
        .select('*, deal_id')
        .single();

      if (paymentError) throw paymentError;

      // 2. Recalculate total_paid for the deal
      const { data: allPayments, error: allPaymentsError } = await supabase
        .from('deal_payments')
        .select('amount, status')
        .eq('deal_id', payment.deal_id);

      if (allPaymentsError) throw allPaymentsError;

      const totalPaid = (allPayments || [])
        .filter(p => p.status === 'received' || p.status === 'confirmed')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      const totalPending = (allPayments || [])
        .filter(p => p.status === 'pending' || p.status === 'link_generated')
        .reduce((sum, p) => sum + (p.amount || 0), 0);

      // 3. Determine payment_status
      let paymentStatus = 'pending';
      if (totalPending === 0 && totalPaid > 0) {
        paymentStatus = 'paid';
      } else if (totalPaid > 0) {
        paymentStatus = 'partial';
      }

      // 4. Update the deal
      const { error: dealError } = await supabase
        .from('deals')
        .update({
          total_paid: totalPaid,
          payment_status: paymentStatus,
        })
        .eq('id', payment.deal_id);

      if (dealError) throw dealError;

      // 5. Get deal info for transaction creation (LTV)
      const { data: deal, error: dealInfoError } = await supabase
        .from('deals')
        .select('lead_id, product_id, payment_method, product:products!deals_product_id_fkey(name)')
        .eq('id', payment.deal_id)
        .single();

      if (!dealInfoError && deal?.lead_id) {
        // 6. Check if transaction already exists for this payment
        const { data: existingTx } = await supabase
          .from('transactions')
          .select('id')
          .eq('deal_payment_id', paymentId)
          .maybeSingle();

        // 7. Create transaction for LTV tracking (if not exists)
        if (!existingTx && payment.amount > 0) {
          const productName = (deal as any).product?.name || deal.product_id;
          const { error: txError } = await supabase
            .from('transactions')
            .insert({
              lead_id: payment.payer_lead_id || deal.lead_id,
              product_id: deal.product_id,
              product_name: productName,
              amount: payment.amount,
              status: 'paid',
              payment_method: payment.billing_type || deal.payment_method || 'manual',
              payment_platform: 'crm',
              transaction_date: payment.paid_at || new Date().toISOString(),
              deal_id: payment.deal_id,
              deal_payment_id: paymentId,
            });

          if (txError) {
            console.error('Error creating transaction for LTV:', txError);
          }
        }
      }

      // 8. Auto-trigger commission calculation (non-blocking)
      try {
        // Determine trigger type: individual payment or full payment
        const allPaidOrConfirmed = (allPayments || []).every(
          (p) => p.status === 'received' || p.status === 'confirmed'
        );
        const trigger = allPaidOrConfirmed ? 'full_payment' : 'payment';

        await supabase.functions.invoke('calculate-commission', {
          body: {
            deal_id: payment.deal_id,
            deal_payment_id: paymentId,
            trigger,
          },
        });
      } catch (commissionError) {
        console.error('Error triggering commission calculation:', commissionError);
        // Non-blocking - don't fail the payment confirmation
      }

      return payment as DealPayment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['deal-payments', data.deal_id] });
      queryClient.invalidateQueries({ queryKey: ['deal-payment', data.id] });
      // Defer non-critical invalidations to avoid cascading re-renders that freeze UI
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['deals'] });
        queryClient.invalidateQueries({ queryKey: ['lead-payments'] });
        queryClient.invalidateQueries({ queryKey: ['lead-financial-summary'] });
        queryClient.invalidateQueries({ queryKey: ['client-ltv'] });
        queryClient.invalidateQueries({ queryKey: ['commissions'] });
        queryClient.invalidateQueries({ queryKey: ['commission-summary'] });
      }, 500);
    },
  });
};

// Get audit log for a payment
export const usePaymentAuditLog = (paymentId: string) => {
  return useQuery({
    queryKey: ['payment-audit-log', paymentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deal_payment_audit_log')
        .select(`
          *,
          changed_by_member:team_members!deal_payment_audit_log_changed_by_fkey(id, name)
        `)
        .eq('deal_payment_id', paymentId)
        .order('changed_at', { ascending: false });

      if (error) throw error;
      return data as DealPaymentAuditEntry[];
    },
    enabled: !!paymentId,
  });
};

// Check if a payment has been edited (for showing badge)
export const usePaymentHasEdits = (paymentId: string) => {
  return useQuery({
    queryKey: ['payment-has-edits', paymentId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('deal_payment_audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('deal_payment_id', paymentId);

      if (error) throw error;
      return (count || 0) > 0;
    },
    enabled: !!paymentId,
  });
};

// Update installment status (for manual updates)
export const useUpdateInstallment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      status,
      paid_at,
    }: {
      id: string;
      status: DealPaymentInstallment['status'];
      paid_at?: string;
    }) => {
      const { data, error } = await supabase
        .from('deal_payment_installments')
        .update({ status, paid_at })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as DealPaymentInstallment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['payment-installments', data.deal_payment_id] });
      queryClient.invalidateQueries({ queryKey: ['deal-payment', data.deal_payment_id] });
    },
  });
};
