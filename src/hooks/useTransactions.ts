import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface LeadTransaction {
  id: string;
  lead_id: string;
  transaction_date: string;
  amount: string;
  currency: string;
  status: string;
  product_name: string;
  product_key: string | null;
  plan_name: string | null;
  payment_platform: string;
  payment_method: string;
  installments: number;
  external_id: string | null;
  metadata: any;
  created_at: string;
  customer_email: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  deal_id: string | null;
  deal_payment_id: string | null;
}

export const useLeadTransactions = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['lead-transactions', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await (supabase
        .from('transactions' as any)
        .select('*')
        .eq('lead_id', leadId)
        .order('transaction_date', { ascending: false }) as any);

      if (error) throw error;
      return (data || []) as LeadTransaction[];
    },
    enabled: !!leadId,
  });
};

// Helper para converter amount baseado na origem
// - Braip com payment_method numérico ('2', '5', etc) → valor em CENTAVOS → dividir por 100
// - Todos os outros casos → valor já em REAIS
export const convertTransactionAmount = (
  amount: string | number,
  paymentMethod?: string | null,
  paymentPlatform?: string | null
): number => {
  const value = parseFloat(String(amount) || '0');

  // Braip com payment_method numérico está em centavos
  const isBraipNumeric = paymentPlatform === 'braip' &&
    paymentMethod &&
    /^\d+$/.test(paymentMethod);

  return isBraipNumeric ? value / 100 : value;
};

export const useClientLTV = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['client-ltv', leadId],
    queryFn: async () => {
      if (!leadId) return 0;

      const { data, error } = await (supabase
        .from('transactions' as any)
        .select('amount, status, payment_method, payment_platform')
        .eq('lead_id', leadId) as any);

      if (error) throw error;

      const approvedStatuses = ['approved', 'RECEIVED', 'paid'];
      const total = (data || []).reduce((sum: number, tx: any) => {
        if (approvedStatuses.includes(tx.status)) {
          return sum + convertTransactionAmount(tx.amount, tx.payment_method, tx.payment_platform);
        }
        return sum;
      }, 0);

      return total;
    },
    enabled: !!leadId,
  });
};
