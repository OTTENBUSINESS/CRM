-- =====================================================================
-- AGENTS PLATFORM — cron do poller (APLICADO 2026-07-06, jobid 12)
-- =====================================================================
-- Adaptado do 0006 do pack: em vez de colar a service_role key no
-- comando (placeholder), usa o padrão dos crons do Otten — URL da
-- tabela config + key do vault. Idempotente.
DO $$ BEGIN
  PERFORM cron.unschedule('agent-jobs-poller');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'agent-jobs-poller',
  '* * * * *',
  $job$
  SELECT net.http_post(
    url := (SELECT value FROM public.config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/agent-jobs-poller',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1)),
    body := '{}'::jsonb
  );
  $job$
);
