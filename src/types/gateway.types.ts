// Payment Gateway Types

export interface PaymentGateway {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  created_at: string;
}

export interface PaymentGatewayFee {
  id: string;
  gateway_id: string;
  billing_type: string;
  fee_percent: number;
  fee_fixed: number;
  created_at: string;
}

export interface PaymentGatewayWithFees extends PaymentGateway {
  fees: PaymentGatewayFee[];
}

export interface CreatePaymentGatewayInput {
  name: string;
  slug: string;
  is_active?: boolean;
  fees: {
    billing_type: string;
    fee_percent: number;
    fee_fixed: number;
  }[];
}

export interface UpdatePaymentGatewayInput {
  id: string;
  name?: string;
  is_active?: boolean;
  fees?: {
    billing_type: string;
    fee_percent: number;
    fee_fixed: number;
  }[];
}
