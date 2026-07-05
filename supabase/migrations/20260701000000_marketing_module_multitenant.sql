-- =====================================================================
-- MÓDULO MARKETING — adaptação MULTI-TENANT (Otten CRM)
-- =====================================================================
-- O pacote original é single-tenant (RLS aberta). Aqui tudo é criado
-- multi-tenant: tenant_id NOT NULL DEFAULT get_tenant_id() + RLS por tenant
-- (USING tenant_id = get_tenant_id()), preservando a blindagem de segurança.
--
-- Já existiam no Otten (não recriar): email_campaigns, email_campaign_leads,
-- email_templates, email_unsubscribes, campaigns, campaign_leads,
-- campaign_instance_stats, email_automation_runs (schema DIFERENTE — o do
-- pacote vira email_flow_runs), + as 4 RPCs de audiência.
--
-- Automação visual do pacote → email_flow_automations / email_flow_runs
-- (pra NÃO colidir com o email_automation_runs já existente do CRM).
-- =====================================================================

-- Extensões já existem (pgcrypto, pg_cron, pg_net). Bucket abaixo.

-- ---------------------------------------------------------------------
-- 1) TABELAS NOVAS (multi-tenant)
-- ---------------------------------------------------------------------

-- email_lists — segmentos salvos
CREATE TABLE IF NOT EXISTS public.email_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  criteria jsonb DEFAULT '{}'::jsonb,
  is_dynamic boolean DEFAULT true,
  is_active boolean DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);

-- email_subscribers — opt-in/opt-out (LGPD)
CREATE TABLE IF NOT EXISTS public.email_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'subscribed',
  unsubscribe_token uuid DEFAULT gen_random_uuid(),
  consent_source text,
  consent_at timestamptz,
  consent_ip text,
  unsubscribed_at timestamptz,
  bounce_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id(),
  CONSTRAINT email_subscribers_tenant_email_uniq UNIQUE (tenant_id, email),
  CONSTRAINT email_subscribers_token_uniq UNIQUE (unsubscribe_token)
);

-- email_sends — histórico granular (1 linha por envio)
CREATE TABLE IF NOT EXISTS public.email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  automation_run_id uuid,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  email text NOT NULL,
  resend_id text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  open_count integer DEFAULT 0,
  clicked_at timestamptz,
  click_count integer DEFAULT 0,
  clicked_url text,
  bounced_at timestamptz,
  bounce_reason text,
  error_message text,
  html text,
  user_agent text,
  device_type text,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);

-- email_events — auditoria bruta dos webhooks Resend
CREATE TABLE IF NOT EXISTS public.email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid REFERENCES public.email_sends(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);

-- email_flow_automations — automações visuais (React Flow) [namespaced]
CREATE TABLE IF NOT EXISTS public.email_flow_automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  trigger_event text,
  trigger_filter jsonb DEFAULT '{}'::jsonb,
  flow_json jsonb,
  is_active boolean DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);

-- email_flow_runs — execuções (1 por lead × automação) [namespaced]
CREATE TABLE IF NOT EXISTS public.email_flow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid REFERENCES public.email_flow_automations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  current_node_id text,
  scheduled_next_at timestamptz,
  status text DEFAULT 'active',
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  context jsonb DEFAULT '{}'::jsonb,
  tenant_id uuid NOT NULL DEFAULT get_tenant_id(),
  CONSTRAINT email_flow_runs_automation_lead_uniq UNIQUE (automation_id, lead_id)
);

-- whatsapp_cloud_templates — templates Meta Cloud API
CREATE TABLE IF NOT EXISTS public.whatsapp_cloud_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_template_id text,
  meta_waba_id text,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING',
  rejection_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id(),
  CONSTRAINT whatsapp_cloud_templates_tenant_name_lang_uniq UNIQUE (tenant_id, name, language)
);

-- whatsapp_template_tags — tags internas
CREATE TABLE IF NOT EXISTS public.whatsapp_template_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.whatsapp_cloud_templates(id) ON DELETE CASCADE,
  tag text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);

-- ---------------------------------------------------------------------
-- 2) ALTER nas tabelas EXISTENTES (só adiciona o que falta)
-- ---------------------------------------------------------------------
ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'campaign',
  ADD COLUMN IF NOT EXISTS automation_id uuid,
  ADD COLUMN IF NOT EXISTS list_id uuid,
  ADD COLUMN IF NOT EXISTS settings jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS html_cache text,
  ADD COLUMN IF NOT EXISTS preheader text,
  ADD COLUMN IF NOT EXISTS total_recipients integer DEFAULT 0;

ALTER TABLE public.email_campaign_leads
  ADD COLUMN IF NOT EXISTS resend_id text;

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'uazapi',
  ADD COLUMN IF NOT EXISTS cloud_template_id uuid,
  ADD COLUMN IF NOT EXISTS cloud_template_params jsonb DEFAULT '[]'::jsonb;

-- FKs opcionais (só se ainda não existem)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='campaigns_cloud_template_id_fkey') THEN
    ALTER TABLE public.campaigns ADD CONSTRAINT campaigns_cloud_template_id_fkey
      FOREIGN KEY (cloud_template_id) REFERENCES public.whatsapp_cloud_templates(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_campaigns_list_id_fkey') THEN
    ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_list_id_fkey
      FOREIGN KEY (list_id) REFERENCES public.email_lists(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='email_campaigns_flow_automation_id_fkey') THEN
    ALTER TABLE public.email_campaigns ADD CONSTRAINT email_campaigns_flow_automation_id_fkey
      FOREIGN KEY (automation_id) REFERENCES public.email_flow_automations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3) ÍNDICES
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_email_subscribers_tenant_status ON public.email_subscribers(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_email_sends_tenant_lead ON public.email_sends(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_resend ON public.email_sends(resend_id);
CREATE INDEX IF NOT EXISTS idx_email_sends_campaign ON public.email_sends(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_events_send ON public.email_events(send_id);
CREATE UNIQUE INDEX IF NOT EXISTS email_events_unique_event ON public.email_events (send_id, event_type, (payload->>'created_at'));
CREATE INDEX IF NOT EXISTS idx_email_flow_runs_scheduled ON public.email_flow_runs(scheduled_next_at) WHERE status='active';
CREATE INDEX IF NOT EXISTS idx_wct_tenant_status ON public.whatsapp_cloud_templates(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_campaigns_provider ON public.campaigns(provider);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_source ON public.email_campaigns(source_type);

-- ---------------------------------------------------------------------
-- 4) RLS por tenant + GRANTS + trigger updated_at (tabelas novas)
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'email_lists','email_subscribers','email_sends','email_events',
    'email_flow_automations','email_flow_runs','whatsapp_cloud_templates','whatsapp_template_tags'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_tenant_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());', t||'_tenant_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
  END LOOP;

  -- updated_at nas que têm a coluna (reusa update_updated_at_column existente)
  FOREACH t IN ARRAY ARRAY['email_lists','email_subscribers','email_flow_automations','whatsapp_cloud_templates']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- 5) STORAGE bucket para imagens/anexos de email
-- ---------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('email-assets','email-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='email_assets_public_read' AND schemaname='storage') THEN
    CREATE POLICY email_assets_public_read ON storage.objects FOR SELECT USING (bucket_id='email-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='email_assets_auth_write' AND schemaname='storage') THEN
    CREATE POLICY email_assets_auth_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id='email-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='email_assets_auth_update' AND schemaname='storage') THEN
    CREATE POLICY email_assets_auth_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id='email-assets');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='email_assets_auth_delete' AND schemaname='storage') THEN
    CREATE POLICY email_assets_auth_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id='email-assets');
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
SELECT 'marketing module multi-tenant migration ok' AS status;
