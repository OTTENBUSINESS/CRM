-- =============================================================
-- Adicionar colunas de org/product/schedule em nps_responses
-- =============================================================

ALTER TABLE nps_responses
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id),
  ADD COLUMN IF NOT EXISTS product_id TEXT REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS survey_schedule_id UUID REFERENCES nps_survey_schedule(id);

-- Índice para busca por organização (usado no calculate-health-scores)
CREATE INDEX IF NOT EXISTS idx_nps_responses_org ON nps_responses(organization_id, created_at DESC);
