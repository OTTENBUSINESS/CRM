-- ============================================================================
-- Email automations: templates reusáveis + extensão do automation engine
-- ============================================================================

-- 1) Templates de email reusáveis entre automações
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  from_email TEXT NOT NULL DEFAULT 'IAP - IA na Prática <contato@napratica.ai>',
  reply_to TEXT,
  variables JSONB DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_templates_authenticated_all" ON email_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_email_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON email_templates;
CREATE TRIGGER trg_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW EXECUTE FUNCTION update_email_templates_updated_at();

-- 2) Extender o check constraint de action_type pra incluir send_email
ALTER TABLE sales_automation_rules
  DROP CONSTRAINT IF EXISTS sales_automation_rules_action_type_check;

ALTER TABLE sales_automation_rules
  ADD CONSTRAINT sales_automation_rules_action_type_check
  CHECK (action_type = ANY (ARRAY[
    'move_deal_stage'::text,
    'create_task'::text,
    'send_notification'::text,
    'update_lead_field'::text,
    'send_webhook'::text,
    'send_email'::text
  ]));

-- 3) Tabela de tracking de envios pra suportar idempotência (1x por lead)
CREATE TABLE IF NOT EXISTS email_automation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES sales_automation_rules(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id) ON DELETE SET NULL,
  email_to TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  resend_id TEXT,
  error_message TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique parcial: garante 1 envio por (rule, lead) quando status='sent'
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_runs_rule_lead_sent
  ON email_automation_runs(rule_id, lead_id)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_email_runs_rule ON email_automation_runs(rule_id);
CREATE INDEX IF NOT EXISTS idx_email_runs_lead ON email_automation_runs(lead_id);

ALTER TABLE email_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_automation_runs_authenticated_read" ON email_automation_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "email_automation_runs_service_write" ON email_automation_runs
  FOR INSERT TO service_role WITH CHECK (true);

COMMENT ON TABLE email_templates IS 'Templates de email HTML reusáveis entre automações';
COMMENT ON TABLE email_automation_runs IS 'Histórico de envios de email das automações; usado pra idempotência (once_per_lead)';
COMMENT ON COLUMN sales_automation_rules.action_type IS 'Tipos: move_deal_stage, create_task, send_notification, update_lead_field, send_webhook, send_email';
