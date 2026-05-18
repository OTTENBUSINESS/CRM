-- =============================================================================
-- 002_ai_agent_crons.sql
-- =============================================================================
-- Cria 2 cron jobs que mantêm o agente IA funcionando mesmo se o trigger HTTP
-- falhar. Rodam a cada 1 minuto.
--
-- IMPORTANTE: depende de config.SUPABASE_PROJECT_URL estar com a URL REAL do
-- projeto. Se estiver com placeholder __REPLACE_WITH_PROJECT_URL__, atualize:
--
--   UPDATE config SET value = 'https://SEU_PROJECT_REF.supabase.co'
--   WHERE key = 'SUPABASE_PROJECT_URL';
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Cron 1: processa fila órfã do agente (caso trigger HTTP tenha falhado)
SELECT cron.unschedule('process-ai-queue') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-ai-queue');
SELECT cron.schedule(
  'process-ai-queue', '* * * * *',
  $$ SELECT net.http_post(
       url := (SELECT value FROM config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/ai-sales-agent',
       headers := jsonb_build_object('Content-Type','application/json'),
       body := '{"action":"process_queue"}'::jsonb
     ); $$
);

-- Cron 2: processa cadências (follow-ups proativos)
SELECT cron.unschedule('process-ai-cadence') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='process-ai-cadence');
SELECT cron.schedule(
  'process-ai-cadence', '* * * * *',
  $$ SELECT net.http_post(
       url := (SELECT value FROM config WHERE key='SUPABASE_PROJECT_URL') || '/functions/v1/ai-sales-agent',
       headers := jsonb_build_object('Content-Type','application/json'),
       body := '{"action":"process_cadence"}'::jsonb
     ); $$
);
