-- =============================================================
-- NPS Survey Schedule - Agendamento automático de pesquisas NPS
-- =============================================================

-- Tabela de agendamento de pesquisas NPS
CREATE TABLE IF NOT EXISTS nps_survey_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  lead_id UUID REFERENCES leads(id),
  milestone TEXT NOT NULL,
  token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_for DATE NOT NULL,
  sent_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, product_id, milestone)
);

-- Índices
CREATE INDEX idx_nps_schedule_token ON nps_survey_schedule(token);
CREATE INDEX idx_nps_schedule_pending ON nps_survey_schedule(status, scheduled_for);

-- RLS
ALTER TABLE nps_survey_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON nps_survey_schedule FOR ALL USING (true);
