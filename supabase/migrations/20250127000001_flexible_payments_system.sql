-- =====================================================
-- Migration: Flexible Payments System with Asaas + Commissions
-- Date: 2025-01-27
-- =====================================================

-- =====================================================
-- 1. MODIFY EXISTING TABLES
-- =====================================================

-- Deals: add payment tracking columns
ALTER TABLE deals ADD COLUMN IF NOT EXISTS total_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'partial', 'paid'));

-- Products: add commercial fields
ALTER TABLE products ADD COLUMN IF NOT EXISTS price DECIMAL(12,2);
ALTER TABLE products ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT;

COMMENT ON COLUMN deals.total_paid IS 'Total amount already paid for this deal';
COMMENT ON COLUMN deals.payment_status IS 'Overall payment status: pending, partial, paid';
COMMENT ON COLUMN products.price IS 'Base price of the product';
COMMENT ON COLUMN products.category IS 'Product category for grouping';
COMMENT ON COLUMN products.sku IS 'Stock Keeping Unit identifier';

-- =====================================================
-- 2. ASAAS CUSTOMERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS asaas_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  asaas_customer_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  cpf_cnpj TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asaas_customers_lead_id ON asaas_customers(lead_id);
CREATE INDEX IF NOT EXISTS idx_asaas_customers_asaas_id ON asaas_customers(asaas_customer_id);

COMMENT ON TABLE asaas_customers IS 'Mapping between leads and Asaas customer IDs';

-- =====================================================
-- 3. DEAL PAYMENTS TABLE (CORE - Multiple payments per deal)
-- =====================================================

CREATE TABLE IF NOT EXISTS deal_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Configuration
  description TEXT, -- "Entrada", "Cartao Principal", etc
  billing_type TEXT NOT NULL CHECK (billing_type IN ('pix', 'boleto', 'credit_card')),
  gateway TEXT DEFAULT 'asaas' CHECK (gateway IN ('asaas', 'manual')),

  -- Values
  amount DECIMAL(12,2) NOT NULL,
  installments INTEGER DEFAULT 1,
  installment_value DECIMAL(12,2),

  -- Asaas Integration
  asaas_payment_id TEXT,
  payment_link TEXT,
  invoice_url TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'link_generated', 'confirmed', 'received', 'overdue', 'refunded', 'cancelled')),

  -- Dates
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,

  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_payments_deal_id ON deal_payments(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_payments_status ON deal_payments(status);
CREATE INDEX IF NOT EXISTS idx_deal_payments_asaas_id ON deal_payments(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_deal_payments_due_date ON deal_payments(due_date);

COMMENT ON TABLE deal_payments IS 'Multiple payment methods/parts for a single deal';

-- =====================================================
-- 4. DEAL PAYMENT INSTALLMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS deal_payment_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_payment_id UUID NOT NULL REFERENCES deal_payments(id) ON DELETE CASCADE,

  installment_number INTEGER NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  due_date DATE NOT NULL,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'received', 'overdue')),
  paid_at TIMESTAMPTZ,

  asaas_installment_id TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(deal_payment_id, installment_number)
);

CREATE INDEX IF NOT EXISTS idx_payment_installments_payment_id ON deal_payment_installments(deal_payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_installments_status ON deal_payment_installments(status);
CREATE INDEX IF NOT EXISTS idx_payment_installments_due_date ON deal_payment_installments(due_date);

COMMENT ON TABLE deal_payment_installments IS 'Individual installments for credit card payments';

-- =====================================================
-- 5. COMMISSION RULES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS commission_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  name TEXT NOT NULL,
  sales_rep_id UUID REFERENCES profiles(id), -- NULL = default rule
  product_id TEXT REFERENCES products(id),   -- NULL = all products

  commission_type TEXT NOT NULL CHECK (commission_type IN ('percentage', 'fixed')),
  commission_value DECIMAL(10,2) NOT NULL, -- % or fixed value

  -- When to pay
  payment_trigger TEXT NOT NULL DEFAULT 'on_payment'
    CHECK (payment_trigger IN ('on_deal_won', 'on_payment', 'on_full_payment')),

  is_active BOOLEAN DEFAULT TRUE,
  priority INTEGER DEFAULT 0, -- Higher = more specific

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commission_rules_sales_rep ON commission_rules(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_product ON commission_rules(product_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_active ON commission_rules(is_active);

COMMENT ON TABLE commission_rules IS 'Rules for calculating sales commissions';
COMMENT ON COLUMN commission_rules.priority IS 'Higher priority = more specific rule (rep+product > rep > product > default)';

-- =====================================================
-- 6. COMMISSIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  deal_id UUID NOT NULL REFERENCES deals(id),
  deal_payment_id UUID REFERENCES deal_payments(id),
  sales_rep_id UUID NOT NULL REFERENCES profiles(id),
  commission_rule_id UUID REFERENCES commission_rules(id),

  base_amount DECIMAL(12,2) NOT NULL,       -- Base value (deal or payment)
  commission_amount DECIMAL(12,2) NOT NULL, -- Commission value

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'paid', 'cancelled')),

  paid_at TIMESTAMPTZ,
  payment_reference TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commissions_deal ON commissions(deal_id);
CREATE INDEX IF NOT EXISTS idx_commissions_sales_rep ON commissions(sales_rep_id);
CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
CREATE INDEX IF NOT EXISTS idx_commissions_created ON commissions(created_at);

COMMENT ON TABLE commissions IS 'Calculated commissions for sales reps';

-- =====================================================
-- 7. ASAAS WEBHOOKS LOG TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS asaas_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  asaas_payment_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_event ON asaas_webhooks(event_type);
CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_payment ON asaas_webhooks(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_webhooks_processed ON asaas_webhooks(processed);

COMMENT ON TABLE asaas_webhooks IS 'Log of all webhooks received from Asaas';

-- =====================================================
-- 8. ROW LEVEL SECURITY POLICIES
-- =====================================================

-- Enable RLS on all new tables
ALTER TABLE asaas_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_payment_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE asaas_webhooks ENABLE ROW LEVEL SECURITY;

-- Asaas Customers: authenticated users can view and manage
CREATE POLICY "Authenticated users can view asaas_customers"
  ON asaas_customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert asaas_customers"
  ON asaas_customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update asaas_customers"
  ON asaas_customers FOR UPDATE
  TO authenticated
  USING (true);

-- Deal Payments: authenticated users can manage
CREATE POLICY "Authenticated users can view deal_payments"
  ON deal_payments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deal_payments"
  ON deal_payments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deal_payments"
  ON deal_payments FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete deal_payments"
  ON deal_payments FOR DELETE
  TO authenticated
  USING (true);

-- Deal Payment Installments
CREATE POLICY "Authenticated users can view deal_payment_installments"
  ON deal_payment_installments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert deal_payment_installments"
  ON deal_payment_installments FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update deal_payment_installments"
  ON deal_payment_installments FOR UPDATE
  TO authenticated
  USING (true);

-- Commission Rules: authenticated users can manage
CREATE POLICY "Authenticated users can view commission_rules"
  ON commission_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert commission_rules"
  ON commission_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update commission_rules"
  ON commission_rules FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete commission_rules"
  ON commission_rules FOR DELETE
  TO authenticated
  USING (true);

-- Commissions: sales reps see their own, admins see all
CREATE POLICY "Authenticated users can view commissions"
  ON commissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert commissions"
  ON commissions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update commissions"
  ON commissions FOR UPDATE
  TO authenticated
  USING (true);

-- Asaas Webhooks: authenticated users can view
CREATE POLICY "Authenticated users can view asaas_webhooks"
  ON asaas_webhooks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role can insert asaas_webhooks"
  ON asaas_webhooks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Service role can update asaas_webhooks"
  ON asaas_webhooks FOR UPDATE
  TO authenticated
  USING (true);

-- =====================================================
-- 9. FUNCTIONS FOR AUTOMATIC UPDATES
-- =====================================================

-- Function to update deal payment totals
CREATE OR REPLACE FUNCTION update_deal_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
  v_deal_id UUID;
  v_total_paid DECIMAL(12,2);
  v_negotiated_price DECIMAL(12,2);
  v_new_status TEXT;
BEGIN
  -- Get the deal_id
  IF TG_OP = 'DELETE' THEN
    v_deal_id := OLD.deal_id;
  ELSE
    v_deal_id := NEW.deal_id;
  END IF;

  -- Calculate total paid
  SELECT COALESCE(SUM(amount), 0)
  INTO v_total_paid
  FROM deal_payments
  WHERE deal_id = v_deal_id
    AND status IN ('confirmed', 'received');

  -- Get negotiated price
  SELECT negotiated_price INTO v_negotiated_price
  FROM deals WHERE id = v_deal_id;

  -- Determine payment status
  IF v_total_paid >= v_negotiated_price THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  -- Update deal
  UPDATE deals
  SET total_paid = v_total_paid,
      payment_status = v_new_status,
      updated_at = NOW()
  WHERE id = v_deal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger to update deal totals when payment status changes
DROP TRIGGER IF EXISTS trigger_update_deal_payment_totals ON deal_payments;
CREATE TRIGGER trigger_update_deal_payment_totals
  AFTER INSERT OR UPDATE OF status OR DELETE
  ON deal_payments
  FOR EACH ROW
  EXECUTE FUNCTION update_deal_payment_totals();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to new tables
DROP TRIGGER IF EXISTS trigger_asaas_customers_updated_at ON asaas_customers;
CREATE TRIGGER trigger_asaas_customers_updated_at
  BEFORE UPDATE ON asaas_customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_deal_payments_updated_at ON deal_payments;
CREATE TRIGGER trigger_deal_payments_updated_at
  BEFORE UPDATE ON deal_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_commission_rules_updated_at ON commission_rules;
CREATE TRIGGER trigger_commission_rules_updated_at
  BEFORE UPDATE ON commission_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_commissions_updated_at ON commissions;
CREATE TRIGGER trigger_commissions_updated_at
  BEFORE UPDATE ON commissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 10. INSERT DEFAULT COMMISSION RULE
-- =====================================================

INSERT INTO commission_rules (name, commission_type, commission_value, payment_trigger, is_active, priority)
VALUES ('Regra Padrao - 10%', 'percentage', 10.00, 'on_payment', true, 0)
ON CONFLICT DO NOTHING;
