-- ============================================================================
-- Cron jobs para os workers de WhatsApp Communities
-- Roda a cada 1 minuto. Requer pg_cron + pg_net habilitados.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove jobs antigos se existirem (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('process-scheduled-messages-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('process-message-sequences-1min');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Worker 1: envia mensagens da fila
SELECT cron.schedule(
  'process-scheduled-messages-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/process-scheduled-messages',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);

-- Worker 2: avança enrollments de sequências
SELECT cron.schedule(
  'process-message-sequences-1min',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT value FROM public.config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/process-message-sequences',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := '{}'::jsonb
  );
  $$
);
