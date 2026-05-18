CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Tabela de follow-ups automáticos para leads no-show
CREATE TABLE IF NOT EXISTS noshow_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id),
  deal_id UUID REFERENCES deals(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  message_sent TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT DEFAULT 'sent', -- sent, replied, stopped
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_noshow_followups_lead ON noshow_followups(lead_id, sent_at DESC);
CREATE INDEX idx_noshow_followups_status ON noshow_followups(status);

-- Cron: disparar follow-up de no-show seg-sex às 9:30 BRT (12:30 UTC)
SELECT cron.schedule(
  'noshow-followup',
  '30 12 * * 1-5',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/process-noshow-followup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  );
  $$
);
