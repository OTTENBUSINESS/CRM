// ─── Financial Accounts ──────────────────────────────────
export type FinancialAccountType = 'bank_account' | 'credit_card' | 'digital_wallet' | 'cash' | 'payment_gateway';

export interface FinancialAccount {
  id: string;
  name: string;
  type: FinancialAccountType;
  institution: string | null;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  color: string;
  icon: string;
  position: number;
  created_at: string;
  updated_at: string;
}

export interface CreateFinancialAccountInput {
  name: string;
  type: FinancialAccountType;
  institution?: string | null;
  description?: string | null;
  color?: string;
  icon?: string;
  position?: number;
  is_default?: boolean;
}

export interface UpdateFinancialAccountInput extends Partial<CreateFinancialAccountInput> {
  id: string;
  is_active?: boolean;
}

// ─── Financial Entry Status ──────────────────────────────
export type FinancialEntryStatus = 'pending' | 'paid' | 'overdue' | 'cancelled';

// ─── Financial Categories ────────────────────────────────
export interface FinancialCategory {
  id: string;
  name: string;
  type: 'revenue' | 'expense' | 'cost';
  parent_id: string | null;
  color: string;
  icon: string;
  is_system: boolean;
  position: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FinancialEntry {
  id: string;
  category_id: string;
  description: string;
  amount: number;
  entry_date: string;
  type: 'expense' | 'revenue' | 'cost';
  recurrence: 'none' | 'monthly' | 'yearly';
  recurrence_end_date: string | null;
  payment_method: string | null;
  receipt_url: string | null;
  notes: string | null;
  tags: string[];
  created_by: string | null;
  metadata: Record<string, any>;
  status: FinancialEntryStatus;
  due_date: string | null;
  paid_at: string | null;
  financial_account_id: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: FinancialCategory;
  financial_account?: FinancialAccount;
}

export interface CreateFinancialEntryInput {
  category_id: string;
  description: string;
  amount: number;
  entry_date: string;
  type: 'expense' | 'revenue' | 'cost';
  recurrence?: 'none' | 'monthly' | 'yearly';
  recurrence_end_date?: string | null;
  payment_method?: string | null;
  receipt_url?: string | null;
  notes?: string | null;
  tags?: string[];
  created_by?: string | null;
  status?: FinancialEntryStatus;
  due_date?: string | null;
  paid_at?: string | null;
  financial_account_id?: string | null;
}

export interface UpdateFinancialEntryInput extends Partial<CreateFinancialEntryInput> {
  id: string;
}

export interface CreateFinancialCategoryInput {
  name: string;
  type: 'revenue' | 'expense' | 'cost';
  parent_id?: string | null;
  color?: string;
  icon?: string;
  position?: number;
}

export interface UpdateFinancialCategoryInput extends Partial<CreateFinancialCategoryInput> {
  id: string;
  is_active?: boolean;
}

export interface FinancialPeriod {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  label: string;
}

export interface DRELine {
  label: string;
  value: number;
  percentage: number; // % of receita bruta
  indent?: number;
  bold?: boolean;
  separator?: boolean;
  children?: DRELine[];
  childCount?: number;
  isEventGroup?: boolean;
}

export interface DRERevenueItem {
  date: string;
  amount: number;
  leadName: string;
  leadId: string | null;
  dealTitle: string;
  gateway?: string;
  billingType?: string;
  description?: string;
}

export interface DRERevenueItem {
  date: string;
  amount: number;
  leadName: string;
  leadId: string | null;
  dealTitle: string;
  gateway?: string;
  billingType?: string;
  description?: string;
}

export interface DREReport {
  receita_bruta: number;
  cancelamentos: number;
  reembolsos: number;
  receita_liquida: number;
  marketing_trafego: number;
  comissoes: number;
  taxas_gateway: number;
  margem_contribuicao: number;
  despesas_por_categoria: { category_name: string; value: number }[];
  total_despesas: number;
  resultado_operacional: number;
  lines: DRELine[];
  revenueItems: DRERevenueItem[];
}

export interface FinancialKPIs {
  receita: number;
  receita_trend: number;
  receita_liquida: number;
  despesas: number;
  despesas_trend: number;
  lucro: number;
  lucro_trend: number;
  margem: number;
  cac: number;
  ltv: number;
  ltv_cac_ratio: number;
  mrr: number;
  pending_total: number;
  overdue_total: number;
  new_clients: number;
  active_clients: number;
  ad_spend: number;
  gateway_fee: number;
  roas: number;
  ticket_medio: number;
  conversion_rate: number;
  pipeline_value: number;
  pipeline_count: number;
  forecast_weighted: number;
  avg_cycle_days: number;
  discount_avg: number;
}

export interface MonthlyDataPoint {
  month: string;   // YYYY-MM
  label: string;   // "Jan/26"
  value: number;
}

export interface RevenueVsExpensePoint {
  month: string;
  label: string;
  receita: number;
  despesas: number;
  lucro: number;
  margem: number;
}

export interface ExpenseBreakdownItem {
  category: string;
  color: string;
  value: number;
  percentage: number;
}

export interface CashFlowPoint {
  date: string;
  label: string;
  entradas: number;
  saidas: number;
  saldo: number;
}

export interface CACReport {
  months: {
    month: string;
    label: string;
    ad_spend: number;
    comissoes: number;
    equipe: number;
    total_cost: number;
    new_clients: number;
    cac: number;
  }[];
}

export interface LTVReport {
  products: {
    product_id: string;
    product_name: string;
    avg_ltv: number;
    total_revenue: number;
    client_count: number;
    cac: number;
    ltv_cac_ratio: number;
  }[];
}

export interface FinancialEntryFilters {
  category_id?: string;
  type?: 'expense' | 'revenue' | 'cost';
  from_date?: string;
  to_date?: string;
  search?: string;
  status?: FinancialEntryStatus;
  financial_account_id?: string;
}
