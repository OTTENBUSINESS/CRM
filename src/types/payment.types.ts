// Payment Types for Flexible Payment System

export type BillingType = 'pix' | 'boleto' | 'credit_card' | 'credit_card_no_anticipation' | 'credit_card_recurring';

/** Check if a billing type is credit-card-based (supports installments) */
export function isCreditCardType(billingType: BillingType | string): boolean {
  return billingType === 'credit_card' || billingType === 'credit_card_no_anticipation' || billingType === 'credit_card_recurring';
}

/** Map billing type to gateway fee lookup key (new CC types use same fees as credit_card) */
export function billingTypeToFeeKey(billingType: BillingType | string): string {
  if (isCreditCardType(billingType)) return 'credit_card';
  return billingType;
}

export type PaymentGatewaySlug = string;

export type PaymentStatus =
  | 'pending'
  | 'link_generated'
  | 'confirmed'
  | 'received'
  | 'overdue'
  | 'refunded'
  | 'cancelled';

export type InstallmentStatus = 'pending' | 'confirmed' | 'received' | 'overdue';

export type DealPaymentStatus = 'pending' | 'partial' | 'paid';

// Asaas Customer (mapping between lead and Asaas)
export interface AsaasCustomer {
  id: string;
  lead_id: string;
  asaas_customer_id: string;
  name: string;
  cpf_cnpj: string;
  email?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
}

// Deal Payment (a single payment method/part of a deal)
export interface DealPayment {
  id: string;
  deal_id: string;
  description?: string;
  billing_type: BillingType;
  gateway: PaymentGatewaySlug;
  amount: number;
  installments: number;
  installment_value?: number;
  payer_lead_id?: string;
  asaas_payment_id?: string;
  payment_link?: string;
  invoice_url?: string;
  status: PaymentStatus;
  due_date: string;
  paid_at?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  // Relations
  payer_lead?: {
    id: string;
    name: string;
  };
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
      email?: string;
      phone?: string;
    };
  };
  installments_list?: DealPaymentInstallment[];
}

// Individual installment
export interface DealPaymentInstallment {
  id: string;
  deal_payment_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: InstallmentStatus;
  paid_at?: string;
  asaas_installment_id?: string;
  created_at: string;
}

// Input types for creating payments
export interface CreateDealPaymentInput {
  deal_id: string;
  description?: string;
  billing_type: BillingType;
  gateway?: PaymentGatewaySlug;
  amount: number;
  installments?: number;
  due_date: string;
  payer_lead_id?: string;
}

export interface UpdateDealPaymentInput {
  id: string;
  description?: string;
  billing_type?: BillingType;
  gateway?: PaymentGatewaySlug;
  amount?: number;
  installments?: number;
  installment_value?: number;
  due_date?: string;
  paid_at?: string;
  status?: PaymentStatus;
  // Audit fields (required when editing a paid payment)
  audit_reason?: string;
  audit_changed_by?: string;
  audit_previous_values?: Record<string, any>;
}

// Audit log entry
export interface DealPaymentAuditEntry {
  id: string;
  deal_payment_id: string;
  deal_id: string;
  changed_by?: string;
  changed_at: string;
  change_type: 'edit' | 'status_change' | 'mark_paid' | 'revert';
  changes: Array<{ field: string; old_value: any; new_value: any }>;
  reason?: string;
  // Relations
  changed_by_member?: {
    id: string;
    name: string;
  };
}

// Asaas Webhook Log
export interface AsaasWebhook {
  id: string;
  event_type: string;
  asaas_payment_id?: string;
  payload: Record<string, unknown>;
  processed: boolean;
  error?: string;
  created_at: string;
}

// Financial Summary for a lead/deal
export interface FinancialSummary {
  total_deals: number;
  total_value: number;
  total_paid: number;
  total_pending: number;
  total_overdue: number;
  payment_status: DealPaymentStatus;
}

// For the flexible payment form
export interface PaymentPart {
  id: string; // temp id for form
  description: string;
  billing_type: BillingType;
  gateway?: string;
  amount: number;
  installments: number;
  due_date: string;
  payer_lead_id?: string;
}

// Asaas API Types
export interface AsaasCreateCustomerRequest {
  name: string;
  cpfCnpj: string;
  email?: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  externalReference?: string;
}

export interface AsaasCreateChargeRequest {
  customer: string; // Asaas customer ID
  billingType: 'BOLETO' | 'CREDIT_CARD' | 'PIX';
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
}

export interface AsaasChargeResponse {
  id: string;
  status: string;
  invoiceUrl?: string;
  bankSlipUrl?: string;
  pixQrCodeId?: string;
  pixCopiaECola?: string;
}

export interface AsaasWebhookPayload {
  event: string;
  payment: {
    id: string;
    customer: string;
    value: number;
    netValue: number;
    status: string;
    billingType: string;
    confirmedDate?: string;
    paymentDate?: string;
    externalReference?: string;
  };
}

// Billing type display helpers
export const BILLING_TYPE_LABELS: Record<BillingType, string> = {
  pix: 'PIX',
  boleto: 'Boleto',
  credit_card: 'Cartao de Credito',
  credit_card_no_anticipation: 'Cartao 12x s/ Antecipacao',
  credit_card_recurring: 'Cartao Recorrente',
};

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendente',
  link_generated: 'Link Gerado',
  confirmed: 'Confirmado',
  received: 'Recebido',
  overdue: 'Atrasado',
  refunded: 'Estornado',
  cancelled: 'Cancelado',
};

export const PAYMENT_STATUS_COLORS: Record<PaymentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  link_generated: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  received: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-gray-100 text-gray-800',
};
