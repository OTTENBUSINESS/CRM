-- ============================================================================
-- Vincula leads ao webinário ativo no momento do cadastro.
-- A quiz-api preenche este campo automaticamente lendo o webinar_config ativo.
-- Permite organizar pipeline de marketing por lançamento (webinário 1, 2, ...).
-- ============================================================================

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS webinar_config_id UUID
  REFERENCES webinar_config(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leads_webinar_config
  ON leads(webinar_config_id)
  WHERE webinar_config_id IS NOT NULL;

COMMENT ON COLUMN leads.webinar_config_id IS
  'Webinário ativo no momento do cadastro do lead. Setado pela edge function quiz-api.';
