-- =============================================================================
-- 001_post_baseline_fixes.sql
-- =============================================================================
-- Patch consolidado de tudo que é necessário pro CRM funcionar 100% após
-- aplicar 000_base_schema.sql. Inclui:
--   1. FKs faltantes (PostgREST embeds)
--   2. RPCs faltantes (inbox, agente IA, etc)
--   3. Trigger trg_enqueue_for_ai_agent
--   4. Tabela ai_agent_chat_events (visual de skips/erros do agente)
--   5. Storage buckets (whatsapp-media, profile-photos)
--   6. Realtime habilitado em tabelas necessárias
--   7. Config seed (SUPABASE_PROJECT_URL — preenchido no setup)
-- =============================================================================

-- =============================================================================
-- 1. FKs FALTANTES (necessárias pros embeds do PostgREST funcionarem)
-- =============================================================================
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.sales_pipelines(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_sdr_id_fkey FOREIGN KEY (sdr_id) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deals ADD CONSTRAINT deals_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.company_activities ADD CONSTRAINT company_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.company_activities ADD CONSTRAINT company_activities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.company_activities ADD CONSTRAINT company_activities_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.company_activities ADD CONSTRAINT company_activities_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.ai_agent_conversations ADD CONSTRAINT ai_agent_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deal_payments ADD CONSTRAINT deal_payments_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.deal_payments ADD CONSTRAINT deal_payments_payer_lead_id_fkey FOREIGN KEY (payer_lead_id) REFERENCES public.leads(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.leads ADD CONSTRAINT leads_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.leads ADD CONSTRAINT leads_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES public.sales_pipeline_stages(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales_pipeline_stages ADD CONSTRAINT sales_pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.sales_pipelines(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales_notes ADD CONSTRAINT sales_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN ALTER TABLE public.call_history ADD CONSTRAINT call_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.call_history ADD CONSTRAINT call_history_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.meetings ADD CONSTRAINT meetings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.meetings ADD CONSTRAINT meetings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.organizations ADD CONSTRAINT organizations_primary_contact_id_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.leads(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.scheduled_messages ADD CONSTRAINT scheduled_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.ai_sales_agents ADD CONSTRAINT ai_sales_agents_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id) ON DELETE CASCADE; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.sales_materials ADD CONSTRAINT sales_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id) ON DELETE SET NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================================================
-- 2. RPCs FALTANTES (single-tenant — ajustadas pra template do aluno)
-- =============================================================================

-- Inbox dashboard
CREATE OR REPLACE FUNCTION public.get_inbox_dashboard_metrics(p_instance_id uuid DEFAULT NULL)
RETURNS TABLE(total_pending bigint, critical_count bigint, warning_count bigint, ok_count bigint, avg_wait_minutes integer, max_wait_minutes integer, resolved_today bigint, total_conversations bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH latest_messages AS (
    SELECT DISTINCT ON (COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT))
      COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT) AS conversation_id,
      wm.is_from_me, wm.created_at,
      EXTRACT(EPOCH FROM (NOW() - wm.created_at))::INTEGER / 60 AS wait_minutes
    FROM whatsapp_messages wm
    WHERE (p_instance_id IS NULL OR wm.instance_id = p_instance_id)
    ORDER BY COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT), wm.created_at DESC
  ),
  pending AS (SELECT * FROM latest_messages WHERE NOT is_from_me)
  SELECT
    (SELECT COUNT(*) FROM pending)::BIGINT,
    (SELECT COUNT(*) FROM pending WHERE wait_minutes > 120)::BIGINT,
    (SELECT COUNT(*) FROM pending WHERE wait_minutes > 30 AND wait_minutes <= 120)::BIGINT,
    (SELECT COUNT(*) FROM pending WHERE wait_minutes <= 30)::BIGINT,
    COALESCE((SELECT AVG(wait_minutes)::INTEGER FROM pending), 0),
    COALESCE((SELECT MAX(wait_minutes)::INTEGER FROM pending), 0),
    (SELECT COUNT(*) FROM latest_messages WHERE is_from_me AND created_at >= CURRENT_DATE)::BIGINT,
    (SELECT COUNT(*) FROM latest_messages)::BIGINT;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inbox_dashboard_metrics(p_instance_id uuid, p_team_filter text)
RETURNS TABLE(total_pending bigint, critical_count bigint, warning_count bigint, ok_count bigint, avg_wait_minutes integer, max_wait_minutes integer, resolved_today bigint, total_conversations bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT * FROM public.get_inbox_dashboard_metrics(p_instance_id); $$;

-- CS Inbox completo (single-tenant)
CREATE OR REPLACE FUNCTION public.get_cs_inbox_with_metrics(
  p_instance_id uuid DEFAULT NULL, p_limit integer DEFAULT 50,
  p_product_filter text DEFAULT NULL, p_health_filter text DEFAULT NULL,
  p_sla_filter text DEFAULT NULL, p_only_pending boolean DEFAULT false,
  p_search text DEFAULT NULL, p_sort_mode text DEFAULT 'recent',
  p_hide_handled boolean DEFAULT false, p_only_with_tasks boolean DEFAULT false,
  p_funnel_filter text DEFAULT NULL, p_pipeline_id uuid DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL, p_team_filter text DEFAULT NULL
)
RETURNS TABLE(
  conversation_id text, conversation_type text, lead_id uuid, group_id uuid,
  contact_phone text, conversation_name text, last_message text, last_message_at timestamp with time zone,
  last_sender_name text, is_from_me boolean, unread_count bigint, organization_id uuid,
  organization_name text, health_status text, health_score integer, instance_id uuid,
  instance_name text, lead_photo_url text, lead_products text[], pending_reply boolean,
  wait_minutes integer, sla_status text, assigned_agent_id uuid, assigned_agent_name text,
  is_handled boolean, handled_at timestamp with time zone, handled_reason text,
  pending_tasks_count integer, lead_company_name text, lead_job_title text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH conversations AS (
    SELECT DISTINCT ON (CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END)
      CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END AS conv_id,
      CASE WHEN m.group_id IS NOT NULL THEN 'grupo' ELSE 'individual' END AS conv_type,
      CASE WHEN m.group_id IS NULL THEN m.lead_id ELSE NULL END AS m_lead_id,
      m.group_id AS m_group_id,
      CASE WHEN m.group_id IS NOT NULL THEN m.sender_phone ELSE COALESCE(l.phone, m.sender_phone) END AS m_contact_phone,
      COALESCE(g.name, l.name, m.sender_name) AS conv_name,
      m.content AS last_msg, m.created_at AS last_msg_at, m.sender_name AS last_sender,
      m.is_from_me AS m_is_from_me, 0::BIGINT AS unread,
      NULL::uuid AS m_org_id, NULL::text AS org_name,
      m.instance_id AS m_instance_id, wi.name AS inst_name,
      l.photo_url AS photo_url, ARRAY[]::TEXT[] AS products,
      (NOT m.is_from_me) AS pending,
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - m.created_at))::INTEGER / 60) AS wait_mins,
      false AS m_is_handled, NULL::timestamptz AS m_handled_at, NULL::text AS m_handled_reason,
      0 AS m_pending_tasks, l.company_name AS m_company_name, l.job_title AS m_job_title
    FROM whatsapp_messages m
    LEFT JOIN leads l ON m.lead_id = l.id
    LEFT JOIN whatsapp_groups g ON m.group_id = g.id
    LEFT JOIN whatsapp_instances wi ON m.instance_id = wi.id
    WHERE (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND (p_search IS NULL OR LENGTH(p_search) < 3
           OR COALESCE(g.name, l.name, m.sender_name) ILIKE '%' || p_search || '%'
           OR m.sender_phone ILIKE '%' || p_search || '%'
           OR l.phone ILIKE '%' || p_search || '%'
           OR l.company_name ILIKE '%' || p_search || '%')
    ORDER BY CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END, m.created_at DESC
  ),
  filtered AS (
    SELECT c.*, 'unknown' AS final_health_status, NULL::INTEGER AS final_health_score,
      CASE WHEN c.pending AND c.wait_mins > 120 THEN 'critical'
           WHEN c.pending AND c.wait_mins > 30 THEN 'warning'
           ELSE 'ok' END AS final_sla_status
    FROM conversations c
    WHERE (p_sla_filter IS NULL OR
           (p_sla_filter = 'critical' AND c.pending AND c.wait_mins > 120) OR
           (p_sla_filter = 'warning' AND c.pending AND c.wait_mins > 30 AND c.wait_mins <= 120) OR
           (p_sla_filter = 'ok' AND (NOT c.pending OR c.wait_mins <= 30)))
      AND (NOT p_only_pending OR c.pending)
  )
  SELECT f.conv_id::TEXT, f.conv_type::TEXT, f.m_lead_id, f.m_group_id,
    f.m_contact_phone::TEXT, f.conv_name::TEXT, f.last_msg::TEXT, f.last_msg_at,
    f.last_sender::TEXT, f.m_is_from_me, f.unread, f.m_org_id, f.org_name,
    f.final_health_status::TEXT, f.final_health_score, f.m_instance_id, f.inst_name::TEXT,
    f.photo_url::TEXT, f.products, f.pending, f.wait_mins::INTEGER, f.final_sla_status::TEXT,
    NULL::UUID, NULL::TEXT, f.m_is_handled, f.m_handled_at, f.m_handled_reason,
    f.m_pending_tasks, f.m_company_name::TEXT, f.m_job_title::TEXT
  FROM filtered f
  ORDER BY CASE WHEN p_sort_mode = 'priority' THEN
    CASE WHEN f.pending AND NOT f.m_is_handled THEN 0 ELSE 1 END ELSE 0 END,
    CASE WHEN p_sort_mode = 'priority' THEN f.wait_mins ELSE 0 END DESC,
    f.last_msg_at DESC
  LIMIT p_limit;
END;
$$;

-- Mensagens de uma conversa
CREATE OR REPLACE FUNCTION public.get_conversation_messages(
  p_lead_id uuid DEFAULT NULL, p_group_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50, p_instance_id uuid DEFAULT NULL,
  p_offset integer DEFAULT 0
) RETURNS TABLE(
  id uuid, instance_id uuid, lead_id uuid, group_id uuid, message_id text,
  remote_jid text, sender_phone text, sender_name text, content text, message_type text,
  media_url text, is_from_me boolean, status text, sent_at timestamp with time zone, metadata jsonb,
  created_at timestamp with time zone, reactions jsonb, is_edited boolean, is_deleted boolean,
  edited_at timestamp with time zone, instance_team text, instance_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM (
    SELECT m.id, m.instance_id, m.lead_id, m.group_id, m.message_id,
      m.remote_jid, m.sender_phone, m.sender_name, m.content, m.message_type,
      m.media_url, m.is_from_me, m.status, m.sent_at, m.metadata, m.created_at,
      m.reactions, m.is_edited, m.is_deleted, m.edited_at,
      COALESCE(wi.teams[1], 'comercial') AS instance_team, wi.name AS instance_name
    FROM whatsapp_messages m
    LEFT JOIN whatsapp_instances wi ON wi.id = m.instance_id
    WHERE (p_lead_id IS NULL OR m.lead_id = p_lead_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND (p_lead_id IS NOT NULL OR p_group_id IS NOT NULL)
    ORDER BY m.sent_at DESC OFFSET p_offset LIMIT p_limit
  ) recent ORDER BY recent.sent_at ASC;
$$;

-- Lead por telefone
DROP FUNCTION IF EXISTS public.get_lead_by_phone(text);
CREATE OR REPLACE FUNCTION public.get_lead_by_phone(p_phone text)
RETURNS TABLE(id uuid, name text, phone text, email text, sales_score integer, company_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT l.id, l.name, l.phone, l.email, l.sales_score, l.company_name
  FROM leads l
  WHERE l.phone = p_phone OR regexp_replace(l.phone, '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g')
  LIMIT 1;
$$;

-- Status do agente IA pra um lead (campos batem com AIAgentStatusForLead do front)
DROP FUNCTION IF EXISTS public.get_ai_agent_status_for_lead(uuid);
CREATE OR REPLACE FUNCTION public.get_ai_agent_status_for_lead(p_lead_id uuid)
RETURNS TABLE(has_agent boolean, agent_name text, conversation_status text, messages_sent integer, last_processed_at timestamp with time zone, is_paused boolean, paused_by_name text, pause_reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (c.id IS NOT NULL) AS has_agent, a.name AS agent_name, c.status AS conversation_status,
    COALESCE(c.total_messages_sent, 0) AS messages_sent, c.last_processed_at,
    (c.paused_at IS NOT NULL) AS is_paused, tm.name AS paused_by_name, c.pause_reason
  FROM ai_agent_conversations c
  LEFT JOIN ai_sales_agents a ON a.id = c.agent_id
  LEFT JOIN team_members tm ON tm.id = c.paused_by
  WHERE c.lead_id = p_lead_id ORDER BY c.updated_at DESC LIMIT 1;
$$;

-- Helpers de inbox
CREATE OR REPLACE FUNCTION public.get_unread_messages_by_leads(p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, unread_count bigint)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT wm.lead_id, COUNT(*)::bigint AS unread_count
  FROM whatsapp_messages wm
  WHERE wm.lead_id = ANY(p_lead_ids) AND NOT wm.is_from_me
  GROUP BY wm.lead_id;
$$;

CREATE OR REPLACE FUNCTION public.get_last_interaction_by_leads(p_lead_ids uuid[])
RETURNS TABLE(lead_id uuid, last_interaction timestamp with time zone, is_from_me boolean)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (wm.lead_id) wm.lead_id, wm.created_at AS last_interaction, wm.is_from_me
  FROM whatsapp_messages wm
  WHERE wm.lead_id = ANY(p_lead_ids)
  ORDER BY wm.lead_id, wm.created_at DESC;
$$;

-- Performance e atividade (dashboards)
CREATE OR REPLACE FUNCTION public.get_sales_performance(p_date_from date DEFAULT NULL, p_date_to date DEFAULT NULL)
RETURNS TABLE(team_member_id uuid, team_member_name text, deals_count bigint, total_revenue numeric, won_count bigint, lost_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT tm.id, tm.name, COUNT(d.id)::bigint,
    COALESCE(SUM(d.negotiated_price) FILTER (WHERE d.status = 'won'), 0)::numeric,
    COUNT(d.id) FILTER (WHERE d.status = 'won')::bigint,
    COUNT(d.id) FILTER (WHERE d.status = 'lost')::bigint
  FROM team_members tm
  LEFT JOIN deals d ON d.sales_rep_id = tm.id
    AND (p_date_from IS NULL OR d.created_at::date >= p_date_from)
    AND (p_date_to IS NULL OR d.created_at::date <= p_date_to)
  GROUP BY tm.id, tm.name ORDER BY 4 DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_daily_activity_summary(p_date date DEFAULT CURRENT_DATE, p_team_member_id uuid DEFAULT NULL)
RETURNS TABLE(calls_count bigint, messages_sent bigint, messages_received bigint, tasks_completed bigint, deals_created bigint, leads_created bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (SELECT COUNT(*)::bigint FROM call_history WHERE created_at::date = p_date AND (p_team_member_id IS NULL OR team_member_id = p_team_member_id)),
    (SELECT COUNT(*)::bigint FROM whatsapp_messages WHERE created_at::date = p_date AND is_from_me = true),
    (SELECT COUNT(*)::bigint FROM whatsapp_messages WHERE created_at::date = p_date AND is_from_me = false),
    (SELECT COUNT(*)::bigint FROM company_activities WHERE completed = true AND updated_at::date = p_date AND (p_team_member_id IS NULL OR responsavel_id = p_team_member_id)),
    (SELECT COUNT(*)::bigint FROM deals WHERE created_at::date = p_date AND (p_team_member_id IS NULL OR sales_rep_id = p_team_member_id)),
    (SELECT COUNT(*)::bigint FROM leads WHERE created_at::date = p_date AND (p_team_member_id IS NULL OR sales_rep_id = p_team_member_id));
$$;

-- Lock do agente (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.try_acquire_agent_lock(p_lead_id uuid, p_lock_duration interval DEFAULT '00:00:30'::interval)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_acquired BOOLEAN := false;
BEGIN
  UPDATE ai_agent_conversations SET processing_lock = now()
  WHERE lead_id = p_lead_id AND status = 'active'
    AND (processing_lock IS NULL OR processing_lock < now() - p_lock_duration)
  RETURNING true INTO v_acquired;
  RETURN COALESCE(v_acquired, false);
END $$;

CREATE OR REPLACE FUNCTION public.release_agent_lock(p_lead_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN UPDATE ai_agent_conversations SET processing_lock = NULL WHERE lead_id = p_lead_id; END $$;

-- =============================================================================
-- 3. FILA E TRIGGER DO AGENTE IA
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_queue_messages(p_batch_size integer DEFAULT 10)
RETURNS SETOF public.ai_agent_message_queue LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_agent_message_queue SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM ai_agent_message_queue
    WHERE status = 'pending' AND scheduled_for <= now() AND attempts < max_attempts
    ORDER BY scheduled_for ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED
  ) RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.claim_scheduled_followups(p_batch_size integer DEFAULT 5)
RETURNS SETOF public.ai_agent_scheduled_followups LANGUAGE plpgsql AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_agent_scheduled_followups SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM ai_agent_scheduled_followups
    WHERE status = 'pending' AND scheduled_at <= now() AND attempts < 3
    ORDER BY scheduled_at ASC LIMIT p_batch_size FOR UPDATE SKIP LOCKED
  ) RETURNING *;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_message_for_ai_agent(
  p_lead_id uuid, p_message_id uuid, p_message_content text, p_debounce_seconds integer DEFAULT 30
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_queue_id UUID; v_conversation_id UUID; v_agent_active BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM ai_sales_agents WHERE is_active = true) INTO v_agent_active;
  IF NOT v_agent_active THEN RETURN NULL; END IF;

  SELECT id INTO v_conversation_id FROM ai_agent_conversations
  WHERE lead_id = p_lead_id AND status = 'active' LIMIT 1;

  IF v_conversation_id IS NULL THEN
    INSERT INTO ai_agent_conversations (lead_id, agent_id, status)
    SELECT p_lead_id, id, 'active' FROM ai_sales_agents WHERE is_active = true LIMIT 1
    RETURNING id INTO v_conversation_id;
  END IF;

  UPDATE ai_agent_message_queue SET status = 'cancelled'
  WHERE lead_id = p_lead_id AND status = 'pending' AND message_content NOT LIKE '[INTERNAL:%';

  INSERT INTO ai_agent_message_queue (lead_id, message_id, conversation_id, message_content, scheduled_for)
  VALUES (p_lead_id, p_message_id, v_conversation_id, p_message_content,
          now() + (p_debounce_seconds || ' seconds')::interval)
  RETURNING id INTO v_queue_id;
  RETURN v_queue_id;
END $$;

CREATE OR REPLACE FUNCTION public.process_ai_agent_queue() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_url TEXT;
BEGIN
  UPDATE ai_agent_message_queue SET status = 'pending'
  WHERE status = 'processing' AND processed_at IS NULL AND created_at < now() - interval '3 minutes';

  SELECT value INTO v_url FROM config WHERE key = 'SUPABASE_PROJECT_URL';
  IF v_url IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM ai_agent_message_queue WHERE status = 'pending' AND scheduled_for <= now()) THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/ai-sales-agent',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := '{"action":"process_queue"}'::jsonb
    );
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.trigger_enqueue_for_ai_agent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_agent RECORD; v_debounce INT; v_url TEXT;
BEGIN
  IF NEW.is_from_me = true OR NEW.group_id IS NOT NULL OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_agent FROM ai_sales_agents WHERE is_active = true LIMIT 1;
  IF v_agent IS NULL THEN RETURN NEW; END IF;

  UPDATE ai_agent_cadence_enrollments SET status = 'replied', updated_at = now()
  WHERE lead_id = NEW.lead_id AND status = 'active';

  v_debounce := COALESCE((v_agent.settings->>'debounce_seconds')::INT, 10);
  PERFORM enqueue_message_for_ai_agent(NEW.lead_id, NEW.id, NEW.content, v_debounce);

  SELECT value INTO v_url FROM config WHERE key = 'SUPABASE_PROJECT_URL';
  IF v_url IS NOT NULL THEN
    PERFORM net.http_post(
      url := v_url || '/functions/v1/ai-sales-agent',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object('action','process_with_debounce','lead_id',NEW.lead_id::text,'message_id',NEW.id::text)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_enqueue_for_ai_agent ON public.whatsapp_messages;
CREATE TRIGGER trg_enqueue_for_ai_agent
  AFTER INSERT ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.trigger_enqueue_for_ai_agent();

-- =============================================================================
-- 4. TABELA AI_AGENT_CHAT_EVENTS (eventos visuais do agente na conversa)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_agent_chat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.ai_sales_agents(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES public.ai_agent_conversations(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  reason text,
  message text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_agent_chat_events_lead_id_created ON public.ai_agent_chat_events(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.log_ai_agent_event(
  p_lead_id uuid, p_event_type text, p_message text, p_reason text DEFAULT NULL,
  p_agent_id uuid DEFAULT NULL, p_conversation_id uuid DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$
  INSERT INTO public.ai_agent_chat_events (lead_id, agent_id, conversation_id, event_type, reason, message, metadata)
  VALUES (p_lead_id, p_agent_id, p_conversation_id, p_event_type, p_reason, p_message, p_metadata)
  RETURNING id;
$$;

-- =============================================================================
-- 5. STORAGE BUCKETS (mídia WhatsApp + fotos perfil)
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('whatsapp-media', 'whatsapp-media', false, 52428800)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('profile-photos', 'profile-photos', true, 5242880)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN CREATE POLICY "whatsapp_media_service_role_all" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'whatsapp-media') WITH CHECK (bucket_id = 'whatsapp-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "profile_photos_service_role_all" ON storage.objects FOR ALL TO service_role USING (bucket_id = 'profile-photos') WITH CHECK (bucket_id = 'profile-photos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "whatsapp_media_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'whatsapp-media'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "profile_photos_public_read" ON storage.objects FOR SELECT TO public USING (bucket_id = 'profile-photos'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- 6. REALTIME nas tabelas necessárias (UI atualiza sem F5)
-- =============================================================================
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_instances; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_chat_events; EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_agent_conversations; EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- =============================================================================
-- 7. CONFIG SEED — placeholder. O setup atualiza com a URL real do projeto.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.config(key, value, updated_at)
VALUES ('SUPABASE_PROJECT_URL', '__REPLACE_WITH_PROJECT_URL__', NOW())
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- FIM
-- =============================================================================
NOTIFY pgrst, 'reload schema';
