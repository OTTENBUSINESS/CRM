-- ============================================================
-- AGENTS PLATFORM — Migration idempotente (pack para mentorados)
--
-- Instala 14 tabelas + ~30 RPCs + RLS + triggers + cron + Realtime
-- pra rodar a plataforma de agentes (multi-provider, no-code, com
-- humanização, notas/RAG, jobs duráveis, lembretes proativos).
--
-- Pré-requisitos OPCIONAIS (só pras "Sales tools" do bloco 99):
--   - leads, deals, sales_pipelines, sales_pipeline_stages, team_members
--   Sem eles, o CORE funciona normal — só as tools de vendas ficam ausentes.
--
-- Rodar: `supabase db push` ou colar no SQL Editor.
-- Idempotente: pode rodar várias vezes, IF NOT EXISTS em tudo.
-- ============================================================

-- ──────────────────────────────────────────────
-- 0. PREFLIGHT
-- ──────────────────────────────────────────────
DO $$
DECLARE
  faltando text := '';
BEGIN
  -- team_members é OBRIGATÓRIO (provider_credentials referencia)
  IF to_regclass('public.team_members') IS NULL THEN
    faltando := faltando || 'team_members, ';
  END IF;

  IF faltando <> '' THEN
    RAISE EXCEPTION E'Agents Platform: faltam tabelas-base do CRM (%).\nEste pack instala SOBRE um CRM base que já tem team_members.\nVeja README.md, seção "Pré-requisitos".', rtrim(faltando, ', ');
  END IF;

  RAISE NOTICE 'Agents Platform: preflight OK, instalando...';
END $$;

-- ──────────────────────────────────────────────
-- 1. EXTENSIONS
-- ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;       -- pgvector pras notas com RAG
CREATE EXTENSION IF NOT EXISTS pg_cron;      -- cron pro poller de jobs/lembretes
CREATE EXTENSION IF NOT EXISTS pg_trgm;      -- busca substring nas notas/buscar


-- ============================================================
-- 2. TABELAS CORE
-- ============================================================

-- ─── 2.1 Credentials (LLM + integrations) ───
CREATE TABLE IF NOT EXISTS public.agents_provider_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES public.team_members(id) ON DELETE CASCADE,
  provider_type text NOT NULL CHECK (provider_type = ANY (ARRAY[
    'anthropic_api','openai_api','openai_codex','google_gemini','groq','together',
    'fireworks','deepseek','custom',
    'borapostar','buffer','scrape_creators','gemini_image','uazapi','jina_reader','tavily'
  ])),
  label text NOT NULL,
  auth_data jsonb NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_shared boolean NOT NULL DEFAULT false,
  last_used_at timestamptz,
  last_refreshed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.2 Integration providers (catálogo de providers disponíveis) ───
CREATE TABLE IF NOT EXISTS public.agents_integration_providers (
  slug text PRIMARY KEY,
  display_name text NOT NULL,
  description text NOT NULL,
  icon text NOT NULL DEFAULT '🔌',
  category text NOT NULL,
  credential_type text,
  setup_url text,
  required_env_vars text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.3 Agent registry (definição do agente) ───
CREATE TABLE IF NOT EXISTS public.agents_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  emoji text,
  provider text NOT NULL,
  model text NOT NULL,
  endpoint_url text,
  system_prompt text NOT NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  daily_token_limit integer,
  daily_cost_limit_brl numeric(10,2),
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  parent_agent_id uuid REFERENCES public.agents_registry(id) ON DELETE SET NULL,
  avatar_color text DEFAULT 'amber' CHECK (avatar_color = ANY (ARRAY['amber','blue','green','red','purple','pink','teal','gray'])),
  responsible_user_id uuid,
  tier text DEFAULT 'specialist' CHECK (tier = ANY (ARRAY['ceo','manager','specialist'])),
  credential_id uuid REFERENCES public.agents_provider_credentials(id) ON DELETE SET NULL,
  is_template boolean NOT NULL DEFAULT false,
  template_variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  required_providers text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.4 Skill catalog (catálogo de tools instaláveis) ───
CREATE TABLE IF NOT EXISTS public.agents_skill_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  emoji text,
  parameters_schema jsonb NOT NULL,
  action_type text NOT NULL CHECK (action_type = ANY (ARRAY['sql','http','webhook','edge_function'])),
  action_config jsonb NOT NULL,
  default_usage_mode text NOT NULL DEFAULT 'always' CHECK (default_usage_mode = ANY (ARRAY['always','with_approval','disabled'])),
  is_recommended boolean NOT NULL DEFAULT false,
  provider text REFERENCES public.agents_integration_providers(slug),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.5 Tools (instâncias de skills no agente) ───
CREATE TABLE IF NOT EXISTS public.agents_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  parameters_schema jsonb NOT NULL,
  action_type text NOT NULL,
  action_config jsonb NOT NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  usage_mode text NOT NULL DEFAULT 'always' CHECK (usage_mode = ANY (ARRAY['always','with_approval','disabled'])),
  provider text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, name)
);

-- ─── 2.6 Deployments (canais que o agente atende) ───
CREATE TABLE IF NOT EXISTS public.agents_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  channel text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.7 Sessions (conversas) ───
CREATE TABLE IF NOT EXISTS public.agents_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  user_id uuid,
  channel text NOT NULL,
  title text,
  working_memory jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary text,
  provider_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.8 Messages ───
CREATE TABLE IF NOT EXISTS public.agents_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.agents_sessions(id) ON DELETE CASCADE,
  role text NOT NULL,
  content text,
  tool_calls jsonb,
  tool_call_id text,
  token_count integer,
  cost_brl numeric(10,4),
  status text NOT NULL DEFAULT 'completed',
  embedding vector(1536),
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.9 Action log (audit de tool calls) ───
CREATE TABLE IF NOT EXISTS public.agents_action_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.agents_registry(id),
  session_id uuid REFERENCES public.agents_sessions(id),
  user_id uuid,
  tool_name text NOT NULL,
  input jsonb,
  output jsonb,
  status text NOT NULL,
  error text,
  idempotency_key text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.10 Jobs (durable async execution) ───
CREATE TABLE IF NOT EXISTS public.agent_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.agents_sessions(id) ON DELETE SET NULL,
  channel text NOT NULL DEFAULT 'chat_web',
  tool_name text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status = ANY (ARRAY['processing','done','failed','timeout'])),
  external_id text,
  poll_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  provider text,
  result jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  resume_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  resumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  timeout_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- ─── 2.11 Reminders (proactive scheduled messages) ───
CREATE TABLE IF NOT EXISTS public.agent_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  session_id uuid,
  channel text NOT NULL DEFAULT 'chat_web',
  fire_at timestamptz NOT NULL,
  message text NOT NULL,
  resume_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

-- ─── 2.12 Notes (memory/RAG) ───
CREATE TABLE IF NOT EXISTS public.agent_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents_registry(id) ON DELETE CASCADE,
  owner_user_id uuid REFERENCES public.team_members(id) ON DELETE SET NULL,
  title text NOT NULL,
  slug text NOT NULL,
  content text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  embedding vector(768),
  embedding_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, slug)
);

-- ─── 2.13 Note versions ───
CREATE TABLE IF NOT EXISTS public.agent_note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.agent_notes(id) ON DELETE CASCADE,
  content text NOT NULL,
  title text,
  author text NOT NULL CHECK (author = ANY (ARRAY['agent','human'])),
  author_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2.14 Routing log (audit do roteador V2) ───
CREATE TABLE IF NOT EXISTS public.agent_routing_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL,
  instance_id text,
  lead_id uuid,
  message_id text,
  decision text NOT NULL,
  v2_enabled boolean NOT NULL DEFAULT false,
  routed_agent_slug text,
  routed_agent_id uuid,
  routed_deployment_id uuid,
  legacy_agent_id uuid,
  routing_ctx jsonb,
  match_used jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 3. ÍNDICES (performance)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agents_registry_active   ON public.agents_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_agents_registry_template ON public.agents_registry(is_template);
CREATE INDEX IF NOT EXISTS idx_agents_tools_agent       ON public.agents_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_deployments_channel_active
  ON public.agents_deployments(channel) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_agents_sessions_agent_user ON public.agents_sessions(agent_id, user_id);
CREATE INDEX IF NOT EXISTS idx_agents_messages_session_time
  ON public.agents_messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_agents_action_log_agent_time
  ON public.agents_action_log(agent_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_jobs_processing
  ON public.agent_jobs(status) WHERE status = 'processing';
CREATE INDEX IF NOT EXISTS idx_agent_reminders_due
  ON public.agent_reminders(fire_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_agent_notes_agent      ON public.agent_notes(agent_id, archived);
CREATE INDEX IF NOT EXISTS idx_agent_notes_embedding  ON public.agent_notes
  USING hnsw (embedding vector_cosine_ops) WHERE embedding IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_notes_content    ON public.agent_notes
  USING gin (content gin_trgm_ops);


-- ============================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents_registry','agents_tools','agents_deployments','agents_sessions',
    'agents_messages','agents_provider_credentials','agents_skill_catalog',
    'agents_integration_providers','agents_action_log',
    'agent_jobs','agent_reminders','agent_notes','agent_note_versions','agent_routing_log'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;

-- Policies: authenticated lê tudo (admin tools agem com service_role)
DO $$
DECLARE
  t text;
  has_pol boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents_registry','agents_tools','agents_deployments','agents_sessions',
    'agents_messages','agents_provider_credentials','agents_skill_catalog',
    'agents_integration_providers','agents_action_log',
    'agent_jobs','agent_reminders','agent_notes','agent_note_versions','agent_routing_log'
  ] LOOP
    SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='ap_authenticated_read') INTO has_pol;
    IF NOT has_pol THEN
      EXECUTE format('CREATE POLICY ap_authenticated_read ON public.%I FOR SELECT TO authenticated USING (true)', t);
    END IF;
    -- update policy só pras tabelas que o usuário precisa editar via frontend
    IF t IN ('agents_registry','agents_tools','agents_deployments','agents_provider_credentials',
             'agent_notes','agent_reminders','agents_skill_catalog') THEN
      SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname='ap_authenticated_write') INTO has_pol;
      IF NOT has_pol THEN
        EXECUTE format('CREATE POLICY ap_authenticated_write ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
      END IF;
    END IF;
  END LOOP;
END $$;


-- ============================================================
-- 5. REALTIME PUBLICATION
-- ============================================================
-- agents_messages no Realtime = entrega ao vivo de mensagens proativas (lembrete, resume de job)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='agents_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agents_messages;
  END IF;
END $$;


-- ============================================================
-- 6. CONFIG KEYS (require `config` table no CRM)
-- ============================================================
-- [Otten] Insert da flag agent_platform_v2_enabled REMOVIDO daqui:
-- o config do Otten e (key text, value text) sem coluna description, e o
-- 0002 ja insere a flag como texto ('false') com ON CONFLICT DO NOTHING.


-- ============================================================
-- 7. FUNCTIONS (RPCs) — extraídas em arquivo separado
-- ============================================================
-- Veja 0002_agents_functions.sql (separado por ser longo)


-- ============================================================
-- 8. TRIGGERS
-- ============================================================
-- updated_at triggers ficam no 0002_agents_functions.sql junto com a função genérica


-- ============================================================
-- 9. PG_CRON: poller a cada minuto
-- ============================================================
DO $$
DECLARE
  v_url text;
  v_key text;
BEGIN
  -- Tenta achar URL e key do projeto (deve vir do ambiente)
  v_url := current_setting('app.settings.supabase_url', true);
  v_key := current_setting('app.settings.service_role_key', true);

  IF v_url IS NULL OR v_key IS NULL THEN
    RAISE NOTICE 'Agents Platform: configure pg_cron MANUALMENTE (veja PLAYBOOK.md, seção "Cron job").';
    RETURN;
  END IF;

  -- Remove agendamento antigo se existir
  PERFORM cron.unschedule('agent-jobs-poller')
   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='agent-jobs-poller');

  PERFORM cron.schedule(
    'agent-jobs-poller',
    '* * * * *',  -- a cada minuto
    format(
      $sql$SELECT net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer %s'),
        body := '{}'::jsonb
      ) AS request_id$sql$,
      v_url || '/functions/v1/agent-jobs-poller', v_key
    )
  );
END $$;

DO $$ BEGIN RAISE NOTICE 'Agents Platform: instalação CORE concluída. Próximo: rode 0002_agents_functions.sql.'; END $$;
