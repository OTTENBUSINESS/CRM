// Commission Types for Sales Commission System

export type CommissionType = 'percentage' | 'fixed';

export type PaymentTrigger = 'on_deal_won' | 'on_payment' | 'on_full_payment';

export type CommissionStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

export type CalculateOn = 'gross' | 'net';

// Commission Rule
export interface CommissionRule {
  id: string;
  name: string;
  sales_rep_id?: string;
  product_id?: string;
  commission_type: CommissionType;
  commission_value: number;
  payment_trigger: PaymentTrigger;
  is_active: boolean;
  priority: number;
  valid_from?: string;
  valid_to?: string;
  calculate_on: CalculateOn;
  created_at: string;
  updated_at: string;
  // Relations
  sales_rep?: {
    id: string;
    name: string;
  };
  product?: {
    id: string;
    name: string;
  };
}

// Commission (calculated/tracked)
export interface Commission {
  id: string;
  deal_id: string;
  deal_payment_id?: string;
  sales_rep_id: string;
  commission_rule_id?: string;
  base_amount: number;
  gateway_fee_amount: number;
  net_amount: number;
  commission_amount: number;
  status: CommissionStatus;
  reference_date?: string;
  paid_at?: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  // Relations
  deal?: {
    id: string;
    negotiated_price: number;
    product?: {
      id: string;
      name: string;
    };
    contact?: {
      id: string;
      name: string;
    };
  };
  deal_payment?: {
    id: string;
    amount: number;
    billing_type: string;
  };
  sales_rep?: {
    id: string;
    name: string;
  };
  commission_rule?: {
    id: string;
    name: string;
    commission_type: CommissionType;
    commission_value: number;
  };
}

// Input types
export interface CreateCommissionRuleInput {
  name: string;
  sales_rep_id?: string;
  product_id?: string;
  commission_type: CommissionType;
  commission_value: number;
  payment_trigger: PaymentTrigger;
  is_active?: boolean;
  priority?: number;
  valid_from?: string;
  valid_to?: string;
  calculate_on?: CalculateOn;
}

export interface UpdateCommissionRuleInput {
  id: string;
  name?: string;
  sales_rep_id?: string | null;
  product_id?: string | null;
  commission_type?: CommissionType;
  commission_value?: number;
  payment_trigger?: PaymentTrigger;
  is_active?: boolean;
  priority?: number;
  valid_from?: string | null;
  valid_to?: string | null;
  calculate_on?: CalculateOn;
}

export interface UpdateCommissionInput {
  id: string;
  status?: CommissionStatus;
  paid_at?: string;
  payment_reference?: string;
  notes?: string;
}

// Filter types
export interface CommissionFilters {
  sales_rep_id?: string;
  deal_ids?: string[];
  status?: CommissionStatus;
  from_date?: string;
  to_date?: string;
}

export interface CommissionRuleFilters {
  sales_rep_id?: string;
  product_id?: string;
  is_active?: boolean;
}

// Summary types
export interface CommissionSummary {
  total_pending: number;
  total_approved: number;
  total_paid: number;
  total_cancelled: number;
  pending_count: number;
  approved_count: number;
  paid_count: number;
}

export interface SalesRepCommissionSummary {
  sales_rep_id: string;
  sales_rep_name: string;
  total_earned: number;
  total_pending: number;
  total_paid: number;
  deals_count: number;
}

// Display helpers
export const COMMISSION_TYPE_LABELS: Record<CommissionType, string> = {
  percentage: 'Percentual',
  fixed: 'Valor Fixo',
};

export const PAYMENT_TRIGGER_LABELS: Record<PaymentTrigger, string> = {
  on_deal_won: 'Ao Ganhar Deal',
  on_payment: 'A Cada Pagamento',
  on_full_payment: 'Ao Quitar',
};

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: 'Pendente',
  approved: 'Aprovada',
  paid: 'Paga',
  cancelled: 'Cancelada',
};

export const CALCULATE_ON_LABELS: Record<CalculateOn, string> = {
  gross: 'Valor Bruto',
  net: 'Valor Liquido',
};

export const COMMISSION_STATUS_COLORS: Record<CommissionStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};
