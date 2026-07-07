-- ============================================================
-- 0002 — Platform Upgrades (rodar DEPOIS do 0001)
--
-- Tudo que evoluiu na plataforma desde o pack original:
--  - 3 tabelas novas: agents_versions (versionamento de prompt),
--    agents_logs (telemetria), agents_core_memory (memória de longo prazo)
--  - Lembretes recorrentes (rotinas): repeat_every_minutes/repeat_until
--  - Roteador V2 flag no routing_log
--  - Bucket de uploads (vision — agente "vê" imagens)
-- ============================================================

-- ─── 1. agents_versions — versionamento (publicar/rollback de prompt) ───
CREATE TABLE IF NOT EXISTS public.agents_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  version integer,
  display_name text,
  description text,
  emoji text,
  provider text,
  model text,
  endpoint_url text,
  system_prompt text,
  settings jsonb,
  daily_token_limit integer,
  daily_cost_limit_brl numeric,
  avatar_color text,
  tier text,
  credential_id uuid,
  snapshot jsonb,
  summary text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  change_summary text,
  is_published boolean DEFAULT false,
  published_at timestamptz,
  version_number integer,
  UNIQUE (agent_id, version)
);
CREATE INDEX IF NOT EXISTS idx_agents_versions_agent ON public.agents_versions (agent_id, version DESC);

-- auto-incremento do número da versão por agente
CREATE OR REPLACE FUNCTION public.tg_agents_versions_autonum()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version IS NULL THEN
    SELECT COALESCE(MAX(version), 0) + 1 INTO NEW.version
    FROM public.agents_versions WHERE agent_id = NEW.agent_id;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.tg_agents_versions_sync_vn()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.version IS NOT NULL THEN NEW.version_number := NEW.version; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_agents_versions_autonum ON public.agents_versions;
CREATE TRIGGER tg_agents_versions_autonum BEFORE INSERT ON public.agents_versions
  FOR EACH ROW EXECUTE FUNCTION tg_agents_versions_autonum();
DROP TRIGGER IF EXISTS tg_agents_versions_sync_vn ON public.agents_versions;
CREATE TRIGGER tg_agents_versions_sync_vn BEFORE INSERT OR UPDATE ON public.agents_versions
  FOR EACH ROW EXECUTE FUNCTION tg_agents_versions_sync_vn();

-- ─── 2. agents_logs — telemetria de execução (tokens, custo, latência) ───
CREATE TABLE IF NOT EXISTS public.agents_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid,
  session_id uuid,
  user_id uuid,
  provider text,
  model text,
  input_tokens integer,
  output_tokens integer,
  cached_tokens integer,
  latency_ms integer,
  ttft_ms integer,
  cost_brl numeric,
  status_code integer,
  error text,
  sampled boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agents_logs_agent_time ON public.agents_logs (agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agents_logs_session ON public.agents_logs (session_id);

-- ─── 3. agents_core_memory — memória de longo prazo (blocos por agente+user) ───
CREATE TABLE IF NOT EXISTS public.agents_core_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  user_id uuid,
  block_key text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, user_id, block_key)
);
CREATE INDEX IF NOT EXISTS idx_agents_core_memory_agent ON public.agents_core_memory (agent_id, user_id);

-- ─── 4. RLS das tabelas novas (mesmo padrão do 0001) ───
ALTER TABLE public.agents_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents_core_memory ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ap_authenticated_read ON public.agents_versions FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ap_authenticated_write ON public.agents_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ap_authenticated_read ON public.agents_logs FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ap_authenticated_read ON public.agents_core_memory FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY ap_authenticated_write ON public.agents_core_memory FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── 5. Lembretes recorrentes (rotinas: "toda manhã 9h faça X") ───
ALTER TABLE public.agent_reminders ADD COLUMN IF NOT EXISTS repeat_every_minutes integer;
ALTER TABLE public.agent_reminders ADD COLUMN IF NOT EXISTS repeat_until timestamptz;
ALTER TABLE public.agent_reminders ADD COLUMN IF NOT EXISTS times_fired integer NOT NULL DEFAULT 0;

-- ─── 6. Roteador WhatsApp V2 — flag no log de roteamento ───
ALTER TABLE public.agent_routing_log ADD COLUMN IF NOT EXISTS v2_enabled boolean NOT NULL DEFAULT false;

-- ─── 7. Bucket de uploads (vision: usuário anexa imagem, agente vê) ───
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-uploads', 'agent-uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Policies do bucket (nomes iguais aos de produção validada).
-- ⚠️ Exigem privilégio no schema storage — aplicar esta migration via
-- MCP Supabase (apply_migration) ou SQL Editor do Dashboard (funciona).
-- O guard abaixo evita travar a migration se faltar privilégio; nesse
-- caso crie as 2 policies pelo Dashboard → Storage → Policies.
DO $$ BEGIN
  CREATE POLICY "agent_uploads_authenticated_write" ON storage.objects
    FOR ALL TO authenticated USING (bucket_id = 'agent-uploads') WITH CHECK (bucket_id = 'agent-uploads');
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN insufficient_privilege THEN RAISE NOTICE 'sem privilégio em storage — crie a policy pelo Dashboard';
END $$;
DO $$ BEGIN
  CREATE POLICY "agent_uploads_public_read" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'agent-uploads');
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN insufficient_privilege THEN RAISE NOTICE 'sem privilégio em storage — crie a policy pelo Dashboard';
END $$;

-- ─── 8. Flag do roteador V2 na tabela config (texto, padrão desligado) ───
INSERT INTO public.config (key, value)
VALUES ('agent_platform_v2_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
