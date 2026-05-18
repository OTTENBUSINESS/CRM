-- ====================================================================
-- BASELINE SCHEMA — UFCRM (CheirinCRM)
-- Generated from: mqkmmsrmauqebllmiikl.supabase.co
-- Date: 2026-04-09
-- 
-- This is the baseline schema captured from production. All previous
-- migrations are squashed into this single file. Future changes should
-- be added as new migrations on top of this baseline.
--
-- Stats: 132 tables · 79 functions · 462 indexes · 440 policies · 52 triggers
-- ====================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.9 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- CREATE SCHEMA public; (already exists in any new database)


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: contact_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_status AS ENUM (
    'lead',
    'qualified',
    'customer',
    'churned'
);


--
-- Name: contact_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.contact_type AS ENUM (
    'person',
    'company'
);


--
-- Name: cs_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.cs_status AS ENUM (
    'active',
    'paused',
    'churned'
);


--
-- Name: health_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.health_status AS ENUM (
    'healthy',
    'alert',
    'risk'
);


--
-- Name: interaction_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.interaction_type AS ENUM (
    'call',
    'message',
    'email',
    'meeting',
    'support',
    'feedback',
    'other'
);


--
-- Name: journey_stage; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.journey_stage AS ENUM (
    'pending_onboard',
    'onboarding',
    'monitoring_7d',
    'ongoing',
    'at_risk',
    'churned'
);


--
-- Name: member_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_role AS ENUM (
    'owner',
    'admin',
    'member',
    'viewer',
    'sponsor',
    'champion',
    'executor'
);


--
-- Name: member_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.member_status AS ENUM (
    'active',
    'invited',
    'inactive',
    'removed'
);


--
-- Name: objective_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.objective_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'cancelled'
);


--
-- Name: onboarding_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.onboarding_status AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'skipped'
);


--
-- Name: organization_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_status AS ENUM (
    'active',
    'churned',
    'paused',
    'trial'
);


--
-- Name: organization_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.organization_type AS ENUM (
    'individual',
    'company',
    'agency'
);


--
-- Name: sentiment; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.sentiment AS ENUM (
    'positive',
    'neutral',
    'negative'
);


--
-- Name: touchpoint_channel; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.touchpoint_channel AS ENUM (
    'whatsapp',
    'zoom',
    'email',
    'phone',
    'in_app',
    'other'
);


--
-- Name: touchpoint_type; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.touchpoint_type AS ENUM (
    'onboarding',
    'checkin',
    'support',
    'training',
    'review',
    'renewal',
    'other'
);


--
-- Name: _audit_deal_stage_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._audit_deal_stage_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    INSERT INTO _deal_stage_audit (deal_id, old_stage_id, new_stage_id, old_stage_name, new_stage_name)
    SELECT 
      NEW.id,
      OLD.pipeline_stage_id,
      NEW.pipeline_stage_id,
      (SELECT name FROM sales_pipeline_stages WHERE id = OLD.pipeline_stage_id),
      (SELECT name FROM sales_pipeline_stages WHERE id = NEW.pipeline_stage_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: assign_conversation_agent(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_conversation_agent(p_conversation_key text, p_agent_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE cs_inbox_metrics SET
    assigned_agent_id = p_agent_id,
    assigned_at = NOW(),
    updated_at = NOW()
  WHERE conversation_key = p_conversation_key;
END;
$$;


--
-- Name: ativar_leads_no_playbook(uuid[], integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ativar_leads_no_playbook(lead_ids uuid[], max_leads integer DEFAULT 20) RETURNS TABLE(id uuid, name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());
  RETURN QUERY
  UPDATE leads l
  SET
    acao_de_hoje = 'ENVIAR_MENSAGEM',
    etapa_funil = 'novo',
    dia_do_playbook = 1,
    tentativas_de_contato = 0,
    status_de_resposta = 'NAO_RESPONDEU',
    ultima_acao = NULL
  WHERE l.id = ANY(lead_ids)
    AND l.tenant_id = v_tid
    AND l.acao_de_hoje IN ('AGUARDAR', 'ENCERRAR')
    AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.primary_contact_id = l.id AND o.tenant_id = v_tid)
    AND NOT EXISTS (SELECT 1 FROM deals d WHERE d.lead_id = l.id AND d.status = 'won' AND d.tenant_id = v_tid)
  RETURNING l.id, l.name;
END;
$$;


--
-- Name: auto_clear_handled_on_new_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_clear_handled_on_new_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_from_me = false THEN
    IF NEW.lead_id IS NOT NULL THEN
      DELETE FROM cs_conversation_handled WHERE lead_id = NEW.lead_id AND tenant_id = NEW.tenant_id;
    ELSIF NEW.group_id IS NOT NULL THEN
      DELETE FROM cs_conversation_handled WHERE group_id = NEW.group_id AND tenant_id = NEW.tenant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: auto_move_deal_to_em_contato(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auto_move_deal_to_em_contato(p_lead_id uuid, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_deal RECORD;
  v_em_contato_stage_id UUID;
  v_tid UUID;
BEGIN
  v_tid := COALESCE(p_tenant_id, (SELECT public.get_tenant_id()));

  FOR v_deal IN
    SELECT d.id as deal_id, sps.pipeline_id
    FROM deals d
    JOIN sales_pipeline_stages sps ON sps.id = d.pipeline_stage_id
    WHERE d.lead_id = p_lead_id
      AND d.tenant_id = v_tid
      AND sps.position = 1
      AND d.status NOT IN ('won', 'lost')
  LOOP
    SELECT id INTO v_em_contato_stage_id
    FROM sales_pipeline_stages
    WHERE pipeline_id = v_deal.pipeline_id
      AND tenant_id = v_tid
      AND position = 2;

    IF v_em_contato_stage_id IS NOT NULL THEN
      UPDATE deals
      SET pipeline_stage_id = v_em_contato_stage_id, updated_at = NOW()
      WHERE id = v_deal.deal_id AND tenant_id = v_tid;
    END IF;
  END LOOP;
END;
$$;


--
-- Name: bulk_transfer_deals(uuid, uuid, uuid, uuid, boolean, uuid, uuid, uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_transfer_deals(p_tenant_id uuid, p_source_pipeline_id uuid DEFAULT NULL::uuid, p_source_stage_id uuid DEFAULT NULL::uuid, p_source_sales_rep_id uuid DEFAULT NULL::uuid, p_include_no_rep boolean DEFAULT false, p_target_sales_rep_id uuid DEFAULT NULL::uuid, p_target_stage_id uuid DEFAULT NULL::uuid, p_target_pipeline_id uuid DEFAULT NULL::uuid, p_transfer_leads_too boolean DEFAULT true, p_transferred_by text DEFAULT 'Gestor'::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_deal RECORD;
  v_count INT := 0;
  v_deal_ids UUID[] := '{}';
  v_lead_ids UUID[] := '{}';
BEGIN
  FOR v_deal IN
    SELECT d.id AS deal_id, d.lead_id, d.sales_rep_id AS old_rep_id,
           l.name AS lead_name,
           tm_old.name AS old_rep_name
    FROM deals d
    LEFT JOIN leads l ON l.id = d.lead_id
    LEFT JOIN team_members tm_old ON tm_old.id = d.sales_rep_id
    WHERE d.tenant_id = p_tenant_id
      AND d.status NOT IN ('won', 'lost')
      AND (p_source_pipeline_id IS NULL OR d.pipeline_id = p_source_pipeline_id)
      AND (p_source_stage_id IS NULL OR d.pipeline_stage_id = p_source_stage_id)
      AND (
        -- No rep filter = all deals
        (p_source_sales_rep_id IS NULL AND p_include_no_rep = FALSE)
        -- Specific rep
        OR (p_source_sales_rep_id IS NOT NULL AND d.sales_rep_id = p_source_sales_rep_id)
        -- Only deals without rep
        OR (p_include_no_rep = TRUE AND d.sales_rep_id IS NULL)
      )
  LOOP
    UPDATE deals SET
      sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
      pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
      pipeline_id = COALESCE(p_target_pipeline_id, pipeline_id),
      updated_at = now()
    WHERE id = v_deal.deal_id;

    IF p_transfer_leads_too AND v_deal.lead_id IS NOT NULL THEN
      UPDATE leads SET
        sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
        pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
        updated_at = now()
      WHERE id = v_deal.lead_id;

      v_lead_ids := array_append(v_lead_ids, v_deal.lead_id);
    END IF;

    v_deal_ids := array_append(v_deal_ids, v_deal.deal_id);
    v_count := v_count + 1;
  END LOOP;

  -- Create timeline entries
  IF v_count > 0 AND array_length(v_lead_ids, 1) > 0 THEN
    INSERT INTO company_activities (
      tenant_id, lead_id, name, description, task_type, team,
      completed, completed_at, scheduled_at, metadata
    )
    SELECT
      p_tenant_id,
      unnest(v_lead_ids),
      'Transferencia em massa',
      'Lead transferido para ' || COALESCE((SELECT name FROM team_members WHERE id = p_target_sales_rep_id), 'sem responsavel') || ' por ' || p_transferred_by,
      'note',
      'sales',
      true,
      now(),
      now(),
      jsonb_build_object(
        'event_type', 'bulk_transfer',
        'transferred_by', p_transferred_by,
        'target_sales_rep_id', p_target_sales_rep_id,
        'target_stage_id', p_target_stage_id,
        'target_pipeline_id', p_target_pipeline_id,
        'total_transferred', v_count
      );
  END IF;

  RETURN jsonb_build_object(
    'transferred_count', v_count,
    'deal_ids', to_jsonb(v_deal_ids),
    'lead_ids', to_jsonb(v_lead_ids)
  );
END;
$$;


--
-- Name: bulk_transfer_deals(uuid, uuid, uuid, uuid, boolean, uuid, uuid, uuid, boolean, text, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_transfer_deals(p_tenant_id uuid, p_source_pipeline_id uuid DEFAULT NULL::uuid, p_source_stage_id uuid DEFAULT NULL::uuid, p_source_sales_rep_id uuid DEFAULT NULL::uuid, p_include_no_rep boolean DEFAULT false, p_target_sales_rep_id uuid DEFAULT NULL::uuid, p_target_stage_id uuid DEFAULT NULL::uuid, p_target_pipeline_id uuid DEFAULT NULL::uuid, p_transfer_leads_too boolean DEFAULT true, p_transferred_by text DEFAULT 'Gestor'::text, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_deal RECORD;
  v_count INT := 0;
  v_deal_ids UUID[] := '{}';
  v_lead_ids UUID[] := '{}';
BEGIN
  FOR v_deal IN
    SELECT d.id AS deal_id, d.lead_id, d.sales_rep_id AS old_rep_id
    FROM deals d
    LEFT JOIN leads l ON l.id = d.lead_id
    WHERE d.tenant_id = p_tenant_id
      AND (p_source_pipeline_id IS NULL OR d.pipeline_id = p_source_pipeline_id)
      AND (p_source_stage_id IS NULL OR d.pipeline_stage_id = p_source_stage_id)
      AND (
        (p_source_sales_rep_id IS NULL AND p_include_no_rep = FALSE)
        OR (p_source_sales_rep_id IS NOT NULL AND d.sales_rep_id = p_source_sales_rep_id)
        OR (p_include_no_rep = TRUE AND d.sales_rep_id IS NULL)
      )
      AND (p_created_after IS NULL OR d.created_at >= p_created_after)
      AND (p_created_before IS NULL OR d.created_at <= p_created_before)
  LOOP
    UPDATE deals SET
      sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
      pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
      pipeline_id = COALESCE(p_target_pipeline_id, pipeline_id),
      updated_at = now()
    WHERE id = v_deal.deal_id;

    IF p_transfer_leads_too AND v_deal.lead_id IS NOT NULL THEN
      UPDATE leads SET
        sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
        pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
        updated_at = now()
      WHERE id = v_deal.lead_id;
      v_lead_ids := array_append(v_lead_ids, v_deal.lead_id);
    END IF;

    v_deal_ids := array_append(v_deal_ids, v_deal.deal_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 AND array_length(v_lead_ids, 1) > 0 THEN
    INSERT INTO company_activities (
      tenant_id, lead_id, name, description, task_type, team,
      completed, completed_at, scheduled_at, metadata
    )
    SELECT
      p_tenant_id, unnest(v_lead_ids),
      'Transferencia em massa',
      'Lead transferido para ' || COALESCE((SELECT name FROM team_members WHERE id = p_target_sales_rep_id), 'sem responsavel') || ' por ' || p_transferred_by,
      'note', 'sales', true, now(), now(),
      jsonb_build_object('event_type','bulk_transfer','transferred_by',p_transferred_by,'target_sales_rep_id',p_target_sales_rep_id,'target_stage_id',p_target_stage_id,'target_pipeline_id',p_target_pipeline_id,'total_transferred',v_count);
  END IF;

  RETURN jsonb_build_object('transferred_count',v_count,'deal_ids',to_jsonb(v_deal_ids),'lead_ids',to_jsonb(v_lead_ids));
END;
$$;


--
-- Name: bulk_transfer_deals(uuid, uuid, uuid, uuid, boolean, uuid, uuid, uuid, boolean, text, timestamp with time zone, timestamp with time zone, uuid[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.bulk_transfer_deals(p_tenant_id uuid, p_source_pipeline_id uuid DEFAULT NULL::uuid, p_source_stage_id uuid DEFAULT NULL::uuid, p_source_sales_rep_id uuid DEFAULT NULL::uuid, p_include_no_rep boolean DEFAULT false, p_target_sales_rep_id uuid DEFAULT NULL::uuid, p_target_stage_id uuid DEFAULT NULL::uuid, p_target_pipeline_id uuid DEFAULT NULL::uuid, p_transfer_leads_too boolean DEFAULT true, p_transferred_by text DEFAULT 'Gestor'::text, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_before timestamp with time zone DEFAULT NULL::timestamp with time zone, p_specific_deal_ids uuid[] DEFAULT NULL::uuid[]) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_deal RECORD;
  v_count INT := 0;
  v_deal_ids UUID[] := '{}';
  v_lead_ids UUID[] := '{}';
  v_target_is_won BOOLEAN := FALSE;
  v_target_is_lost BOOLEAN := FALSE;
  v_new_status TEXT;
BEGIN
  -- Check if target stage is won/lost to set correct status
  IF p_target_stage_id IS NOT NULL THEN
    SELECT is_won, is_lost INTO v_target_is_won, v_target_is_lost
    FROM sales_pipeline_stages WHERE id = p_target_stage_id;
    
    IF v_target_is_won THEN
      v_new_status := 'won';
    ELSIF v_target_is_lost THEN
      v_new_status := 'lost';
    ELSE
      v_new_status := 'negotiation';
    END IF;
  END IF;

  FOR v_deal IN
    SELECT d.id AS deal_id, d.lead_id, d.status AS current_status
    FROM deals d
    WHERE d.tenant_id = p_tenant_id
      AND (
        (p_specific_deal_ids IS NOT NULL AND d.id = ANY(p_specific_deal_ids))
        OR
        (p_specific_deal_ids IS NULL
          AND (p_source_pipeline_id IS NULL OR d.pipeline_id = p_source_pipeline_id)
          AND (p_source_stage_id IS NULL OR d.pipeline_stage_id = p_source_stage_id)
          AND (
            (p_source_sales_rep_id IS NULL AND p_include_no_rep = FALSE)
            OR (p_source_sales_rep_id IS NOT NULL AND d.sales_rep_id = p_source_sales_rep_id)
            OR (p_include_no_rep = TRUE AND d.sales_rep_id IS NULL)
          )
          AND (p_created_after IS NULL OR d.created_at >= p_created_after)
          AND (p_created_before IS NULL OR d.created_at <= p_created_before)
        )
      )
  LOOP
    UPDATE deals SET
      sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
      pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
      pipeline_id = COALESCE(p_target_pipeline_id, pipeline_id),
      status = CASE 
        WHEN v_new_status IS NOT NULL THEN v_new_status
        ELSE status
      END,
      won_at = CASE 
        WHEN v_new_status = 'won' THEN COALESCE(won_at, now())
        WHEN v_new_status = 'negotiation' THEN NULL
        ELSE won_at
      END,
      lost_at = CASE 
        WHEN v_new_status = 'lost' THEN COALESCE(lost_at, now())
        WHEN v_new_status = 'negotiation' THEN NULL
        ELSE lost_at
      END,
      updated_at = now()
    WHERE id = v_deal.deal_id;

    IF p_transfer_leads_too AND v_deal.lead_id IS NOT NULL THEN
      UPDATE leads SET
        sales_rep_id = COALESCE(p_target_sales_rep_id, sales_rep_id),
        pipeline_stage_id = COALESCE(p_target_stage_id, pipeline_stage_id),
        updated_at = now()
      WHERE id = v_deal.lead_id;
      v_lead_ids := array_append(v_lead_ids, v_deal.lead_id);
    END IF;

    v_deal_ids := array_append(v_deal_ids, v_deal.deal_id);
    v_count := v_count + 1;
  END LOOP;

  IF v_count > 0 AND array_length(v_lead_ids, 1) > 0 THEN
    INSERT INTO company_activities (
      tenant_id, lead_id, name, description, task_type, team,
      completed, completed_at, scheduled_at, metadata
    )
    SELECT
      p_tenant_id, unnest(v_lead_ids),
      'Transferencia em massa',
      'Lead transferido para ' || COALESCE((SELECT name FROM team_members WHERE id = p_target_sales_rep_id), 'sem responsavel') || ' por ' || p_transferred_by,
      'note', 'sales', true, now(), now(),
      jsonb_build_object('event_type','bulk_transfer','transferred_by',p_transferred_by,'target_sales_rep_id',p_target_sales_rep_id,'target_stage_id',p_target_stage_id,'target_pipeline_id',p_target_pipeline_id,'total_transferred',v_count);
  END IF;

  RETURN jsonb_build_object('transferred_count',v_count,'deal_ids',to_jsonb(v_deal_ids),'lead_ids',to_jsonb(v_lead_ids));
END;
$$;


--
-- Name: calculate_wait_minutes(timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calculate_wait_minutes(wait_start timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql STABLE
    AS $$
BEGIN
  IF wait_start IS NULL THEN
    RETURN 0;
  END IF;
  RETURN GREATEST(0, (EXTRACT(EPOCH FROM (NOW() - wait_start)) / 60)::INTEGER);
END;
$$;


--
-- Name: cancel_orphaned_tasks_on_deal_rep_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_orphaned_tasks_on_deal_rep_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.sales_rep_id IS NOT NULL 
     AND NEW.sales_rep_id IS DISTINCT FROM OLD.sales_rep_id
     AND NEW.lead_id IS NOT NULL THEN
    
    UPDATE company_activities
    SET status = 'cancelled',
        completed = true,
        completed_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'cancelled_reason', 'deal_reassigned',
          'old_sales_rep_id', OLD.sales_rep_id::text,
          'new_sales_rep_id', NEW.sales_rep_id::text,
          'cancelled_at', NOW()::text
        )
    WHERE lead_id = NEW.lead_id
      AND responsavel_id = OLD.sales_rep_id
      AND completed = false;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: cancel_orphaned_tasks_on_rep_change(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_orphaned_tasks_on_rep_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- Only fire when sales_rep_id actually changes
  IF OLD.sales_rep_id IS NOT NULL 
     AND NEW.sales_rep_id IS DISTINCT FROM OLD.sales_rep_id THEN
    
    UPDATE company_activities
    SET status = 'cancelled',
        completed = true,
        completed_at = NOW(),
        metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
          'cancelled_reason', 'lead_reassigned',
          'old_sales_rep_id', OLD.sales_rep_id::text,
          'new_sales_rep_id', NEW.sales_rep_id::text,
          'cancelled_at', NOW()::text
        )
    WHERE lead_id = NEW.id
      AND responsavel_id = OLD.sales_rep_id
      AND completed = false;
  END IF;
  
  RETURN NEW;
END;
$$;


--
-- Name: get_tenant_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    nullif(
      (current_setting('request.jwt.claims', true)::jsonb
        -> 'app_metadata' ->> 'tenant_id'),
      ''
    )::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  )
$$;


SET default_table_access_method = heap;

--
-- Name: ai_agent_message_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_message_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    message_id uuid,
    conversation_id uuid,
    message_content text,
    message_metadata jsonb DEFAULT '{}'::jsonb,
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'pending'::text,
    result jsonb,
    error_message text,
    attempts integer DEFAULT 0,
    max_attempts integer DEFAULT 3,
    created_at timestamp with time zone DEFAULT now(),
    processed_at timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: claim_queue_messages(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_queue_messages(p_batch_size integer DEFAULT 10) RETURNS SETOF public.ai_agent_message_queue
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_agent_message_queue
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM ai_agent_message_queue
    WHERE status = 'pending'
      AND scheduled_for <= now()
      AND attempts < max_attempts
    ORDER BY scheduled_for ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;


--
-- Name: ai_agent_scheduled_followups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_scheduled_followups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    conversation_id uuid,
    agent_id uuid,
    scheduled_at timestamp with time zone NOT NULL,
    context_note text,
    status text DEFAULT 'pending'::text NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT (current_setting('app.settings.tenant_id'::text, true))::uuid NOT NULL
);


--
-- Name: claim_scheduled_followups(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.claim_scheduled_followups(p_batch_size integer DEFAULT 5) RETURNS SETOF public.ai_agent_scheduled_followups
    LANGUAGE plpgsql
    AS $$
BEGIN
  RETURN QUERY
  UPDATE ai_agent_scheduled_followups
  SET status = 'processing', attempts = attempts + 1
  WHERE id IN (
    SELECT id FROM ai_agent_scheduled_followups
    WHERE status = 'pending'
      AND scheduled_at <= now()
      AND attempts < 3
    ORDER BY scheduled_at ASC
    LIMIT p_batch_size
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;


--
-- Name: clear_tenant_from_jwt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.clear_tenant_from_jwt() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data - 'tenant_id'
  WHERE id = auth.uid();
END;
$$;


--
-- Name: count_deals_for_transfer(uuid, uuid, uuid, uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_deals_for_transfer(p_tenant_id uuid, p_source_pipeline_id uuid DEFAULT NULL::uuid, p_source_stage_id uuid DEFAULT NULL::uuid, p_source_sales_rep_id uuid DEFAULT NULL::uuid, p_include_no_rep boolean DEFAULT false) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM deals d
  WHERE d.tenant_id = p_tenant_id
    AND d.status NOT IN ('won', 'lost')
    AND (p_source_pipeline_id IS NULL OR d.pipeline_id = p_source_pipeline_id)
    AND (p_source_stage_id IS NULL OR d.pipeline_stage_id = p_source_stage_id)
    AND (
      (p_source_sales_rep_id IS NULL AND p_include_no_rep = FALSE)
      OR (p_source_sales_rep_id IS NOT NULL AND d.sales_rep_id = p_source_sales_rep_id)
      OR (p_include_no_rep = TRUE AND d.sales_rep_id IS NULL)
    );

  RETURN v_count;
END;
$$;


--
-- Name: count_deals_for_transfer(uuid, uuid, uuid, uuid, boolean, timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_deals_for_transfer(p_tenant_id uuid, p_source_pipeline_id uuid DEFAULT NULL::uuid, p_source_stage_id uuid DEFAULT NULL::uuid, p_source_sales_rep_id uuid DEFAULT NULL::uuid, p_include_no_rep boolean DEFAULT false, p_created_after timestamp with time zone DEFAULT NULL::timestamp with time zone, p_created_before timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM deals d
  WHERE d.tenant_id = p_tenant_id
    AND (p_source_pipeline_id IS NULL OR d.pipeline_id = p_source_pipeline_id)
    AND (p_source_stage_id IS NULL OR d.pipeline_stage_id = p_source_stage_id)
    AND (
      (p_source_sales_rep_id IS NULL AND p_include_no_rep = FALSE)
      OR (p_source_sales_rep_id IS NOT NULL AND d.sales_rep_id = p_source_sales_rep_id)
      OR (p_include_no_rep = TRUE AND d.sales_rep_id IS NULL)
    )
    AND (p_created_after IS NULL OR d.created_at >= p_created_after)
    AND (p_created_before IS NULL OR d.created_at <= p_created_before);
  RETURN v_count;
END;
$$;


--
-- Name: create_impersonation_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_impersonation_token(target_member_id uuid) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_admin_id UUID;
  v_admin_role TEXT;
  v_target_auth_id UUID;
  v_tenant_id UUID;
  v_token TEXT;
BEGIN
  -- Get caller's team member
  SELECT tm.id, tm.role, tm.tenant_id INTO v_admin_id, v_admin_role, v_tenant_id
  FROM team_members tm
  WHERE tm.auth_user_id = auth.uid()
    AND tm.is_active = true
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Team member not found';
  END IF;

  IF v_admin_role != 'admin' THEN
    RAISE EXCEPTION 'Only admins can impersonate';
  END IF;

  -- Verify target exists and has auth
  SELECT auth_user_id INTO v_target_auth_id
  FROM team_members
  WHERE id = target_member_id AND is_active = true AND tenant_id = v_tenant_id;

  IF v_target_auth_id IS NULL THEN
    RAISE EXCEPTION 'Target member not found or has no auth account';
  END IF;

  -- Create token (5 min expiry, single use)
  INSERT INTO admin_impersonation_tokens (admin_member_id, target_member_id, tenant_id)
  VALUES (v_admin_id, target_member_id, v_tenant_id)
  RETURNING token INTO v_token;

  RETURN v_token;
END;
$$;


--
-- Name: create_lead_and_deal_from_pain_registration(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_lead_and_deal_from_pain_registration() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_lead_id UUID;
  v_is_internal BOOLEAN := false;
  v_deal_id UUID;
  v_pipeline_id UUID;
  v_pipeline_stage_id UUID;
  v_default_sales_rep_id UUID;
  v_product_id TEXT := 'pain';
  v_product_price NUMERIC := 25000;
  v_tid UUID;
BEGIN
  v_tid := NEW.tenant_id;

  SELECT id, COALESCE(is_internal_contact, false) INTO v_lead_id, v_is_internal
  FROM leads
  WHERE tenant_id = v_tid
    AND (LOWER(email) = LOWER(NEW.email)
      OR (NEW.phone IS NOT NULL AND phone LIKE '%' || REGEXP_REPLACE(NEW.phone, '[^0-9]', '', 'g') || '%'))
  LIMIT 1;

  IF v_lead_id IS NULL THEN
    INSERT INTO leads (
      name, email, phone, company_name, sales_stage,
      utm_source, utm_medium, utm_campaign, utm_term, utm_content, created_at, tenant_id
    ) VALUES (
      UPPER(SPLIT_PART(NEW.name, ' ', 1)),
      NEW.email,
      REGEXP_REPLACE(NEW.phone, '[^0-9]', '', 'g'),
      NEW.company_name, 'new',
      NEW.utm_source, NEW.utm_medium, NEW.utm_campaign, NEW.utm_term, NEW.utm_content,
      NOW(), v_tid
    )
    RETURNING id INTO v_lead_id;
  ELSE
    IF NEW.company_name IS NOT NULL AND NEW.company_name != '' THEN
      UPDATE leads SET company_name = NEW.company_name, updated_at = NOW()
      WHERE id = v_lead_id AND tenant_id = v_tid AND (company_name IS NULL OR company_name = '');
    END IF;
  END IF;

  NEW.lead_id := v_lead_id;

  IF v_is_internal THEN RETURN NEW; END IF;

  SELECT id, default_sales_rep_id INTO v_pipeline_id, v_default_sales_rep_id
  FROM sales_pipelines
  WHERE tenant_id = v_tid AND is_default = true AND is_active = true
  LIMIT 1;

  SELECT id INTO v_pipeline_stage_id
  FROM sales_pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND tenant_id = v_tid
    AND is_won = false AND is_lost = false
  ORDER BY position LIMIT 1;

  IF NOT EXISTS (SELECT 1 FROM deals WHERE lead_id = v_lead_id AND pipeline_id = v_pipeline_id AND tenant_id = v_tid) THEN
    INSERT INTO deals (
      lead_id, product_id, pipeline_id, pipeline_stage_id, sales_rep_id,
      original_price, negotiated_price, status, notes, created_at, tenant_id
    ) VALUES (
      v_lead_id, v_product_id, v_pipeline_id, v_pipeline_stage_id, v_default_sales_rep_id,
      v_product_price, v_product_price, 'open',
      'Criado automaticamente via Pain Registration. Opcao de pagamento: ' || COALESCE(NEW.payment_option, 'nao informado'),
      NOW(), v_tid
    )
    RETURNING id INTO v_deal_id;

    IF v_default_sales_rep_id IS NOT NULL THEN
      UPDATE leads SET sales_rep_id = v_default_sales_rep_id, updated_at = NOW()
      WHERE id = v_lead_id AND tenant_id = v_tid AND sales_rep_id IS NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: dispatch_meta_ads_sync(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dispatch_meta_ads_sync() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  rec RECORD;
  base_url TEXT;
BEGIN
  base_url := 'https://mqkmmsrmauqebllmiikl.supabase.co/functions/v1/sync-meta-account';
  FOR rec IN
    SELECT account_id, organization_id, tenant_id
    FROM meta_ads_accounts
    WHERE is_active = true
  LOOP
    PERFORM net.http_post(
      url := base_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'account_id', rec.account_id,
        'organization_id', rec.organization_id,
        'tenant_id', rec.tenant_id
      )
    );
  END LOOP;
END;
$$;


--
-- Name: enqueue_message_for_ai_agent(uuid, uuid, text, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enqueue_message_for_ai_agent(p_lead_id uuid, p_message_id uuid, p_message_content text, p_debounce_seconds integer DEFAULT 30) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_queue_id UUID;
  v_conversation_id UUID;
  v_agent_active BOOLEAN;
BEGIN
  SELECT EXISTS(SELECT 1 FROM ai_sales_agents WHERE is_active = true) INTO v_agent_active;
  IF NOT v_agent_active THEN RETURN NULL; END IF;

  SELECT id INTO v_conversation_id
  FROM ai_agent_conversations
  WHERE lead_id = p_lead_id AND status = 'active'
  LIMIT 1;

  IF v_conversation_id IS NULL THEN RETURN NULL; END IF;

  -- Cancelar items pendentes EXCETO follow-ups agendados (mensagens [INTERNAL:])
  UPDATE ai_agent_message_queue
  SET status = 'cancelled'
  WHERE lead_id = p_lead_id AND status = 'pending'
    AND message_content NOT LIKE '[INTERNAL:%';

  INSERT INTO ai_agent_message_queue (lead_id, message_id, conversation_id, message_content, scheduled_for, tenant_id)
  VALUES (p_lead_id, p_message_id, v_conversation_id, p_message_content, now() + (p_debounce_seconds || ' seconds')::interval,
    (SELECT tenant_id FROM ai_agent_conversations WHERE id = v_conversation_id))
  RETURNING id INTO v_queue_id;

  RETURN v_queue_id;
END;
$$;


--
-- Name: enroll_lead_in_cadence(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enroll_lead_in_cadence() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_agent RECORD;
  v_stage_name TEXT;
  v_steps JSONB;
  v_has_meeting BOOLEAN;
BEGIN
  IF OLD.pipeline_stage_id IS NOT DISTINCT FROM NEW.pipeline_stage_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_agent FROM ai_sales_agents WHERE is_active = true LIMIT 1;
  IF v_agent IS NULL THEN RETURN NEW; END IF;

  SELECT name INTO v_stage_name FROM sales_pipeline_stages WHERE id = NEW.pipeline_stage_id;

  v_steps := v_agent.cadence_steps->v_stage_name;
  IF v_steps IS NULL OR jsonb_array_length(v_steps) = 0 THEN RETURN NEW; END IF;

  SELECT EXISTS(
    SELECT 1 FROM company_activities
    WHERE lead_id = NEW.id
      AND task_type IN ('call', 'meeting')
      AND status IN ('pending', 'confirmed')
      AND scheduled_at > now()
  ) INTO v_has_meeting;
  IF v_has_meeting THEN RETURN NEW; END IF;

  UPDATE ai_agent_cadence_enrollments
  SET status = 'cancelled', updated_at = now()
  WHERE lead_id = NEW.id AND status = 'active';

  INSERT INTO ai_agent_cadence_enrollments (lead_id, agent_id, stage, current_step, next_action_at, tenant_id)
  VALUES (
    NEW.id,
    v_agent.id,
    v_stage_name,
    0,
    now() + ((v_steps->0->>'delay_minutes')::INT || ' minutes')::interval,
    NEW.tenant_id
  )
  ON CONFLICT (lead_id, agent_id, stage) DO UPDATE SET
    status = 'active',
    current_step = 0,
    next_action_at = now() + ((v_steps->0->>'delay_minutes')::INT || ' minutes')::interval,
    completed_at = NULL,
    updated_at = now();

  RETURN NEW;
END;
$$;


--
-- Name: find_lead_by_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_lead_by_phone(p_phone text) RETURNS uuid
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_lead_id UUID;
  v_clean_phone TEXT;
BEGIN
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  SELECT id INTO v_lead_id
  FROM leads
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') = v_clean_phone
     OR regexp_replace(phone, '[^0-9]', '', 'g') = '55' || v_clean_phone
     OR '55' || regexp_replace(phone, '[^0-9]', '', 'g') = v_clean_phone
  LIMIT 1;
  RETURN v_lead_id;
END;
$$;


--
-- Name: find_lead_by_phone_suffix(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_lead_by_phone_suffix(p_suffix text) RETURNS TABLE(id uuid, name text, phone text, email text, sales_rep_id uuid, source text, utm_source text, utm_medium text, utm_campaign text, utm_content text, original_source text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT l.id, l.name, l.phone, l.email, l.sales_rep_id, l.source,
         l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.original_source
  FROM leads l
  WHERE RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 8) = p_suffix
  LIMIT 1;
$$;


--
-- Name: find_lead_by_phone_suffix(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.find_lead_by_phone_suffix(p_suffix text, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, phone text, email text, sales_rep_id uuid, source text, utm_source text, utm_medium text, utm_campaign text, utm_content text, original_source text)
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT l.id, l.name, l.phone, l.email, l.sales_rep_id, l.source,
         l.utm_source, l.utm_medium, l.utm_campaign, l.utm_content, l.original_source
  FROM leads l
  WHERE RIGHT(REGEXP_REPLACE(l.phone, '[^0-9]', '', 'g'), 8) = p_suffix
  AND (p_tenant_id IS NULL OR l.tenant_id = p_tenant_id)
  LIMIT 1;
$$;


--
-- Name: fn_config_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fn_config_audit() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_user_id UUID;
  v_user_name TEXT;
  v_old JSONB;
  v_new JSONB;
  v_changed TEXT[];
  v_tenant UUID;
  v_record_id TEXT;
  k TEXT;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT name INTO v_user_name FROM team_members WHERE auth_user_id = v_user_id LIMIT 1;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id::text;
    v_tenant := OLD.tenant_id;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id::text;
    v_tenant := NEW.tenant_id;
    
    v_changed := '{}';
    FOR k IN SELECT jsonb_object_keys(v_new)
    LOOP
      -- Ignorar campos de update automático E current_activity (presença)
      IF k NOT IN ('updated_at', 'created_at', 'current_activity', 'current_activity_at', 'current_activity_meta') 
         AND (v_old->k IS DISTINCT FROM v_new->k) THEN
        v_changed := array_append(v_changed, k);
      END IF;
    END LOOP;
    
    IF array_length(v_changed, 1) IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  INSERT INTO config_audit_log (table_name, record_id, action, changed_by_user_id, changed_by_name, old_data, new_data, changed_fields, tenant_id)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_user_name, v_old, v_new, v_changed, v_tenant);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_ai_agent_status_for_lead(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_ai_agent_status_for_lead(p_lead_id uuid) RETURNS TABLE(has_agent boolean, agent_name text, conversation_status text, messages_sent integer, last_processed_at timestamp with time zone, is_paused boolean, paused_by_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id IS NOT NULL AS has_agent,
    a.name AS agent_name,
    c.status AS conversation_status,
    c.total_messages_sent AS messages_sent,
    c.last_processed_at,
    c.status IN ('paused_by_human', 'paused_by_schedule') AS is_paused,
    COALESCE(
      (SELECT tm.name FROM team_members tm WHERE tm.id::TEXT = c.paused_by::TEXT AND tm.tenant_id = (SELECT public.get_tenant_id()) LIMIT 1),
      'Sistema'
    ) AS paused_by_name
  FROM ai_agent_conversations c
  JOIN ai_sales_agents a ON a.id = c.agent_id
  WHERE c.lead_id = p_lead_id
    AND c.tenant_id = (SELECT public.get_tenant_id())
  ORDER BY c.created_at DESC
  LIMIT 1;
END;
$$;


--
-- Name: get_avg_first_response_time(timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_avg_first_response_time(p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS TABLE(avg_hours double precision, sample_size bigint)
    LANGUAGE sql STABLE
    AS $$
  WITH 
  -- Effective window (defaults to last 30 days)
  win AS (
    SELECT 
      COALESCE(p_start, now() - interval '30 days') AS w_start,
      COALESCE(p_end, now()) AS w_end,
      get_tenant_id() AS tid
  ),
  -- Only fetch deals within the window for this tenant
  target_deals AS (
    SELECT d.id, d.lead_id, d.created_at
    FROM deals d, win
    WHERE d.tenant_id = win.tid
      AND d.lead_id IS NOT NULL
      AND d.created_at >= win.w_start
      AND d.created_at <= win.w_end
      AND d.metadata @> '{"source": "receive-lead"}'
  ),
  -- First call AFTER deal creation, scoped to lead_ids in window
  first_call AS (
    SELECT ch.lead_id, MIN(ch.started_at) AS first_at
    FROM call_history ch, win
    WHERE ch.lead_id IN (SELECT lead_id FROM target_deals)
      AND LOWER(ch.direction) IN ('outbound', 'outgoing')
      AND ch.started_at >= win.w_start
      AND ch.started_at <= win.w_end + interval '7 days'
    GROUP BY ch.lead_id
  ),
  -- First whatsapp message AFTER deal creation, scoped + tenant filter
  first_msg AS (
    SELECT wm.lead_id, MIN(wm.created_at) AS first_at
    FROM whatsapp_messages wm, win
    WHERE wm.tenant_id = win.tid
      AND wm.lead_id IN (SELECT lead_id FROM target_deals)
      AND wm.is_from_me = true
      AND wm.created_at >= win.w_start
      AND wm.created_at <= win.w_end + interval '7 days'
    GROUP BY wm.lead_id
  ),
  response_times AS (
    SELECT td.id,
      EXTRACT(EPOCH FROM (LEAST(fc.first_at, fm.first_at) - td.created_at)) / 3600.0 AS hours
    FROM target_deals td
    LEFT JOIN first_call fc ON fc.lead_id = td.lead_id
    LEFT JOIN first_msg fm ON fm.lead_id = td.lead_id
    WHERE LEAST(fc.first_at, fm.first_at) IS NOT NULL
      AND EXTRACT(EPOCH FROM (LEAST(fc.first_at, fm.first_at) - td.created_at)) > 0
  )
  SELECT
    AVG(hours) AS avg_hours,
    COUNT(*) AS sample_size
  FROM response_times;
$$;


--
-- Name: get_campaign_audience_count(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_campaign_audience_count(p_tenant_id uuid, p_filters jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_count INTEGER;
  v_query TEXT;
BEGIN
  v_query := 'SELECT COUNT(*)::INTEGER FROM leads WHERE tenant_id = $1';

  -- Pipeline stage filter
  IF p_filters ? 'pipeline_stage_ids' AND jsonb_array_length(p_filters->'pipeline_stage_ids') > 0 THEN
    v_query := v_query || ' AND pipeline_stage_id IN (SELECT jsonb_array_elements_text($2->''pipeline_stage_ids'')::UUID)';
  END IF;

  -- Sales stage filter
  IF p_filters ? 'sales_stages' AND jsonb_array_length(p_filters->'sales_stages') > 0 THEN
    v_query := v_query || ' AND sales_stage IN (SELECT jsonb_array_elements_text($2->''sales_stages''))';
  END IF;

  -- Date range: created_at
  IF p_filters ? 'created_after' THEN
    v_query := v_query || ' AND created_at >= ($2->>''created_after'')::TIMESTAMPTZ';
  END IF;
  IF p_filters ? 'created_before' THEN
    v_query := v_query || ' AND created_at <= ($2->>''created_before'')::TIMESTAMPTZ';
  END IF;

  -- Date range: last_interaction_at
  IF p_filters ? 'last_interaction_after' THEN
    v_query := v_query || ' AND last_interaction_at >= ($2->>''last_interaction_after'')::TIMESTAMPTZ';
  END IF;
  IF p_filters ? 'last_interaction_before' THEN
    v_query := v_query || ' AND last_interaction_at <= ($2->>''last_interaction_before'')::TIMESTAMPTZ';
  END IF;

  -- Capital range
  IF p_filters ? 'capital_min' THEN
    v_query := v_query || ' AND (metadata->>''capital_disponivel'')::NUMERIC >= ($2->>''capital_min'')::NUMERIC';
  END IF;
  IF p_filters ? 'capital_max' THEN
    v_query := v_query || ' AND (metadata->>''capital_disponivel'')::NUMERIC <= ($2->>''capital_max'')::NUMERIC';
  END IF;

  -- City filter
  IF p_filters ? 'cities' AND jsonb_array_length(p_filters->'cities') > 0 THEN
    v_query := v_query || ' AND city_name IN (SELECT jsonb_array_elements_text($2->''cities''))';
  END IF;

  -- State filter
  IF p_filters ? 'states' AND jsonb_array_length(p_filters->'states') > 0 THEN
    v_query := v_query || ' AND state IN (SELECT jsonb_array_elements_text($2->''states''))';
  END IF;

  -- UTM source
  IF p_filters ? 'utm_sources' AND jsonb_array_length(p_filters->'utm_sources') > 0 THEN
    v_query := v_query || ' AND utm_source IN (SELECT jsonb_array_elements_text($2->''utm_sources''))';
  END IF;

  -- UTM campaign
  IF p_filters ? 'utm_campaigns' AND jsonb_array_length(p_filters->'utm_campaigns') > 0 THEN
    v_query := v_query || ' AND utm_campaign IN (SELECT jsonb_array_elements_text($2->''utm_campaigns''))';
  END IF;

  -- Score range
  IF p_filters ? 'score_min' THEN
    v_query := v_query || ' AND sales_score >= ($2->>''score_min'')::NUMERIC';
  END IF;
  IF p_filters ? 'score_max' THEN
    v_query := v_query || ' AND sales_score <= ($2->>''score_max'')::NUMERIC';
  END IF;

  -- Sales rep filter
  IF p_filters ? 'sales_rep_ids' AND jsonb_array_length(p_filters->'sales_rep_ids') > 0 THEN
    v_query := v_query || ' AND sales_rep_id IN (SELECT jsonb_array_elements_text($2->''sales_rep_ids'')::UUID)';
  END IF;

  -- No sales rep (unassigned)
  IF p_filters ? 'no_sales_rep' AND (p_filters->>'no_sales_rep')::BOOLEAN THEN
    v_query := v_query || ' AND sales_rep_id IS NULL';
  END IF;

  -- BANT filters
  IF p_filters ? 'bant_budget' AND (p_filters->>'bant_budget')::BOOLEAN THEN
    v_query := v_query || ' AND bant_budget = true';
  END IF;
  IF p_filters ? 'bant_authority' AND (p_filters->>'bant_authority')::BOOLEAN THEN
    v_query := v_query || ' AND bant_authority = true';
  END IF;
  IF p_filters ? 'bant_need' AND (p_filters->>'bant_need')::BOOLEAN THEN
    v_query := v_query || ' AND bant_need = true';
  END IF;
  IF p_filters ? 'bant_timeline' AND (p_filters->>'bant_timeline')::BOOLEAN THEN
    v_query := v_query || ' AND bant_timeline = true';
  END IF;

  -- Must have phone
  v_query := v_query || ' AND phone IS NOT NULL AND phone != ''''';

  -- Exclude leads who received a campaign recently
  IF p_filters ? 'exclude_campaign_days' THEN
    v_query := v_query || ' AND id NOT IN (
      SELECT cl.lead_id FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.status NOT IN (''skipped'',''failed'')
      AND cl.created_at >= now() - (($2->>''exclude_campaign_days'')::INTEGER || '' days'')::INTERVAL
    )';
  END IF;

  EXECUTE v_query INTO v_count USING p_tenant_id, p_filters;
  RETURN COALESCE(v_count, 0);
END;
$_$;


--
-- Name: get_conversation_messages(uuid, uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_messages(p_lead_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_instance_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, instance_id uuid, lead_id uuid, group_id uuid, message_id text, remote_jid text, sender_phone text, sender_name text, content text, message_type text, media_url text, is_from_me boolean, status text, sent_at timestamp with time zone, metadata jsonb, created_at timestamp with time zone, reactions jsonb, is_edited boolean, is_deleted boolean, edited_at timestamp with time zone, instance_team text, instance_name text)
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  -- Subquery pega as N mais recentes (DESC), depois ordena ASC para exibir cronologicamente
  SELECT * FROM (
    SELECT
      m.id, m.instance_id, m.lead_id, m.group_id, m.message_id,
      m.remote_jid, m.sender_phone, m.sender_name, m.content, m.message_type,
      m.media_url, m.is_from_me, m.status, m.sent_at, m.metadata, m.created_at,
      m.reactions, m.is_edited, m.is_deleted, m.edited_at,
      COALESCE(wi.teams[1], 'comercial') AS instance_team,
      wi.name AS instance_name
    FROM whatsapp_messages m
    LEFT JOIN whatsapp_instances wi ON wi.id = m.instance_id
    WHERE m.tenant_id = (SELECT public.get_tenant_id())
      AND (p_lead_id IS NULL OR m.lead_id = p_lead_id)
      AND (p_group_id IS NULL OR m.group_id = p_group_id)
      AND (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND (p_lead_id IS NOT NULL OR p_group_id IS NOT NULL)
    ORDER BY m.sent_at DESC
    LIMIT p_limit
  ) recent
  ORDER BY recent.sent_at ASC;
$$;


--
-- Name: get_conversation_notes(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_conversation_notes(p_lead_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, content text, note_type text, is_pinned boolean, created_by uuid, created_by_name text, created_at timestamp with time zone)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT n.id, n.content, n.note_type::TEXT, n.is_pinned, n.created_by,
    pr.name AS created_by_name, n.created_at
  FROM cs_conversation_notes n
  LEFT JOIN profiles pr ON n.created_by = pr.id
  WHERE n.tenant_id = (SELECT public.get_tenant_id())
    AND ((p_lead_id IS NOT NULL AND n.lead_id = p_lead_id)
      OR (p_group_id IS NOT NULL AND n.group_id = p_group_id))
  ORDER BY n.is_pinned DESC, n.created_at DESC;
END;
$$;


--
-- Name: get_cs_inbox_with_metrics(uuid, integer, text, text, text, boolean, text, text, boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_cs_inbox_with_metrics(p_instance_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50, p_product_filter text DEFAULT NULL::text, p_health_filter text DEFAULT NULL::text, p_sla_filter text DEFAULT NULL::text, p_only_pending boolean DEFAULT false, p_search text DEFAULT NULL::text, p_sort_mode text DEFAULT 'recent'::text, p_hide_handled boolean DEFAULT false, p_only_with_tasks boolean DEFAULT false) RETURNS TABLE(conversation_id text, conversation_type text, lead_id uuid, group_id uuid, contact_phone text, conversation_name text, last_message text, last_message_at timestamp with time zone, last_sender_name text, is_from_me boolean, unread_count bigint, organization_id uuid, organization_name text, health_status text, health_score integer, instance_id uuid, instance_name text, lead_photo_url text, lead_products text[], pending_reply boolean, wait_minutes integer, sla_status text, assigned_agent_id uuid, assigned_agent_name text, is_handled boolean, handled_at timestamp with time zone, handled_reason text, pending_tasks_count integer, lead_company_name text, lead_job_title text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_matching_lead_ids UUID[];
  v_matching_group_ids UUID[];
  v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());

  IF p_search IS NOT NULL AND LENGTH(p_search) >= 3 THEN
    SELECT ARRAY_AGG(DISTINCT m.lead_id) INTO v_matching_lead_ids
    FROM whatsapp_messages m
    WHERE m.tenant_id = v_tid AND m.lead_id IS NOT NULL
      AND (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND m.content ILIKE '%' || p_search || '%';

    SELECT ARRAY_AGG(DISTINCT m.group_id) INTO v_matching_group_ids
    FROM whatsapp_messages m
    WHERE m.tenant_id = v_tid AND m.group_id IS NOT NULL
      AND (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND m.content ILIKE '%' || p_search || '%';
  END IF;

  RETURN QUERY
  WITH latest_health AS (
    SELECT DISTINCT ON (ch.organization_id)
      ch.organization_id AS org_id, ch.health_status::TEXT AS health_stat, ch.overall_score AS health_sc
    FROM cs_health_current ch
    WHERE ch.tenant_id = v_tid
    ORDER BY ch.organization_id, ch.updated_at DESC
  ),
  lead_tasks AS (
    SELECT ca.lead_id, COUNT(*)::INTEGER AS tasks_count
    FROM company_activities ca
    WHERE ca.tenant_id = v_tid AND ca.lead_id IS NOT NULL AND ca.completed = false
    GROUP BY ca.lead_id
  ),
  conversations AS (
    SELECT DISTINCT ON (
      CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END
    )
      CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END AS conv_id,
      CASE WHEN m.group_id IS NOT NULL THEN 'grupo' ELSE 'individual' END AS conv_type,
      CASE WHEN m.group_id IS NULL THEN m.lead_id ELSE NULL END AS m_lead_id,
      m.group_id AS m_group_id,
      CASE WHEN m.group_id IS NOT NULL THEN m.sender_phone ELSE COALESCE(l.phone, m.sender_phone) END AS m_contact_phone,
      COALESCE(g.name, l.name, m.sender_name) AS conv_name,
      m.content AS last_msg, m.created_at AS last_msg_at,
      m.sender_name AS last_sender, m.is_from_me AS m_is_from_me,
      0::BIGINT AS unread,
      org.id AS m_org_id, org.name AS org_name,
      m.instance_id AS m_instance_id, wi.name AS inst_name,
      l.photo_url AS photo_url, ARRAY[]::TEXT[] AS products,
      (NOT m.is_from_me) AS pending,
      GREATEST(0, EXTRACT(EPOCH FROM (NOW() - m.created_at))::INTEGER / 60) AS wait_mins,
      CASE WHEN ch.id IS NOT NULL THEN true ELSE false END AS m_is_handled,
      ch.handled_at AS m_handled_at, ch.reason AS m_handled_reason,
      COALESCE(lt.tasks_count, 0) AS m_pending_tasks,
      l.company_name AS m_company_name, l.job_title AS m_job_title
    FROM whatsapp_messages m
    LEFT JOIN leads l ON m.lead_id = l.id
    LEFT JOIN whatsapp_groups g ON m.group_id = g.id
    LEFT JOIN organizations org ON org.primary_contact_id = l.id
    LEFT JOIN whatsapp_instances wi ON m.instance_id = wi.id
    LEFT JOIN cs_conversation_handled ch ON
      (ch.lead_id = m.lead_id AND m.lead_id IS NOT NULL) OR
      (ch.group_id = m.group_id AND m.group_id IS NOT NULL)
    LEFT JOIN lead_tasks lt ON lt.lead_id = m.lead_id
    WHERE m.tenant_id = v_tid
      AND (p_instance_id IS NULL OR m.instance_id = p_instance_id)
      AND (
        p_search IS NULL OR LENGTH(p_search) < 3
        OR COALESCE(g.name, l.name, m.sender_name) ILIKE '%' || p_search || '%'
        OR m.sender_phone ILIKE '%' || p_search || '%'
        OR l.phone ILIKE '%' || p_search || '%'
        OR l.company_name ILIKE '%' || p_search || '%'
        OR (m.lead_id IS NOT NULL AND m.lead_id = ANY(v_matching_lead_ids))
        OR (m.group_id IS NOT NULL AND m.group_id = ANY(v_matching_group_ids))
      )
    ORDER BY
      CASE WHEN m.group_id IS NOT NULL THEN m.group_id::TEXT ELSE m.lead_id::TEXT END,
      m.created_at DESC
  ),
  filtered AS (
    SELECT c.*,
      COALESCE(lh.health_stat, 'unknown') AS final_health_status,
      lh.health_sc AS final_health_score,
      CASE
        WHEN c.pending AND c.wait_mins > 120 THEN 'critical'
        WHEN c.pending AND c.wait_mins > 30 THEN 'warning'
        ELSE 'ok'
      END AS final_sla_status
    FROM conversations c
    LEFT JOIN latest_health lh ON c.m_org_id = lh.org_id
    WHERE (p_product_filter IS NULL OR p_product_filter = ANY(c.products))
      AND (p_health_filter IS NULL OR COALESCE(lh.health_stat, 'unknown') = p_health_filter)
      AND (p_sla_filter IS NULL OR
           (p_sla_filter = 'critical' AND c.pending AND c.wait_mins > 120) OR
           (p_sla_filter = 'warning' AND c.pending AND c.wait_mins > 30 AND c.wait_mins <= 120) OR
           (p_sla_filter = 'ok' AND (NOT c.pending OR c.wait_mins <= 30)))
      AND (NOT p_only_pending OR c.pending)
      AND (NOT p_hide_handled OR c.m_is_handled = false)
      AND (NOT p_only_with_tasks OR c.m_pending_tasks > 0)
  )
  SELECT
    f.conv_id::TEXT, f.conv_type::TEXT, f.m_lead_id, f.m_group_id,
    f.m_contact_phone::TEXT, f.conv_name::TEXT, f.last_msg::TEXT, f.last_msg_at,
    f.last_sender::TEXT, f.m_is_from_me, f.unread, f.m_org_id, f.org_name::TEXT,
    f.final_health_status::TEXT, f.final_health_score::INTEGER,
    f.m_instance_id, f.inst_name::TEXT, f.photo_url::TEXT, f.products,
    f.pending, f.wait_mins::INTEGER, f.final_sla_status::TEXT,
    NULL::UUID, NULL::TEXT,
    f.m_is_handled, f.m_handled_at, f.m_handled_reason::TEXT,
    f.m_pending_tasks, f.m_company_name::TEXT, f.m_job_title::TEXT
  FROM filtered f
  ORDER BY
    CASE WHEN p_sort_mode = 'priority' THEN
      CASE WHEN f.pending AND NOT f.m_is_handled THEN 0 ELSE 1 END
    ELSE 0 END,
    CASE WHEN p_sort_mode = 'priority' THEN f.wait_mins ELSE 0 END DESC,
    f.last_msg_at DESC
  LIMIT p_limit;
END;
$$;


--
-- Name: get_email_audience_count(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_email_audience_count(p_tenant_id uuid, p_filters jsonb DEFAULT '{}'::jsonb) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
BEGIN
  SELECT count(*) INTO v_count
  FROM leads l
  WHERE l.tenant_id = p_tenant_id
    AND l.email IS NOT NULL
    AND l.email != ''
    AND (l.email_opted_out IS NULL OR l.email_opted_out = false)
    AND NOT EXISTS (
      SELECT 1 FROM email_unsubscribes u
      WHERE u.tenant_id = p_tenant_id AND u.email = l.email
    )
    AND (
      p_filters->'pipeline_stage_ids' IS NULL
      OR jsonb_array_length(p_filters->'pipeline_stage_ids') = 0
      OR l.pipeline_stage_id::text IN (SELECT jsonb_array_elements_text(p_filters->'pipeline_stage_ids'))
    )
    AND (
      p_filters->'states' IS NULL
      OR jsonb_array_length(p_filters->'states') = 0
      OR l.state IN (SELECT jsonb_array_elements_text(p_filters->'states'))
    )
    AND (
      p_filters->'cities' IS NULL
      OR jsonb_array_length(p_filters->'cities') = 0
      OR l.city_name IN (SELECT jsonb_array_elements_text(p_filters->'cities'))
    )
    AND (
      p_filters->'utm_sources' IS NULL
      OR jsonb_array_length(p_filters->'utm_sources') = 0
      OR l.utm_source IN (SELECT jsonb_array_elements_text(p_filters->'utm_sources'))
    )
    AND (
      (p_filters->>'score_min') IS NULL
      OR l.sales_score >= (p_filters->>'score_min')::int
    )
    AND (
      (p_filters->>'score_max') IS NULL
      OR l.sales_score <= (p_filters->>'score_max')::int
    )
    AND (
      (p_filters->>'created_after') IS NULL
      OR l.created_at >= (p_filters->>'created_after')::timestamptz
    )
    AND (
      (p_filters->>'created_before') IS NULL
      OR l.created_at <= (p_filters->>'created_before')::timestamptz
    )
    AND (
      p_filters->'sales_rep_ids' IS NULL
      OR jsonb_array_length(p_filters->'sales_rep_ids') = 0
      OR l.sales_rep_id::text IN (SELECT jsonb_array_elements_text(p_filters->'sales_rep_ids'))
    )
    AND (
      (p_filters->>'exclude_campaign_days') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM email_campaign_leads ecl
        JOIN email_campaigns ec ON ec.id = ecl.campaign_id
        WHERE ecl.lead_id = l.id
          AND ecl.status IN ('sent', 'delivered', 'opened', 'clicked')
          AND ecl.sent_at > now() - ((p_filters->>'exclude_campaign_days')::int || ' days')::interval
      )
    );

  RETURN v_count;
END;
$$;


--
-- Name: get_focus_stage_mapping(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_focus_stage_mapping(p_tenant_id uuid, p_pipeline_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_config tenant_sales_config;
  v_mapping JSONB;
  v_stages RECORD;
  v_new_leads UUID;
  v_not_answered UUID;
  v_answered UUID;
  v_standby UUID;
  v_won UUID;
  v_lost UUID;
  v_nurturing UUID[] := ARRAY[]::UUID[];
  v_role_key TEXT;
BEGIN
  SELECT * INTO v_config FROM tenant_sales_config WHERE tenant_id = p_tenant_id;
  
  IF v_config.stage_role_mapping IS NOT NULL THEN
    -- Check if mapping is nested (has sdr/closer keys)
    IF v_config.stage_role_mapping ? 'sdr' OR v_config.stage_role_mapping ? 'closer' THEN
      -- Determine which sub-key to use based on pipeline_id
      IF p_pipeline_id = v_config.sdr_pipeline_id THEN
        v_role_key := 'sdr';
      ELSIF p_pipeline_id = v_config.closer_pipeline_id THEN
        v_role_key := 'closer';
      END IF;
      
      IF v_role_key IS NOT NULL AND v_config.stage_role_mapping ? v_role_key THEN
        RETURN v_config.stage_role_mapping -> v_role_key;
      END IF;
    ELSE
      -- Flat mapping (legacy), return as-is
      RETURN v_config.stage_role_mapping;
    END IF;
  END IF;

  -- Auto-derive from pipeline stages by position (1-based)
  FOR v_stages IN
    SELECT id, position, is_won, is_lost
    FROM sales_pipeline_stages
    WHERE pipeline_id = p_pipeline_id
    ORDER BY position ASC
  LOOP
    IF v_stages.is_won THEN
      v_won := v_stages.id;
    ELSIF v_stages.is_lost THEN
      v_lost := v_stages.id;
    ELSIF v_stages.position = 1 THEN
      v_new_leads := v_stages.id;
    ELSIF v_stages.position = 2 THEN
      v_not_answered := v_stages.id;
    ELSIF v_stages.position = 3 THEN
      v_answered := v_stages.id;
    ELSIF v_stages.position = 4 THEN
      v_standby := v_stages.id;
    ELSE
      v_nurturing := array_append(v_nurturing, v_stages.id);
    END IF;
  END LOOP;

  v_mapping := jsonb_build_object(
    'new_leads', v_new_leads,
    'not_answered', v_not_answered,
    'answered', v_answered,
    'standby', v_standby,
    'won', v_won,
    'lost', v_lost,
    'nurturing', to_jsonb(v_nurturing)
  );

  RETURN v_mapping;
END;
$$;


--
-- Name: get_inbox_dashboard_metrics(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_inbox_dashboard_metrics(p_instance_id uuid DEFAULT NULL::uuid) RETURNS TABLE(total_pending bigint, critical_count bigint, warning_count bigint, ok_count bigint, avg_wait_minutes integer, max_wait_minutes integer, resolved_today bigint, total_conversations bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());
  RETURN QUERY
  WITH latest_messages AS (
    SELECT DISTINCT ON (COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT))
      COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT) AS conversation_id,
      wm.is_from_me, wm.created_at,
      EXTRACT(EPOCH FROM (NOW() - wm.created_at))::INTEGER / 60 AS wait_minutes
    FROM whatsapp_messages wm
    WHERE wm.tenant_id = v_tid
      AND (p_instance_id IS NULL OR wm.instance_id = p_instance_id)
    ORDER BY COALESCE(wm.lead_id::TEXT, wm.group_id::TEXT), wm.created_at DESC
  ),
  pending AS (
    SELECT * FROM latest_messages WHERE NOT is_from_me
  )
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


--
-- Name: get_instagram_inbox(uuid, text, text, uuid, text, integer, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_instagram_inbox(p_account_id uuid DEFAULT NULL::uuid, p_stage_slug text DEFAULT NULL::text, p_status text DEFAULT 'open'::text, p_assigned_to uuid DEFAULT NULL::uuid, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0) RETURNS TABLE(id uuid, account_id uuid, lead_id uuid, thread_id text, participant_username text, participant_name text, participant_profile_pic text, status text, assigned_to uuid, stage_id uuid, stage_name text, stage_slug text, stage_color text, stage_position integer, last_message text, last_message_at timestamp with time zone, last_client_message_at timestamp with time zone, unread_count integer, total_messages integer, created_at timestamp with time zone, lead_name text, lead_phone text, lead_instagram text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.account_id, c.lead_id, c.thread_id,
    c.participant_username, c.participant_name, c.participant_profile_pic,
    c.status, c.assigned_to,
    s.id as stage_id, s.name as stage_name, s.slug as stage_slug,
    s.color as stage_color, s.position as stage_position,
    c.last_message, c.last_message_at, c.last_client_message_at,
    c.unread_count, c.total_messages, c.created_at,
    l.name as lead_name, l.phone as lead_phone, l.instagram as lead_instagram
  FROM instagram_conversations c
  LEFT JOIN social_seller_stages s ON c.social_seller_stage_id = s.id
  LEFT JOIN leads l ON c.lead_id = l.id
  WHERE c.tenant_id = (SELECT public.get_tenant_id())
    AND (p_account_id IS NULL OR c.account_id = p_account_id)
    AND (p_status IS NULL OR c.status = p_status)
    AND (p_stage_slug IS NULL OR s.slug = p_stage_slug)
    AND (p_assigned_to IS NULL OR c.assigned_to = p_assigned_to)
    AND (p_search IS NULL
      OR c.participant_username ILIKE '%' || p_search || '%'
      OR c.participant_name ILIKE '%' || p_search || '%'
      OR l.name ILIKE '%' || p_search || '%')
  ORDER BY c.last_message_at DESC NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;


--
-- Name: get_lead_by_phone(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_lead_by_phone(p_phone text) RETURNS TABLE(id uuid, name text, email text, phone text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE clean_phone TEXT;
BEGIN
  clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');
  RETURN QUERY
  SELECT l.id, l.name, l.email, l.phone
  FROM leads l
  WHERE l.tenant_id = (SELECT public.get_tenant_id())
    AND (regexp_replace(l.phone, '[^0-9]', '', 'g') LIKE '%' || clean_phone || '%'
      OR regexp_replace(l.phone, '[^0-9]', '', 'g') LIKE '%' || RIGHT(clean_phone, 11) || '%')
  LIMIT 1;
END;
$$;


--
-- Name: get_next_distribution_member(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_distribution_member(p_config_id uuid, p_require_availability boolean DEFAULT false) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_last_member_id UUID;
  v_last_position INTEGER;
  v_next_member_id UUID;
  v_member_count INTEGER;
  v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());

  SELECT COUNT(*) INTO v_member_count
  FROM lead_distribution_members
  WHERE config_id = p_config_id AND is_active = true AND tenant_id = v_tid;

  IF v_member_count = 0 THEN RETURN NULL; END IF;

  SELECT team_member_id INTO v_last_member_id
  FROM lead_distribution_log
  WHERE config_id = p_config_id AND tenant_id = v_tid
  ORDER BY created_at DESC LIMIT 1;

  IF v_last_member_id IS NOT NULL THEN
    SELECT position INTO v_last_position
    FROM lead_distribution_members
    WHERE config_id = p_config_id AND team_member_id = v_last_member_id AND is_active = true AND tenant_id = v_tid;
  END IF;

  IF v_last_position IS NULL THEN v_last_position := -1; END IF;

  IF p_require_availability THEN
    SELECT dm.team_member_id INTO v_next_member_id
    FROM lead_distribution_members dm
    JOIN team_members tm ON tm.id = dm.team_member_id
    WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.position > v_last_position
      AND dm.tenant_id = v_tid
      AND (tm.current_activity IS NULL OR tm.current_activity = 'available')
    ORDER BY dm.position ASC LIMIT 1;

    IF v_next_member_id IS NULL THEN
      SELECT dm.team_member_id INTO v_next_member_id
      FROM lead_distribution_members dm
      JOIN team_members tm ON tm.id = dm.team_member_id
      WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.tenant_id = v_tid
        AND (tm.current_activity IS NULL OR tm.current_activity = 'available')
      ORDER BY dm.position ASC LIMIT 1;
    END IF;
  ELSE
    SELECT dm.team_member_id INTO v_next_member_id
    FROM lead_distribution_members dm
    WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.position > v_last_position
      AND dm.tenant_id = v_tid
    ORDER BY dm.position ASC LIMIT 1;

    IF v_next_member_id IS NULL THEN
      SELECT dm.team_member_id INTO v_next_member_id
      FROM lead_distribution_members dm
      WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.tenant_id = v_tid
      ORDER BY dm.position ASC LIMIT 1;
    END IF;
  END IF;

  RETURN v_next_member_id;
END;
$$;


--
-- Name: get_next_distribution_member(uuid, boolean, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_distribution_member(p_config_id uuid, p_require_availability boolean DEFAULT false, p_tenant_id uuid DEFAULT NULL::uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_last_member_id UUID;
  v_last_position INTEGER;
  v_next_member_id UUID;
  v_member_count INTEGER;
  v_tid uuid;
BEGIN
  -- Use explicit tenant_id if provided, otherwise fallback to JWT
  v_tid := COALESCE(p_tenant_id, (SELECT public.get_tenant_id()));

  SELECT COUNT(*) INTO v_member_count
  FROM lead_distribution_members
  WHERE config_id = p_config_id AND is_active = true AND tenant_id = v_tid;

  IF v_member_count = 0 THEN RETURN NULL; END IF;

  SELECT team_member_id INTO v_last_member_id
  FROM lead_distribution_log
  WHERE config_id = p_config_id AND tenant_id = v_tid
  ORDER BY created_at DESC LIMIT 1;

  IF v_last_member_id IS NOT NULL THEN
    SELECT position INTO v_last_position
    FROM lead_distribution_members
    WHERE config_id = p_config_id AND team_member_id = v_last_member_id AND is_active = true AND tenant_id = v_tid;
  END IF;

  IF v_last_position IS NULL THEN v_last_position := -1; END IF;

  IF p_require_availability THEN
    SELECT dm.team_member_id INTO v_next_member_id
    FROM lead_distribution_members dm
    JOIN team_members tm ON tm.id = dm.team_member_id
    WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.position > v_last_position
      AND dm.tenant_id = v_tid
      AND (tm.current_activity IS NULL OR tm.current_activity = 'available')
    ORDER BY dm.position ASC LIMIT 1;

    IF v_next_member_id IS NULL THEN
      SELECT dm.team_member_id INTO v_next_member_id
      FROM lead_distribution_members dm
      JOIN team_members tm ON tm.id = dm.team_member_id
      WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.tenant_id = v_tid
        AND (tm.current_activity IS NULL OR tm.current_activity = 'available')
      ORDER BY dm.position ASC LIMIT 1;
    END IF;
  ELSE
    SELECT dm.team_member_id INTO v_next_member_id
    FROM lead_distribution_members dm
    WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.position > v_last_position
      AND dm.tenant_id = v_tid
    ORDER BY dm.position ASC LIMIT 1;

    IF v_next_member_id IS NULL THEN
      SELECT dm.team_member_id INTO v_next_member_id
      FROM lead_distribution_members dm
      WHERE dm.config_id = p_config_id AND dm.is_active = true AND dm.tenant_id = v_tid
      ORDER BY dm.position ASC LIMIT 1;
    END IF;
  END IF;

  RETURN v_next_member_id;
END;
$$;


--
-- Name: get_next_franchise_member(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_next_franchise_member(p_campaign_id uuid, p_city text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_last_member_id UUID;
  v_last_position INTEGER;
  v_next_member_id UUID;
  v_member_count INTEGER;
BEGIN
  -- Count active members (optionally filtered by city)
  SELECT COUNT(*) INTO v_member_count
  FROM franchise_members
  WHERE campaign_id = p_campaign_id AND is_active = true
    AND (p_city IS NULL OR cities = '{}' OR p_city = ANY(cities));

  IF v_member_count = 0 THEN RETURN NULL; END IF;

  -- Get last distributed member
  SELECT franchise_member_id INTO v_last_member_id
  FROM franchise_distribution_log
  WHERE campaign_id = p_campaign_id
  ORDER BY created_at DESC LIMIT 1;

  IF v_last_member_id IS NOT NULL THEN
    SELECT position INTO v_last_position
    FROM franchise_members
    WHERE campaign_id = p_campaign_id AND id = v_last_member_id AND is_active = true;
  END IF;

  IF v_last_position IS NULL THEN v_last_position := -1; END IF;

  -- Get next member after last position
  SELECT id INTO v_next_member_id
  FROM franchise_members
  WHERE campaign_id = p_campaign_id AND is_active = true AND position > v_last_position
    AND (p_city IS NULL OR cities = '{}' OR p_city = ANY(cities))
  ORDER BY position ASC LIMIT 1;

  -- Wrap around if needed
  IF v_next_member_id IS NULL THEN
    SELECT id INTO v_next_member_id
    FROM franchise_members
    WHERE campaign_id = p_campaign_id AND is_active = true
      AND (p_city IS NULL OR cities = '{}' OR p_city = ANY(cities))
    ORDER BY position ASC LIMIT 1;
  END IF;

  RETURN v_next_member_id;
END;
$$;


--
-- Name: get_response_templates(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_response_templates(p_team text DEFAULT 'cs'::text, p_category text DEFAULT NULL::text) RETURNS TABLE(id uuid, name text, content text, category text, shortcut text, usage_count integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.name, t.content, t.category, t.shortcut, t.usage_count
  FROM cs_response_templates t
  WHERE t.tenant_id = (SELECT public.get_tenant_id())
    AND t.team = p_team AND t.is_active = TRUE
    AND (p_category IS NULL OR t.category = p_category)
  ORDER BY t.usage_count DESC, t.name;
END;
$$;


--
-- Name: get_social_seller_funnel_stats(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_social_seller_funnel_stats(p_account_id uuid DEFAULT NULL::uuid) RETURNS TABLE(stage_slug text, stage_name text, stage_color text, stage_position integer, conversation_count bigint, unread_count bigint)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT s.slug as stage_slug, s.name as stage_name,
    s.color as stage_color, s.position as stage_position,
    COUNT(c.id) as conversation_count,
    COALESCE(SUM(c.unread_count), 0) as unread_count
  FROM social_seller_stages s
  LEFT JOIN instagram_conversations c ON c.social_seller_stage_id = s.id
    AND c.status = 'open'
    AND c.tenant_id = (SELECT public.get_tenant_id())
    AND (p_account_id IS NULL OR c.account_id = p_account_id)
  WHERE s.tenant_id = (SELECT public.get_tenant_id())
    AND s.is_active = true
  GROUP BY s.id, s.slug, s.name, s.color, s.position
  ORDER BY s.position;
END;
$$;


--
-- Name: get_stale_leads_never_contacted(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_stale_leads_never_contacted() RETURNS TABLE(deal_id uuid, deal_created_at timestamp with time zone, deal_updated_at timestamp with time zone, deal_pipeline_stage_id uuid, deal_sales_rep_id uuid, lead_id uuid, lead_name text, lead_phone text, lead_email text, rep_name text, waiting_hours numeric)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT 
    d.id,
    d.created_at,
    d.updated_at,
    d.pipeline_stage_id,
    d.sales_rep_id,
    l.id,
    l.name,
    l.phone,
    l.email,
    tm.name,
    round(EXTRACT(EPOCH FROM (now() - d.created_at)) / 3600.0, 1)
  FROM deals d
  JOIN leads l ON l.id = d.lead_id
  LEFT JOIN team_members tm ON tm.id = d.sales_rep_id
  WHERE d.tenant_id = get_tenant_id()
    AND d.status = 'negotiation'
    AND d.pipeline_stage_id IN (
      '721bddeb-fc05-4baf-b25c-d948a3df1eb4',  -- SDR Leads Novos
      '78ced961-429d-4272-9ddc-e53585519cc1'    -- Closer Leads Novos
    )
    AND d.metadata @> '{"source": "receive-lead"}'
    -- Nunca teve ligação
    AND NOT EXISTS (
      SELECT 1 FROM call_history ch WHERE ch.lead_id = l.id
    )
    -- Nunca recebeu WhatsApp do vendedor
    AND NOT EXISTS (
      SELECT 1 FROM whatsapp_messages wm WHERE wm.lead_id = l.id AND wm.is_from_me = true
    )
    -- Não tem deal ativo em outra etapa (já trabalhado em outro pipeline)
    AND NOT EXISTS (
      SELECT 1 FROM deals d2 
      WHERE d2.lead_id = l.id 
        AND d2.id != d.id 
        AND d2.pipeline_stage_id NOT IN ('721bddeb-fc05-4baf-b25c-d948a3df1eb4', '78ced961-429d-4272-9ddc-e53585519cc1')
        AND d2.status = 'negotiation'
    )
  ORDER BY d.created_at ASC;
END;
$$;


--
-- Name: team_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.team_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    team text,
    phone text,
    avatar_url text,
    is_active boolean DEFAULT true,
    auth_user_id uuid,
    google_access_token text,
    google_refresh_token text,
    google_token_expires_at timestamp with time zone,
    google_calendar_connected boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    google_calendar_sync_token text,
    google_calendar_watch_channel_id text,
    google_calendar_watch_resource_id text,
    google_calendar_watch_expiration timestamp with time zone,
    whatsapp_instance_id uuid,
    focus_mode_enabled boolean DEFAULT false,
    zadarma_enabled boolean DEFAULT false,
    zadarma_sip text,
    zadarma_caller_id text,
    zadarma_sip_password text,
    telnyx_enabled boolean DEFAULT false,
    telnyx_caller_id text,
    focus_mode_config jsonb DEFAULT '{}'::jsonb,
    availability_status text DEFAULT 'available'::text NOT NULL,
    paused_at timestamp with time zone,
    paused_reason text,
    current_activity text DEFAULT 'available'::text,
    current_activity_meta jsonb DEFAULT '{}'::jsonb,
    current_activity_at timestamp with time zone,
    twilio_enabled boolean DEFAULT false,
    twilio_caller_id text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    sub_role text,
    is_superadmin boolean DEFAULT false,
    CONSTRAINT chk_availability_status CHECK ((availability_status = ANY (ARRAY['available'::text, 'paused'::text, 'break'::text, 'offline'::text]))),
    CONSTRAINT team_members_current_activity_check CHECK ((current_activity = ANY (ARRAY['available'::text, 'dialing'::text, 'on_call'::text, 'in_meeting'::text, 'post_call'::text]))),
    CONSTRAINT team_members_sub_role_check CHECK ((sub_role = ANY (ARRAY['sdr'::text, 'closer'::text])))
);


--
-- Name: COLUMN team_members.availability_status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.availability_status IS 'Current availability: available, paused, break, offline';


--
-- Name: COLUMN team_members.paused_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.paused_at IS 'When the member paused/went on break';


--
-- Name: COLUMN team_members.paused_reason; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.paused_reason IS 'Optional reason for pause (almoco, banheiro, etc)';


--
-- Name: COLUMN team_members.current_activity; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.current_activity IS 'Persistent activity: available, dialing, on_call, in_meeting, post_call';


--
-- Name: COLUMN team_members.current_activity_meta; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.current_activity_meta IS 'Activity metadata: {leadId, leadName, phone, callId, meetingId, direction}';


--
-- Name: COLUMN team_members.current_activity_at; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.team_members.current_activity_at IS 'When the current activity started';


--
-- Name: get_team_member_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_team_member_by_email(user_email text) RETURNS SETOF public.team_members
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT *
  FROM team_members tm 
  WHERE tm.email = user_email AND tm.is_active = true 
  LIMIT 1;
END;
$$;


--
-- Name: get_tenant_branding(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_branding(lookup_domain text DEFAULT NULL::text, lookup_name text DEFAULT NULL::text) RETURNS TABLE(company_name text, logo_url text, favicon_url text, primary_color text, secondary_color text, background_color text, text_color text, custom_domain text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT tc.company_name, tc.logo_url, tc.favicon_url, tc.primary_color, 
         tc.secondary_color, tc.background_color, tc.text_color, tc.custom_domain
  FROM tenant_config tc
  WHERE (lookup_domain IS NOT NULL AND tc.custom_domain = lookup_domain)
     OR (lookup_name IS NOT NULL AND LOWER(tc.company_name) = LOWER(lookup_name))
  LIMIT 1;
END;
$$;


--
-- Name: get_tenant_options_for_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_options_for_email(user_email text) RETURNS TABLE(tenant_id uuid, tenant_name text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT DISTINCT tm.tenant_id, t.name as tenant_name
  FROM team_members tm JOIN tenants t ON t.id = tm.tenant_id
  WHERE tm.email = user_email AND tm.is_active = true;
END;
$$;


--
-- Name: tenant_sales_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_sales_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    has_sdr_closer_split boolean DEFAULT false NOT NULL,
    sdr_pipeline_id uuid,
    closer_pipeline_id uuid,
    transfer_required_fields jsonb DEFAULT '["timing_negocio", "regiao_interesse", "capital_disponivel"]'::jsonb NOT NULL,
    transfer_auto_assign_closer boolean DEFAULT true NOT NULL,
    closer_distribution_config_id uuid,
    closer_accept_required boolean DEFAULT true NOT NULL,
    cadence_rules jsonb DEFAULT '[{"maxDays": 30, "callsPerDay": 3, "frequencyDays": 1}, {"maxDays": 60, "callsPerDay": 1, "frequencyDays": 3}, {"maxDays": 90, "callsPerDay": 1, "frequencyDays": 5}, {"maxDays": null, "callsPerDay": 1, "frequencyDays": 7}]'::jsonb NOT NULL,
    sla_minutes integer DEFAULT 4 NOT NULL,
    retry_cooldown_minutes integer DEFAULT 180 NOT NULL,
    meeting_prep_window_minutes integer DEFAULT 10 NOT NULL,
    task_grace_minutes integer DEFAULT 5 NOT NULL,
    sdr_daily_call_target integer DEFAULT 200,
    closer_daily_call_target integer DEFAULT 50,
    stage_role_mapping jsonb,
    noshow_auto_return boolean DEFAULT false NOT NULL,
    noshow_return_after_hours integer DEFAULT 24,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: get_tenant_sales_config(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_tenant_sales_config(p_tenant_id uuid) RETURNS SETOF public.tenant_sales_config
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Create default if not exists
  INSERT INTO tenant_sales_config (tenant_id)
  VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN QUERY
  SELECT * FROM tenant_sales_config WHERE tenant_id = p_tenant_id LIMIT 1;
END;
$$;


--
-- Name: get_user_by_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_by_email(p_email text) RETURNS TABLE(id uuid, email text)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u WHERE u.email = p_email LIMIT 1;
END;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, tenant_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_app_meta_data->>'tenant_id')::uuid, public.get_tenant_id())
  );
  RETURN NEW;
END;
$$;


--
-- Name: health_check(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.health_check() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_active INT; v_max INT; v_slow JSONB; v_tables JSONB;
BEGIN
  SELECT count(*) INTO v_active FROM pg_stat_activity WHERE pid != pg_backend_pid();
  SELECT setting::int INTO v_max FROM pg_settings WHERE name = 'max_connections';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('duration', round(EXTRACT(EPOCH FROM (now() - query_start)))::text || 's', 'query', left(query, 120), 'state', state)), '[]'::jsonb) INTO v_slow FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '10 seconds' AND pid != pg_backend_pid() AND query NOT LIKE '%health_check%' AND query NOT LIKE '%START_REPLICATION%' AND query NOT LIKE '%autovacuum%' AND backend_type = 'client backend';
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', relname, 'size_mb', round((pg_total_relation_size(c.oid) / 1048576.0)::numeric, 0)) ORDER BY pg_total_relation_size(c.oid) DESC), '[]'::jsonb) INTO v_tables FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND pg_total_relation_size(c.oid) > 100 * 1048576;
  RETURN jsonb_build_object('active_connections', v_active, 'max_connections', v_max, 'slow_queries', v_slow, 'big_tables', v_tables, 'checked_at', now());
END; $$;


--
-- Name: increment_campaign_counter(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_campaign_counter(p_campaign_id uuid, p_field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  EXECUTE format('UPDATE campaigns SET %I = COALESCE(%I, 0) + 1, updated_at = now() WHERE id = $1', p_field, p_field) USING p_campaign_id;
END;
$_$;


--
-- Name: increment_email_campaign_counter(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.increment_email_campaign_counter(p_campaign_id uuid, p_field text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
BEGIN
  IF auth.uid() IS NULL AND current_setting('request.jwt.claims', true)::jsonb->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  EXECUTE format('UPDATE email_campaigns SET %I = COALESCE(%I, 0) + 1, updated_at = now() WHERE id = $1', p_field, p_field) USING p_campaign_id;
END;
$_$;


--
-- Name: is_superadmin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_superadmin() RETURNS boolean
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM team_members 
    WHERE auth_user_id = auth.uid() 
    AND is_superadmin = true
  );
END;
$$;


--
-- Name: is_tenant_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_tenant_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM team_members
    WHERE auth_user_id = auth.uid()
      AND role = 'admin'
      AND tenant_id = get_tenant_id()
  )
$$;


--
-- Name: link_auth_user_to_team_member(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.link_auth_user_to_team_member(user_email text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_count int; v_first_tenant text;
BEGIN
  -- Linka TODOS os team_members do email (multi-tenant)
  UPDATE team_members SET auth_user_id = auth.uid()
  WHERE email = user_email AND auth_user_id IS NULL AND is_active = true;

  -- Conta quantos tenants o usuario tem
  SELECT COUNT(*), MIN(tenant_id::text) INTO v_count, v_first_tenant
  FROM team_members WHERE email = user_email AND is_active = true;

  -- So stampa JWT automaticamente se tiver 1 unico tenant
  IF v_count = 1 THEN
    UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data,'{}'::jsonb)
      || jsonb_build_object('tenant_id', v_first_tenant)
    WHERE id = auth.uid() AND (raw_app_meta_data->>'tenant_id' IS NULL
      OR raw_app_meta_data->>'tenant_id' != v_first_tenant);
  END IF;
END;
$$;


--
-- Name: mark_conversation_handled(uuid, uuid, uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_conversation_handled(p_lead_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid, p_handled_by uuid DEFAULT NULL::uuid, p_reason text DEFAULT 'replied_manually'::text, p_notes text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());
  IF p_lead_id IS NULL AND p_group_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'lead_id ou group_id obrigatorio');
  END IF;
  IF p_lead_id IS NOT NULL THEN
    INSERT INTO cs_conversation_handled (lead_id, group_id, handled_by, reason, notes, handled_at, tenant_id)
    VALUES (p_lead_id, NULL, p_handled_by, p_reason, p_notes, NOW(), v_tid)
    ON CONFLICT (lead_id) WHERE lead_id IS NOT NULL
    DO UPDATE SET
      handled_by = EXCLUDED.handled_by,
      reason = EXCLUDED.reason,
      notes = EXCLUDED.notes,
      handled_at = NOW();
  ELSE
    INSERT INTO cs_conversation_handled (lead_id, group_id, handled_by, reason, notes, handled_at, tenant_id)
    VALUES (NULL, p_group_id, p_handled_by, p_reason, p_notes, NOW(), v_tid)
    ON CONFLICT (group_id) WHERE group_id IS NOT NULL
    DO UPDATE SET
      handled_by = EXCLUDED.handled_by,
      reason = EXCLUDED.reason,
      notes = EXCLUDED.notes,
      handled_at = NOW();
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: normalize_phone_last8(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalize_phone_last8(p_phone text) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $$
BEGIN
  RETURN RIGHT(REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g'), 8);
END;
$$;


--
-- Name: populate_campaign_leads(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_campaign_leads(p_campaign_id uuid, p_tenant_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $_$
DECLARE
  v_filters JSONB;
  v_count INTEGER;
  v_query TEXT;
BEGIN
  SELECT audience_filters INTO v_filters FROM campaigns WHERE id = p_campaign_id AND tenant_id = p_tenant_id;
  IF v_filters IS NULL THEN
    RAISE EXCEPTION 'Campaign not found or no filters';
  END IF;

  v_query := 'INSERT INTO campaign_leads (tenant_id, campaign_id, lead_id, assigned_to)
    SELECT $1, $3, l.id, l.sales_rep_id
    FROM leads l WHERE l.tenant_id = $1';

  IF v_filters ? 'pipeline_stage_ids' AND jsonb_array_length(v_filters->'pipeline_stage_ids') > 0 THEN
    v_query := v_query || ' AND l.pipeline_stage_id IN (SELECT jsonb_array_elements_text($2->''pipeline_stage_ids'')::UUID)';
  END IF;
  IF v_filters ? 'sales_stages' AND jsonb_array_length(v_filters->'sales_stages') > 0 THEN
    v_query := v_query || ' AND l.sales_stage IN (SELECT jsonb_array_elements_text($2->''sales_stages''))';
  END IF;
  IF v_filters ? 'created_after' THEN
    v_query := v_query || ' AND l.created_at >= ($2->>''created_after'')::TIMESTAMPTZ';
  END IF;
  IF v_filters ? 'created_before' THEN
    v_query := v_query || ' AND l.created_at <= ($2->>''created_before'')::TIMESTAMPTZ';
  END IF;
  IF v_filters ? 'last_interaction_after' THEN
    v_query := v_query || ' AND l.last_interaction_at >= ($2->>''last_interaction_after'')::TIMESTAMPTZ';
  END IF;
  IF v_filters ? 'last_interaction_before' THEN
    v_query := v_query || ' AND l.last_interaction_at <= ($2->>''last_interaction_before'')::TIMESTAMPTZ';
  END IF;
  IF v_filters ? 'capital_min' THEN
    v_query := v_query || ' AND (l.metadata->>''capital_disponivel'')::NUMERIC >= ($2->>''capital_min'')::NUMERIC';
  END IF;
  IF v_filters ? 'capital_max' THEN
    v_query := v_query || ' AND (l.metadata->>''capital_disponivel'')::NUMERIC <= ($2->>''capital_max'')::NUMERIC';
  END IF;
  IF v_filters ? 'cities' AND jsonb_array_length(v_filters->'cities') > 0 THEN
    v_query := v_query || ' AND l.city_name IN (SELECT jsonb_array_elements_text($2->''cities''))';
  END IF;
  IF v_filters ? 'states' AND jsonb_array_length(v_filters->'states') > 0 THEN
    v_query := v_query || ' AND l.state IN (SELECT jsonb_array_elements_text($2->''states''))';
  END IF;
  IF v_filters ? 'utm_sources' AND jsonb_array_length(v_filters->'utm_sources') > 0 THEN
    v_query := v_query || ' AND l.utm_source IN (SELECT jsonb_array_elements_text($2->''utm_sources''))';
  END IF;
  IF v_filters ? 'utm_campaigns' AND jsonb_array_length(v_filters->'utm_campaigns') > 0 THEN
    v_query := v_query || ' AND l.utm_campaign IN (SELECT jsonb_array_elements_text($2->''utm_campaigns''))';
  END IF;
  IF v_filters ? 'score_min' THEN
    v_query := v_query || ' AND l.sales_score >= ($2->>''score_min'')::NUMERIC';
  END IF;
  IF v_filters ? 'score_max' THEN
    v_query := v_query || ' AND l.sales_score <= ($2->>''score_max'')::NUMERIC';
  END IF;
  IF v_filters ? 'sales_rep_ids' AND jsonb_array_length(v_filters->'sales_rep_ids') > 0 THEN
    v_query := v_query || ' AND l.sales_rep_id IN (SELECT jsonb_array_elements_text($2->''sales_rep_ids'')::UUID)';
  END IF;
  IF v_filters ? 'no_sales_rep' AND (v_filters->>'no_sales_rep')::BOOLEAN THEN
    v_query := v_query || ' AND l.sales_rep_id IS NULL';
  END IF;
  IF v_filters ? 'bant_budget' AND (v_filters->>'bant_budget')::BOOLEAN THEN
    v_query := v_query || ' AND l.bant_budget = true';
  END IF;
  IF v_filters ? 'bant_authority' AND (v_filters->>'bant_authority')::BOOLEAN THEN
    v_query := v_query || ' AND l.bant_authority = true';
  END IF;
  IF v_filters ? 'bant_need' AND (v_filters->>'bant_need')::BOOLEAN THEN
    v_query := v_query || ' AND l.bant_need = true';
  END IF;
  IF v_filters ? 'bant_timeline' AND (v_filters->>'bant_timeline')::BOOLEAN THEN
    v_query := v_query || ' AND l.bant_timeline = true';
  END IF;

  v_query := v_query || ' AND l.phone IS NOT NULL AND l.phone != ''''';

  IF v_filters ? 'exclude_campaign_days' THEN
    v_query := v_query || ' AND l.id NOT IN (
      SELECT cl.lead_id FROM campaign_leads cl
      JOIN campaigns c ON c.id = cl.campaign_id
      WHERE cl.status NOT IN (''skipped'',''failed'')
      AND cl.created_at >= now() - (($2->>''exclude_campaign_days'')::INTEGER || '' days'')::INTERVAL
    )';
  END IF;

  v_query := v_query || ' ON CONFLICT (campaign_id, lead_id) DO NOTHING';

  EXECUTE v_query USING p_tenant_id, v_filters, p_campaign_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Update campaign counters
  UPDATE campaigns SET total_leads = v_count, audience_count = v_count, updated_at = now() WHERE id = p_campaign_id;

  RETURN v_count;
END;
$_$;


--
-- Name: populate_email_campaign_leads(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.populate_email_campaign_leads(p_campaign_id uuid, p_tenant_id uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_count INT;
  v_filters JSONB;
BEGIN
  SELECT audience_filters INTO v_filters
  FROM email_campaigns WHERE id = p_campaign_id AND tenant_id = p_tenant_id;

  IF v_filters IS NULL THEN v_filters := '{}'; END IF;

  DELETE FROM email_campaign_leads
  WHERE campaign_id = p_campaign_id AND status = 'pending';

  INSERT INTO email_campaign_leads (tenant_id, campaign_id, lead_id, email, name)
  SELECT
    p_tenant_id,
    p_campaign_id,
    l.id,
    l.email,
    l.name
  FROM leads l
  WHERE l.tenant_id = p_tenant_id
    AND l.email IS NOT NULL
    AND l.email != ''
    AND (l.email_opted_out IS NULL OR l.email_opted_out = false)
    AND NOT EXISTS (
      SELECT 1 FROM email_unsubscribes u
      WHERE u.tenant_id = p_tenant_id AND u.email = l.email
    )
    AND (
      v_filters->'pipeline_stage_ids' IS NULL
      OR jsonb_array_length(v_filters->'pipeline_stage_ids') = 0
      OR l.pipeline_stage_id::text IN (SELECT jsonb_array_elements_text(v_filters->'pipeline_stage_ids'))
    )
    AND (
      v_filters->'states' IS NULL
      OR jsonb_array_length(v_filters->'states') = 0
      OR l.state IN (SELECT jsonb_array_elements_text(v_filters->'states'))
    )
    AND (
      v_filters->'cities' IS NULL
      OR jsonb_array_length(v_filters->'cities') = 0
      OR l.city_name IN (SELECT jsonb_array_elements_text(v_filters->'cities'))
    )
    AND (
      v_filters->'utm_sources' IS NULL
      OR jsonb_array_length(v_filters->'utm_sources') = 0
      OR l.utm_source IN (SELECT jsonb_array_elements_text(v_filters->'utm_sources'))
    )
    AND (
      (v_filters->>'score_min') IS NULL
      OR l.sales_score >= (v_filters->>'score_min')::int
    )
    AND (
      (v_filters->>'score_max') IS NULL
      OR l.sales_score <= (v_filters->>'score_max')::int
    )
    AND (
      (v_filters->>'created_after') IS NULL
      OR l.created_at >= (v_filters->>'created_after')::timestamptz
    )
    AND (
      (v_filters->>'created_before') IS NULL
      OR l.created_at <= (v_filters->>'created_before')::timestamptz
    )
    AND (
      v_filters->'sales_rep_ids' IS NULL
      OR jsonb_array_length(v_filters->'sales_rep_ids') = 0
      OR l.sales_rep_id::text IN (SELECT jsonb_array_elements_text(v_filters->'sales_rep_ids'))
    )
    AND (
      (v_filters->>'exclude_campaign_days') IS NULL
      OR NOT EXISTS (
        SELECT 1 FROM email_campaign_leads ecl
        JOIN email_campaigns ec ON ec.id = ecl.campaign_id
        WHERE ecl.lead_id = l.id
          AND ecl.status IN ('sent', 'delivered', 'opened', 'clicked')
          AND ecl.sent_at > now() - ((v_filters->>'exclude_campaign_days')::int || ' days')::interval
      )
    )
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


--
-- Name: process_ai_agent_queue(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.process_ai_agent_queue() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE ai_agent_message_queue
  SET status = 'pending'
  WHERE status = 'processing'
    AND processed_at IS NULL
    AND created_at < now() - interval '3 minutes';

  IF EXISTS (SELECT 1 FROM ai_agent_message_queue WHERE status = 'pending' AND scheduled_for <= now()) THEN
    PERFORM net.http_post(
      url := 'https://mqkmmsrmauqebllmiikl.supabase.co/functions/v1/ai-sales-agent',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
      ),
      body := '{"action": "process_queue"}'::jsonb
    );
  END IF;
END;
$$;


--
-- Name: release_agent_lock(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.release_agent_lock(p_lead_id uuid) RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE ai_agent_conversations
  SET processing_lock = NULL
  WHERE lead_id = p_lead_id;
END;
$$;


--
-- Name: search_leads_focus(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.search_leads_focus(search_term text, rep_id uuid DEFAULT NULL::uuid) RETURNS TABLE(id uuid, name text, phone text, email text, company_name text, city_name text, state text, sales_score integer, sales_stage text, capital_disponivel text, deal_stage_name text, deal_pipeline_stage_id uuid)
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  normalized text;
  digits_only text;
  v_tid uuid;
BEGIN
  v_tid := (SELECT public.get_tenant_id());
  normalized := lower(extensions.unaccent(trim(search_term)));
  digits_only := regexp_replace(normalized, '[^0-9]', '', 'g');
  IF length(normalized) < 2 THEN RETURN; END IF;

  RETURN QUERY
  SELECT l.id, l.name, l.phone, l.email, l.company_name,
    l.city_name::text, l.state::text, l.sales_score::int,
    l.sales_stage::text, l.capital_disponivel,
    sps.name AS deal_stage_name, d.pipeline_stage_id AS deal_pipeline_stage_id
  FROM leads l
  LEFT JOIN LATERAL (
    SELECT dd.pipeline_stage_id FROM deals dd
    WHERE dd.lead_id = l.id AND dd.status IN ('open', 'negotiation') AND dd.tenant_id = v_tid
    ORDER BY dd.updated_at DESC LIMIT 1
  ) d ON true
  LEFT JOIN sales_pipeline_stages sps ON sps.id = d.pipeline_stage_id
  WHERE l.tenant_id = v_tid
    AND (rep_id IS NULL OR l.sales_rep_id = rep_id)
    AND (
      lower(extensions.unaccent(coalesce(l.name, ''))) ILIKE '%' || normalized || '%'
      OR lower(extensions.unaccent(coalesce(l.email, ''))) ILIKE '%' || normalized || '%'
      OR lower(extensions.unaccent(coalesce(l.company_name, ''))) ILIKE '%' || normalized || '%'
      OR lower(extensions.unaccent(coalesce(l.city_name::text, ''))) ILIKE '%' || normalized || '%'
      OR (length(digits_only) >= 3 AND regexp_replace(coalesce(l.phone, ''), '[^0-9]', '', 'g') LIKE '%' || digits_only || '%')
    )
  ORDER BY
    CASE WHEN lower(extensions.unaccent(coalesce(l.name, ''))) ILIKE '%' || normalized || '%' THEN 0 ELSE 1 END,
    l.sales_score DESC NULLS LAST
  LIMIT 20;
END;
$$;


--
-- Name: select_tenant_for_user(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.select_tenant_for_user(target_tenant_id uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_member_id uuid; v_member_role text;
BEGIN
  SELECT tm.id, tm.role::text INTO v_member_id, v_member_role
  FROM team_members tm WHERE tm.auth_user_id = auth.uid()
    AND tm.tenant_id = target_tenant_id AND tm.is_active = true LIMIT 1;
  IF v_member_id IS NULL THEN
    RAISE EXCEPTION 'User does not belong to tenant %', target_tenant_id USING ERRCODE='insufficient_privilege';
  END IF;
  UPDATE auth.users SET raw_app_meta_data = COALESCE(raw_app_meta_data,'{}'::jsonb)
    || jsonb_build_object('tenant_id', target_tenant_id::text) WHERE id = auth.uid();
  RETURN jsonb_build_object('tenant_id',target_tenant_id,'member_id',v_member_id,'role',v_member_role);
END; $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_lead_from_deal(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_lead_from_deal() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- No INSERT: sempre sincronizar
  IF TG_OP = 'INSERT' THEN
    UPDATE leads
    SET 
      pipeline_stage_id = NEW.pipeline_stage_id,
      sales_rep_id = COALESCE(NEW.sales_rep_id, leads.sales_rep_id)
    WHERE id = NEW.lead_id;
    RETURN NEW;
  END IF;

  -- No UPDATE: sincronizar se stage ou rep mudou
  IF TG_OP = 'UPDATE' THEN
    -- Se o deal foi perdido/cancelado, buscar o deal ativo mais recente
    IF NEW.status IN ('lost', 'cancelled') AND OLD.status = 'negotiation' THEN
      UPDATE leads
      SET 
        pipeline_stage_id = sub.pipeline_stage_id,
        sales_rep_id = COALESCE(sub.sales_rep_id, leads.sales_rep_id)
      FROM (
        SELECT d.pipeline_stage_id, d.sales_rep_id
        FROM deals d
        WHERE d.lead_id = NEW.lead_id
          AND d.id != NEW.id
          AND d.status = 'negotiation'
        ORDER BY d.updated_at DESC
        LIMIT 1
      ) sub
      WHERE leads.id = NEW.lead_id;
      RETURN NEW;
    END IF;

    -- Sincronizar stage e rep se mudaram
    IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id
       OR OLD.sales_rep_id IS DISTINCT FROM NEW.sales_rep_id THEN
      UPDATE leads
      SET 
        pipeline_stage_id = NEW.pipeline_stage_id,
        sales_rep_id = COALESCE(NEW.sales_rep_id, leads.sales_rep_id)
      WHERE id = NEW.lead_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_price_amount(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_price_amount() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.amount IS NOT NULL AND NEW.price IS NULL THEN
    NEW.price := NEW.amount;
  ELSIF NEW.price IS NOT NULL AND NEW.amount IS NULL THEN
    NEW.amount := NEW.price;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_auto_move_on_call(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_auto_move_on_call() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL THEN
    PERFORM auto_move_deal_to_em_contato(NEW.lead_id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_auto_move_on_task(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_auto_move_on_task() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  -- Skip auto-move for SDR transfer tasks: the closer deal was JUST created
  -- at position 1 and must NOT be moved automatically.
  IF NEW.task_type = 'meeting'
     AND (NEW.metadata->>'source') = 'sdr_transfer' THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NOT NULL THEN
    PERFORM auto_move_deal_to_em_contato(NEW.lead_id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_auto_move_on_whatsapp_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_auto_move_on_whatsapp_message() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.is_from_me = true AND NEW.lead_id IS NOT NULL THEN
    PERFORM auto_move_deal_to_em_contato(NEW.lead_id, NEW.tenant_id);
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trigger_enqueue_for_ai_agent(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trigger_enqueue_for_ai_agent() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
DECLARE
  v_agent RECORD;
  v_debounce INT;
  v_reactivation_map JSONB;
  v_current_stage TEXT;
  v_target_stage TEXT;
BEGIN
  IF NEW.is_from_me = true OR NEW.group_id IS NOT NULL OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_agent FROM ai_sales_agents WHERE is_active = true LIMIT 1;
  IF v_agent IS NULL THEN RETURN NEW; END IF;

  -- Stop active cadences (lead replied)
  UPDATE ai_agent_cadence_enrollments
  SET status = 'replied', updated_at = now()
  WHERE lead_id = NEW.lead_id AND status = 'active';

  -- Reactivation: move lead back from terminal stages
  v_reactivation_map := v_agent.settings->'cadence_reactivation_map';
  IF v_reactivation_map IS NOT NULL THEN
    SELECT sps.name INTO v_current_stage
    FROM leads l
    JOIN sales_pipeline_stages sps ON sps.id = l.pipeline_stage_id
    WHERE l.id = NEW.lead_id;

    v_target_stage := v_reactivation_map->>v_current_stage;
    IF v_target_stage IS NOT NULL THEN
      UPDATE leads SET pipeline_stage_id = (
        SELECT id FROM sales_pipeline_stages WHERE name = v_target_stage LIMIT 1
      ) WHERE id = NEW.lead_id;
    END IF;
  END IF;

  v_debounce := COALESCE((v_agent.settings->>'debounce_seconds')::INT, 30);

  -- Enfileirar (backup para cron caso o HTTP falhe)
  PERFORM enqueue_message_for_ai_agent(NEW.lead_id, NEW.id, NEW.content, v_debounce);

  -- Chamar process_with_debounce (espera o debounce DENTRO da edge function e processa na hora)
  PERFORM net.http_post(
    url := 'https://mqkmmsrmauqebllmiikl.supabase.co/functions/v1/ai-sales-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1)
    ),
    body := jsonb_build_object(
      'action', 'process_with_debounce',
      'lead_id', NEW.lead_id::text,
      'message_id', NEW.id::text
    )
  );

  RETURN NEW;
END;
$$;


--
-- Name: try_acquire_agent_lock(uuid, interval); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.try_acquire_agent_lock(p_lead_id uuid, p_lock_duration interval DEFAULT '00:00:30'::interval) RETURNS boolean
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_acquired BOOLEAN := false;
BEGIN
  UPDATE ai_agent_conversations
  SET processing_lock = now()
  WHERE lead_id = p_lead_id
    AND status = 'active'
    AND (processing_lock IS NULL OR processing_lock < now() - p_lock_duration)
  RETURNING true INTO v_acquired;

  RETURN COALESCE(v_acquired, false);
END;
$$;


--
-- Name: unmark_conversation_handled(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unmark_conversation_handled(p_lead_id uuid DEFAULT NULL::uuid, p_group_id uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    AS $$
BEGIN
  IF p_lead_id IS NOT NULL THEN
    DELETE FROM cs_conversation_handled
    WHERE lead_id = p_lead_id AND tenant_id = (SELECT public.get_tenant_id());
  ELSIF p_group_id IS NOT NULL THEN
    DELETE FROM cs_conversation_handled
    WHERE group_id = p_group_id AND tenant_id = (SELECT public.get_tenant_id());
  ELSE
    RETURN jsonb_build_object('success', false, 'error', 'lead_id ou group_id obrigatorio');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;


--
-- Name: update_deal_payment_totals(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_deal_payment_totals() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  v_deal_id UUID;
  v_tid UUID;
  v_total_paid DECIMAL(12,2);
  v_negotiated_price DECIMAL(12,2);
  v_new_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_deal_id := OLD.deal_id;
    v_tid := OLD.tenant_id;
  ELSE
    v_deal_id := NEW.deal_id;
    v_tid := NEW.tenant_id;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
  FROM deal_payments
  WHERE deal_id = v_deal_id AND tenant_id = v_tid AND status IN ('confirmed', 'received');

  SELECT negotiated_price INTO v_negotiated_price
  FROM deals WHERE id = v_deal_id AND tenant_id = v_tid;

  IF v_total_paid >= v_negotiated_price THEN
    v_new_status := 'paid';
  ELSIF v_total_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE deals
  SET total_paid = v_total_paid, payment_status = v_new_status, updated_at = NOW()
  WHERE id = v_deal_id AND tenant_id = v_tid;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: update_distribution_config_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_distribution_config_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: update_inbox_metrics_on_message(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_inbox_metrics_on_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  conv_key TEXT;
BEGIN
  IF NEW.lead_id IS NOT NULL AND NEW.group_id IS NULL THEN
    conv_key := 'lead_' || NEW.lead_id::TEXT;
  ELSIF NEW.group_id IS NOT NULL THEN
    conv_key := 'group_' || NEW.group_id::TEXT;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.is_from_me THEN
    INSERT INTO cs_inbox_metrics (
      lead_id, group_id, instance_id, conversation_key, tenant_id,
      last_response_at, first_response_at,
      is_waiting_response, wait_started_at, sla_status,
      total_messages_sent, total_interactions
    ) VALUES (
      NEW.lead_id, NEW.group_id, NEW.instance_id, conv_key, NEW.tenant_id,
      NEW.sent_at, NEW.sent_at,
      FALSE, NULL, 'ok',
      1, 1
    )
    ON CONFLICT (conversation_key) DO UPDATE SET
      last_response_at = NEW.sent_at,
      first_response_at = COALESCE(cs_inbox_metrics.first_response_at, NEW.sent_at),
      is_waiting_response = FALSE,
      wait_started_at = NULL,
      sla_status = 'ok',
      total_messages_sent = cs_inbox_metrics.total_messages_sent + 1,
      total_interactions = cs_inbox_metrics.total_interactions + 1,
      tenant_id = COALESCE(cs_inbox_metrics.tenant_id, NEW.tenant_id),
      updated_at = NOW();
  ELSE
    INSERT INTO cs_inbox_metrics (
      lead_id, group_id, instance_id, conversation_key, tenant_id,
      first_customer_message_at, last_customer_message_at,
      is_waiting_response, wait_started_at,
      total_messages_received, total_interactions
    ) VALUES (
      NEW.lead_id, NEW.group_id, NEW.instance_id, conv_key, NEW.tenant_id,
      NEW.sent_at, NEW.sent_at,
      TRUE, NEW.sent_at,
      1, 1
    )
    ON CONFLICT (conversation_key) DO UPDATE SET
      last_customer_message_at = NEW.sent_at,
      first_customer_message_at = COALESCE(cs_inbox_metrics.first_customer_message_at, NEW.sent_at),
      is_waiting_response = TRUE,
      wait_started_at = NEW.sent_at,
      total_messages_received = cs_inbox_metrics.total_messages_received + 1,
      total_interactions = cs_inbox_metrics.total_interactions + 1,
      tenant_id = COALESCE(cs_inbox_metrics.tenant_id, NEW.tenant_id),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: update_sla_status(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_sla_status() RETURNS void
    LANGUAGE plpgsql
    AS $$
BEGIN
  UPDATE cs_inbox_metrics SET
    sla_status = CASE
      WHEN NOT is_waiting_response THEN 'ok'
      WHEN calculate_wait_minutes(wait_started_at) > 120 THEN 'critical'
      WHEN calculate_wait_minutes(wait_started_at) > 30 THEN 'warning'
      ELSE 'ok'
    END,
    sla_breached_at = CASE
      WHEN sla_status != 'critical' AND calculate_wait_minutes(wait_started_at) > 120 THEN NOW()
      ELSE sla_breached_at
    END,
    total_sla_breaches = CASE
      WHEN sla_status != 'critical' AND calculate_wait_minutes(wait_started_at) > 120 THEN total_sla_breaches + 1
      ELSE total_sla_breaches
    END,
    updated_at = NOW()
  WHERE is_waiting_response = TRUE;
END;
$$;


--
-- Name: update_stage_changed_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_stage_changed_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.pipeline_stage_id IS DISTINCT FROM NEW.pipeline_stage_id THEN
    NEW.stage_changed_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


--
-- Name: use_response_template(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.use_response_template(p_template_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE cs_response_templates
  SET usage_count = usage_count + 1, updated_at = NOW()
  WHERE id = p_template_id
    AND tenant_id = (SELECT public.get_tenant_id());
END;
$$;


--
-- Name: _deal_stage_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public._deal_stage_audit (
    id integer NOT NULL,
    deal_id uuid NOT NULL,
    old_stage_id uuid,
    new_stage_id uuid,
    old_stage_name text,
    new_stage_name text,
    changed_at timestamp with time zone DEFAULT now(),
    query_source text DEFAULT current_setting('application_name'::text, true)
);


--
-- Name: _deal_stage_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public._deal_stage_audit_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _deal_stage_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public._deal_stage_audit_id_seq OWNED BY public._deal_stage_audit.id;


--
-- Name: admin_impersonation_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_impersonation_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    admin_member_id uuid NOT NULL,
    target_member_id uuid NOT NULL,
    token text DEFAULT encode(extensions.gen_random_bytes(32), 'hex'::text) NOT NULL,
    used boolean DEFAULT false,
    expires_at timestamp with time zone DEFAULT (now() + '00:05:00'::interval) NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid NOT NULL
);


--
-- Name: ai_agent_cadence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_cadence_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    agent_id uuid NOT NULL,
    stage text NOT NULL,
    current_step integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    next_action_at timestamp with time zone,
    enrolled_at timestamp with time zone DEFAULT now(),
    last_step_at timestamp with time zone,
    completed_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT (current_setting('app.settings.tenant_id'::text, true))::uuid NOT NULL
);


--
-- Name: ai_agent_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    agent_id uuid,
    status text DEFAULT 'active'::text,
    messages_history jsonb DEFAULT '[]'::jsonb,
    total_messages_sent integer DEFAULT 0,
    total_messages_received integer DEFAULT 0,
    paused_by uuid,
    paused_at timestamp with time zone,
    pause_reason text,
    last_processed_at timestamp with time zone,
    last_message_id uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    processing_lock timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: ai_agent_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid,
    lead_id uuid,
    agent_id uuid,
    log_type text NOT NULL,
    data jsonb DEFAULT '{}'::jsonb,
    tokens_input integer,
    tokens_output integer,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: ai_agent_send_counts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_send_counts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid NOT NULL,
    window_start timestamp with time zone NOT NULL,
    window_type character varying NOT NULL,
    message_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT (current_setting('app.settings.tenant_id'::text, true))::uuid NOT NULL
);


--
-- Name: ai_agent_tools; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_agent_tools (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    name text NOT NULL,
    description text NOT NULL,
    parameters jsonb DEFAULT '{"type": "object", "required": [], "properties": {}}'::jsonb,
    action_type text NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb,
    priority integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: ai_sales_agents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_sales_agents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    system_prompt text NOT NULL,
    personality_traits jsonb DEFAULT '[]'::jsonb,
    target_stages text[] DEFAULT ARRAY['captura'::text, 'qualificacao'::text],
    settings jsonb DEFAULT '{"working_days": [1, 2, 3, 4, 5, 6], "debounce_seconds": 10, "typing_speed_cpm": 300, "working_hours_end": "20:00", "working_hours_start": "08:00", "response_delay_max_ms": 5000, "response_delay_min_ms": 2000, "auto_pause_after_human_reply": true, "max_messages_per_conversation": 50}'::jsonb,
    model text DEFAULT 'gpt-4o-mini'::text,
    temperature numeric(3,2) DEFAULT 0.7,
    max_tokens integer DEFAULT 500,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    cadence_steps jsonb DEFAULT '{}'::jsonb
);


--
-- Name: analysis_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analysis_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    prompt text NOT NULL,
    category text DEFAULT 'call_analysis'::text NOT NULL,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: asaas_customers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asaas_customers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    asaas_customer_id text NOT NULL,
    name text NOT NULL,
    cpf_cnpj text NOT NULL,
    email text,
    phone text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: asaas_webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asaas_webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_type text NOT NULL,
    asaas_payment_id text,
    payload jsonb NOT NULL,
    processed boolean DEFAULT false,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: calendar_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    google_event_id text NOT NULL,
    calendar_id text DEFAULT 'primary'::text NOT NULL,
    team_member_id uuid,
    title text NOT NULL,
    description text,
    location text,
    start_datetime timestamp with time zone NOT NULL,
    end_datetime timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false,
    timezone text DEFAULT 'America/Sao_Paulo'::text,
    attendees jsonb DEFAULT '[]'::jsonb,
    organizer_email text,
    meet_link text,
    html_link text,
    status text DEFAULT 'confirmed'::text,
    lead_id uuid,
    deal_id uuid,
    raw_event jsonb,
    synced_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: calendar_sync_channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendar_sync_channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid NOT NULL,
    channel_id text NOT NULL,
    resource_id text NOT NULL,
    calendar_id text DEFAULT 'primary'::text,
    expiration timestamp with time zone NOT NULL,
    sync_token text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: call_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.call_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    wavoip_device_id uuid,
    wavoip_call_id text,
    wavoip_session_id text,
    team_member_id uuid,
    lead_id uuid,
    call_type text DEFAULT 'whatsapp'::text NOT NULL,
    direction text NOT NULL,
    status text DEFAULT 'CALLING'::text NOT NULL,
    caller_phone text,
    receiver_phone text,
    peer_phone text,
    peer_name text,
    peer_profile_picture text,
    duration_seconds integer DEFAULT 0,
    record_status text,
    record_url text,
    transcription text,
    ai_summary text,
    ai_sentiment text,
    ai_key_points jsonb DEFAULT '[]'::jsonb,
    ai_suggested_tasks jsonb DEFAULT '[]'::jsonb,
    ai_processed_at timestamp with time zone,
    ai_processing_error text,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    transcriptions jsonb DEFAULT '[]'::jsonb,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: campaign_instance_stats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_instance_stats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    instance_id uuid NOT NULL,
    date date DEFAULT CURRENT_DATE NOT NULL,
    messages_sent_hour integer DEFAULT 0,
    messages_sent_day integer DEFAULT 0,
    blocks_detected_day integer DEFAULT 0,
    warmup_started_at timestamp with time zone,
    warmup_day integer DEFAULT 0,
    daily_limit_override integer,
    cooldown_until timestamp with time zone,
    last_block_at timestamp with time zone,
    hour_bucket integer DEFAULT EXTRACT(hour FROM now()) NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaign_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    resolved_message text,
    instance_id uuid,
    whatsapp_message_id text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    read_at timestamp with time zone,
    responded_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_message text,
    retry_count integer DEFAULT 0,
    assigned_to uuid,
    response_message_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT campaign_leads_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'sending'::text, 'sent'::text, 'delivered'::text, 'read'::text, 'responded'::text, 'failed'::text, 'blocked'::text, 'skipped'::text])))
);


--
-- Name: campaign_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaign_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'campaign'::text,
    variables text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    template_id uuid,
    message_content text NOT NULL,
    audience_filters jsonb DEFAULT '{}'::jsonb NOT NULL,
    audience_count integer DEFAULT 0,
    instance_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    assignment_mode text DEFAULT 'keep_current'::text NOT NULL,
    assignment_target_id uuid,
    assignment_distribution_config_id uuid,
    scheduled_at timestamp with time zone,
    business_hours_start time without time zone DEFAULT '08:00:00'::time without time zone,
    business_hours_end time without time zone DEFAULT '20:00:00'::time without time zone,
    delay_min_seconds integer DEFAULT 45,
    delay_max_seconds integer DEFAULT 90,
    batch_size integer DEFAULT 20,
    batch_pause_min_seconds integer DEFAULT 180,
    batch_pause_max_seconds integer DEFAULT 300,
    hourly_limit_per_instance integer DEFAULT 40,
    daily_limit_per_instance integer DEFAULT 500,
    total_leads integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    read_count integer DEFAULT 0,
    responded_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    blocked_count integer DEFAULT 0,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone,
    pause_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    message_contents jsonb DEFAULT '[]'::jsonb,
    CONSTRAINT campaigns_assignment_mode_check CHECK ((assignment_mode = ANY (ARRAY['sdr_round_robin'::text, 'specific_sdr'::text, 'closer_round_robin'::text, 'specific_closer'::text, 'keep_current'::text]))),
    CONSTRAINT campaigns_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'scheduled'::text, 'sending'::text, 'paused'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: chat_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    slug text NOT NULL,
    display_name text NOT NULL,
    system_prompt text NOT NULL,
    model text DEFAULT 'claude-3-5-sonnet-20241022'::text NOT NULL,
    temperature numeric DEFAULT 0.2,
    top_p numeric DEFAULT 1,
    tools jsonb DEFAULT '[]'::jsonb,
    provider text DEFAULT 'anthropic'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: chat_configurations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_configurations (
    id integer NOT NULL,
    config_type character varying NOT NULL,
    user_id character varying,
    config_data jsonb,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: chat_configurations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_configurations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_configurations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_configurations_id_seq OWNED BY public.chat_configurations.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    role text NOT NULL,
    content text NOT NULL,
    tool_name text,
    token_count integer,
    raw jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: chat_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    title text DEFAULT 'Nova conversa'::text,
    created_by uuid,
    summary text,
    token_budget integer DEFAULT 120000,
    last_response_id text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: client_onboarding_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_onboarding_data (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    organization_id uuid,
    lead_id uuid,
    current_stage text,
    data jsonb DEFAULT '{}'::jsonb,
    completion_percent integer DEFAULT 0,
    transcript text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: coach_playbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(100) NOT NULL,
    type character varying(20) DEFAULT 'sales'::character varying NOT NULL,
    description text,
    context text,
    phases jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_by uuid,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: coach_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coach_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_id uuid,
    playbook_id uuid,
    lead_id uuid,
    team_member_id uuid,
    briefing text,
    current_phase_index integer DEFAULT 0,
    checklist_state jsonb DEFAULT '{}'::jsonb,
    events jsonb DEFAULT '[]'::jsonb,
    phases_completed integer DEFAULT 0,
    alerts_triggered integer DEFAULT 0,
    suggestions_shown integer DEFAULT 0,
    started_at timestamp with time zone DEFAULT now(),
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: commission_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    sales_rep_id uuid,
    product_id text,
    commission_type text NOT NULL,
    commission_value numeric(10,2) NOT NULL,
    payment_trigger text DEFAULT 'on_payment'::text NOT NULL,
    calculate_on character varying DEFAULT 'gross'::character varying,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    valid_from date,
    valid_to date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    deal_payment_id uuid,
    sales_rep_id uuid NOT NULL,
    commission_rule_id uuid,
    base_amount numeric(12,2) NOT NULL,
    gateway_fee_amount numeric(12,2) DEFAULT 0,
    net_amount numeric(12,2) DEFAULT 0,
    commission_amount numeric(12,2) NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    payment_reference text,
    reference_date timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: company_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.company_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    priority text DEFAULT 'medium'::text,
    assignee text,
    date date,
    completed boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    meeting_id uuid,
    parent_task_id uuid,
    source_type text,
    source_id uuid,
    ai_generated boolean DEFAULT false,
    status text DEFAULT 'not_started'::text,
    due_datetime timestamp with time zone,
    responsavel_id uuid,
    created_by_id uuid,
    task_type text DEFAULT 'internal'::text,
    team text DEFAULT 'internal'::text,
    lead_id uuid,
    organization_id uuid,
    notes text,
    completed_at timestamp with time zone,
    reminder_at timestamp with time zone,
    scheduled_at timestamp with time zone,
    confirmed_by_client boolean DEFAULT false,
    client_contact_method text,
    meeting_link text,
    product_id text,
    participants uuid[],
    end_datetime timestamp with time zone,
    is_all_day boolean DEFAULT false,
    google_event_id text,
    google_calendar_synced boolean DEFAULT false,
    outcome text,
    metadata jsonb DEFAULT '{}'::jsonb,
    reminder_sent_at timestamp with time zone,
    call_channel text,
    call_duration_seconds integer,
    recording_url text,
    external_call_id text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);

ALTER TABLE ONLY public.company_activities REPLICA IDENTITY FULL;


--
-- Name: config_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.config_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id text NOT NULL,
    action text NOT NULL,
    changed_by_user_id uuid,
    changed_by_name text,
    old_data jsonb,
    new_data jsonb,
    changed_fields text[],
    tenant_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: cs_conversation_handled; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_conversation_handled (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    group_id uuid,
    handled_by uuid,
    handled_at timestamp with time zone DEFAULT now(),
    reason text,
    notes text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_conversation_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_conversation_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    group_id uuid,
    content text NOT NULL,
    note_type text DEFAULT 'general'::text,
    created_by uuid,
    is_pinned boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_engagement_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_engagement_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    member_area_last_access timestamp with time zone,
    member_area_total_lessons integer DEFAULT 0,
    member_area_completed_lessons integer DEFAULT 0,
    member_area_time_spent_minutes integer DEFAULT 0,
    whatsapp_group_last_message timestamp with time zone,
    whatsapp_group_total_messages integer DEFAULT 0,
    whatsapp_support_last_message timestamp with time zone,
    whatsapp_support_total_tickets integer DEFAULT 0,
    zoom_last_participation timestamp with time zone,
    zoom_total_participations integer DEFAULT 0,
    zoom_total_minutes integer DEFAULT 0,
    product_last_login timestamp with time zone,
    product_total_logins integer DEFAULT 0,
    product_features_used jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_event_rsvps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_event_rsvps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    event_id uuid NOT NULL,
    guest_name character varying NOT NULL,
    guest_email character varying NOT NULL,
    guest_phone character varying,
    guest_company character varying,
    lead_id uuid,
    organization_id uuid,
    is_client boolean DEFAULT false,
    rsvp_status character varying DEFAULT 'confirmed'::character varying NOT NULL,
    confirmed_at timestamp with time zone DEFAULT now(),
    has_companion boolean DEFAULT false,
    companion_name character varying,
    companion_email character varying,
    companion_phone character varying,
    checked_in_at timestamp with time zone,
    checked_in_by uuid,
    companion_checked_in boolean DEFAULT false,
    companion_checked_in_at timestamp with time zone,
    dietary_restrictions character varying,
    notes text,
    custom_answers jsonb DEFAULT '{}'::jsonb,
    source character varying DEFAULT 'public_form'::character varying,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    slug character varying,
    start_date date NOT NULL,
    end_date date,
    start_time time without time zone,
    end_time time without time zone,
    location character varying,
    location_details text,
    is_online boolean DEFAULT false,
    online_link character varying,
    capacity integer,
    rsvp_token character varying DEFAULT encode(extensions.gen_random_bytes(16), 'hex'::text) NOT NULL,
    rsvp_enabled boolean DEFAULT true,
    rsvp_deadline timestamp with time zone,
    allow_companion boolean DEFAULT false,
    max_companions_per_guest integer DEFAULT 1,
    product_id text,
    custom_questions jsonb DEFAULT '[]'::jsonb,
    settings jsonb DEFAULT '{}'::jsonb,
    banner_url character varying,
    status character varying DEFAULT 'draft'::character varying,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    guide_url character varying,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_health_current; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_health_current (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    overall_score integer NOT NULL,
    health_status public.health_status NOT NULL,
    engagement_score integer,
    objectives_score integer,
    sentiment_score integer,
    usage_score integer,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_health_scores_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_health_scores_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    overall_score integer NOT NULL,
    health_status public.health_status NOT NULL,
    engagement_score integer,
    objectives_score integer,
    sentiment_score integer,
    usage_score integer,
    calculated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_inbox_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_inbox_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    group_id uuid,
    instance_id uuid,
    conversation_key text NOT NULL,
    first_customer_message_at timestamp with time zone,
    last_customer_message_at timestamp with time zone,
    first_response_at timestamp with time zone,
    last_response_at timestamp with time zone,
    is_waiting_response boolean DEFAULT false,
    wait_started_at timestamp with time zone,
    sla_status text DEFAULT 'ok'::text,
    sla_breached_at timestamp with time zone,
    total_sla_breaches integer DEFAULT 0,
    assigned_agent_id uuid,
    assigned_at timestamp with time zone,
    total_messages_received integer DEFAULT 0,
    total_messages_sent integer DEFAULT 0,
    total_interactions integer DEFAULT 0,
    avg_response_time_minutes numeric(10,2),
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text,
    member_id uuid,
    interaction_timestamp timestamp with time zone DEFAULT now(),
    type public.interaction_type NOT NULL,
    title text NOT NULL,
    description text,
    sentiment public.sentiment,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    scheduled_at timestamp with time zone,
    status text DEFAULT 'active'::text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_objectives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_objectives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    description text NOT NULL,
    deadline date NOT NULL,
    days_target integer NOT NULL,
    status public.objective_status DEFAULT 'pending'::public.objective_status,
    completed_at timestamp with time zone,
    assigned_to uuid,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_response_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_response_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    content text NOT NULL,
    category text DEFAULT 'geral'::text,
    shortcut text,
    product_id text,
    team text DEFAULT 'cs'::text,
    usage_count integer DEFAULT 0,
    created_by uuid,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_success_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_success_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    testimonial_collected boolean DEFAULT false,
    testimonial_date date,
    testimonial_content text,
    testimonial_rating integer,
    testimonial_video_url text,
    upsell_done boolean DEFAULT false,
    upsell_value numeric,
    upsell_product text,
    upsell_date date,
    referrals_count integer DEFAULT 0,
    referrals_target integer DEFAULT 10,
    referrals_converted integer DEFAULT 0,
    is_success_case boolean DEFAULT false,
    success_case_url text,
    success_case_published_at timestamp with time zone,
    nps_score integer,
    nps_collected_at timestamp with time zone,
    nps_feedback text,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: cs_touchpoints; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cs_touchpoints (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    touchpoint_date date NOT NULL,
    type public.touchpoint_type NOT NULL,
    channel public.touchpoint_channel NOT NULL,
    summary text NOT NULL,
    sentiment public.sentiment,
    next_action text,
    next_contact_date date,
    created_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: deal_contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    role text,
    is_primary boolean DEFAULT false,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: deal_loss_reasons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_loss_reasons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    "position" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: deal_payment_installments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_payment_installments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_payment_id uuid NOT NULL,
    installment_number integer NOT NULL,
    amount numeric(12,2) NOT NULL,
    due_date date NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    asaas_installment_id text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: deal_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deal_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    deal_id uuid NOT NULL,
    payer_lead_id uuid,
    description text,
    billing_type text NOT NULL,
    gateway text DEFAULT 'asaas'::text,
    amount numeric(12,2) NOT NULL,
    installments integer DEFAULT 1,
    installment_value numeric(12,2),
    asaas_payment_id text,
    asaas_invoice_number text,
    payment_link text,
    invoice_url text,
    status text DEFAULT 'pending'::text NOT NULL,
    due_date date NOT NULL,
    paid_at timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    lead_id uuid NOT NULL,
    product_id text,
    sales_rep_id uuid,
    pipeline_id uuid,
    pipeline_stage_id uuid,
    title text,
    original_price numeric(10,2),
    negotiated_price numeric(10,2),
    discount_percent numeric(5,2),
    discount_reason text,
    payment_method text,
    installments integer DEFAULT 1,
    status text DEFAULT 'negotiation'::text,
    expected_close_date date,
    won_at timestamp with time zone,
    lost_at timestamp with time zone,
    lost_reason text,
    proposal_sent_at timestamp with time zone,
    proposal_url text,
    ai_win_probability integer DEFAULT 0,
    ai_proposal_suggestion jsonb,
    notes text,
    metadata jsonb,
    total_paid numeric(12,2) DEFAULT 0,
    payment_status text DEFAULT 'pending'::text,
    utm_source text,
    utm_campaign text,
    utm_content text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    stage_changed_at timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);

ALTER TABLE ONLY public.deals REPLICA IDENTITY FULL;


--
-- Name: email_campaign_leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaign_leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    campaign_id uuid NOT NULL,
    lead_id uuid,
    email text NOT NULL,
    name text,
    status text DEFAULT 'pending'::text NOT NULL,
    brevo_message_id text,
    sent_at timestamp with time zone,
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    bounced_at timestamp with time zone,
    complained_at timestamp with time zone,
    unsubscribed_at timestamp with time zone,
    failed_at timestamp with time zone,
    error_message text,
    open_count integer DEFAULT 0,
    click_count integer DEFAULT 0,
    clicked_urls text[] DEFAULT '{}'::text[],
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    template_id uuid,
    subject text DEFAULT ''::text NOT NULL,
    from_name text DEFAULT ''::text NOT NULL,
    from_email text DEFAULT ''::text NOT NULL,
    reply_to text,
    html_content text,
    audience_filters jsonb DEFAULT '{}'::jsonb,
    total_leads integer DEFAULT 0,
    sent_count integer DEFAULT 0,
    delivered_count integer DEFAULT 0,
    opened_count integer DEFAULT 0,
    clicked_count integer DEFAULT 0,
    bounced_count integer DEFAULT 0,
    complained_count integer DEFAULT 0,
    unsubscribed_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    completed_at timestamp with time zone,
    paused_at timestamp with time zone,
    pause_reason text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequence_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequence_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    lead_id uuid,
    email text NOT NULL,
    name text,
    status text DEFAULT 'active'::text NOT NULL,
    current_step integer DEFAULT 0,
    next_step_at timestamp with time zone,
    exit_reason text,
    enrolled_at timestamp with time zone DEFAULT now(),
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequence_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequence_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    enrollment_id uuid NOT NULL,
    step_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    lead_id uuid,
    email text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    brevo_message_id text,
    sent_at timestamp with time zone DEFAULT now(),
    delivered_at timestamp with time zone,
    opened_at timestamp with time zone,
    clicked_at timestamp with time zone,
    bounced_at timestamp with time zone,
    error_message text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequence_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequence_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    sequence_id uuid NOT NULL,
    step_order integer DEFAULT 0 NOT NULL,
    template_id uuid,
    subject text DEFAULT ''::text NOT NULL,
    html_content text,
    delay_days integer DEFAULT 0,
    delay_hours integer DEFAULT 0,
    skip_if_opened boolean DEFAULT false,
    skip_if_clicked boolean DEFAULT false,
    sent_count integer DEFAULT 0,
    opened_count integer DEFAULT 0,
    clicked_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_sequences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_sequences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    description text,
    status text DEFAULT 'draft'::text NOT NULL,
    trigger_type text DEFAULT 'manual'::text,
    trigger_config jsonb DEFAULT '{}'::jsonb,
    from_name text DEFAULT ''::text NOT NULL,
    from_email text DEFAULT ''::text NOT NULL,
    reply_to text,
    exit_on_reply boolean DEFAULT true,
    exit_on_unsubscribe boolean DEFAULT true,
    exit_on_deal_won boolean DEFAULT false,
    exit_on_bounce boolean DEFAULT true,
    total_enrolled integer DEFAULT 0,
    total_completed integer DEFAULT 0,
    total_exited integer DEFAULT 0,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    subject text DEFAULT ''::text NOT NULL,
    html_content text DEFAULT ''::text NOT NULL,
    text_content text,
    design_json jsonb,
    thumbnail_url text,
    category text DEFAULT 'geral'::text,
    variables text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true,
    usage_count integer DEFAULT 0,
    last_used_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: email_unsubscribes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_unsubscribes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    email text NOT NULL,
    lead_id uuid,
    reason text,
    source text DEFAULT 'link'::text,
    unsubscribed_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: financial_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying DEFAULT 'bank_account'::character varying NOT NULL,
    institution character varying,
    description character varying,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    color character varying DEFAULT '#6B7280'::character varying,
    icon character varying DEFAULT 'Wallet'::character varying,
    "position" integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: financial_categories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_categories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    type character varying NOT NULL,
    parent_id uuid,
    color character varying DEFAULT '#6B7280'::character varying,
    icon character varying DEFAULT 'CircleDollarSign'::character varying,
    is_system boolean DEFAULT false,
    "position" integer DEFAULT 0,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: financial_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category_id uuid NOT NULL,
    description character varying NOT NULL,
    amount numeric(12,2) NOT NULL,
    entry_date date NOT NULL,
    type character varying DEFAULT 'expense'::character varying NOT NULL,
    recurrence character varying DEFAULT 'none'::character varying,
    recurrence_end_date date,
    payment_method character varying,
    receipt_url character varying,
    notes text,
    tags text[] DEFAULT '{}'::text[],
    created_by uuid,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    status character varying DEFAULT 'paid'::character varying,
    due_date date,
    paid_at timestamp with time zone,
    financial_account_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: franchise_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franchise_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    name text NOT NULL,
    api_key uuid DEFAULT gen_random_uuid() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    min_capital_tier text DEFAULT 'acima_de_r$_100_mil'::text NOT NULL,
    whatsapp_instance_id uuid,
    also_distribute_to_sellers boolean DEFAULT true NOT NULL,
    message_template text DEFAULT '🔔 *Novo Lead - {{campaign_name}}*

*Nome:* {{lead_name}}
*Tel:* {{lead_phone}}
*Email:* {{lead_email}}
*Cidade:* {{lead_city}}/{{lead_state}}
*Capital:* {{lead_capital}}
*Horário:* {{lead_horario}}

*Vendedor acompanhando:* {{seller_name}}'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: franchise_distribution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franchise_distribution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    franchise_member_id uuid NOT NULL,
    lead_id uuid,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    whatsapp_sent boolean DEFAULT false,
    whatsapp_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: franchise_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.franchise_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    campaign_id uuid NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    name text NOT NULL,
    phone text NOT NULL,
    cities text[] DEFAULT '{}'::text[],
    is_active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    utm_identifier text
);


--
-- Name: google_ads_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    account_name text,
    organization_id uuid,
    is_active boolean DEFAULT true,
    last_synced_date date,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: google_ads_campaign_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_campaign_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    organization_id uuid,
    campaign_id text NOT NULL,
    campaign_name text,
    date date NOT NULL,
    impressions bigint DEFAULT 0,
    clicks bigint DEFAULT 0,
    cost_micros bigint DEFAULT 0,
    conversions numeric DEFAULT 0,
    ctr numeric,
    average_cpc_micros bigint,
    campaign_status text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: google_ads_daily_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.google_ads_daily_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    organization_id uuid,
    date date NOT NULL,
    impressions bigint DEFAULT 0,
    clicks bigint DEFAULT 0,
    cost_micros bigint DEFAULT 0,
    conversions numeric DEFAULT 0,
    ctr numeric,
    average_cpc_micros bigint,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: import_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.import_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    created_by uuid,
    file_name text,
    total_rows integer DEFAULT 0,
    created_count integer DEFAULT 0,
    updated_count integer DEFAULT 0,
    skipped_count integer DEFAULT 0,
    failed_count integer DEFAULT 0,
    config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: instagram_business_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_business_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    facebook_page_id text,
    instagram_business_id text,
    instagram_username text NOT NULL,
    access_token text NOT NULL,
    token_expires_at timestamp with time zone,
    name text NOT NULL,
    status text DEFAULT 'connected'::text,
    teams text[] DEFAULT '{comercial}'::text[],
    webhook_verify_token text,
    profile_picture_url text,
    followers_count integer,
    biography text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: instagram_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    lead_id uuid,
    comment_id text NOT NULL,
    post_id text NOT NULL,
    post_url text,
    post_thumbnail_url text,
    parent_comment_id text,
    author_instagram_id text NOT NULL,
    author_username text,
    author_name text,
    author_profile_pic text,
    content text NOT NULL,
    status text DEFAULT 'new'::text,
    replied_at timestamp with time zone,
    replied_by uuid,
    reply_content text,
    commented_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: instagram_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    lead_id uuid,
    thread_id text NOT NULL,
    participant_instagram_id text NOT NULL,
    participant_username text,
    participant_name text,
    participant_profile_pic text,
    status text DEFAULT 'open'::text,
    assigned_to uuid,
    social_seller_stage_id uuid,
    stage_changed_at timestamp with time zone,
    stage_changed_by uuid,
    last_message text,
    last_message_at timestamp with time zone,
    last_client_message_at timestamp with time zone,
    last_agent_message_at timestamp with time zone,
    unread_count integer DEFAULT 0,
    total_messages integer DEFAULT 0,
    first_response_at timestamp with time zone,
    avg_response_time_minutes integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: instagram_engagement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_engagement (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    account_id uuid NOT NULL,
    total_dms integer DEFAULT 0,
    total_comments integer DEFAULT 0,
    total_story_replies integer DEFAULT 0,
    total_story_mentions integer DEFAULT 0,
    total_post_shares integer DEFAULT 0,
    last_dm_at timestamp with time zone,
    last_comment_at timestamp with time zone,
    last_story_reply_at timestamp with time zone,
    last_interaction_at timestamp with time zone,
    dms_last_7_days integer DEFAULT 0,
    dms_last_30_days integer DEFAULT 0,
    interactions_last_7_days integer DEFAULT 0,
    interactions_last_30_days integer DEFAULT 0,
    engagement_score integer DEFAULT 0,
    first_interaction_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: instagram_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.instagram_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    instagram_message_id text,
    content text,
    message_type text DEFAULT 'text'::text,
    media_url text,
    is_from_me boolean DEFAULT false,
    sender_instagram_id text,
    sender_username text,
    reference_type text,
    reference_id text,
    reference_url text,
    reference_preview_url text,
    status text DEFAULT 'delivered'::text,
    error_message text,
    sent_at timestamp with time zone NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: integration_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    provider text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: lead_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid NOT NULL,
    conversion_type text DEFAULT 'new'::text NOT NULL,
    source text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    extra_data jsonb DEFAULT '{}'::jsonb,
    sales_rep_id uuid,
    deal_id uuid,
    origin text DEFAULT 'api'::text,
    raw_payload jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: TABLE lead_conversions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.lead_conversions IS 'Rastreia cada conversão/cadastro de um lead - primeira conversão e reconversões';


--
-- Name: COLUMN lead_conversions.conversion_type; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_conversions.conversion_type IS 'new = primeiro cadastro, reconversion = se cadastrou de novo';


--
-- Name: COLUMN lead_conversions.origin; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.lead_conversions.origin IS 'De onde veio: rdstation, api, pain_registration, manual';


--
-- Name: lead_diagnostics_v2; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_diagnostics_v2 (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    lead_id uuid NOT NULL,
    business_stage character varying NOT NULL,
    age character varying,
    gender character varying,
    motivation text,
    ai_challenges text,
    monthly_revenue character varying,
    ai_course_experience character varying,
    biggest_dream text,
    immersion_content text,
    business_description text,
    time_consuming text,
    current_activity text,
    income_types text,
    qualification_score integer,
    other_goal text,
    which_ai_course text,
    ai_knowledge_level text,
    ai_knowledge_detail text,
    event_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: lead_distribution_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_distribution_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Distribuição Padrão'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    method text DEFAULT 'round_robin'::text NOT NULL,
    pipeline_id uuid,
    product_id text,
    first_stage_id uuid,
    require_availability boolean DEFAULT false NOT NULL,
    auto_create_deal boolean DEFAULT true NOT NULL,
    api_key uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    CONSTRAINT lead_distribution_config_method_check CHECK ((method = ANY (ARRAY['round_robin'::text, 'weighted'::text, 'by_source'::text])))
);


--
-- Name: lead_distribution_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_distribution_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid,
    lead_id uuid,
    deal_id uuid,
    team_member_id uuid,
    method_used text DEFAULT 'round_robin'::text NOT NULL,
    source text DEFAULT 'api'::text NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: lead_distribution_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lead_distribution_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid NOT NULL,
    team_member_id uuid NOT NULL,
    weight integer DEFAULT 1 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    email text,
    phone text,
    instagram text,
    region text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_content text,
    utm_term text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    last_interaction_at timestamp with time zone DEFAULT now(),
    last_message_sent_at timestamp with time zone,
    last_message_received_at timestamp with time zone,
    messages_count integer DEFAULT 0,
    engagement_score integer DEFAULT 0,
    document character varying(20),
    address text,
    address_number character varying(20),
    address_complement character varying(100),
    address_province character varying(100),
    postal_code character varying(10),
    city_name character varying(100),
    state character varying(50),
    country character varying(50),
    person_type character varying(20),
    sales_rep_id uuid,
    sales_stage text DEFAULT 'new'::text,
    sales_score integer DEFAULT 0,
    sales_score_reason text,
    bant_budget boolean,
    bant_authority boolean,
    bant_need boolean,
    bant_timeline boolean,
    expected_revenue numeric,
    ai_conversation_insights jsonb,
    ai_proposal_suggestion jsonb,
    ai_last_analysis_at timestamp with time zone,
    cpf_cnpj text,
    pipeline_stage_id uuid,
    attachments text[] DEFAULT '{}'::text[],
    context text,
    status text DEFAULT 'new'::text,
    instagram_id text,
    instagram_verified_at timestamp with time zone,
    company_name text,
    job_title text,
    photo_url text,
    source text,
    capital_disponivel text,
    melhor_horario_contato text,
    metadata jsonb DEFAULT '{}'::jsonb,
    is_internal_contact boolean DEFAULT false,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    timing_negocio text,
    regiao_interesse text,
    pode_completar_capital boolean,
    qualification jsonb DEFAULT '{}'::jsonb,
    franchise_campaign_id uuid,
    franchise_member_id uuid,
    franchise_member_name text,
    franchise_member_phone text,
    original_source text,
    original_utm_source text,
    original_utm_medium text,
    original_utm_campaign text,
    original_utm_content text,
    original_utm_term text,
    email_opted_out boolean DEFAULT false
);


--
-- Name: COLUMN leads.utm_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.utm_source IS 'utm_source da última conversão (atualizado a cada reconversão)';


--
-- Name: COLUMN leads.source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.source IS 'Source da última conversão (atualizado a cada reconversão)';


--
-- Name: COLUMN leads.is_internal_contact; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.is_internal_contact IS 'Marks lead as internal contact (team member, partner, etc). Excluded from metrics, pipeline, focus mode.';


--
-- Name: COLUMN leads.qualification; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.qualification IS 'Campos de qualificação coletados pelo agente IA (business_type, years_in_business, business_model, unit_count, growth_objective, has_structured_team, monthly_revenue, is_qualified, qualification_reason)';


--
-- Name: COLUMN leads.original_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.original_source IS 'Source da primeira conversão (nunca sobrescrito)';


--
-- Name: COLUMN leads.original_utm_source; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.leads.original_utm_source IS 'utm_source da primeira conversão (nunca sobrescrito)';


--
-- Name: llm_provider_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.llm_provider_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    provider text NOT NULL,
    api_key text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT llm_provider_configs_provider_check CHECK ((provider = ANY (ARRAY['anthropic'::text, 'openai'::text, 'gemini'::text, 'groq'::text, 'deepseek'::text])))
);


--
-- Name: marketing_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
    name text NOT NULL,
    description text,
    fields jsonb DEFAULT '[]'::jsonb NOT NULL,
    style jsonb DEFAULT '{}'::jsonb NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb NOT NULL,
    redirect_url text,
    success_message text DEFAULT 'Obrigado! Entraremos em contato em breve.'::text,
    is_active boolean DEFAULT true,
    submissions_count integer DEFAULT 0,
    last_submission_at timestamp with time zone,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE marketing_forms; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.marketing_forms IS 'Formulários embeddáveis para landing pages';


--
-- Name: COLUMN marketing_forms.fields; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_forms.fields IS 'Array de campos: [{id, type, label, placeholder, required, options, mask}]';


--
-- Name: COLUMN marketing_forms.style; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_forms.style IS 'Customização visual: {primary_color, bg_color, text_color, border_radius, font_family, logo_url}';


--
-- Name: COLUMN marketing_forms.settings; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.marketing_forms.settings IS 'Config: {distribution_key, source_name, show_logo, compact_mode}';


--
-- Name: meetings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meetings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    type text,
    participants jsonb NOT NULL,
    transcriptions jsonb,
    summary text,
    key_points jsonb,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    status text DEFAULT 'active'::text,
    organization_id uuid,
    lead_id uuid,
    activity_id uuid,
    created_by uuid,
    meeting_link character varying(500),
    meeting_type character varying(50) DEFAULT 'interno'::character varying,
    team character varying(50),
    audio_url character varying(500),
    soniox_session_id character varying(255),
    ai_analysis jsonb,
    processed_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    CONSTRAINT meetings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'completed'::text, 'no_show'::text, 'cancelled'::text])))
);


--
-- Name: member_calls_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_calls_history (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    member_email text,
    member_user_id uuid,
    call_id uuid,
    call_title text,
    call_type text,
    call_date timestamp with time zone,
    join_time timestamp with time zone,
    leave_time timestamp with time zone,
    duration_minutes integer,
    call_total_duration integer,
    attendance_percentage numeric,
    created_at timestamp with time zone DEFAULT now(),
    lead_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: member_daily_activity; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_daily_activity (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    member_email text,
    member_user_id uuid,
    activity_date date,
    sessions integer,
    page_views integer,
    time_minutes integer,
    lessons_watched integer,
    lessons_completed integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lead_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: member_engagement_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_engagement_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    member_user_id_external uuid,
    member_email text,
    member_name text,
    member_user_id uuid,
    snapshot_hour timestamp with time zone,
    last_access timestamp with time zone,
    days_since_last_access integer,
    total_sessions integer,
    sessions_last_7_days integer,
    sessions_last_30_days integer,
    total_time_minutes integer,
    lessons_started integer,
    lessons_completed integer,
    lessons_completion_rate numeric,
    calls_attended integer,
    calls_total_minutes integer,
    last_call_date timestamp with time zone,
    risk_score integer,
    risk_status text,
    created_at timestamp with time zone DEFAULT now(),
    lead_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: member_lessons_progress; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.member_lessons_progress (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    member_user_id uuid,
    member_email text,
    lesson_id text,
    lesson_title text,
    project_id text,
    completed boolean DEFAULT false,
    seconds_watched integer DEFAULT 0,
    completed_at timestamp with time zone,
    started_at timestamp with time zone,
    last_watched_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    lead_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_ads_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    account_name text,
    is_active boolean DEFAULT true,
    last_synced_date date,
    is_syncing boolean DEFAULT false,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_ads_ad_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_ad_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    ad_id text NOT NULL,
    ad_name text,
    campaign_id text,
    campaign_name text,
    adset_id text,
    adset_name text,
    date date NOT NULL,
    aggregation_level text NOT NULL,
    spend numeric DEFAULT 0,
    impressions bigint DEFAULT 0,
    clicks bigint DEFAULT 0,
    ctr numeric DEFAULT 0,
    cpc numeric DEFAULT 0,
    frequency numeric DEFAULT 0,
    image_url text,
    thumbnail_url text,
    link_url text,
    body text,
    headline text,
    description text,
    status text,
    total_conversions bigint DEFAULT 0,
    primary_conversions bigint DEFAULT 0,
    cost_per_conversion numeric DEFAULT 0,
    campaign_objective text,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_ads_conversions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_conversions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ad_data_id uuid,
    conversion_type text NOT NULL,
    conversion_count bigint DEFAULT 0,
    conversion_value numeric DEFAULT 0,
    cost_per_conversion numeric DEFAULT 0,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_ads_daily_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_daily_data (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text NOT NULL,
    date date NOT NULL,
    aggregation_level text NOT NULL,
    total_spend numeric DEFAULT 0,
    total_impressions bigint DEFAULT 0,
    total_clicks bigint DEFAULT 0,
    total_leads bigint DEFAULT 0,
    ctr numeric DEFAULT 0,
    cpl numeric DEFAULT 0,
    conversion_rate numeric DEFAULT 0,
    frequency numeric DEFAULT 0,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_ads_sync_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_ads_sync_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id text,
    sync_type text NOT NULL,
    start_date date,
    end_date date,
    status text DEFAULT 'running'::text NOT NULL,
    records_processed integer DEFAULT 0,
    error_message text,
    execution_time_ms integer,
    completed_at timestamp with time zone,
    organization_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: meta_lead_ads_forms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_lead_ads_forms (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    page_id text NOT NULL,
    form_id text NOT NULL,
    form_name text NOT NULL,
    is_enabled boolean DEFAULT true,
    leads_count integer DEFAULT 0,
    last_lead_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: meta_lead_ads_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_lead_ads_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    page_id text,
    form_id text,
    form_name text,
    leadgen_id text,
    lead_name text,
    lead_email text,
    lead_phone text,
    status text DEFAULT 'success'::text,
    error_message text,
    lead_id uuid,
    deal_id uuid,
    assigned_to_name text,
    raw_data jsonb,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: meta_lead_ads_pages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.meta_lead_ads_pages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    page_id text NOT NULL,
    page_name text NOT NULL,
    page_access_token text NOT NULL,
    is_active boolean DEFAULT true,
    total_leads_synced integer DEFAULT 0,
    last_lead_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: migration_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_offset integer DEFAULT 0 NOT NULL,
    deals_processed integer DEFAULT 0,
    leads_created integer DEFAULT 0,
    leads_deduped integer DEFAULT 0,
    deals_created integer DEFAULT 0,
    activities_created integer DEFAULT 0,
    errors integer DEFAULT 0,
    error_details jsonb,
    status text DEFAULT 'BATCH_COMPLETE'::text NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rule_id uuid,
    rule_name character varying(255),
    event_id uuid,
    event_type character varying(50),
    channel character varying(50),
    target character varying(255),
    message text,
    status character varying(50) DEFAULT 'pending'::character varying,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: notification_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    trigger_type character varying(50) NOT NULL,
    trigger_event character varying(50),
    trigger_minutes integer,
    trigger_time time without time zone,
    trigger_days character varying[],
    action_channel character varying(50) NOT NULL,
    action_target_type character varying(50),
    action_target_id character varying(255),
    action_target_phone character varying(50),
    message_template text NOT NULL,
    enabled boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    action_instance_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: onboarding_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboarding_stages (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    "position" integer DEFAULT 0 NOT NULL,
    icon text DEFAULT 'circle'::text,
    color text DEFAULT '#6B7280'::text,
    is_final boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    checklist jsonb DEFAULT '[]'::jsonb
);


--
-- Name: onboardings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.onboardings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid,
    meeting_id uuid,
    activity_id uuid,
    product_id text DEFAULT 'pain'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    transcription_source text,
    transcription_raw text,
    dossier jsonb DEFAULT '{}'::jsonb,
    form_token text,
    form_url text,
    form_sent_at timestamp with time zone,
    form_opened_at timestamp with time zone,
    form_completed_at timestamp with time zone,
    confirmed_data jsonb DEFAULT '{}'::jsonb,
    additional_members jsonb DEFAULT '[]'::jsonb,
    plan text DEFAULT 'basic'::text,
    seats_limit integer DEFAULT 5,
    add_to_whatsapp boolean DEFAULT true,
    send_welcome boolean DEFAULT true,
    journey_config jsonb DEFAULT '{}'::jsonb,
    approved_at timestamp with time zone,
    approved_by uuid,
    rejected_at timestamp with time zone,
    rejected_by uuid,
    rejection_reason text,
    webhook_response jsonb,
    external_org_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    created_by uuid,
    early_access_granted boolean DEFAULT false,
    early_access_at timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    user_id uuid,
    role public.member_role DEFAULT 'member'::public.member_role NOT NULL,
    job_title text,
    is_admin boolean DEFAULT false,
    can_invite boolean DEFAULT false,
    status public.member_status DEFAULT 'active'::public.member_status,
    invited_by uuid,
    invited_at timestamp with time zone,
    joined_at timestamp with time zone,
    invite_token text,
    invite_expires_at timestamp with time zone,
    whatsapp_in_group boolean DEFAULT false,
    whatsapp_added_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: organization_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    organization_id uuid NOT NULL,
    product_id text NOT NULL,
    deal_id uuid,
    starts_at timestamp with time zone,
    expires_at timestamp with time zone,
    onboarding_status public.onboarding_status DEFAULT 'pending'::public.onboarding_status,
    onboarding_started_at timestamp with time zone,
    onboarding_completed_at timestamp with time zone,
    journey_stage public.journey_stage DEFAULT 'pending_onboard'::public.journey_stage,
    cs_status public.cs_status DEFAULT 'active'::public.cs_status,
    cs_rep_id uuid,
    notes text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    primary_contact_id uuid,
    name text NOT NULL,
    slug text NOT NULL,
    org_type public.organization_type DEFAULT 'individual'::public.organization_type NOT NULL,
    plan text DEFAULT 'basic'::text,
    seats_limit integer DEFAULT 1,
    contract_start date,
    contract_end date,
    billing_contact_name text,
    billing_contact_email text,
    billing_contact_phone text,
    logo_url text,
    primary_color text,
    status public.organization_status DEFAULT 'active'::public.organization_status,
    churned_at timestamp with time zone,
    churn_reason text,
    settings jsonb DEFAULT '{}'::jsonb,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    external_member_area_org_id uuid,
    external_member_area_user_id uuid,
    ai_insights jsonb,
    early_access_granted boolean DEFAULT false,
    early_access_at timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: pain_registrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pain_registrations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    name text NOT NULL,
    phone text NOT NULL,
    email text,
    company_name text,
    monthly_revenue text,
    payment_option text,
    status text DEFAULT 'pending'::text,
    notes text,
    assignee text,
    payment_method text,
    payment_details text,
    amount_paid integer DEFAULT 0,
    amount_total integer DEFAULT 0,
    amount_balance integer DEFAULT 0,
    payment_platform text,
    loss_reason text,
    utm_source text,
    utm_medium text,
    utm_campaign text,
    utm_term text,
    utm_content text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: payment_gateway_fees; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_gateway_fees (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gateway_id uuid NOT NULL,
    billing_type character varying NOT NULL,
    fee_percent numeric(5,2) DEFAULT 0 NOT NULL,
    fee_fixed numeric(10,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: payment_gateways; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment_gateways (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    slug character varying NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.products (
    id text NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    logo_url text,
    primary_color text,
    cs_process_type text,
    cs_config jsonb,
    onboarding_required boolean DEFAULT true,
    onboarding_steps jsonb,
    is_active boolean DEFAULT true,
    settings jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    price numeric,
    category text,
    sku text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    email text NOT NULL,
    name text NOT NULL,
    avatar_url text,
    role text DEFAULT 'user'::text NOT NULL,
    team text,
    phone text,
    is_active boolean DEFAULT true,
    google_access_token text,
    google_refresh_token text,
    google_token_expires_at timestamp with time zone,
    google_calendar_connected boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    whatsapp_instance_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: receive_lead_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.receive_lead_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    api_key text,
    config_id uuid,
    origin text,
    lead_name text,
    lead_email text,
    lead_phone text,
    lead_source text,
    status text DEFAULT 'pending'::text NOT NULL,
    lead_id uuid,
    deal_id uuid,
    assigned_to uuid,
    assigned_to_name text,
    dedup_match text,
    existing_lead_id uuid,
    error_message text,
    error_details jsonb,
    raw_payload jsonb,
    processing_ms integer,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_alerts (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    lead_id uuid NOT NULL,
    sales_rep_id uuid,
    alert_type text NOT NULL,
    title text NOT NULL,
    description text,
    priority integer DEFAULT 5,
    is_read boolean DEFAULT false,
    is_actioned boolean DEFAULT false,
    actioned_at timestamp with time zone,
    expires_at timestamp with time zone,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_automation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_automation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type text NOT NULL,
    trigger_conditions jsonb DEFAULT '{}'::jsonb,
    action_type text NOT NULL,
    action_config jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    team text DEFAULT 'sales'::text,
    priority integer DEFAULT 10,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_materials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_materials (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    file_url text NOT NULL,
    thumbnail_url text,
    file_size bigint,
    mime_type character varying(100),
    tags text[] DEFAULT '{}'::text[],
    usage_hint text,
    is_active boolean DEFAULT true,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    lead_id uuid,
    deal_id uuid,
    content text NOT NULL,
    note_type text DEFAULT 'note'::text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_pipeline_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_pipeline_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    "position" integer NOT NULL,
    color text DEFAULT 'gray'::text,
    description text,
    is_won boolean DEFAULT false,
    is_lost boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    pipeline_id uuid NOT NULL,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_pipeline_transitions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_pipeline_transitions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    source_pipeline_id uuid,
    source_stage_id uuid,
    target_pipeline_id uuid,
    target_stage_id uuid,
    action character varying DEFAULT 'move'::character varying,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_pipelines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_pipelines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying NOT NULL,
    description text,
    "position" integer DEFAULT 0,
    is_default boolean DEFAULT false,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    default_sales_rep_id uuid,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sales_playbooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales_playbooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    steps jsonb DEFAULT '[]'::jsonb NOT NULL,
    trigger_conditions jsonb DEFAULT '{}'::jsonb,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: sdr_closer_transfers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sdr_closer_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tenant_id uuid NOT NULL,
    deal_id uuid NOT NULL,
    lead_id uuid NOT NULL,
    sdr_id uuid NOT NULL,
    closer_id uuid,
    from_pipeline_id uuid NOT NULL,
    from_stage_id uuid NOT NULL,
    to_pipeline_id uuid NOT NULL,
    to_stage_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    qualification_snapshot jsonb DEFAULT '{}'::jsonb,
    return_reason text,
    return_notes text,
    transferred_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_at timestamp with time zone,
    returned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT sdr_closer_transfers_return_reason_check CHECK ((return_reason = ANY (ARRAY['no_show'::text, 'not_qualified'::text, 'unreachable'::text, 'other'::text]))),
    CONSTRAINT sdr_closer_transfers_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'returned'::text, 'expired'::text])))
);


--
-- Name: social_seller_alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_seller_alerts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    conversation_id uuid NOT NULL,
    lead_id uuid,
    rule_id uuid,
    alert_type text NOT NULL,
    title text NOT NULL,
    message text,
    trigger_message text,
    detected_keywords text[],
    from_stage text,
    to_stage text,
    status text DEFAULT 'pending'::text,
    viewed_at timestamp with time zone,
    actioned_at timestamp with time zone,
    actioned_by uuid,
    action_notes text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: social_seller_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_seller_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    description text,
    trigger_type text NOT NULL,
    trigger_config jsonb DEFAULT '{}'::jsonb NOT NULL,
    from_stage_id uuid,
    to_stage_id uuid NOT NULL,
    create_alert boolean DEFAULT false,
    alert_message text,
    notify_whatsapp boolean DEFAULT false,
    notification_template text,
    is_active boolean DEFAULT true,
    priority integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: social_seller_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.social_seller_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    color text DEFAULT '#6B7280'::text,
    icon text DEFAULT 'circle'::text,
    "position" integer NOT NULL,
    is_active boolean DEFAULT true,
    is_final boolean DEFAULT false,
    is_converted boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: tenant_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_config (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    tenant_id uuid NOT NULL,
    company_name text NOT NULL,
    logo_url text,
    favicon_url text,
    primary_color text DEFAULT '#c8952e'::text,
    secondary_color text DEFAULT '#7a9182'::text,
    background_color text DEFAULT '#0c0c0e'::text,
    text_color text DEFAULT '#f8f6f1'::text,
    custom_domain text,
    features jsonb DEFAULT '{"agenda": true, "eventos": false, "playbook": true, "comissoes": true, "cs_module": false, "instagram": false, "materiais": true, "modo_foco": true, "financeiro": false, "meta_lead_ads": false, "monitoramento": true, "importar_leads": true, "email_marketing": false, "super_relatorio": true, "campanhas_whatsapp": true}'::jsonb,
    default_pipeline_id uuid,
    commission_type text DEFAULT 'percentual_fixo'::text,
    commission_config jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    api_key text DEFAULT (extensions.uuid_generate_v4())::text
);


--
-- Name: tenants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenants (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: twilio_call_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.twilio_call_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    call_sid text NOT NULL,
    parent_call_sid text,
    call_status text NOT NULL,
    direction text,
    from_number text,
    to_number text,
    caller_id text,
    duration integer,
    sip_response_code text,
    error_code text,
    error_message text,
    "timestamp" timestamp with time zone DEFAULT now(),
    raw_params jsonb,
    call_history_id uuid,
    team_member_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: v_ai_agent_dashboard; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ai_agent_dashboard AS
 SELECT a.id AS agent_id,
    a.name AS agent_name,
    a.is_active,
    a.tenant_id,
    count(DISTINCT c.id) AS total_conversations,
    count(DISTINCT
        CASE
            WHEN (c.status = 'active'::text) THEN c.id
            ELSE NULL::uuid
        END) AS active_conversations,
    count(DISTINCT
        CASE
            WHEN (c.status = 'paused_by_human'::text) THEN c.id
            ELSE NULL::uuid
        END) AS paused_conversations,
    COALESCE(sum(c.total_messages_sent), (0)::bigint) AS total_messages_sent,
    count(DISTINCT q.id) FILTER (WHERE (q.status = 'pending'::text)) AS pending_in_queue,
    count(DISTINCT q.id) FILTER (WHERE (q.status = 'failed'::text)) AS failed_in_queue
   FROM ((public.ai_sales_agents a
     LEFT JOIN public.ai_agent_conversations c ON ((c.agent_id = a.id)))
     LEFT JOIN public.ai_agent_message_queue q ON ((q.lead_id = c.lead_id)))
  GROUP BY a.id, a.name, a.is_active, a.tenant_id;


--
-- Name: wavoip_devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.wavoip_devices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    team_member_id uuid,
    token text NOT NULL,
    name text,
    phone_number text,
    status text DEFAULT 'disconnected'::text,
    webhook_configured boolean DEFAULT false,
    is_active boolean DEFAULT true,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: whatsapp_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid,
    lead_id uuid,
    phone text NOT NULL,
    name text,
    is_admin boolean DEFAULT false,
    joined_at timestamp with time zone DEFAULT now(),
    metadata jsonb DEFAULT '{}'::jsonb,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: whatsapp_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid,
    group_jid text NOT NULL,
    name text,
    description text,
    owner_jid text,
    participant_count integer DEFAULT 0,
    purposes text[] DEFAULT '{}'::text[],
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    photo_url text,
    group_type text DEFAULT 'group'::text,
    is_active boolean DEFAULT true,
    whatsapp_id text,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: whatsapp_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_instances (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    phone_number text,
    teams text[] DEFAULT '{}'::text[],
    status text DEFAULT 'disconnected'::text,
    api_key text,
    webhook_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    api_url character varying(255),
    bypass_disconnect boolean DEFAULT false,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL,
    purpose text DEFAULT 'inbox'::text NOT NULL,
    CONSTRAINT whatsapp_instances_purpose_check CHECK ((purpose = ANY (ARRAY['inbox'::text, 'campaign'::text])))
);

ALTER TABLE ONLY public.whatsapp_instances REPLICA IDENTITY FULL;


--
-- Name: COLUMN whatsapp_instances.bypass_disconnect; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.whatsapp_instances.bypass_disconnect IS 'When true, the disconnect banner is suppressed (e.g. when WhatsApp account is blocked)';


--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    instance_id uuid,
    lead_id uuid,
    group_id uuid,
    message_id text NOT NULL,
    remote_jid text,
    sender_phone text,
    sender_name text,
    content text,
    message_type text DEFAULT 'text'::text,
    media_url text,
    is_from_me boolean DEFAULT false,
    status text DEFAULT 'sent'::text,
    sent_at timestamp with time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now(),
    reactions jsonb DEFAULT '[]'::jsonb,
    is_edited boolean DEFAULT false,
    is_deleted boolean DEFAULT false,
    edited_at timestamp with time zone,
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);

ALTER TABLE ONLY public.whatsapp_messages REPLICA IDENTITY FULL;


--
-- Name: whatsapp_task_bot_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_task_bot_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text DEFAULT 'Bot de Tarefas'::text NOT NULL,
    instance_id uuid,
    bot_mention_id text NOT NULL,
    enabled_group_ids uuid[] DEFAULT '{}'::uuid[],
    ai_prompt text DEFAULT 'Voce e um assistente que cria tarefas a partir de conversas de WhatsApp.'::text NOT NULL,
    context_messages_count integer DEFAULT 20,
    auto_assign_to_sender boolean DEFAULT true,
    default_task_type text DEFAULT 'follow_up'::text,
    notify_on_creation boolean DEFAULT true,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: whatsapp_task_bot_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.whatsapp_task_bot_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    config_id uuid,
    group_id uuid,
    trigger_message_id uuid,
    trigger_content text,
    sender_name text,
    sender_phone text,
    context_messages jsonb,
    ai_response jsonb,
    action_taken text,
    task_id uuid,
    response_message text,
    error text,
    created_at timestamp with time zone DEFAULT now(),
    tenant_id uuid DEFAULT public.get_tenant_id() NOT NULL
);


--
-- Name: _deal_stage_audit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._deal_stage_audit ALTER COLUMN id SET DEFAULT nextval('public._deal_stage_audit_id_seq'::regclass);


--
-- Name: chat_configurations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configurations ALTER COLUMN id SET DEFAULT nextval('public.chat_configurations_id_seq'::regclass);


--
-- Name: _deal_stage_audit _deal_stage_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public._deal_stage_audit
    ADD CONSTRAINT _deal_stage_audit_pkey PRIMARY KEY (id);


--
-- Name: admin_impersonation_tokens admin_impersonation_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_impersonation_tokens
    ADD CONSTRAINT admin_impersonation_tokens_pkey PRIMARY KEY (id);


--
-- Name: admin_impersonation_tokens admin_impersonation_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_impersonation_tokens
    ADD CONSTRAINT admin_impersonation_tokens_token_key UNIQUE (token);


--
-- Name: ai_agent_cadence_enrollments ai_agent_cadence_enrollments_lead_id_agent_id_stage_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_cadence_enrollments
    ADD CONSTRAINT ai_agent_cadence_enrollments_lead_id_agent_id_stage_key UNIQUE (lead_id, agent_id, stage);


--
-- Name: ai_agent_cadence_enrollments ai_agent_cadence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_cadence_enrollments
    ADD CONSTRAINT ai_agent_cadence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_conversations ai_agent_conversations_lead_agent_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_lead_agent_key UNIQUE (lead_id, agent_id);


--
-- Name: ai_agent_conversations ai_agent_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_logs ai_agent_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_message_queue ai_agent_message_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_message_queue
    ADD CONSTRAINT ai_agent_message_queue_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_scheduled_followups ai_agent_scheduled_followups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_scheduled_followups
    ADD CONSTRAINT ai_agent_scheduled_followups_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_send_counts ai_agent_send_counts_instance_id_window_start_window_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_send_counts
    ADD CONSTRAINT ai_agent_send_counts_instance_id_window_start_window_type_key UNIQUE (instance_id, window_start, window_type);


--
-- Name: ai_agent_send_counts ai_agent_send_counts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_send_counts
    ADD CONSTRAINT ai_agent_send_counts_pkey PRIMARY KEY (id);


--
-- Name: ai_agent_tools ai_agent_tools_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_pkey PRIMARY KEY (id);


--
-- Name: ai_sales_agents ai_sales_agents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_sales_agents
    ADD CONSTRAINT ai_sales_agents_pkey PRIMARY KEY (id);


--
-- Name: analysis_templates analysis_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_templates
    ADD CONSTRAINT analysis_templates_pkey PRIMARY KEY (id);


--
-- Name: asaas_customers asaas_customers_asaas_customer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_customers
    ADD CONSTRAINT asaas_customers_asaas_customer_id_key UNIQUE (asaas_customer_id);


--
-- Name: asaas_customers asaas_customers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_customers
    ADD CONSTRAINT asaas_customers_pkey PRIMARY KEY (id);


--
-- Name: asaas_webhooks asaas_webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_webhooks
    ADD CONSTRAINT asaas_webhooks_pkey PRIMARY KEY (id);


--
-- Name: calendar_events calendar_events_google_event_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_google_event_id_key UNIQUE (google_event_id);


--
-- Name: calendar_events calendar_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);


--
-- Name: calendar_sync_channels calendar_sync_channels_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_channels
    ADD CONSTRAINT calendar_sync_channels_channel_id_key UNIQUE (channel_id);


--
-- Name: calendar_sync_channels calendar_sync_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_channels
    ADD CONSTRAINT calendar_sync_channels_pkey PRIMARY KEY (id);


--
-- Name: call_history call_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_pkey PRIMARY KEY (id);


--
-- Name: campaign_instance_stats campaign_instance_stats_instance_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_instance_stats
    ADD CONSTRAINT campaign_instance_stats_instance_id_date_key UNIQUE (instance_id, date);


--
-- Name: campaign_instance_stats campaign_instance_stats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_instance_stats
    ADD CONSTRAINT campaign_instance_stats_pkey PRIMARY KEY (id);


--
-- Name: campaign_leads campaign_leads_campaign_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_campaign_id_lead_id_key UNIQUE (campaign_id, lead_id);


--
-- Name: campaign_leads campaign_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_pkey PRIMARY KEY (id);


--
-- Name: campaign_templates campaign_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: chat_configs chat_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configs
    ADD CONSTRAINT chat_configs_pkey PRIMARY KEY (id);


--
-- Name: chat_configs chat_configs_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configs
    ADD CONSTRAINT chat_configs_slug_key UNIQUE (slug);


--
-- Name: chat_configurations chat_configurations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configurations
    ADD CONSTRAINT chat_configurations_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_sessions chat_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_pkey PRIMARY KEY (id);


--
-- Name: client_onboarding_data client_onboarding_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_onboarding_data
    ADD CONSTRAINT client_onboarding_data_pkey PRIMARY KEY (id);


--
-- Name: client_onboarding_data client_onboarding_data_tenant_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_onboarding_data
    ADD CONSTRAINT client_onboarding_data_tenant_id_lead_id_key UNIQUE (tenant_id, lead_id);


--
-- Name: coach_playbooks coach_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_playbooks
    ADD CONSTRAINT coach_playbooks_pkey PRIMARY KEY (id);


--
-- Name: coach_sessions coach_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_pkey PRIMARY KEY (id);


--
-- Name: commission_rules commission_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_pkey PRIMARY KEY (id);


--
-- Name: commissions commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_pkey PRIMARY KEY (id);


--
-- Name: company_activities company_activities_google_event_id_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_google_event_id_unique UNIQUE (google_event_id);


--
-- Name: company_activities company_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_pkey PRIMARY KEY (id);


--
-- Name: config_audit_log config_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.config_audit_log
    ADD CONSTRAINT config_audit_log_pkey PRIMARY KEY (id);


--
-- Name: cs_conversation_handled cs_conversation_handled_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_handled
    ADD CONSTRAINT cs_conversation_handled_pkey PRIMARY KEY (id);


--
-- Name: cs_conversation_notes cs_conversation_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_notes
    ADD CONSTRAINT cs_conversation_notes_pkey PRIMARY KEY (id);


--
-- Name: cs_engagement_metrics cs_engagement_metrics_org_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_engagement_metrics
    ADD CONSTRAINT cs_engagement_metrics_org_product_key UNIQUE (organization_id, product_id);


--
-- Name: cs_engagement_metrics cs_engagement_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_engagement_metrics
    ADD CONSTRAINT cs_engagement_metrics_pkey PRIMARY KEY (id);


--
-- Name: cs_event_rsvps cs_event_rsvps_event_id_guest_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_event_id_guest_email_key UNIQUE (event_id, guest_email);


--
-- Name: cs_event_rsvps cs_event_rsvps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_pkey PRIMARY KEY (id);


--
-- Name: cs_events cs_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_pkey PRIMARY KEY (id);


--
-- Name: cs_events cs_events_rsvp_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_rsvp_token_key UNIQUE (rsvp_token);


--
-- Name: cs_events cs_events_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_slug_key UNIQUE (slug);


--
-- Name: cs_health_current cs_health_current_org_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_current
    ADD CONSTRAINT cs_health_current_org_product_key UNIQUE (organization_id, product_id);


--
-- Name: cs_health_current cs_health_current_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_current
    ADD CONSTRAINT cs_health_current_pkey PRIMARY KEY (id);


--
-- Name: cs_health_scores_history cs_health_scores_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_scores_history
    ADD CONSTRAINT cs_health_scores_history_pkey PRIMARY KEY (id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_conversation_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_conversation_key_key UNIQUE (conversation_key);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_pkey PRIMARY KEY (id);


--
-- Name: cs_interactions cs_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_interactions
    ADD CONSTRAINT cs_interactions_pkey PRIMARY KEY (id);


--
-- Name: cs_objectives cs_objectives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_objectives
    ADD CONSTRAINT cs_objectives_pkey PRIMARY KEY (id);


--
-- Name: cs_response_templates cs_response_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_response_templates
    ADD CONSTRAINT cs_response_templates_pkey PRIMARY KEY (id);


--
-- Name: cs_success_metrics cs_success_metrics_org_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_success_metrics
    ADD CONSTRAINT cs_success_metrics_org_product_key UNIQUE (organization_id, product_id);


--
-- Name: cs_success_metrics cs_success_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_success_metrics
    ADD CONSTRAINT cs_success_metrics_pkey PRIMARY KEY (id);


--
-- Name: cs_touchpoints cs_touchpoints_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_touchpoints
    ADD CONSTRAINT cs_touchpoints_pkey PRIMARY KEY (id);


--
-- Name: deal_contacts deal_contacts_deal_id_lead_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_deal_id_lead_id_key UNIQUE (deal_id, lead_id);


--
-- Name: deal_contacts deal_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_pkey PRIMARY KEY (id);


--
-- Name: deal_loss_reasons deal_loss_reasons_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_loss_reasons
    ADD CONSTRAINT deal_loss_reasons_label_key UNIQUE (label);


--
-- Name: deal_loss_reasons deal_loss_reasons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_loss_reasons
    ADD CONSTRAINT deal_loss_reasons_pkey PRIMARY KEY (id);


--
-- Name: deal_payment_installments deal_payment_installments_payment_installment_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payment_installments
    ADD CONSTRAINT deal_payment_installments_payment_installment_key UNIQUE (deal_payment_id, installment_number);


--
-- Name: deal_payment_installments deal_payment_installments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payment_installments
    ADD CONSTRAINT deal_payment_installments_pkey PRIMARY KEY (id);


--
-- Name: deal_payments deal_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payments
    ADD CONSTRAINT deal_payments_pkey PRIMARY KEY (id);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: email_campaign_leads email_campaign_leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_leads
    ADD CONSTRAINT email_campaign_leads_pkey PRIMARY KEY (id);


--
-- Name: email_campaigns email_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_pkey PRIMARY KEY (id);


--
-- Name: email_sequence_enrollments email_sequence_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_enrollments
    ADD CONSTRAINT email_sequence_enrollments_pkey PRIMARY KEY (id);


--
-- Name: email_sequence_logs email_sequence_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_logs
    ADD CONSTRAINT email_sequence_logs_pkey PRIMARY KEY (id);


--
-- Name: email_sequence_steps email_sequence_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_steps
    ADD CONSTRAINT email_sequence_steps_pkey PRIMARY KEY (id);


--
-- Name: email_sequences email_sequences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequences
    ADD CONSTRAINT email_sequences_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribes email_unsubscribes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_pkey PRIMARY KEY (id);


--
-- Name: email_unsubscribes email_unsubscribes_tenant_id_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_tenant_id_email_key UNIQUE (tenant_id, email);


--
-- Name: financial_accounts financial_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_pkey PRIMARY KEY (id);


--
-- Name: financial_categories financial_categories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_categories
    ADD CONSTRAINT financial_categories_pkey PRIMARY KEY (id);


--
-- Name: financial_entries financial_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_pkey PRIMARY KEY (id);


--
-- Name: franchise_campaigns franchise_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_campaigns
    ADD CONSTRAINT franchise_campaigns_pkey PRIMARY KEY (id);


--
-- Name: franchise_distribution_log franchise_distribution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_distribution_log
    ADD CONSTRAINT franchise_distribution_log_pkey PRIMARY KEY (id);


--
-- Name: franchise_members franchise_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_members
    ADD CONSTRAINT franchise_members_pkey PRIMARY KEY (id);


--
-- Name: google_ads_accounts google_ads_accounts_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_accounts
    ADD CONSTRAINT google_ads_accounts_account_id_key UNIQUE (account_id);


--
-- Name: google_ads_accounts google_ads_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_accounts
    ADD CONSTRAINT google_ads_accounts_pkey PRIMARY KEY (id);


--
-- Name: google_ads_campaign_data google_ads_campaign_data_account_id_organization_id_campaig_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_data
    ADD CONSTRAINT google_ads_campaign_data_account_id_organization_id_campaig_key UNIQUE (account_id, organization_id, campaign_id, date);


--
-- Name: google_ads_campaign_data google_ads_campaign_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_data
    ADD CONSTRAINT google_ads_campaign_data_pkey PRIMARY KEY (id);


--
-- Name: google_ads_daily_data google_ads_daily_data_account_id_organization_id_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_daily_data
    ADD CONSTRAINT google_ads_daily_data_account_id_organization_id_date_key UNIQUE (account_id, organization_id, date);


--
-- Name: google_ads_daily_data google_ads_daily_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_daily_data
    ADD CONSTRAINT google_ads_daily_data_pkey PRIMARY KEY (id);


--
-- Name: instagram_business_accounts ig_accounts_business_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_business_accounts
    ADD CONSTRAINT ig_accounts_business_id_key UNIQUE (instagram_business_id);


--
-- Name: instagram_conversations ig_conversations_account_thread_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT ig_conversations_account_thread_key UNIQUE (account_id, thread_id);


--
-- Name: instagram_engagement ig_engagement_lead_account_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_engagement
    ADD CONSTRAINT ig_engagement_lead_account_key UNIQUE (lead_id, account_id);


--
-- Name: instagram_messages ig_messages_instagram_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT ig_messages_instagram_message_id_key UNIQUE (instagram_message_id);


--
-- Name: import_jobs import_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_pkey PRIMARY KEY (id);


--
-- Name: instagram_business_accounts instagram_business_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_business_accounts
    ADD CONSTRAINT instagram_business_accounts_pkey PRIMARY KEY (id);


--
-- Name: instagram_comments instagram_comments_comment_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_comment_id_key UNIQUE (comment_id);


--
-- Name: instagram_comments instagram_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_pkey PRIMARY KEY (id);


--
-- Name: instagram_conversations instagram_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_pkey PRIMARY KEY (id);


--
-- Name: instagram_engagement instagram_engagement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_engagement
    ADD CONSTRAINT instagram_engagement_pkey PRIMARY KEY (id);


--
-- Name: instagram_messages instagram_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_pkey PRIMARY KEY (id);


--
-- Name: integration_settings integration_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_pkey PRIMARY KEY (id);


--
-- Name: integration_settings integration_settings_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_provider_key UNIQUE (provider);


--
-- Name: lead_conversions lead_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_conversions
    ADD CONSTRAINT lead_conversions_pkey PRIMARY KEY (id);


--
-- Name: lead_diagnostics_v2 lead_diagnostics_v2_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_diagnostics_v2
    ADD CONSTRAINT lead_diagnostics_v2_pkey PRIMARY KEY (id);


--
-- Name: lead_distribution_config lead_distribution_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_config
    ADD CONSTRAINT lead_distribution_config_pkey PRIMARY KEY (id);


--
-- Name: lead_distribution_log lead_distribution_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_log
    ADD CONSTRAINT lead_distribution_log_pkey PRIMARY KEY (id);


--
-- Name: lead_distribution_members lead_distribution_members_config_id_team_member_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_members
    ADD CONSTRAINT lead_distribution_members_config_id_team_member_id_key UNIQUE (config_id, team_member_id);


--
-- Name: lead_distribution_members lead_distribution_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_members
    ADD CONSTRAINT lead_distribution_members_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: llm_provider_configs llm_provider_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_provider_configs
    ADD CONSTRAINT llm_provider_configs_pkey PRIMARY KEY (id);


--
-- Name: llm_provider_configs llm_provider_configs_tenant_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.llm_provider_configs
    ADD CONSTRAINT llm_provider_configs_tenant_id_provider_key UNIQUE (tenant_id, provider);


--
-- Name: marketing_forms marketing_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_forms
    ADD CONSTRAINT marketing_forms_pkey PRIMARY KEY (id);


--
-- Name: meetings meetings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_pkey PRIMARY KEY (id);


--
-- Name: member_calls_history member_calls_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_calls_history
    ADD CONSTRAINT member_calls_history_pkey PRIMARY KEY (id);


--
-- Name: member_daily_activity member_daily_activity_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_daily_activity
    ADD CONSTRAINT member_daily_activity_pkey PRIMARY KEY (id);


--
-- Name: member_engagement_snapshots member_engagement_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_engagement_snapshots
    ADD CONSTRAINT member_engagement_snapshots_pkey PRIMARY KEY (id);


--
-- Name: member_lessons_progress member_lessons_progress_email_lesson_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_lessons_progress
    ADD CONSTRAINT member_lessons_progress_email_lesson_key UNIQUE (member_email, lesson_id);


--
-- Name: member_lessons_progress member_lessons_progress_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_lessons_progress
    ADD CONSTRAINT member_lessons_progress_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_accounts meta_ads_accounts_account_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_accounts
    ADD CONSTRAINT meta_ads_accounts_account_id_key UNIQUE (account_id);


--
-- Name: meta_ads_accounts meta_ads_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_accounts
    ADD CONSTRAINT meta_ads_accounts_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_ad_data meta_ads_ad_data_account_id_ad_id_date_aggregation_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_ad_data
    ADD CONSTRAINT meta_ads_ad_data_account_id_ad_id_date_aggregation_level_key UNIQUE (account_id, ad_id, date, aggregation_level);


--
-- Name: meta_ads_ad_data meta_ads_ad_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_ad_data
    ADD CONSTRAINT meta_ads_ad_data_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_conversions meta_ads_conversions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_conversions
    ADD CONSTRAINT meta_ads_conversions_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_daily_data meta_ads_daily_data_account_id_date_aggregation_level_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_daily_data
    ADD CONSTRAINT meta_ads_daily_data_account_id_date_aggregation_level_key UNIQUE (account_id, date, aggregation_level);


--
-- Name: meta_ads_daily_data meta_ads_daily_data_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_daily_data
    ADD CONSTRAINT meta_ads_daily_data_pkey PRIMARY KEY (id);


--
-- Name: meta_ads_sync_log meta_ads_sync_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_sync_log
    ADD CONSTRAINT meta_ads_sync_log_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_ads_forms meta_lead_ads_forms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_ads_forms
    ADD CONSTRAINT meta_lead_ads_forms_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_ads_forms meta_lead_ads_forms_tenant_id_form_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_ads_forms
    ADD CONSTRAINT meta_lead_ads_forms_tenant_id_form_id_key UNIQUE (tenant_id, form_id);


--
-- Name: meta_lead_ads_logs meta_lead_ads_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_ads_logs
    ADD CONSTRAINT meta_lead_ads_logs_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_ads_pages meta_lead_ads_pages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_ads_pages
    ADD CONSTRAINT meta_lead_ads_pages_pkey PRIMARY KEY (id);


--
-- Name: meta_lead_ads_pages meta_lead_ads_pages_tenant_id_page_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_lead_ads_pages
    ADD CONSTRAINT meta_lead_ads_pages_tenant_id_page_id_key UNIQUE (tenant_id, page_id);


--
-- Name: migration_log migration_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_log
    ADD CONSTRAINT migration_log_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_rules notification_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_pkey PRIMARY KEY (id);


--
-- Name: onboarding_stages onboarding_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_stages
    ADD CONSTRAINT onboarding_stages_pkey PRIMARY KEY (id);


--
-- Name: onboardings onboardings_form_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_form_token_key UNIQUE (form_token);


--
-- Name: onboardings onboardings_org_product_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_org_product_key UNIQUE (organization_id, product_id);


--
-- Name: onboardings onboardings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_pkey PRIMARY KEY (id);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_products organization_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_products
    ADD CONSTRAINT organization_products_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_slug_key UNIQUE (slug);


--
-- Name: pain_registrations pain_registrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pain_registrations
    ADD CONSTRAINT pain_registrations_pkey PRIMARY KEY (id);


--
-- Name: payment_gateway_fees payment_gateway_fees_gateway_id_billing_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_fees
    ADD CONSTRAINT payment_gateway_fees_gateway_id_billing_type_key UNIQUE (gateway_id, billing_type);


--
-- Name: payment_gateway_fees payment_gateway_fees_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_fees
    ADD CONSTRAINT payment_gateway_fees_pkey PRIMARY KEY (id);


--
-- Name: payment_gateways payment_gateways_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateways
    ADD CONSTRAINT payment_gateways_pkey PRIMARY KEY (id);


--
-- Name: payment_gateways payment_gateways_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateways
    ADD CONSTRAINT payment_gateways_slug_key UNIQUE (slug);


--
-- Name: products products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_pkey PRIMARY KEY (id);


--
-- Name: products products_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_slug_key UNIQUE (slug);


--
-- Name: profiles profiles_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_email_key UNIQUE (email);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: receive_lead_logs receive_lead_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receive_lead_logs
    ADD CONSTRAINT receive_lead_logs_pkey PRIMARY KEY (id);


--
-- Name: sales_alerts sales_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_alerts
    ADD CONSTRAINT sales_alerts_pkey PRIMARY KEY (id);


--
-- Name: sales_automation_rules sales_automation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_automation_rules
    ADD CONSTRAINT sales_automation_rules_pkey PRIMARY KEY (id);


--
-- Name: sales_materials sales_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_materials
    ADD CONSTRAINT sales_materials_pkey PRIMARY KEY (id);


--
-- Name: sales_notes sales_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_pkey PRIMARY KEY (id);


--
-- Name: sales_pipeline_stages sales_pipeline_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_stages
    ADD CONSTRAINT sales_pipeline_stages_pkey PRIMARY KEY (id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_pkey PRIMARY KEY (id);


--
-- Name: sales_pipelines sales_pipelines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipelines
    ADD CONSTRAINT sales_pipelines_pkey PRIMARY KEY (id);


--
-- Name: sales_playbooks sales_playbooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_playbooks
    ADD CONSTRAINT sales_playbooks_pkey PRIMARY KEY (id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_pkey PRIMARY KEY (id);


--
-- Name: social_seller_alerts social_seller_alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_pkey PRIMARY KEY (id);


--
-- Name: social_seller_rules social_seller_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_rules
    ADD CONSTRAINT social_seller_rules_pkey PRIMARY KEY (id);


--
-- Name: social_seller_stages social_seller_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_stages
    ADD CONSTRAINT social_seller_stages_pkey PRIMARY KEY (id);


--
-- Name: social_seller_stages social_seller_stages_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_stages
    ADD CONSTRAINT social_seller_stages_slug_key UNIQUE (slug);


--
-- Name: team_members team_members_email_tenant_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_email_tenant_key UNIQUE (email, tenant_id);


--
-- Name: team_members team_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_pkey PRIMARY KEY (id);


--
-- Name: tenant_config tenant_config_api_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_api_key_key UNIQUE (api_key);


--
-- Name: tenant_config tenant_config_custom_domain_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_custom_domain_key UNIQUE (custom_domain);


--
-- Name: tenant_config tenant_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_pkey PRIMARY KEY (id);


--
-- Name: tenant_config tenant_config_tenant_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_tenant_id_key UNIQUE (tenant_id);


--
-- Name: tenant_sales_config tenant_sales_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT tenant_sales_config_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_pkey PRIMARY KEY (id);


--
-- Name: tenants tenants_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenants
    ADD CONSTRAINT tenants_slug_key UNIQUE (slug);


--
-- Name: twilio_call_logs twilio_call_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twilio_call_logs
    ADD CONSTRAINT twilio_call_logs_pkey PRIMARY KEY (id);


--
-- Name: lead_diagnostics_v2 unique_lead_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_diagnostics_v2
    ADD CONSTRAINT unique_lead_event UNIQUE (lead_id, event_id);


--
-- Name: tenant_sales_config unique_tenant_sales_config; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT unique_tenant_sales_config UNIQUE (tenant_id);


--
-- Name: wavoip_devices wavoip_devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wavoip_devices
    ADD CONSTRAINT wavoip_devices_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_group_members whatsapp_group_members_group_id_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_group_members
    ADD CONSTRAINT whatsapp_group_members_group_id_phone_key UNIQUE (group_id, phone);


--
-- Name: whatsapp_group_members whatsapp_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_group_members
    ADD CONSTRAINT whatsapp_group_members_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_groups whatsapp_groups_instance_id_group_jid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_instance_id_group_jid_key UNIQUE (instance_id, group_jid);


--
-- Name: whatsapp_groups whatsapp_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_instances whatsapp_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_messages whatsapp_messages_instance_id_message_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_instance_id_message_id_key UNIQUE (instance_id, message_id);


--
-- Name: whatsapp_messages whatsapp_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_task_bot_config whatsapp_task_bot_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_config
    ADD CONSTRAINT whatsapp_task_bot_config_pkey PRIMARY KEY (id);


--
-- Name: whatsapp_task_bot_logs whatsapp_task_bot_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_logs
    ADD CONSTRAINT whatsapp_task_bot_logs_pkey PRIMARY KEY (id);


--
-- Name: cs_conversation_handled_group_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cs_conversation_handled_group_id_unique ON public.cs_conversation_handled USING btree (group_id) WHERE (group_id IS NOT NULL);


--
-- Name: cs_conversation_handled_lead_id_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX cs_conversation_handled_lead_id_unique ON public.cs_conversation_handled USING btree (lead_id) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_activities_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_lead ON public.company_activities USING btree (lead_id);


--
-- Name: idx_activities_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_org ON public.company_activities USING btree (organization_id);


--
-- Name: idx_activities_responsavel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_responsavel ON public.company_activities USING btree (responsavel_id);


--
-- Name: idx_activities_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_scheduled ON public.company_activities USING btree (scheduled_at);


--
-- Name: idx_activities_team; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_team ON public.company_activities USING btree (team);


--
-- Name: idx_admin_impersonation_tokens_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_admin_impersonation_tokens_tenant ON public.admin_impersonation_tokens USING btree (tenant_id);


--
-- Name: idx_ai_agent_cadence_enrollments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_cadence_enrollments_tenant ON public.ai_agent_cadence_enrollments USING btree (tenant_id);


--
-- Name: idx_ai_agent_conversations_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_conversations_lead ON public.ai_agent_conversations USING btree (lead_id);


--
-- Name: idx_ai_agent_conversations_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_conversations_status ON public.ai_agent_conversations USING btree (status);


--
-- Name: idx_ai_agent_conversations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_conversations_tenant_id ON public.ai_agent_conversations USING btree (tenant_id);


--
-- Name: idx_ai_agent_logs_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_logs_conversation ON public.ai_agent_logs USING btree (conversation_id);


--
-- Name: idx_ai_agent_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_logs_tenant_id ON public.ai_agent_logs USING btree (tenant_id);


--
-- Name: idx_ai_agent_message_queue_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_message_queue_tenant_id ON public.ai_agent_message_queue USING btree (tenant_id);


--
-- Name: idx_ai_agent_queue_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_queue_scheduled ON public.ai_agent_message_queue USING btree (scheduled_for);


--
-- Name: idx_ai_agent_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_queue_status ON public.ai_agent_message_queue USING btree (status);


--
-- Name: idx_ai_agent_scheduled_followups_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_scheduled_followups_tenant ON public.ai_agent_scheduled_followups USING btree (tenant_id);


--
-- Name: idx_ai_agent_send_counts_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_send_counts_tenant ON public.ai_agent_send_counts USING btree (tenant_id);


--
-- Name: idx_ai_agent_tools_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_agent_tools_tenant_id ON public.ai_agent_tools USING btree (tenant_id);


--
-- Name: idx_ai_sales_agents_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_sales_agents_tenant_id ON public.ai_sales_agents USING btree (tenant_id);


--
-- Name: idx_analysis_templates_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analysis_templates_tenant_id ON public.analysis_templates USING btree (tenant_id);


--
-- Name: idx_asaas_customers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asaas_customers_tenant_id ON public.asaas_customers USING btree (tenant_id);


--
-- Name: idx_asaas_webhooks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_asaas_webhooks_tenant_id ON public.asaas_webhooks USING btree (tenant_id);


--
-- Name: idx_cadence_agent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_agent ON public.ai_agent_cadence_enrollments USING btree (agent_id);


--
-- Name: idx_cadence_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_lead ON public.ai_agent_cadence_enrollments USING btree (lead_id);


--
-- Name: idx_cadence_next; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cadence_next ON public.ai_agent_cadence_enrollments USING btree (next_action_at) WHERE (status = 'active'::text);


--
-- Name: idx_calendar_events_google; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_google ON public.calendar_events USING btree (google_event_id);


--
-- Name: idx_calendar_events_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_member ON public.calendar_events USING btree (team_member_id);


--
-- Name: idx_calendar_events_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_events_tenant_id ON public.calendar_events USING btree (tenant_id);


--
-- Name: idx_calendar_sync_channels_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_sync_channels_tenant_id ON public.calendar_sync_channels USING btree (tenant_id);


--
-- Name: idx_calendar_sync_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_calendar_sync_member ON public.calendar_sync_channels USING btree (team_member_id);


--
-- Name: idx_call_history_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_lead ON public.call_history USING btree (lead_id);


--
-- Name: idx_call_history_lead_direction_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_lead_direction_started ON public.call_history USING btree (lead_id, started_at) WHERE (lead_id IS NOT NULL);


--
-- Name: idx_call_history_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_member ON public.call_history USING btree (team_member_id);


--
-- Name: idx_call_history_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_started ON public.call_history USING btree (started_at);


--
-- Name: idx_call_history_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_tenant_created ON public.call_history USING btree (tenant_id, created_at DESC);


--
-- Name: idx_call_history_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_call_history_tenant_id ON public.call_history USING btree (tenant_id);


--
-- Name: idx_campaign_instance_stats_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_instance_stats_tenant ON public.campaign_instance_stats USING btree (tenant_id);


--
-- Name: idx_campaign_leads_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_leads_tenant ON public.campaign_leads USING btree (tenant_id);


--
-- Name: idx_campaign_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaign_templates_tenant ON public.campaign_templates USING btree (tenant_id);


--
-- Name: idx_campaigns_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_scheduled ON public.campaigns USING btree (scheduled_at) WHERE (status = 'scheduled'::text);


--
-- Name: idx_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_status ON public.campaigns USING btree (status);


--
-- Name: idx_campaigns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_campaigns_tenant ON public.campaigns USING btree (tenant_id);


--
-- Name: idx_chat_configs_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_configs_slug ON public.chat_configs USING btree (slug);


--
-- Name: idx_chat_configs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_configs_tenant_id ON public.chat_configs USING btree (tenant_id);


--
-- Name: idx_chat_configurations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_configurations_tenant_id ON public.chat_configurations USING btree (tenant_id);


--
-- Name: idx_chat_messages_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_session_id ON public.chat_messages USING btree (session_id);


--
-- Name: idx_chat_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_messages_tenant_id ON public.chat_messages USING btree (tenant_id);


--
-- Name: idx_chat_sessions_config_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_config_id ON public.chat_sessions USING btree (config_id);


--
-- Name: idx_chat_sessions_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_created_by ON public.chat_sessions USING btree (created_by);


--
-- Name: idx_chat_sessions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chat_sessions_tenant_id ON public.chat_sessions USING btree (tenant_id);


--
-- Name: idx_cl_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cl_campaign ON public.campaign_leads USING btree (campaign_id);


--
-- Name: idx_cl_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cl_lead ON public.campaign_leads USING btree (lead_id);


--
-- Name: idx_cl_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cl_pending ON public.campaign_leads USING btree (campaign_id) WHERE (status = 'pending'::text);


--
-- Name: idx_cl_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cl_status ON public.campaign_leads USING btree (campaign_id, status);


--
-- Name: idx_client_onboarding_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_onboarding_lead ON public.client_onboarding_data USING btree (tenant_id, lead_id);


--
-- Name: idx_client_onboarding_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_onboarding_org ON public.client_onboarding_data USING btree (tenant_id, organization_id);


--
-- Name: idx_coach_playbooks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coach_playbooks_tenant_id ON public.coach_playbooks USING btree (tenant_id);


--
-- Name: idx_coach_sessions_call; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coach_sessions_call ON public.coach_sessions USING btree (call_id);


--
-- Name: idx_coach_sessions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coach_sessions_tenant_id ON public.coach_sessions USING btree (tenant_id);


--
-- Name: idx_commission_rules_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commission_rules_tenant_id ON public.commission_rules USING btree (tenant_id);


--
-- Name: idx_commissions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_commissions_tenant_id ON public.commissions USING btree (tenant_id);


--
-- Name: idx_company_activities_external_call_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_activities_external_call_id ON public.company_activities USING btree (external_call_id) WHERE (external_call_id IS NOT NULL);


--
-- Name: idx_company_activities_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_activities_tenant_created ON public.company_activities USING btree (tenant_id, created_at DESC);


--
-- Name: idx_company_activities_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_company_activities_tenant_id ON public.company_activities USING btree (tenant_id);


--
-- Name: idx_config_audit_table; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_audit_table ON public.config_audit_log USING btree (table_name, created_at DESC);


--
-- Name: idx_config_audit_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_config_audit_tenant ON public.config_audit_log USING btree (tenant_id, created_at DESC);


--
-- Name: idx_cs_conversation_handled_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_conversation_handled_tenant_id ON public.cs_conversation_handled USING btree (tenant_id);


--
-- Name: idx_cs_conversation_notes_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_conversation_notes_lead ON public.cs_conversation_notes USING btree (lead_id);


--
-- Name: idx_cs_conversation_notes_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_conversation_notes_tenant_id ON public.cs_conversation_notes USING btree (tenant_id);


--
-- Name: idx_cs_engagement_metrics_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_engagement_metrics_tenant_id ON public.cs_engagement_metrics USING btree (tenant_id);


--
-- Name: idx_cs_engagement_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_engagement_org ON public.cs_engagement_metrics USING btree (organization_id);


--
-- Name: idx_cs_event_rsvps_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_event_rsvps_event ON public.cs_event_rsvps USING btree (event_id);


--
-- Name: idx_cs_event_rsvps_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_event_rsvps_tenant_id ON public.cs_event_rsvps USING btree (tenant_id);


--
-- Name: idx_cs_events_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_events_status ON public.cs_events USING btree (status);


--
-- Name: idx_cs_events_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_events_tenant_id ON public.cs_events USING btree (tenant_id);


--
-- Name: idx_cs_health_current_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_health_current_org ON public.cs_health_current USING btree (organization_id);


--
-- Name: idx_cs_health_current_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_health_current_tenant_id ON public.cs_health_current USING btree (tenant_id);


--
-- Name: idx_cs_health_history_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_health_history_org ON public.cs_health_scores_history USING btree (organization_id);


--
-- Name: idx_cs_health_scores_history_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_health_scores_history_tenant_id ON public.cs_health_scores_history USING btree (tenant_id);


--
-- Name: idx_cs_inbox_metrics_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_inbox_metrics_key ON public.cs_inbox_metrics USING btree (conversation_key);


--
-- Name: idx_cs_inbox_metrics_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_inbox_metrics_lead ON public.cs_inbox_metrics USING btree (lead_id);


--
-- Name: idx_cs_inbox_metrics_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_inbox_metrics_tenant_id ON public.cs_inbox_metrics USING btree (tenant_id);


--
-- Name: idx_cs_interactions_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_interactions_org ON public.cs_interactions USING btree (organization_id);


--
-- Name: idx_cs_interactions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_interactions_tenant_id ON public.cs_interactions USING btree (tenant_id);


--
-- Name: idx_cs_objectives_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_objectives_org ON public.cs_objectives USING btree (organization_id);


--
-- Name: idx_cs_objectives_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_objectives_tenant_id ON public.cs_objectives USING btree (tenant_id);


--
-- Name: idx_cs_response_templates_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_response_templates_tenant_id ON public.cs_response_templates USING btree (tenant_id);


--
-- Name: idx_cs_success_metrics_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_success_metrics_tenant_id ON public.cs_success_metrics USING btree (tenant_id);


--
-- Name: idx_cs_success_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_success_org ON public.cs_success_metrics USING btree (organization_id);


--
-- Name: idx_cs_touchpoints_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_touchpoints_org ON public.cs_touchpoints USING btree (organization_id);


--
-- Name: idx_cs_touchpoints_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cs_touchpoints_tenant_id ON public.cs_touchpoints USING btree (tenant_id);


--
-- Name: idx_deal_contacts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_contacts_tenant_id ON public.deal_contacts USING btree (tenant_id);


--
-- Name: idx_deal_loss_reasons_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_loss_reasons_tenant_id ON public.deal_loss_reasons USING btree (tenant_id);


--
-- Name: idx_deal_payment_installments_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_payment_installments_tenant_id ON public.deal_payment_installments USING btree (tenant_id);


--
-- Name: idx_deal_payments_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deal_payments_tenant_id ON public.deal_payments USING btree (tenant_id);


--
-- Name: idx_deals_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_tenant_created ON public.deals USING btree (tenant_id, created_at DESC);


--
-- Name: idx_deals_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_tenant_id ON public.deals USING btree (tenant_id);


--
-- Name: idx_distribution_config_api_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_distribution_config_api_key ON public.lead_distribution_config USING btree (api_key);


--
-- Name: idx_distribution_log_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_log_config ON public.lead_distribution_log USING btree (config_id, created_at DESC);


--
-- Name: idx_distribution_log_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_log_member ON public.lead_distribution_log USING btree (team_member_id, created_at DESC);


--
-- Name: idx_distribution_members_config; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_distribution_members_config ON public.lead_distribution_members USING btree (config_id);


--
-- Name: idx_email_campaign_leads_brevo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_leads_brevo ON public.email_campaign_leads USING btree (brevo_message_id);


--
-- Name: idx_email_campaign_leads_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_leads_campaign ON public.email_campaign_leads USING btree (campaign_id);


--
-- Name: idx_email_campaign_leads_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_leads_lead ON public.email_campaign_leads USING btree (lead_id);


--
-- Name: idx_email_campaign_leads_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_leads_status ON public.email_campaign_leads USING btree (status);


--
-- Name: idx_email_campaign_leads_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaign_leads_tenant ON public.email_campaign_leads USING btree (tenant_id);


--
-- Name: idx_email_campaigns_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_status ON public.email_campaigns USING btree (status);


--
-- Name: idx_email_campaigns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_campaigns_tenant ON public.email_campaigns USING btree (tenant_id);


--
-- Name: idx_email_sequence_enrollments_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_enrollments_lead ON public.email_sequence_enrollments USING btree (lead_id);


--
-- Name: idx_email_sequence_enrollments_next; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_enrollments_next ON public.email_sequence_enrollments USING btree (next_step_at) WHERE (status = 'active'::text);


--
-- Name: idx_email_sequence_enrollments_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_enrollments_sequence ON public.email_sequence_enrollments USING btree (sequence_id);


--
-- Name: idx_email_sequence_enrollments_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_enrollments_tenant ON public.email_sequence_enrollments USING btree (tenant_id);


--
-- Name: idx_email_sequence_logs_brevo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_logs_brevo ON public.email_sequence_logs USING btree (brevo_message_id);


--
-- Name: idx_email_sequence_logs_enrollment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_logs_enrollment ON public.email_sequence_logs USING btree (enrollment_id);


--
-- Name: idx_email_sequence_logs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_logs_tenant ON public.email_sequence_logs USING btree (tenant_id);


--
-- Name: idx_email_sequence_steps_sequence; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_steps_sequence ON public.email_sequence_steps USING btree (sequence_id);


--
-- Name: idx_email_sequence_steps_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequence_steps_tenant ON public.email_sequence_steps USING btree (tenant_id);


--
-- Name: idx_email_sequences_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_sequences_tenant ON public.email_sequences USING btree (tenant_id);


--
-- Name: idx_email_templates_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_templates_tenant ON public.email_templates USING btree (tenant_id);


--
-- Name: idx_email_unsubscribes_tenant_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_email_unsubscribes_tenant_email ON public.email_unsubscribes USING btree (tenant_id, email);


--
-- Name: idx_financial_accounts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_accounts_tenant_id ON public.financial_accounts USING btree (tenant_id);


--
-- Name: idx_financial_categories_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_categories_tenant_id ON public.financial_categories USING btree (tenant_id);


--
-- Name: idx_financial_entries_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_entries_account ON public.financial_entries USING btree (financial_account_id);


--
-- Name: idx_financial_entries_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_entries_category ON public.financial_entries USING btree (category_id);


--
-- Name: idx_financial_entries_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_entries_date ON public.financial_entries USING btree (entry_date);


--
-- Name: idx_financial_entries_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_entries_tenant_id ON public.financial_entries USING btree (tenant_id);


--
-- Name: idx_financial_entries_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_entries_type ON public.financial_entries USING btree (type);


--
-- Name: idx_followups_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_lead ON public.ai_agent_scheduled_followups USING btree (lead_id);


--
-- Name: idx_followups_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_followups_pending ON public.ai_agent_scheduled_followups USING btree (status, scheduled_at) WHERE (status = 'pending'::text);


--
-- Name: idx_franchise_campaigns_api_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_campaigns_api_key ON public.franchise_campaigns USING btree (api_key);


--
-- Name: idx_franchise_campaigns_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_campaigns_tenant ON public.franchise_campaigns USING btree (tenant_id);


--
-- Name: idx_franchise_distribution_log_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_distribution_log_campaign ON public.franchise_distribution_log USING btree (campaign_id);


--
-- Name: idx_franchise_distribution_log_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_distribution_log_tenant ON public.franchise_distribution_log USING btree (tenant_id);


--
-- Name: idx_franchise_members_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_members_campaign ON public.franchise_members USING btree (campaign_id);


--
-- Name: idx_franchise_members_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_franchise_members_tenant ON public.franchise_members USING btree (tenant_id);


--
-- Name: idx_google_ads_accounts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_accounts_tenant_id ON public.google_ads_accounts USING btree (tenant_id);


--
-- Name: idx_google_ads_campaign_data_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_campaign_data_campaign ON public.google_ads_campaign_data USING btree (campaign_id);


--
-- Name: idx_google_ads_campaign_data_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_campaign_data_date ON public.google_ads_campaign_data USING btree (date);


--
-- Name: idx_google_ads_campaign_data_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_campaign_data_org ON public.google_ads_campaign_data USING btree (organization_id);


--
-- Name: idx_google_ads_campaign_data_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_campaign_data_tenant_id ON public.google_ads_campaign_data USING btree (tenant_id);


--
-- Name: idx_google_ads_daily_data_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_daily_data_date ON public.google_ads_daily_data USING btree (date);


--
-- Name: idx_google_ads_daily_data_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_daily_data_org ON public.google_ads_daily_data USING btree (organization_id);


--
-- Name: idx_google_ads_daily_data_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_daily_data_tenant_id ON public.google_ads_daily_data USING btree (tenant_id);


--
-- Name: idx_google_ads_daily_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_google_ads_daily_org_date ON public.google_ads_daily_data USING btree (organization_id, date);


--
-- Name: idx_ig_comments_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_comments_account ON public.instagram_comments USING btree (account_id);


--
-- Name: idx_ig_comments_post; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_comments_post ON public.instagram_comments USING btree (post_id);


--
-- Name: idx_ig_conversations_account; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_conversations_account ON public.instagram_conversations USING btree (account_id);


--
-- Name: idx_ig_conversations_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_conversations_lead ON public.instagram_conversations USING btree (lead_id);


--
-- Name: idx_ig_conversations_thread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_conversations_thread ON public.instagram_conversations USING btree (thread_id);


--
-- Name: idx_ig_engagement_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_engagement_lead ON public.instagram_engagement USING btree (lead_id);


--
-- Name: idx_ig_messages_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_conversation ON public.instagram_messages USING btree (conversation_id);


--
-- Name: idx_ig_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ig_messages_sent_at ON public.instagram_messages USING btree (sent_at);


--
-- Name: idx_import_jobs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_import_jobs_tenant ON public.import_jobs USING btree (tenant_id);


--
-- Name: idx_instagram_business_accounts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_business_accounts_tenant_id ON public.instagram_business_accounts USING btree (tenant_id);


--
-- Name: idx_instagram_comments_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_comments_tenant_id ON public.instagram_comments USING btree (tenant_id);


--
-- Name: idx_instagram_conversations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_conversations_tenant_id ON public.instagram_conversations USING btree (tenant_id);


--
-- Name: idx_instagram_engagement_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_engagement_tenant_id ON public.instagram_engagement USING btree (tenant_id);


--
-- Name: idx_instagram_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_instagram_messages_tenant_id ON public.instagram_messages USING btree (tenant_id);


--
-- Name: idx_integration_settings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_integration_settings_tenant_id ON public.integration_settings USING btree (tenant_id);


--
-- Name: idx_lead_conversions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_conversions_created_at ON public.lead_conversions USING btree (created_at DESC);


--
-- Name: idx_lead_conversions_lead_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_conversions_lead_id ON public.lead_conversions USING btree (lead_id);


--
-- Name: idx_lead_conversions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_conversions_tenant_id ON public.lead_conversions USING btree (tenant_id);


--
-- Name: idx_lead_diagnostics_v2_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_diagnostics_v2_tenant_id ON public.lead_diagnostics_v2 USING btree (tenant_id);


--
-- Name: idx_lead_distribution_config_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_distribution_config_tenant_id ON public.lead_distribution_config USING btree (tenant_id);


--
-- Name: idx_lead_distribution_log_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_distribution_log_tenant_id ON public.lead_distribution_log USING btree (tenant_id);


--
-- Name: idx_lead_distribution_members_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_lead_distribution_members_tenant_id ON public.lead_distribution_members USING btree (tenant_id);


--
-- Name: idx_leads_franchise_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_franchise_campaign ON public.leads USING btree (franchise_campaign_id) WHERE (franchise_campaign_id IS NOT NULL);


--
-- Name: idx_leads_internal_contact; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_internal_contact ON public.leads USING btree (is_internal_contact) WHERE (is_internal_contact = true);


--
-- Name: idx_leads_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_tenant_created ON public.leads USING btree (tenant_id, created_at DESC);


--
-- Name: idx_leads_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_tenant_id ON public.leads USING btree (tenant_id);


--
-- Name: idx_marketing_forms_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_forms_active ON public.marketing_forms USING btree (is_active) WHERE (is_active = true);


--
-- Name: idx_marketing_forms_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketing_forms_tenant ON public.marketing_forms USING btree (tenant_id);


--
-- Name: idx_meetings_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_lead ON public.meetings USING btree (lead_id);


--
-- Name: idx_meetings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_org ON public.meetings USING btree (organization_id);


--
-- Name: idx_meetings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meetings_tenant_id ON public.meetings USING btree (tenant_id);


--
-- Name: idx_member_activity_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_activity_org ON public.member_daily_activity USING btree (organization_id);


--
-- Name: idx_member_calls_history_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_calls_history_tenant_id ON public.member_calls_history USING btree (tenant_id);


--
-- Name: idx_member_calls_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_calls_org ON public.member_calls_history USING btree (organization_id);


--
-- Name: idx_member_daily_activity_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_daily_activity_tenant_id ON public.member_daily_activity USING btree (tenant_id);


--
-- Name: idx_member_engagement_snapshots_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_engagement_snapshots_tenant_id ON public.member_engagement_snapshots USING btree (tenant_id);


--
-- Name: idx_member_lessons_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_lessons_org ON public.member_lessons_progress USING btree (organization_id);


--
-- Name: idx_member_lessons_progress_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_lessons_progress_tenant_id ON public.member_lessons_progress USING btree (tenant_id);


--
-- Name: idx_member_snapshots_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_member_snapshots_org ON public.member_engagement_snapshots USING btree (organization_id);


--
-- Name: idx_meta_ads_accounts_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_accounts_organization_id ON public.meta_ads_accounts USING btree (organization_id);


--
-- Name: idx_meta_ads_accounts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_accounts_tenant_id ON public.meta_ads_accounts USING btree (tenant_id);


--
-- Name: idx_meta_ads_ad_data_account_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_ad_data_account_date ON public.meta_ads_ad_data USING btree (account_id, date DESC);


--
-- Name: idx_meta_ads_ad_data_campaign; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_ad_data_campaign ON public.meta_ads_ad_data USING btree (campaign_id, date DESC);


--
-- Name: idx_meta_ads_ad_data_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_ad_data_organization_id ON public.meta_ads_ad_data USING btree (organization_id);


--
-- Name: idx_meta_ads_ad_data_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_ad_data_tenant_id ON public.meta_ads_ad_data USING btree (tenant_id);


--
-- Name: idx_meta_ads_conversions_ad_data; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_conversions_ad_data ON public.meta_ads_conversions USING btree (ad_data_id);


--
-- Name: idx_meta_ads_conversions_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_conversions_organization_id ON public.meta_ads_conversions USING btree (organization_id);


--
-- Name: idx_meta_ads_conversions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_conversions_tenant_id ON public.meta_ads_conversions USING btree (tenant_id);


--
-- Name: idx_meta_ads_daily_data_account_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_daily_data_account_date ON public.meta_ads_daily_data USING btree (account_id, date DESC);


--
-- Name: idx_meta_ads_daily_data_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_daily_data_organization_id ON public.meta_ads_daily_data USING btree (organization_id);


--
-- Name: idx_meta_ads_daily_data_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_daily_data_tenant_id ON public.meta_ads_daily_data USING btree (tenant_id);


--
-- Name: idx_meta_ads_daily_org_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_daily_org_date ON public.meta_ads_daily_data USING btree (organization_id, date);


--
-- Name: idx_meta_ads_sync_log_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_sync_log_date ON public.meta_ads_sync_log USING btree (created_at DESC);


--
-- Name: idx_meta_ads_sync_log_organization_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_sync_log_organization_id ON public.meta_ads_sync_log USING btree (organization_id);


--
-- Name: idx_meta_ads_sync_log_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_ads_sync_log_tenant_id ON public.meta_ads_sync_log USING btree (tenant_id);


--
-- Name: idx_meta_forms_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_forms_page ON public.meta_lead_ads_forms USING btree (page_id);


--
-- Name: idx_meta_lead_ads_logs_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_lead_ads_logs_tenant ON public.meta_lead_ads_logs USING btree (tenant_id);


--
-- Name: idx_meta_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_meta_logs_created ON public.meta_lead_ads_logs USING btree (created_at DESC);


--
-- Name: idx_migration_log_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_migration_log_tenant_id ON public.migration_log USING btree (tenant_id);


--
-- Name: idx_notification_logs_rule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_rule ON public.notification_logs USING btree (rule_id);


--
-- Name: idx_notification_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_logs_tenant_id ON public.notification_logs USING btree (tenant_id);


--
-- Name: idx_notification_rules_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_rules_tenant_id ON public.notification_rules USING btree (tenant_id);


--
-- Name: idx_notification_rules_trigger; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_rules_trigger ON public.notification_rules USING btree (trigger_type);


--
-- Name: idx_onboarding_stages_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboarding_stages_tenant ON public.onboarding_stages USING btree (tenant_id, "position");


--
-- Name: idx_onboardings_org; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboardings_org ON public.onboardings USING btree (organization_id);


--
-- Name: idx_onboardings_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_onboardings_tenant_id ON public.onboardings USING btree (tenant_id);


--
-- Name: idx_organization_members_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_members_tenant_id ON public.organization_members USING btree (tenant_id);


--
-- Name: idx_organization_products_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organization_products_tenant_id ON public.organization_products USING btree (tenant_id);


--
-- Name: idx_organizations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_organizations_tenant_id ON public.organizations USING btree (tenant_id);


--
-- Name: idx_pain_registrations_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pain_registrations_tenant_id ON public.pain_registrations USING btree (tenant_id);


--
-- Name: idx_payment_gateway_fees_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_gateway_fees_tenant_id ON public.payment_gateway_fees USING btree (tenant_id);


--
-- Name: idx_payment_gateways_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payment_gateways_tenant_id ON public.payment_gateways USING btree (tenant_id);


--
-- Name: idx_products_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_products_tenant_id ON public.products USING btree (tenant_id);


--
-- Name: idx_profiles_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_tenant_id ON public.profiles USING btree (tenant_id);


--
-- Name: idx_receive_lead_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receive_lead_logs_created ON public.receive_lead_logs USING btree (created_at DESC);


--
-- Name: idx_receive_lead_logs_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receive_lead_logs_lead ON public.receive_lead_logs USING btree (lead_id);


--
-- Name: idx_receive_lead_logs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receive_lead_logs_status ON public.receive_lead_logs USING btree (status);


--
-- Name: idx_receive_lead_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_receive_lead_logs_tenant_id ON public.receive_lead_logs USING btree (tenant_id);


--
-- Name: idx_sales_alerts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_alerts_tenant_id ON public.sales_alerts USING btree (tenant_id);


--
-- Name: idx_sales_automation_rules_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_automation_rules_tenant_id ON public.sales_automation_rules USING btree (tenant_id);


--
-- Name: idx_sales_materials_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_materials_tenant_id ON public.sales_materials USING btree (tenant_id);


--
-- Name: idx_sales_notes_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_notes_tenant_id ON public.sales_notes USING btree (tenant_id);


--
-- Name: idx_sales_pipeline_stages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_pipeline_stages_tenant_id ON public.sales_pipeline_stages USING btree (tenant_id);


--
-- Name: idx_sales_pipeline_transitions_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_pipeline_transitions_tenant_id ON public.sales_pipeline_transitions USING btree (tenant_id);


--
-- Name: idx_sales_pipelines_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_pipelines_tenant_id ON public.sales_pipelines USING btree (tenant_id);


--
-- Name: idx_sales_playbooks_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_playbooks_tenant_id ON public.sales_playbooks USING btree (tenant_id);


--
-- Name: idx_sdr_closer_transfers_closer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdr_closer_transfers_closer_id ON public.sdr_closer_transfers USING btree (closer_id);


--
-- Name: idx_sdr_closer_transfers_deal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdr_closer_transfers_deal_id ON public.sdr_closer_transfers USING btree (deal_id);


--
-- Name: idx_sdr_closer_transfers_sdr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdr_closer_transfers_sdr_id ON public.sdr_closer_transfers USING btree (sdr_id);


--
-- Name: idx_sdr_closer_transfers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdr_closer_transfers_status ON public.sdr_closer_transfers USING btree (status);


--
-- Name: idx_sdr_closer_transfers_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sdr_closer_transfers_tenant_id ON public.sdr_closer_transfers USING btree (tenant_id);


--
-- Name: idx_send_counts_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_send_counts_lookup ON public.ai_agent_send_counts USING btree (instance_id, window_type, window_start);


--
-- Name: idx_social_alerts_conversation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_alerts_conversation ON public.social_seller_alerts USING btree (conversation_id);


--
-- Name: idx_social_alerts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_alerts_status ON public.social_seller_alerts USING btree (status);


--
-- Name: idx_social_seller_alerts_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_seller_alerts_tenant_id ON public.social_seller_alerts USING btree (tenant_id);


--
-- Name: idx_social_seller_rules_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_seller_rules_tenant_id ON public.social_seller_rules USING btree (tenant_id);


--
-- Name: idx_social_seller_stages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_social_seller_stages_tenant_id ON public.social_seller_stages USING btree (tenant_id);


--
-- Name: idx_team_members_email_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_email_tenant ON public.team_members USING btree (email, tenant_id);


--
-- Name: idx_team_members_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_team_members_tenant_id ON public.team_members USING btree (tenant_id);


--
-- Name: idx_tenant_config_api_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_config_api_key ON public.tenant_config USING btree (api_key);


--
-- Name: idx_tenant_config_domain; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_config_domain ON public.tenant_config USING btree (custom_domain);


--
-- Name: idx_tenant_config_tenant; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_config_tenant ON public.tenant_config USING btree (tenant_id);


--
-- Name: idx_tenant_sales_config_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_sales_config_tenant_id ON public.tenant_sales_config USING btree (tenant_id);


--
-- Name: idx_twilio_call_logs_call_history_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_twilio_call_logs_call_history_id ON public.twilio_call_logs USING btree (call_history_id);


--
-- Name: idx_twilio_call_logs_call_sid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_twilio_call_logs_call_sid ON public.twilio_call_logs USING btree (call_sid);


--
-- Name: idx_twilio_call_logs_timestamp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_twilio_call_logs_timestamp ON public.twilio_call_logs USING btree ("timestamp" DESC);


--
-- Name: idx_wavoip_devices_member; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wavoip_devices_member ON public.wavoip_devices USING btree (team_member_id);


--
-- Name: idx_wavoip_devices_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_wavoip_devices_tenant_id ON public.wavoip_devices USING btree (tenant_id);


--
-- Name: idx_whatsapp_group_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_group_members_group ON public.whatsapp_group_members USING btree (group_id);


--
-- Name: idx_whatsapp_group_members_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_group_members_tenant_id ON public.whatsapp_group_members USING btree (tenant_id);


--
-- Name: idx_whatsapp_groups_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_groups_instance ON public.whatsapp_groups USING btree (instance_id);


--
-- Name: idx_whatsapp_groups_jid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_groups_jid ON public.whatsapp_groups USING btree (group_jid);


--
-- Name: idx_whatsapp_groups_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_groups_tenant_id ON public.whatsapp_groups USING btree (tenant_id);


--
-- Name: idx_whatsapp_instances_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_instances_tenant_id ON public.whatsapp_instances USING btree (tenant_id);


--
-- Name: idx_whatsapp_messages_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_group ON public.whatsapp_messages USING btree (group_id);


--
-- Name: idx_whatsapp_messages_instance; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_instance ON public.whatsapp_messages USING btree (instance_id);


--
-- Name: idx_whatsapp_messages_lead; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_lead ON public.whatsapp_messages USING btree (lead_id);


--
-- Name: idx_whatsapp_messages_message_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_message_id ON public.whatsapp_messages USING btree (message_id);


--
-- Name: idx_whatsapp_messages_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_sent_at ON public.whatsapp_messages USING btree (sent_at);


--
-- Name: idx_whatsapp_messages_tenant_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_tenant_created ON public.whatsapp_messages USING btree (tenant_id, created_at DESC);


--
-- Name: idx_whatsapp_messages_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_tenant_id ON public.whatsapp_messages USING btree (tenant_id);


--
-- Name: idx_whatsapp_messages_tenant_isfromme_lead_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_tenant_isfromme_lead_created ON public.whatsapp_messages USING btree (tenant_id, lead_id, created_at) WHERE ((is_from_me = true) AND (lead_id IS NOT NULL));


--
-- Name: idx_whatsapp_messages_tenant_lead_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_messages_tenant_lead_sent ON public.whatsapp_messages USING btree (tenant_id, lead_id, sent_at DESC);


--
-- Name: idx_whatsapp_task_bot_config_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_task_bot_config_tenant_id ON public.whatsapp_task_bot_config USING btree (tenant_id);


--
-- Name: idx_whatsapp_task_bot_logs_tenant_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_whatsapp_task_bot_logs_tenant_id ON public.whatsapp_task_bot_logs USING btree (tenant_id);


--
-- Name: deals _trg_audit_deal_stage; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER _trg_audit_deal_stage AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public._audit_deal_stage_change();


--
-- Name: ai_sales_agents audit_ai_sales_agents; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_ai_sales_agents AFTER INSERT OR DELETE OR UPDATE ON public.ai_sales_agents FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: franchise_campaigns audit_franchise_campaigns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_franchise_campaigns AFTER INSERT OR DELETE OR UPDATE ON public.franchise_campaigns FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: integration_settings audit_integration_settings; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_integration_settings AFTER INSERT OR DELETE OR UPDATE ON public.integration_settings FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: lead_distribution_config audit_lead_distribution_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_lead_distribution_config AFTER INSERT OR DELETE OR UPDATE ON public.lead_distribution_config FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: lead_distribution_members audit_lead_distribution_members; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_lead_distribution_members AFTER INSERT OR DELETE OR UPDATE ON public.lead_distribution_members FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: notification_rules audit_notification_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_notification_rules AFTER INSERT OR DELETE OR UPDATE ON public.notification_rules FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: sales_automation_rules audit_sales_automation_rules; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sales_automation_rules AFTER INSERT OR DELETE OR UPDATE ON public.sales_automation_rules FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: sales_pipeline_stages audit_sales_pipeline_stages; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sales_pipeline_stages AFTER INSERT OR DELETE OR UPDATE ON public.sales_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: sales_pipelines audit_sales_pipelines; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_sales_pipelines AFTER INSERT OR DELETE OR UPDATE ON public.sales_pipelines FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: team_members audit_team_members; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_team_members AFTER UPDATE ON public.team_members FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: tenant_sales_config audit_tenant_sales_config; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_tenant_sales_config AFTER INSERT OR DELETE OR UPDATE ON public.tenant_sales_config FOR EACH ROW EXECUTE FUNCTION public.fn_config_audit();


--
-- Name: call_history auto_move_deal_on_call; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_move_deal_on_call AFTER INSERT ON public.call_history FOR EACH ROW EXECUTE FUNCTION public.trg_auto_move_on_call();


--
-- Name: company_activities auto_move_deal_on_task; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_move_deal_on_task AFTER INSERT ON public.company_activities FOR EACH ROW EXECUTE FUNCTION public.trg_auto_move_on_task();


--
-- Name: whatsapp_messages auto_move_deal_on_whatsapp_message; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER auto_move_deal_on_whatsapp_message AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.trg_auto_move_on_whatsapp_message();


--
-- Name: deal_contacts deal_contacts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER deal_contacts_updated_at BEFORE UPDATE ON public.deal_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: onboardings onboardings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER onboardings_updated_at BEFORE UPDATE ON public.onboardings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: whatsapp_messages trg_auto_clear_handled; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_auto_clear_handled AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.auto_clear_handled_on_new_message();


--
-- Name: deals trg_cancel_orphaned_tasks_on_deal_rep_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cancel_orphaned_tasks_on_deal_rep_change BEFORE UPDATE ON public.deals FOR EACH ROW WHEN ((old.sales_rep_id IS DISTINCT FROM new.sales_rep_id)) EXECUTE FUNCTION public.cancel_orphaned_tasks_on_deal_rep_change();


--
-- Name: leads trg_cancel_orphaned_tasks_on_lead_rep_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_cancel_orphaned_tasks_on_lead_rep_change BEFORE UPDATE ON public.leads FOR EACH ROW WHEN ((old.sales_rep_id IS DISTINCT FROM new.sales_rep_id)) EXECUTE FUNCTION public.cancel_orphaned_tasks_on_rep_change();


--
-- Name: deals trg_deals_stage_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_deals_stage_changed BEFORE UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.update_stage_changed_at();


--
-- Name: whatsapp_messages trg_enqueue_for_ai_agent; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enqueue_for_ai_agent AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.trigger_enqueue_for_ai_agent();


--
-- Name: leads trg_enroll_lead_in_cadence; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enroll_lead_in_cadence AFTER UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.enroll_lead_in_cadence();


--
-- Name: deals trg_sync_lead_from_deal_insert; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_lead_from_deal_insert AFTER INSERT ON public.deals FOR EACH ROW EXECUTE FUNCTION public.sync_lead_from_deal();


--
-- Name: deals trg_sync_lead_from_deal_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_sync_lead_from_deal_update AFTER UPDATE ON public.deals FOR EACH ROW EXECUTE FUNCTION public.sync_lead_from_deal();


--
-- Name: whatsapp_messages trg_update_inbox_metrics; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_update_inbox_metrics AFTER INSERT ON public.whatsapp_messages FOR EACH ROW EXECUTE FUNCTION public.update_inbox_metrics_on_message();


--
-- Name: asaas_customers trigger_asaas_customers_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_asaas_customers_updated_at BEFORE UPDATE ON public.asaas_customers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commission_rules trigger_commission_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_commission_rules_updated_at BEFORE UPDATE ON public.commission_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: commissions trigger_commissions_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_commissions_updated_at BEFORE UPDATE ON public.commissions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: pain_registrations trigger_create_lead_deal_on_pain_registration; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_create_lead_deal_on_pain_registration BEFORE INSERT ON public.pain_registrations FOR EACH ROW EXECUTE FUNCTION public.create_lead_and_deal_from_pain_registration();


--
-- Name: cs_event_rsvps trigger_cs_event_rsvps_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cs_event_rsvps_updated_at BEFORE UPDATE ON public.cs_event_rsvps FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: cs_events trigger_cs_events_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_cs_events_updated_at BEFORE UPDATE ON public.cs_events FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: deal_payments trigger_deal_payments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_deal_payments_updated_at BEFORE UPDATE ON public.deal_payments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lead_distribution_config trigger_distribution_config_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_distribution_config_updated_at BEFORE UPDATE ON public.lead_distribution_config FOR EACH ROW EXECUTE FUNCTION public.update_distribution_config_updated_at();


--
-- Name: deal_payments trigger_update_deal_payment_totals; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_deal_payment_totals AFTER INSERT ON public.deal_payments FOR EACH ROW EXECUTE FUNCTION public.update_deal_payment_totals();


--
-- Name: meetings trigger_update_meetings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_meetings_updated_at BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_materials trigger_update_sales_materials_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_sales_materials_updated_at BEFORE UPDATE ON public.sales_materials FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: sales_notes trigger_update_sales_notes_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trigger_update_sales_notes_updated_at BEFORE UPDATE ON public.sales_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_conversations update_ai_agent_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_agent_conversations_updated_at BEFORE UPDATE ON public.ai_agent_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_tools update_ai_agent_tools_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_agent_tools_updated_at BEFORE UPDATE ON public.ai_agent_tools FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_sales_agents update_ai_sales_agents_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_ai_sales_agents_updated_at BEFORE UPDATE ON public.ai_sales_agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_cadence_enrollments update_cadence_enrollments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_cadence_enrollments_updated_at BEFORE UPDATE ON public.ai_agent_cadence_enrollments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: company_activities update_company_activities_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_company_activities_updated_at BEFORE UPDATE ON public.company_activities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_business_accounts update_instagram_business_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_business_accounts_updated_at BEFORE UPDATE ON public.instagram_business_accounts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: instagram_conversations update_instagram_conversations_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_instagram_conversations_updated_at BEFORE UPDATE ON public.instagram_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: lead_diagnostics_v2 update_lead_diagnostics_v2_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_lead_diagnostics_v2_updated_at BEFORE UPDATE ON public.lead_diagnostics_v2 FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: leads update_leads_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: llm_provider_configs update_llm_provider_configs_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_llm_provider_configs_updated_at BEFORE UPDATE ON public.llm_provider_configs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: profiles update_profiles_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: ai_agent_scheduled_followups update_scheduled_followups_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_scheduled_followups_updated_at BEFORE UPDATE ON public.ai_agent_scheduled_followups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: social_seller_rules update_social_seller_rules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_social_seller_rules_updated_at BEFORE UPDATE ON public.social_seller_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: social_seller_stages update_social_seller_stages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_social_seller_stages_updated_at BEFORE UPDATE ON public.social_seller_stages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: admin_impersonation_tokens admin_impersonation_tokens_admin_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_impersonation_tokens
    ADD CONSTRAINT admin_impersonation_tokens_admin_member_id_fkey FOREIGN KEY (admin_member_id) REFERENCES public.team_members(id);


--
-- Name: admin_impersonation_tokens admin_impersonation_tokens_target_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_impersonation_tokens
    ADD CONSTRAINT admin_impersonation_tokens_target_member_id_fkey FOREIGN KEY (target_member_id) REFERENCES public.team_members(id);


--
-- Name: ai_agent_cadence_enrollments ai_agent_cadence_enrollments_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_cadence_enrollments
    ADD CONSTRAINT ai_agent_cadence_enrollments_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_sales_agents(id);


--
-- Name: ai_agent_cadence_enrollments ai_agent_cadence_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_cadence_enrollments
    ADD CONSTRAINT ai_agent_cadence_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: ai_agent_conversations ai_agent_conversations_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_sales_agents(id);


--
-- Name: ai_agent_conversations ai_agent_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: ai_agent_conversations ai_agent_conversations_paused_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_paused_by_fkey FOREIGN KEY (paused_by) REFERENCES public.team_members(id);


--
-- Name: ai_agent_conversations ai_agent_conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_conversations
    ADD CONSTRAINT ai_agent_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ai_agent_logs ai_agent_logs_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_sales_agents(id);


--
-- Name: ai_agent_logs ai_agent_logs_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_agent_conversations(id);


--
-- Name: ai_agent_logs ai_agent_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: ai_agent_logs ai_agent_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_logs
    ADD CONSTRAINT ai_agent_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ai_agent_message_queue ai_agent_message_queue_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_message_queue
    ADD CONSTRAINT ai_agent_message_queue_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_agent_conversations(id);


--
-- Name: ai_agent_message_queue ai_agent_message_queue_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_message_queue
    ADD CONSTRAINT ai_agent_message_queue_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: ai_agent_message_queue ai_agent_message_queue_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_message_queue
    ADD CONSTRAINT ai_agent_message_queue_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.whatsapp_messages(id);


--
-- Name: ai_agent_message_queue ai_agent_message_queue_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_message_queue
    ADD CONSTRAINT ai_agent_message_queue_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ai_agent_scheduled_followups ai_agent_scheduled_followups_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_scheduled_followups
    ADD CONSTRAINT ai_agent_scheduled_followups_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_sales_agents(id);


--
-- Name: ai_agent_scheduled_followups ai_agent_scheduled_followups_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_scheduled_followups
    ADD CONSTRAINT ai_agent_scheduled_followups_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.ai_agent_conversations(id);


--
-- Name: ai_agent_scheduled_followups ai_agent_scheduled_followups_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_scheduled_followups
    ADD CONSTRAINT ai_agent_scheduled_followups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: ai_agent_tools ai_agent_tools_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.ai_sales_agents(id);


--
-- Name: ai_agent_tools ai_agent_tools_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_agent_tools
    ADD CONSTRAINT ai_agent_tools_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: ai_sales_agents ai_sales_agents_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_sales_agents
    ADD CONSTRAINT ai_sales_agents_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: ai_sales_agents ai_sales_agents_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_sales_agents
    ADD CONSTRAINT ai_sales_agents_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: analysis_templates analysis_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analysis_templates
    ADD CONSTRAINT analysis_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: asaas_customers asaas_customers_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_customers
    ADD CONSTRAINT asaas_customers_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: asaas_customers asaas_customers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_customers
    ADD CONSTRAINT asaas_customers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: asaas_webhooks asaas_webhooks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asaas_webhooks
    ADD CONSTRAINT asaas_webhooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: calendar_events calendar_events_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: calendar_events calendar_events_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: calendar_events calendar_events_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: calendar_events calendar_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: calendar_sync_channels calendar_sync_channels_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_channels
    ADD CONSTRAINT calendar_sync_channels_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: calendar_sync_channels calendar_sync_channels_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendar_sync_channels
    ADD CONSTRAINT calendar_sync_channels_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: call_history call_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: call_history call_history_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: call_history call_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: call_history call_history_wavoip_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.call_history
    ADD CONSTRAINT call_history_wavoip_device_id_fkey FOREIGN KEY (wavoip_device_id) REFERENCES public.wavoip_devices(id);


--
-- Name: campaign_instance_stats campaign_instance_stats_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_instance_stats
    ADD CONSTRAINT campaign_instance_stats_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: campaign_instance_stats campaign_instance_stats_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_instance_stats
    ADD CONSTRAINT campaign_instance_stats_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: campaign_leads campaign_leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id);


--
-- Name: campaign_leads campaign_leads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE;


--
-- Name: campaign_leads campaign_leads_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: campaign_leads campaign_leads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: campaign_leads campaign_leads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_leads
    ADD CONSTRAINT campaign_leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: campaign_templates campaign_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: campaign_templates campaign_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaign_templates
    ADD CONSTRAINT campaign_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: campaigns campaigns_assignment_distribution_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_assignment_distribution_config_id_fkey FOREIGN KEY (assignment_distribution_config_id) REFERENCES public.lead_distribution_config(id);


--
-- Name: campaigns campaigns_assignment_target_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_assignment_target_id_fkey FOREIGN KEY (assignment_target_id) REFERENCES public.team_members(id);


--
-- Name: campaigns campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: campaigns campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.campaign_templates(id);


--
-- Name: campaigns campaigns_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_configs chat_configs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configs
    ADD CONSTRAINT chat_configs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_configurations chat_configurations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_configurations
    ADD CONSTRAINT chat_configurations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_messages chat_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chat_sessions(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: chat_sessions chat_sessions_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.chat_configs(id) ON DELETE CASCADE;


--
-- Name: chat_sessions chat_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_sessions
    ADD CONSTRAINT chat_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: client_onboarding_data client_onboarding_data_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_onboarding_data
    ADD CONSTRAINT client_onboarding_data_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: client_onboarding_data client_onboarding_data_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_onboarding_data
    ADD CONSTRAINT client_onboarding_data_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: client_onboarding_data client_onboarding_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_onboarding_data
    ADD CONSTRAINT client_onboarding_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: coach_playbooks coach_playbooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_playbooks
    ADD CONSTRAINT coach_playbooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: coach_playbooks coach_playbooks_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_playbooks
    ADD CONSTRAINT coach_playbooks_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: coach_playbooks coach_playbooks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_playbooks
    ADD CONSTRAINT coach_playbooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: coach_sessions coach_sessions_call_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_call_id_fkey FOREIGN KEY (call_id) REFERENCES public.call_history(id);


--
-- Name: coach_sessions coach_sessions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: coach_sessions coach_sessions_playbook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_playbook_id_fkey FOREIGN KEY (playbook_id) REFERENCES public.coach_playbooks(id);


--
-- Name: coach_sessions coach_sessions_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: coach_sessions coach_sessions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coach_sessions
    ADD CONSTRAINT coach_sessions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: commission_rules commission_rules_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: commission_rules commission_rules_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id);


--
-- Name: commission_rules commission_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_rules
    ADD CONSTRAINT commission_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: commissions commissions_commission_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_commission_rule_id_fkey FOREIGN KEY (commission_rule_id) REFERENCES public.commission_rules(id);


--
-- Name: commissions commissions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: commissions commissions_deal_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_deal_payment_id_fkey FOREIGN KEY (deal_payment_id) REFERENCES public.deal_payments(id);


--
-- Name: commissions commissions_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id);


--
-- Name: commissions commissions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commissions
    ADD CONSTRAINT commissions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: company_activities company_activities_created_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_created_by_id_fkey FOREIGN KEY (created_by_id) REFERENCES public.team_members(id);


--
-- Name: company_activities company_activities_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: company_activities company_activities_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: company_activities company_activities_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: company_activities company_activities_responsavel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_responsavel_id_fkey FOREIGN KEY (responsavel_id) REFERENCES public.team_members(id);


--
-- Name: company_activities company_activities_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT company_activities_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_conversation_handled cs_conversation_handled_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_handled
    ADD CONSTRAINT cs_conversation_handled_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: cs_conversation_handled cs_conversation_handled_handled_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_handled
    ADD CONSTRAINT cs_conversation_handled_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES public.team_members(id);


--
-- Name: cs_conversation_handled cs_conversation_handled_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_handled
    ADD CONSTRAINT cs_conversation_handled_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: cs_conversation_handled cs_conversation_handled_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_handled
    ADD CONSTRAINT cs_conversation_handled_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_conversation_notes cs_conversation_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_notes
    ADD CONSTRAINT cs_conversation_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: cs_conversation_notes cs_conversation_notes_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_notes
    ADD CONSTRAINT cs_conversation_notes_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: cs_conversation_notes cs_conversation_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_notes
    ADD CONSTRAINT cs_conversation_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: cs_conversation_notes cs_conversation_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_conversation_notes
    ADD CONSTRAINT cs_conversation_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_engagement_metrics cs_engagement_metrics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_engagement_metrics
    ADD CONSTRAINT cs_engagement_metrics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_engagement_metrics cs_engagement_metrics_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_engagement_metrics
    ADD CONSTRAINT cs_engagement_metrics_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_engagement_metrics cs_engagement_metrics_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_engagement_metrics
    ADD CONSTRAINT cs_engagement_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_event_rsvps cs_event_rsvps_checked_in_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_checked_in_by_fkey FOREIGN KEY (checked_in_by) REFERENCES public.team_members(id);


--
-- Name: cs_event_rsvps cs_event_rsvps_event_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_event_id_fkey FOREIGN KEY (event_id) REFERENCES public.cs_events(id);


--
-- Name: cs_event_rsvps cs_event_rsvps_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: cs_event_rsvps cs_event_rsvps_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_event_rsvps cs_event_rsvps_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_event_rsvps
    ADD CONSTRAINT cs_event_rsvps_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_events cs_events_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: cs_events cs_events_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_events cs_events_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_events
    ADD CONSTRAINT cs_events_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_health_current cs_health_current_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_current
    ADD CONSTRAINT cs_health_current_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_health_current cs_health_current_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_current
    ADD CONSTRAINT cs_health_current_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_health_current cs_health_current_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_current
    ADD CONSTRAINT cs_health_current_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_health_scores_history cs_health_scores_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_scores_history
    ADD CONSTRAINT cs_health_scores_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_health_scores_history cs_health_scores_history_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_scores_history
    ADD CONSTRAINT cs_health_scores_history_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_health_scores_history cs_health_scores_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_health_scores_history
    ADD CONSTRAINT cs_health_scores_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_assigned_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_assigned_agent_id_fkey FOREIGN KEY (assigned_agent_id) REFERENCES public.team_members(id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: cs_inbox_metrics cs_inbox_metrics_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_inbox_metrics
    ADD CONSTRAINT cs_inbox_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_interactions cs_interactions_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_interactions
    ADD CONSTRAINT cs_interactions_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: cs_interactions cs_interactions_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_interactions
    ADD CONSTRAINT cs_interactions_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_interactions cs_interactions_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_interactions
    ADD CONSTRAINT cs_interactions_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_interactions cs_interactions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_interactions
    ADD CONSTRAINT cs_interactions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_objectives cs_objectives_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_objectives
    ADD CONSTRAINT cs_objectives_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id);


--
-- Name: cs_objectives cs_objectives_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_objectives
    ADD CONSTRAINT cs_objectives_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_objectives cs_objectives_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_objectives
    ADD CONSTRAINT cs_objectives_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_objectives cs_objectives_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_objectives
    ADD CONSTRAINT cs_objectives_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_response_templates cs_response_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_response_templates
    ADD CONSTRAINT cs_response_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: cs_response_templates cs_response_templates_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_response_templates
    ADD CONSTRAINT cs_response_templates_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_response_templates cs_response_templates_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_response_templates
    ADD CONSTRAINT cs_response_templates_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_success_metrics cs_success_metrics_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_success_metrics
    ADD CONSTRAINT cs_success_metrics_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_success_metrics cs_success_metrics_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_success_metrics
    ADD CONSTRAINT cs_success_metrics_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_success_metrics cs_success_metrics_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_success_metrics
    ADD CONSTRAINT cs_success_metrics_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: cs_touchpoints cs_touchpoints_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_touchpoints
    ADD CONSTRAINT cs_touchpoints_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: cs_touchpoints cs_touchpoints_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_touchpoints
    ADD CONSTRAINT cs_touchpoints_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: cs_touchpoints cs_touchpoints_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_touchpoints
    ADD CONSTRAINT cs_touchpoints_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: cs_touchpoints cs_touchpoints_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cs_touchpoints
    ADD CONSTRAINT cs_touchpoints_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deal_contacts deal_contacts_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_contacts deal_contacts_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: deal_contacts deal_contacts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_contacts
    ADD CONSTRAINT deal_contacts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deal_loss_reasons deal_loss_reasons_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_loss_reasons
    ADD CONSTRAINT deal_loss_reasons_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deal_payment_installments deal_payment_installments_deal_payment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payment_installments
    ADD CONSTRAINT deal_payment_installments_deal_payment_id_fkey FOREIGN KEY (deal_payment_id) REFERENCES public.deal_payments(id) ON DELETE CASCADE;


--
-- Name: deal_payment_installments deal_payment_installments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payment_installments
    ADD CONSTRAINT deal_payment_installments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deal_payments deal_payments_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payments
    ADD CONSTRAINT deal_payments_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: deal_payments deal_payments_payer_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payments
    ADD CONSTRAINT deal_payments_payer_lead_id_fkey FOREIGN KEY (payer_lead_id) REFERENCES public.leads(id);


--
-- Name: deal_payments deal_payments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deal_payments
    ADD CONSTRAINT deal_payments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: deals deals_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: deals deals_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: deals deals_pipeline_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: deals deals_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: deals deals_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: deals deals_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: email_campaign_leads email_campaign_leads_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_leads
    ADD CONSTRAINT email_campaign_leads_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.email_campaigns(id) ON DELETE CASCADE;


--
-- Name: email_campaign_leads email_campaign_leads_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaign_leads
    ADD CONSTRAINT email_campaign_leads_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: email_campaigns email_campaigns_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: email_campaigns email_campaigns_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_campaigns
    ADD CONSTRAINT email_campaigns_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id);


--
-- Name: email_sequence_enrollments email_sequence_enrollments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_enrollments
    ADD CONSTRAINT email_sequence_enrollments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: email_sequence_enrollments email_sequence_enrollments_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_enrollments
    ADD CONSTRAINT email_sequence_enrollments_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.email_sequences(id) ON DELETE CASCADE;


--
-- Name: email_sequence_logs email_sequence_logs_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_logs
    ADD CONSTRAINT email_sequence_logs_enrollment_id_fkey FOREIGN KEY (enrollment_id) REFERENCES public.email_sequence_enrollments(id) ON DELETE CASCADE;


--
-- Name: email_sequence_logs email_sequence_logs_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_logs
    ADD CONSTRAINT email_sequence_logs_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: email_sequence_logs email_sequence_logs_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_logs
    ADD CONSTRAINT email_sequence_logs_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.email_sequences(id);


--
-- Name: email_sequence_logs email_sequence_logs_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_logs
    ADD CONSTRAINT email_sequence_logs_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.email_sequence_steps(id);


--
-- Name: email_sequence_steps email_sequence_steps_sequence_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_steps
    ADD CONSTRAINT email_sequence_steps_sequence_id_fkey FOREIGN KEY (sequence_id) REFERENCES public.email_sequences(id) ON DELETE CASCADE;


--
-- Name: email_sequence_steps email_sequence_steps_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequence_steps
    ADD CONSTRAINT email_sequence_steps_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.email_templates(id);


--
-- Name: email_sequences email_sequences_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_sequences
    ADD CONSTRAINT email_sequences_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: email_templates email_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);


--
-- Name: email_unsubscribes email_unsubscribes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_unsubscribes
    ADD CONSTRAINT email_unsubscribes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: financial_accounts financial_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: financial_categories financial_categories_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_categories
    ADD CONSTRAINT financial_categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.financial_categories(id);


--
-- Name: financial_categories financial_categories_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_categories
    ADD CONSTRAINT financial_categories_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: financial_entries financial_entries_category_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.financial_categories(id);


--
-- Name: financial_entries financial_entries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: financial_entries financial_entries_financial_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_financial_account_id_fkey FOREIGN KEY (financial_account_id) REFERENCES public.financial_accounts(id);


--
-- Name: financial_entries financial_entries_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_entries
    ADD CONSTRAINT financial_entries_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: company_activities fk_activity_meeting; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT fk_activity_meeting FOREIGN KEY (meeting_id) REFERENCES public.meetings(id);


--
-- Name: onboardings fk_onboarding_activity; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT fk_onboarding_activity FOREIGN KEY (activity_id) REFERENCES public.company_activities(id);


--
-- Name: onboardings fk_onboarding_meeting; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT fk_onboarding_meeting FOREIGN KEY (meeting_id) REFERENCES public.meetings(id);


--
-- Name: company_activities fk_parent_task; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.company_activities
    ADD CONSTRAINT fk_parent_task FOREIGN KEY (parent_task_id) REFERENCES public.company_activities(id);


--
-- Name: franchise_campaigns franchise_campaigns_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_campaigns
    ADD CONSTRAINT franchise_campaigns_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: franchise_distribution_log franchise_distribution_log_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_distribution_log
    ADD CONSTRAINT franchise_distribution_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.franchise_campaigns(id);


--
-- Name: franchise_distribution_log franchise_distribution_log_franchise_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_distribution_log
    ADD CONSTRAINT franchise_distribution_log_franchise_member_id_fkey FOREIGN KEY (franchise_member_id) REFERENCES public.franchise_members(id);


--
-- Name: franchise_distribution_log franchise_distribution_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_distribution_log
    ADD CONSTRAINT franchise_distribution_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: franchise_members franchise_members_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.franchise_members
    ADD CONSTRAINT franchise_members_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.franchise_campaigns(id) ON DELETE CASCADE;


--
-- Name: google_ads_accounts google_ads_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_accounts
    ADD CONSTRAINT google_ads_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: google_ads_campaign_data google_ads_campaign_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_campaign_data
    ADD CONSTRAINT google_ads_campaign_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: google_ads_daily_data google_ads_daily_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.google_ads_daily_data
    ADD CONSTRAINT google_ads_daily_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: import_jobs import_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.import_jobs
    ADD CONSTRAINT import_jobs_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: instagram_business_accounts instagram_business_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_business_accounts
    ADD CONSTRAINT instagram_business_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: instagram_comments instagram_comments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.instagram_business_accounts(id);


--
-- Name: instagram_comments instagram_comments_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: instagram_comments instagram_comments_replied_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_replied_by_fkey FOREIGN KEY (replied_by) REFERENCES public.team_members(id);


--
-- Name: instagram_comments instagram_comments_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_comments
    ADD CONSTRAINT instagram_comments_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: instagram_conversations instagram_conversations_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.instagram_business_accounts(id);


--
-- Name: instagram_conversations instagram_conversations_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id);


--
-- Name: instagram_conversations instagram_conversations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: instagram_conversations instagram_conversations_social_seller_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_social_seller_stage_id_fkey FOREIGN KEY (social_seller_stage_id) REFERENCES public.social_seller_stages(id);


--
-- Name: instagram_conversations instagram_conversations_stage_changed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_stage_changed_by_fkey FOREIGN KEY (stage_changed_by) REFERENCES public.team_members(id);


--
-- Name: instagram_conversations instagram_conversations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_conversations
    ADD CONSTRAINT instagram_conversations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: instagram_engagement instagram_engagement_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_engagement
    ADD CONSTRAINT instagram_engagement_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.instagram_business_accounts(id);


--
-- Name: instagram_engagement instagram_engagement_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_engagement
    ADD CONSTRAINT instagram_engagement_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: instagram_engagement instagram_engagement_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_engagement
    ADD CONSTRAINT instagram_engagement_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: instagram_messages instagram_messages_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.instagram_conversations(id);


--
-- Name: instagram_messages instagram_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.instagram_messages
    ADD CONSTRAINT instagram_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: integration_settings integration_settings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_settings
    ADD CONSTRAINT integration_settings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lead_conversions lead_conversions_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_conversions
    ADD CONSTRAINT lead_conversions_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: lead_conversions lead_conversions_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_conversions
    ADD CONSTRAINT lead_conversions_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_conversions lead_conversions_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_conversions
    ADD CONSTRAINT lead_conversions_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id);


--
-- Name: lead_conversions lead_conversions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_conversions
    ADD CONSTRAINT lead_conversions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lead_diagnostics_v2 lead_diagnostics_v2_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_diagnostics_v2
    ADD CONSTRAINT lead_diagnostics_v2_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: lead_diagnostics_v2 lead_diagnostics_v2_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_diagnostics_v2
    ADD CONSTRAINT lead_diagnostics_v2_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lead_distribution_config lead_distribution_config_first_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_config
    ADD CONSTRAINT lead_distribution_config_first_stage_id_fkey FOREIGN KEY (first_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: lead_distribution_config lead_distribution_config_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_config
    ADD CONSTRAINT lead_distribution_config_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: lead_distribution_config lead_distribution_config_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_config
    ADD CONSTRAINT lead_distribution_config_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: lead_distribution_config lead_distribution_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_config
    ADD CONSTRAINT lead_distribution_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lead_distribution_log lead_distribution_log_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_log
    ADD CONSTRAINT lead_distribution_log_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.lead_distribution_config(id);


--
-- Name: lead_distribution_log lead_distribution_log_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_log
    ADD CONSTRAINT lead_distribution_log_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: lead_distribution_log lead_distribution_log_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_log
    ADD CONSTRAINT lead_distribution_log_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: lead_distribution_log lead_distribution_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_log
    ADD CONSTRAINT lead_distribution_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: lead_distribution_members lead_distribution_members_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_members
    ADD CONSTRAINT lead_distribution_members_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.lead_distribution_config(id) ON DELETE CASCADE;


--
-- Name: lead_distribution_members lead_distribution_members_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_members
    ADD CONSTRAINT lead_distribution_members_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: lead_distribution_members lead_distribution_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lead_distribution_members
    ADD CONSTRAINT lead_distribution_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: leads leads_franchise_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_franchise_campaign_id_fkey FOREIGN KEY (franchise_campaign_id) REFERENCES public.franchise_campaigns(id);


--
-- Name: leads leads_franchise_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_franchise_member_id_fkey FOREIGN KEY (franchise_member_id) REFERENCES public.franchise_members(id);


--
-- Name: leads leads_pipeline_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pipeline_stage_id_fkey FOREIGN KEY (pipeline_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: leads leads_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: marketing_forms marketing_forms_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_forms
    ADD CONSTRAINT marketing_forms_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: meetings meetings_activity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_activity_id_fkey FOREIGN KEY (activity_id) REFERENCES public.company_activities(id);


--
-- Name: meetings meetings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: meetings meetings_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: meetings meetings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: meetings meetings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meetings
    ADD CONSTRAINT meetings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: member_calls_history member_calls_history_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_calls_history
    ADD CONSTRAINT member_calls_history_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: member_calls_history member_calls_history_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_calls_history
    ADD CONSTRAINT member_calls_history_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: member_calls_history member_calls_history_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_calls_history
    ADD CONSTRAINT member_calls_history_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: member_daily_activity member_daily_activity_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_daily_activity
    ADD CONSTRAINT member_daily_activity_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: member_daily_activity member_daily_activity_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_daily_activity
    ADD CONSTRAINT member_daily_activity_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: member_daily_activity member_daily_activity_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_daily_activity
    ADD CONSTRAINT member_daily_activity_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: member_engagement_snapshots member_engagement_snapshots_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_engagement_snapshots
    ADD CONSTRAINT member_engagement_snapshots_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: member_engagement_snapshots member_engagement_snapshots_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_engagement_snapshots
    ADD CONSTRAINT member_engagement_snapshots_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: member_engagement_snapshots member_engagement_snapshots_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_engagement_snapshots
    ADD CONSTRAINT member_engagement_snapshots_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: member_lessons_progress member_lessons_progress_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_lessons_progress
    ADD CONSTRAINT member_lessons_progress_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: member_lessons_progress member_lessons_progress_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_lessons_progress
    ADD CONSTRAINT member_lessons_progress_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: member_lessons_progress member_lessons_progress_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.member_lessons_progress
    ADD CONSTRAINT member_lessons_progress_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meta_ads_accounts meta_ads_accounts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_accounts
    ADD CONSTRAINT meta_ads_accounts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meta_ads_ad_data meta_ads_ad_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_ad_data
    ADD CONSTRAINT meta_ads_ad_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meta_ads_conversions meta_ads_conversions_ad_data_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_conversions
    ADD CONSTRAINT meta_ads_conversions_ad_data_id_fkey FOREIGN KEY (ad_data_id) REFERENCES public.meta_ads_ad_data(id) ON DELETE CASCADE;


--
-- Name: meta_ads_conversions meta_ads_conversions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_conversions
    ADD CONSTRAINT meta_ads_conversions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meta_ads_daily_data meta_ads_daily_data_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_daily_data
    ADD CONSTRAINT meta_ads_daily_data_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: meta_ads_sync_log meta_ads_sync_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.meta_ads_sync_log
    ADD CONSTRAINT meta_ads_sync_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: migration_log migration_log_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration_log
    ADD CONSTRAINT migration_log_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_logs notification_logs_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.notification_rules(id);


--
-- Name: notification_logs notification_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: notification_rules notification_rules_action_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_action_instance_id_fkey FOREIGN KEY (action_instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: notification_rules notification_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: notification_rules notification_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_rules
    ADD CONSTRAINT notification_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: onboarding_stages onboarding_stages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboarding_stages
    ADD CONSTRAINT onboarding_stages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: onboardings onboardings_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.team_members(id);


--
-- Name: onboardings onboardings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: onboardings onboardings_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: onboardings onboardings_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: onboardings onboardings_rejected_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_rejected_by_fkey FOREIGN KEY (rejected_by) REFERENCES public.team_members(id);


--
-- Name: onboardings onboardings_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.onboardings
    ADD CONSTRAINT onboardings_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: organization_members organization_members_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.leads(id);


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: organization_members organization_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: organization_products organization_products_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_products
    ADD CONSTRAINT organization_products_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id);


--
-- Name: organization_products organization_products_product_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_products
    ADD CONSTRAINT organization_products_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id);


--
-- Name: organization_products organization_products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_products
    ADD CONSTRAINT organization_products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: organizations organizations_primary_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_primary_contact_id_fkey FOREIGN KEY (primary_contact_id) REFERENCES public.leads(id);


--
-- Name: organizations organizations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: pain_registrations pain_registrations_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pain_registrations
    ADD CONSTRAINT pain_registrations_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;


--
-- Name: pain_registrations pain_registrations_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pain_registrations
    ADD CONSTRAINT pain_registrations_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payment_gateway_fees payment_gateway_fees_gateway_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_fees
    ADD CONSTRAINT payment_gateway_fees_gateway_id_fkey FOREIGN KEY (gateway_id) REFERENCES public.payment_gateways(id) ON DELETE CASCADE;


--
-- Name: payment_gateway_fees payment_gateway_fees_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateway_fees
    ADD CONSTRAINT payment_gateway_fees_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: payment_gateways payment_gateways_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment_gateways
    ADD CONSTRAINT payment_gateways_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: products products_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.products
    ADD CONSTRAINT products_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: profiles profiles_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: receive_lead_logs receive_lead_logs_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receive_lead_logs
    ADD CONSTRAINT receive_lead_logs_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.team_members(id);


--
-- Name: receive_lead_logs receive_lead_logs_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receive_lead_logs
    ADD CONSTRAINT receive_lead_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.lead_distribution_config(id);


--
-- Name: receive_lead_logs receive_lead_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.receive_lead_logs
    ADD CONSTRAINT receive_lead_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_alerts sales_alerts_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_alerts
    ADD CONSTRAINT sales_alerts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: sales_alerts sales_alerts_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_alerts
    ADD CONSTRAINT sales_alerts_sales_rep_id_fkey FOREIGN KEY (sales_rep_id) REFERENCES public.team_members(id) ON DELETE SET NULL;


--
-- Name: sales_alerts sales_alerts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_alerts
    ADD CONSTRAINT sales_alerts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_automation_rules sales_automation_rules_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_automation_rules
    ADD CONSTRAINT sales_automation_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: sales_automation_rules sales_automation_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_automation_rules
    ADD CONSTRAINT sales_automation_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_materials sales_materials_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_materials
    ADD CONSTRAINT sales_materials_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: sales_materials sales_materials_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_materials
    ADD CONSTRAINT sales_materials_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_notes sales_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.team_members(id);


--
-- Name: sales_notes sales_notes_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE;


--
-- Name: sales_notes sales_notes_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE CASCADE;


--
-- Name: sales_notes sales_notes_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_notes
    ADD CONSTRAINT sales_notes_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_pipeline_stages sales_pipeline_stages_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_stages
    ADD CONSTRAINT sales_pipeline_stages_pipeline_id_fkey FOREIGN KEY (pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: sales_pipeline_stages sales_pipeline_stages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_stages
    ADD CONSTRAINT sales_pipeline_stages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_source_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_source_pipeline_id_fkey FOREIGN KEY (source_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_source_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_source_stage_id_fkey FOREIGN KEY (source_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_target_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_target_pipeline_id_fkey FOREIGN KEY (target_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_target_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_target_stage_id_fkey FOREIGN KEY (target_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: sales_pipeline_transitions sales_pipeline_transitions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipeline_transitions
    ADD CONSTRAINT sales_pipeline_transitions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_pipelines sales_pipelines_default_sales_rep_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipelines
    ADD CONSTRAINT sales_pipelines_default_sales_rep_id_fkey FOREIGN KEY (default_sales_rep_id) REFERENCES public.team_members(id);


--
-- Name: sales_pipelines sales_pipelines_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_pipelines
    ADD CONSTRAINT sales_pipelines_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sales_playbooks sales_playbooks_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales_playbooks
    ADD CONSTRAINT sales_playbooks_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_closer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_closer_id_fkey FOREIGN KEY (closer_id) REFERENCES public.team_members(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_from_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_from_pipeline_id_fkey FOREIGN KEY (from_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_sdr_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_sdr_id_fkey FOREIGN KEY (sdr_id) REFERENCES public.team_members(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_to_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_to_pipeline_id_fkey FOREIGN KEY (to_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: sdr_closer_transfers sdr_closer_transfers_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sdr_closer_transfers
    ADD CONSTRAINT sdr_closer_transfers_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES public.sales_pipeline_stages(id);


--
-- Name: social_seller_alerts social_seller_alerts_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.team_members(id);


--
-- Name: social_seller_alerts social_seller_alerts_conversation_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.instagram_conversations(id);


--
-- Name: social_seller_alerts social_seller_alerts_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: social_seller_alerts social_seller_alerts_rule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES public.social_seller_rules(id);


--
-- Name: social_seller_alerts social_seller_alerts_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_alerts
    ADD CONSTRAINT social_seller_alerts_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: social_seller_rules social_seller_rules_from_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_rules
    ADD CONSTRAINT social_seller_rules_from_stage_id_fkey FOREIGN KEY (from_stage_id) REFERENCES public.social_seller_stages(id);


--
-- Name: social_seller_rules social_seller_rules_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_rules
    ADD CONSTRAINT social_seller_rules_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: social_seller_rules social_seller_rules_to_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_rules
    ADD CONSTRAINT social_seller_rules_to_stage_id_fkey FOREIGN KEY (to_stage_id) REFERENCES public.social_seller_stages(id);


--
-- Name: social_seller_stages social_seller_stages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.social_seller_stages
    ADD CONSTRAINT social_seller_stages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: team_members team_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: team_members team_members_whatsapp_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.team_members
    ADD CONSTRAINT team_members_whatsapp_instance_id_fkey FOREIGN KEY (whatsapp_instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: tenant_config tenant_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_config
    ADD CONSTRAINT tenant_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: tenant_sales_config tenant_sales_config_closer_distribution_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT tenant_sales_config_closer_distribution_config_id_fkey FOREIGN KEY (closer_distribution_config_id) REFERENCES public.lead_distribution_config(id);


--
-- Name: tenant_sales_config tenant_sales_config_closer_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT tenant_sales_config_closer_pipeline_id_fkey FOREIGN KEY (closer_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: tenant_sales_config tenant_sales_config_sdr_pipeline_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT tenant_sales_config_sdr_pipeline_id_fkey FOREIGN KEY (sdr_pipeline_id) REFERENCES public.sales_pipelines(id);


--
-- Name: tenant_sales_config tenant_sales_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_sales_config
    ADD CONSTRAINT tenant_sales_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE;


--
-- Name: twilio_call_logs twilio_call_logs_call_history_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twilio_call_logs
    ADD CONSTRAINT twilio_call_logs_call_history_id_fkey FOREIGN KEY (call_history_id) REFERENCES public.call_history(id);


--
-- Name: twilio_call_logs twilio_call_logs_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.twilio_call_logs
    ADD CONSTRAINT twilio_call_logs_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: wavoip_devices wavoip_devices_team_member_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wavoip_devices
    ADD CONSTRAINT wavoip_devices_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id);


--
-- Name: wavoip_devices wavoip_devices_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.wavoip_devices
    ADD CONSTRAINT wavoip_devices_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_group_members whatsapp_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_group_members
    ADD CONSTRAINT whatsapp_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: whatsapp_group_members whatsapp_group_members_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_group_members
    ADD CONSTRAINT whatsapp_group_members_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: whatsapp_group_members whatsapp_group_members_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_group_members
    ADD CONSTRAINT whatsapp_group_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_groups whatsapp_groups_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: whatsapp_groups whatsapp_groups_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_groups
    ADD CONSTRAINT whatsapp_groups_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_instances whatsapp_instances_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_instances
    ADD CONSTRAINT whatsapp_instances_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_messages whatsapp_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: whatsapp_messages whatsapp_messages_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: whatsapp_messages whatsapp_messages_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: whatsapp_messages whatsapp_messages_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT whatsapp_messages_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_task_bot_config whatsapp_task_bot_config_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_config
    ADD CONSTRAINT whatsapp_task_bot_config_instance_id_fkey FOREIGN KEY (instance_id) REFERENCES public.whatsapp_instances(id);


--
-- Name: whatsapp_task_bot_config whatsapp_task_bot_config_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_config
    ADD CONSTRAINT whatsapp_task_bot_config_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: whatsapp_task_bot_logs whatsapp_task_bot_logs_config_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_logs
    ADD CONSTRAINT whatsapp_task_bot_logs_config_id_fkey FOREIGN KEY (config_id) REFERENCES public.whatsapp_task_bot_config(id);


--
-- Name: whatsapp_task_bot_logs whatsapp_task_bot_logs_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_logs
    ADD CONSTRAINT whatsapp_task_bot_logs_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.whatsapp_groups(id);


--
-- Name: whatsapp_task_bot_logs whatsapp_task_bot_logs_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.whatsapp_task_bot_logs
    ADD CONSTRAINT whatsapp_task_bot_logs_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id);


--
-- Name: _deal_stage_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public._deal_stage_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_impersonation_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_impersonation_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_impersonation_tokens admin_only; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY admin_only ON public.admin_impersonation_tokens USING ((tenant_id = public.get_tenant_id()));


--
-- Name: ai_agent_cadence_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_cadence_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_message_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_message_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_scheduled_followups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_scheduled_followups ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_send_counts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_send_counts ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_tools; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_agent_tools ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_sales_agents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_sales_agents ENABLE ROW LEVEL SECURITY;

--
-- Name: analysis_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.analysis_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: asaas_customers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asaas_customers ENABLE ROW LEVEL SECURITY;

--
-- Name: asaas_webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.asaas_webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: _deal_stage_audit authenticated_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_access ON public._deal_stage_audit TO authenticated USING (true);


--
-- Name: twilio_call_logs authenticated_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY authenticated_access ON public.twilio_call_logs TO authenticated USING (true);


--
-- Name: calendar_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

--
-- Name: calendar_sync_channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendar_sync_channels ENABLE ROW LEVEL SECURITY;

--
-- Name: call_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_instance_stats; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_instance_stats ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_leads campaign_leads_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_leads_tenant ON public.campaign_leads USING ((tenant_id = ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.auth_user_id = auth.uid()))));


--
-- Name: campaign_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaign_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_templates campaign_templates_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaign_templates_tenant ON public.campaign_templates USING ((tenant_id = ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.auth_user_id = auth.uid()))));


--
-- Name: campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: campaigns campaigns_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY campaigns_tenant ON public.campaigns USING ((tenant_id = ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.auth_user_id = auth.uid()))));


--
-- Name: chat_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_configurations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_configurations ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: chat_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: campaign_instance_stats cis_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY cis_tenant ON public.campaign_instance_stats USING ((tenant_id = ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.auth_user_id = auth.uid()))));


--
-- Name: client_onboarding_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_onboarding_data ENABLE ROW LEVEL SECURITY;

--
-- Name: client_onboarding_data client_onboarding_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_onboarding_insert ON public.client_onboarding_data FOR INSERT WITH CHECK (((tenant_id = public.get_tenant_id()) OR public.is_superadmin()));


--
-- Name: client_onboarding_data client_onboarding_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_onboarding_select ON public.client_onboarding_data FOR SELECT USING (((tenant_id = public.get_tenant_id()) OR public.is_superadmin()));


--
-- Name: client_onboarding_data client_onboarding_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_onboarding_update ON public.client_onboarding_data FOR UPDATE USING (((tenant_id = public.get_tenant_id()) OR public.is_superadmin()));


--
-- Name: coach_playbooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coach_playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: coach_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coach_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: commission_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: company_activities; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.company_activities ENABLE ROW LEVEL SECURITY;

--
-- Name: config_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.config_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: config_audit_log config_audit_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY config_audit_tenant ON public.config_audit_log USING ((tenant_id = public.get_tenant_id()));


--
-- Name: cs_conversation_handled; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_conversation_handled ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_conversation_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_conversation_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_engagement_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_engagement_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_event_rsvps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_event_rsvps ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_events ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_health_current; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_health_current ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_health_scores_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_health_scores_history ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_inbox_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_inbox_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_interactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_interactions ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_objectives; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_objectives ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_response_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_response_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_success_metrics; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_success_metrics ENABLE ROW LEVEL SECURITY;

--
-- Name: cs_touchpoints; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.cs_touchpoints ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_loss_reasons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_loss_reasons ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_payment_installments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_payment_installments ENABLE ROW LEVEL SECURITY;

--
-- Name: deal_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deal_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaign_leads ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaign_leads email_campaign_leads_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_campaign_leads_tenant ON public.email_campaign_leads USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: email_campaigns email_campaigns_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_campaigns_tenant ON public.email_campaigns USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_sequence_enrollments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sequence_enrollments ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sequence_enrollments email_sequence_enrollments_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_sequence_enrollments_tenant ON public.email_sequence_enrollments USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_sequence_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sequence_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sequence_logs email_sequence_logs_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_sequence_logs_tenant ON public.email_sequence_logs USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_sequence_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sequence_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sequence_steps email_sequence_steps_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_sequence_steps_tenant ON public.email_sequence_steps USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_sequences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_sequences ENABLE ROW LEVEL SECURITY;

--
-- Name: email_sequences email_sequences_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_sequences_tenant ON public.email_sequences USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: email_templates email_templates_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_templates_tenant ON public.email_templates USING ((tenant_id = public.get_tenant_id()));


--
-- Name: email_unsubscribes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.email_unsubscribes ENABLE ROW LEVEL SECURITY;

--
-- Name: email_unsubscribes email_unsubscribes_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY email_unsubscribes_tenant ON public.email_unsubscribes USING ((tenant_id = public.get_tenant_id()));


--
-- Name: financial_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_categories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_categories ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: franchise_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.franchise_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: franchise_campaigns franchise_campaigns_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY franchise_campaigns_tenant ON public.franchise_campaigns USING ((tenant_id = public.get_tenant_id()));


--
-- Name: franchise_distribution_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.franchise_distribution_log ENABLE ROW LEVEL SECURITY;

--
-- Name: franchise_distribution_log franchise_distribution_log_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY franchise_distribution_log_tenant ON public.franchise_distribution_log USING ((tenant_id = public.get_tenant_id()));


--
-- Name: franchise_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.franchise_members ENABLE ROW LEVEL SECURITY;

--
-- Name: franchise_members franchise_members_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY franchise_members_tenant ON public.franchise_members USING ((tenant_id = public.get_tenant_id()));


--
-- Name: google_ads_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_ads_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: google_ads_campaign_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_ads_campaign_data ENABLE ROW LEVEL SECURITY;

--
-- Name: google_ads_daily_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.google_ads_daily_data ENABLE ROW LEVEL SECURITY;

--
-- Name: import_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_business_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_business_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_comments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_comments ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_engagement; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_engagement ENABLE ROW LEVEL SECURITY;

--
-- Name: instagram_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.instagram_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: integration_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.integration_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_diagnostics_v2; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_diagnostics_v2 ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_distribution_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_distribution_config ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_distribution_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_distribution_log ENABLE ROW LEVEL SECURITY;

--
-- Name: lead_distribution_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.lead_distribution_members ENABLE ROW LEVEL SECURITY;

--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: llm_provider_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.llm_provider_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_forms marketing_forms_anon_update_stats; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_forms_anon_update_stats ON public.marketing_forms FOR UPDATE USING ((is_active = true)) WITH CHECK ((is_active = true));


--
-- Name: marketing_forms marketing_forms_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_forms_public_read ON public.marketing_forms FOR SELECT USING ((is_active = true));


--
-- Name: marketing_forms marketing_forms_tenant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_forms_tenant ON public.marketing_forms USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meetings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

--
-- Name: member_calls_history; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_calls_history ENABLE ROW LEVEL SECURITY;

--
-- Name: member_daily_activity; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_daily_activity ENABLE ROW LEVEL SECURITY;

--
-- Name: member_engagement_snapshots; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_engagement_snapshots ENABLE ROW LEVEL SECURITY;

--
-- Name: member_lessons_progress; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.member_lessons_progress ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_ad_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_ad_data ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_conversions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_conversions ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_daily_data; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_daily_data ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_ads_sync_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_ads_sync_log ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_lead_ads_forms; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_lead_ads_forms ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_lead_ads_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_lead_ads_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: meta_lead_ads_pages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.meta_lead_ads_pages ENABLE ROW LEVEL SECURITY;

--
-- Name: migration_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.migration_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboarding_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: onboarding_stages onboarding_stages_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY onboarding_stages_admin ON public.onboarding_stages USING (public.is_superadmin());


--
-- Name: onboarding_stages onboarding_stages_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY onboarding_stages_select ON public.onboarding_stages FOR SELECT USING (((tenant_id = public.get_tenant_id()) OR public.is_superadmin()));


--
-- Name: onboardings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.onboardings ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

--
-- Name: organization_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organization_products ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

--
-- Name: pain_registrations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pain_registrations ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_gateway_fees; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_gateway_fees ENABLE ROW LEVEL SECURITY;

--
-- Name: payment_gateways; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payment_gateways ENABLE ROW LEVEL SECURITY;

--
-- Name: products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: receive_lead_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.receive_lead_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_automation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_automation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_materials; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_materials ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_notes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_notes ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_pipeline_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_pipeline_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_pipeline_transitions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_pipeline_transitions ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_pipelines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_pipelines ENABLE ROW LEVEL SECURITY;

--
-- Name: sales_playbooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales_playbooks ENABLE ROW LEVEL SECURITY;

--
-- Name: sdr_closer_transfers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sdr_closer_transfers ENABLE ROW LEVEL SECURITY;

--
-- Name: sdr_closer_transfers sdr_closer_transfers_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sdr_closer_transfers_insert ON public.sdr_closer_transfers FOR INSERT TO authenticated WITH CHECK ((tenant_id = public.get_tenant_id()));


--
-- Name: sdr_closer_transfers sdr_closer_transfers_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sdr_closer_transfers_select ON public.sdr_closer_transfers FOR SELECT TO authenticated USING ((tenant_id = public.get_tenant_id()));


--
-- Name: sdr_closer_transfers sdr_closer_transfers_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY sdr_closer_transfers_update ON public.sdr_closer_transfers FOR UPDATE TO authenticated USING ((tenant_id = public.get_tenant_id()));


--
-- Name: social_seller_alerts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_seller_alerts ENABLE ROW LEVEL SECURITY;

--
-- Name: social_seller_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_seller_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: social_seller_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.social_seller_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: team_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_agent_cadence_enrollments tenant_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_access ON public.ai_agent_cadence_enrollments USING ((tenant_id = public.get_tenant_id()));


--
-- Name: ai_agent_scheduled_followups tenant_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_access ON public.ai_agent_scheduled_followups USING ((tenant_id = public.get_tenant_id()));


--
-- Name: ai_agent_send_counts tenant_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_access ON public.ai_agent_send_counts USING ((tenant_id = public.get_tenant_id()));


--
-- Name: profiles tenant_admin_delete_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_admin_delete_profiles ON public.profiles FOR DELETE TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)))))));


--
-- Name: team_members tenant_admin_delete_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_admin_delete_team_members ON public.team_members FOR DELETE USING (((tenant_id = public.get_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: profiles tenant_admin_update_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_admin_update_profiles ON public.profiles FOR UPDATE TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::text) AND (p.tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)))))));


--
-- Name: team_members tenant_admin_update_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_admin_update_team_members ON public.team_members FOR UPDATE USING (((tenant_id = public.get_tenant_id()) AND public.is_tenant_admin())) WITH CHECK (((tenant_id = public.get_tenant_id()) AND public.is_tenant_admin()));


--
-- Name: tenant_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_config tenant_config_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_config_insert ON public.tenant_config FOR INSERT WITH CHECK (public.is_superadmin());


--
-- Name: tenant_config tenant_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_config_select ON public.tenant_config FOR SELECT USING (((tenant_id = public.get_tenant_id()) OR public.is_superadmin()));


--
-- Name: tenant_config tenant_config_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_config_update ON public.tenant_config FOR UPDATE USING (public.is_superadmin());


--
-- Name: ai_agent_conversations tenant_delete_ai_agent_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_ai_agent_conversations ON public.ai_agent_conversations FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_logs tenant_delete_ai_agent_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_ai_agent_logs ON public.ai_agent_logs FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_message_queue tenant_delete_ai_agent_message_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_ai_agent_message_queue ON public.ai_agent_message_queue FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_tools tenant_delete_ai_agent_tools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_ai_agent_tools ON public.ai_agent_tools FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_sales_agents tenant_delete_ai_sales_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_ai_sales_agents ON public.ai_sales_agents FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: analysis_templates tenant_delete_analysis_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_analysis_templates ON public.analysis_templates FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_customers tenant_delete_asaas_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_asaas_customers ON public.asaas_customers FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_webhooks tenant_delete_asaas_webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_asaas_webhooks ON public.asaas_webhooks FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: calendar_events tenant_delete_calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_calendar_events ON public.calendar_events FOR DELETE TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (team_member_id = auth.uid())));


--
-- Name: call_history tenant_delete_call_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_call_history ON public.call_history FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configs tenant_delete_chat_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_chat_configs ON public.chat_configs FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configurations tenant_delete_chat_configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_chat_configurations ON public.chat_configurations FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_messages tenant_delete_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_chat_messages ON public.chat_messages FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_sessions tenant_delete_chat_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_chat_sessions ON public.chat_sessions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_playbooks tenant_delete_coach_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_coach_playbooks ON public.coach_playbooks FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_sessions tenant_delete_coach_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_coach_sessions ON public.coach_sessions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commission_rules tenant_delete_commission_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_commission_rules ON public.commission_rules FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commissions tenant_delete_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_commissions ON public.commissions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: company_activities tenant_delete_company_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_company_activities ON public.company_activities FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_handled tenant_delete_cs_conversation_handled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_conversation_handled ON public.cs_conversation_handled FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_notes tenant_delete_cs_conversation_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_conversation_notes ON public.cs_conversation_notes FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_engagement_metrics tenant_delete_cs_engagement_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_engagement_metrics ON public.cs_engagement_metrics FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_event_rsvps tenant_delete_cs_event_rsvps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_event_rsvps ON public.cs_event_rsvps FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_events tenant_delete_cs_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_events ON public.cs_events FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_current tenant_delete_cs_health_current; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_health_current ON public.cs_health_current FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_scores_history tenant_delete_cs_health_scores_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_health_scores_history ON public.cs_health_scores_history FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_inbox_metrics tenant_delete_cs_inbox_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_inbox_metrics ON public.cs_inbox_metrics FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_interactions tenant_delete_cs_interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_interactions ON public.cs_interactions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_objectives tenant_delete_cs_objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_objectives ON public.cs_objectives FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_response_templates tenant_delete_cs_response_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_response_templates ON public.cs_response_templates FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_success_metrics tenant_delete_cs_success_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_success_metrics ON public.cs_success_metrics FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_touchpoints tenant_delete_cs_touchpoints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_cs_touchpoints ON public.cs_touchpoints FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_contacts tenant_delete_deal_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_deal_contacts ON public.deal_contacts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_loss_reasons tenant_delete_deal_loss_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_deal_loss_reasons ON public.deal_loss_reasons FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payment_installments tenant_delete_deal_payment_installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_deal_payment_installments ON public.deal_payment_installments FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payments tenant_delete_deal_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_deal_payments ON public.deal_payments FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deals tenant_delete_deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_deals ON public.deals FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_accounts tenant_delete_financial_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_financial_accounts ON public.financial_accounts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_categories tenant_delete_financial_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_financial_categories ON public.financial_categories FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_entries tenant_delete_financial_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_financial_entries ON public.financial_entries FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_accounts tenant_delete_google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_google_ads_accounts ON public.google_ads_accounts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_campaign_data tenant_delete_google_ads_campaign_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_google_ads_campaign_data ON public.google_ads_campaign_data FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_daily_data tenant_delete_google_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_google_ads_daily_data ON public.google_ads_daily_data FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_business_accounts tenant_delete_instagram_business_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_instagram_business_accounts ON public.instagram_business_accounts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_comments tenant_delete_instagram_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_instagram_comments ON public.instagram_comments FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_conversations tenant_delete_instagram_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_instagram_conversations ON public.instagram_conversations FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_engagement tenant_delete_instagram_engagement; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_instagram_engagement ON public.instagram_engagement FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_messages tenant_delete_instagram_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_instagram_messages ON public.instagram_messages FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: integration_settings tenant_delete_integration_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_integration_settings ON public.integration_settings FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_conversions tenant_delete_lead_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_lead_conversions ON public.lead_conversions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_diagnostics_v2 tenant_delete_lead_diagnostics_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_lead_diagnostics_v2 ON public.lead_diagnostics_v2 FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_config tenant_delete_lead_distribution_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_lead_distribution_config ON public.lead_distribution_config FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_log tenant_delete_lead_distribution_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_lead_distribution_log ON public.lead_distribution_log FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_members tenant_delete_lead_distribution_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_lead_distribution_members ON public.lead_distribution_members FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: leads tenant_delete_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_leads ON public.leads FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: llm_provider_configs tenant_delete_llm_provider_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_llm_provider_configs ON public.llm_provider_configs FOR DELETE USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meetings tenant_delete_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meetings ON public.meetings FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_calls_history tenant_delete_member_calls_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_member_calls_history ON public.member_calls_history FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_daily_activity tenant_delete_member_daily_activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_member_daily_activity ON public.member_daily_activity FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_engagement_snapshots tenant_delete_member_engagement_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_member_engagement_snapshots ON public.member_engagement_snapshots FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_lessons_progress tenant_delete_member_lessons_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_member_lessons_progress ON public.member_lessons_progress FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_accounts tenant_delete_meta_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meta_ads_accounts ON public.meta_ads_accounts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_ad_data tenant_delete_meta_ads_ad_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meta_ads_ad_data ON public.meta_ads_ad_data FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_conversions tenant_delete_meta_ads_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meta_ads_conversions ON public.meta_ads_conversions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_daily_data tenant_delete_meta_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meta_ads_daily_data ON public.meta_ads_daily_data FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_sync_log tenant_delete_meta_ads_sync_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_meta_ads_sync_log ON public.meta_ads_sync_log FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_logs tenant_delete_notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_notification_logs ON public.notification_logs FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_rules tenant_delete_notification_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_notification_rules ON public.notification_rules FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: onboardings tenant_delete_onboardings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_onboardings ON public.onboardings FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_members tenant_delete_organization_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_organization_members ON public.organization_members FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_products tenant_delete_organization_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_organization_products ON public.organization_products FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organizations tenant_delete_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_organizations ON public.organizations FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: pain_registrations tenant_delete_pain_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_pain_registrations ON public.pain_registrations FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateway_fees tenant_delete_payment_gateway_fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_payment_gateway_fees ON public.payment_gateway_fees FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateways tenant_delete_payment_gateways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_payment_gateways ON public.payment_gateways FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: products tenant_delete_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_products ON public.products FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: receive_lead_logs tenant_delete_receive_lead_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_receive_lead_logs ON public.receive_lead_logs FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_alerts tenant_delete_sales_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_alerts ON public.sales_alerts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_automation_rules tenant_delete_sales_automation_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_automation_rules ON public.sales_automation_rules FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_materials tenant_delete_sales_materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_materials ON public.sales_materials FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_notes tenant_delete_sales_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_notes ON public.sales_notes FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_stages tenant_delete_sales_pipeline_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_pipeline_stages ON public.sales_pipeline_stages FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_transitions tenant_delete_sales_pipeline_transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_pipeline_transitions ON public.sales_pipeline_transitions FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipelines tenant_delete_sales_pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_pipelines ON public.sales_pipelines FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_playbooks tenant_delete_sales_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_sales_playbooks ON public.sales_playbooks FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_alerts tenant_delete_social_seller_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_social_seller_alerts ON public.social_seller_alerts FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_rules tenant_delete_social_seller_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_social_seller_rules ON public.social_seller_rules FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_stages tenant_delete_social_seller_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_social_seller_stages ON public.social_seller_stages FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: wavoip_devices tenant_delete_wavoip_devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_wavoip_devices ON public.wavoip_devices FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_group_members tenant_delete_whatsapp_group_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_group_members ON public.whatsapp_group_members FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_groups tenant_delete_whatsapp_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_groups ON public.whatsapp_groups FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_instances tenant_delete_whatsapp_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_instances ON public.whatsapp_instances FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_messages tenant_delete_whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_messages ON public.whatsapp_messages FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_config tenant_delete_whatsapp_task_bot_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_task_bot_config ON public.whatsapp_task_bot_config FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_logs tenant_delete_whatsapp_task_bot_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_delete_whatsapp_task_bot_logs ON public.whatsapp_task_bot_logs FOR DELETE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_conversations tenant_insert_ai_agent_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_ai_agent_conversations ON public.ai_agent_conversations FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_logs tenant_insert_ai_agent_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_ai_agent_logs ON public.ai_agent_logs FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_message_queue tenant_insert_ai_agent_message_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_ai_agent_message_queue ON public.ai_agent_message_queue FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_tools tenant_insert_ai_agent_tools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_ai_agent_tools ON public.ai_agent_tools FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_sales_agents tenant_insert_ai_sales_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_ai_sales_agents ON public.ai_sales_agents FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: analysis_templates tenant_insert_analysis_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_analysis_templates ON public.analysis_templates FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_customers tenant_insert_asaas_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_asaas_customers ON public.asaas_customers FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_webhooks tenant_insert_asaas_webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_asaas_webhooks ON public.asaas_webhooks FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: calendar_events tenant_insert_calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_calendar_events ON public.calendar_events FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: call_history tenant_insert_call_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_call_history ON public.call_history FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configs tenant_insert_chat_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_chat_configs ON public.chat_configs FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configurations tenant_insert_chat_configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_chat_configurations ON public.chat_configurations FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_messages tenant_insert_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_chat_messages ON public.chat_messages FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_sessions tenant_insert_chat_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_chat_sessions ON public.chat_sessions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_playbooks tenant_insert_coach_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_coach_playbooks ON public.coach_playbooks FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_sessions tenant_insert_coach_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_coach_sessions ON public.coach_sessions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commission_rules tenant_insert_commission_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_commission_rules ON public.commission_rules FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commissions tenant_insert_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_commissions ON public.commissions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: company_activities tenant_insert_company_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_company_activities ON public.company_activities FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_handled tenant_insert_cs_conversation_handled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_conversation_handled ON public.cs_conversation_handled FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_notes tenant_insert_cs_conversation_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_conversation_notes ON public.cs_conversation_notes FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_engagement_metrics tenant_insert_cs_engagement_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_engagement_metrics ON public.cs_engagement_metrics FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_event_rsvps tenant_insert_cs_event_rsvps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_event_rsvps ON public.cs_event_rsvps FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_events tenant_insert_cs_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_events ON public.cs_events FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_current tenant_insert_cs_health_current; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_health_current ON public.cs_health_current FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_scores_history tenant_insert_cs_health_scores_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_health_scores_history ON public.cs_health_scores_history FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_inbox_metrics tenant_insert_cs_inbox_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_inbox_metrics ON public.cs_inbox_metrics FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_interactions tenant_insert_cs_interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_interactions ON public.cs_interactions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_objectives tenant_insert_cs_objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_objectives ON public.cs_objectives FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_response_templates tenant_insert_cs_response_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_response_templates ON public.cs_response_templates FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_success_metrics tenant_insert_cs_success_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_success_metrics ON public.cs_success_metrics FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_touchpoints tenant_insert_cs_touchpoints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_cs_touchpoints ON public.cs_touchpoints FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_contacts tenant_insert_deal_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_deal_contacts ON public.deal_contacts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_loss_reasons tenant_insert_deal_loss_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_deal_loss_reasons ON public.deal_loss_reasons FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payment_installments tenant_insert_deal_payment_installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_deal_payment_installments ON public.deal_payment_installments FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payments tenant_insert_deal_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_deal_payments ON public.deal_payments FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deals tenant_insert_deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_deals ON public.deals FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_accounts tenant_insert_financial_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_financial_accounts ON public.financial_accounts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_categories tenant_insert_financial_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_financial_categories ON public.financial_categories FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_entries tenant_insert_financial_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_financial_entries ON public.financial_entries FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_accounts tenant_insert_google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_google_ads_accounts ON public.google_ads_accounts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_campaign_data tenant_insert_google_ads_campaign_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_google_ads_campaign_data ON public.google_ads_campaign_data FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_daily_data tenant_insert_google_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_google_ads_daily_data ON public.google_ads_daily_data FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_business_accounts tenant_insert_instagram_business_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_instagram_business_accounts ON public.instagram_business_accounts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_comments tenant_insert_instagram_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_instagram_comments ON public.instagram_comments FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_conversations tenant_insert_instagram_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_instagram_conversations ON public.instagram_conversations FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_engagement tenant_insert_instagram_engagement; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_instagram_engagement ON public.instagram_engagement FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_messages tenant_insert_instagram_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_instagram_messages ON public.instagram_messages FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: integration_settings tenant_insert_integration_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_integration_settings ON public.integration_settings FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_conversions tenant_insert_lead_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_lead_conversions ON public.lead_conversions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_diagnostics_v2 tenant_insert_lead_diagnostics_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_lead_diagnostics_v2 ON public.lead_diagnostics_v2 FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_config tenant_insert_lead_distribution_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_lead_distribution_config ON public.lead_distribution_config FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_log tenant_insert_lead_distribution_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_lead_distribution_log ON public.lead_distribution_log FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_members tenant_insert_lead_distribution_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_lead_distribution_members ON public.lead_distribution_members FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: leads tenant_insert_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_leads ON public.leads FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: llm_provider_configs tenant_insert_llm_provider_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_llm_provider_configs ON public.llm_provider_configs FOR INSERT WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meetings tenant_insert_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meetings ON public.meetings FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_calls_history tenant_insert_member_calls_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_member_calls_history ON public.member_calls_history FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_daily_activity tenant_insert_member_daily_activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_member_daily_activity ON public.member_daily_activity FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_engagement_snapshots tenant_insert_member_engagement_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_member_engagement_snapshots ON public.member_engagement_snapshots FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_lessons_progress tenant_insert_member_lessons_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_member_lessons_progress ON public.member_lessons_progress FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_accounts tenant_insert_meta_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meta_ads_accounts ON public.meta_ads_accounts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_ad_data tenant_insert_meta_ads_ad_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meta_ads_ad_data ON public.meta_ads_ad_data FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_conversions tenant_insert_meta_ads_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meta_ads_conversions ON public.meta_ads_conversions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_daily_data tenant_insert_meta_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meta_ads_daily_data ON public.meta_ads_daily_data FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_sync_log tenant_insert_meta_ads_sync_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_meta_ads_sync_log ON public.meta_ads_sync_log FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_logs tenant_insert_notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_notification_logs ON public.notification_logs FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_rules tenant_insert_notification_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_notification_rules ON public.notification_rules FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: onboardings tenant_insert_onboardings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_onboardings ON public.onboardings FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_members tenant_insert_organization_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_organization_members ON public.organization_members FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_products tenant_insert_organization_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_organization_products ON public.organization_products FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organizations tenant_insert_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_organizations ON public.organizations FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: pain_registrations tenant_insert_pain_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_pain_registrations ON public.pain_registrations FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateway_fees tenant_insert_payment_gateway_fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_payment_gateway_fees ON public.payment_gateway_fees FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateways tenant_insert_payment_gateways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_payment_gateways ON public.payment_gateways FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: products tenant_insert_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_products ON public.products FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: profiles tenant_insert_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_profiles ON public.profiles FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: receive_lead_logs tenant_insert_receive_lead_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_receive_lead_logs ON public.receive_lead_logs FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_alerts tenant_insert_sales_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_alerts ON public.sales_alerts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_automation_rules tenant_insert_sales_automation_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_automation_rules ON public.sales_automation_rules FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_materials tenant_insert_sales_materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_materials ON public.sales_materials FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_notes tenant_insert_sales_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_notes ON public.sales_notes FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_stages tenant_insert_sales_pipeline_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_pipeline_stages ON public.sales_pipeline_stages FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_transitions tenant_insert_sales_pipeline_transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_pipeline_transitions ON public.sales_pipeline_transitions FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipelines tenant_insert_sales_pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_pipelines ON public.sales_pipelines FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_playbooks tenant_insert_sales_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_sales_playbooks ON public.sales_playbooks FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_alerts tenant_insert_social_seller_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_social_seller_alerts ON public.social_seller_alerts FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_rules tenant_insert_social_seller_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_social_seller_rules ON public.social_seller_rules FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_stages tenant_insert_social_seller_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_social_seller_stages ON public.social_seller_stages FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: team_members tenant_insert_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_team_members ON public.team_members FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: wavoip_devices tenant_insert_wavoip_devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_wavoip_devices ON public.wavoip_devices FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_group_members tenant_insert_whatsapp_group_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_group_members ON public.whatsapp_group_members FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_groups tenant_insert_whatsapp_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_groups ON public.whatsapp_groups FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_instances tenant_insert_whatsapp_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_instances ON public.whatsapp_instances FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_messages tenant_insert_whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_messages ON public.whatsapp_messages FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_config tenant_insert_whatsapp_task_bot_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_task_bot_config ON public.whatsapp_task_bot_config FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_logs tenant_insert_whatsapp_task_bot_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_insert_whatsapp_task_bot_logs ON public.whatsapp_task_bot_logs FOR INSERT TO authenticated WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: import_jobs tenant_isolation_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_insert ON public.import_jobs FOR INSERT WITH CHECK ((tenant_id = public.get_tenant_id()));


--
-- Name: import_jobs tenant_isolation_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_isolation_select ON public.import_jobs FOR SELECT USING ((tenant_id = public.get_tenant_id()));


--
-- Name: calendar_sync_channels tenant_manage_calendar_sync_channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_manage_calendar_sync_channels ON public.calendar_sync_channels TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (team_member_id = auth.uid()))) WITH CHECK (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (team_member_id = auth.uid())));


--
-- Name: meta_lead_ads_forms tenant_meta_forms; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_meta_forms ON public.meta_lead_ads_forms USING ((tenant_id = public.get_tenant_id()));


--
-- Name: meta_lead_ads_logs tenant_meta_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_meta_logs ON public.meta_lead_ads_logs USING ((tenant_id = public.get_tenant_id()));


--
-- Name: meta_lead_ads_pages tenant_meta_pages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_meta_pages ON public.meta_lead_ads_pages USING ((tenant_id = public.get_tenant_id()));


--
-- Name: tenant_sales_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenant_sales_config ENABLE ROW LEVEL SECURITY;

--
-- Name: tenant_sales_config tenant_sales_config_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_sales_config_insert ON public.tenant_sales_config FOR INSERT WITH CHECK (((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE ((team_members.auth_user_id = auth.uid()) AND (team_members.role = 'admin'::text)))) OR (current_setting('role'::text, true) = 'service_role'::text)));


--
-- Name: tenant_sales_config tenant_sales_config_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_sales_config_select ON public.tenant_sales_config FOR SELECT USING (((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE (team_members.auth_user_id = auth.uid()))) OR (current_setting('role'::text, true) = 'service_role'::text)));


--
-- Name: tenant_sales_config tenant_sales_config_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_sales_config_update ON public.tenant_sales_config FOR UPDATE USING (((tenant_id IN ( SELECT team_members.tenant_id
   FROM public.team_members
  WHERE ((team_members.auth_user_id = auth.uid()) AND (team_members.role = 'admin'::text)))) OR (current_setting('role'::text, true) = 'service_role'::text)));


--
-- Name: tenants tenant_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select ON public.tenants FOR SELECT TO authenticated USING (true);


--
-- Name: ai_agent_conversations tenant_select_ai_agent_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_ai_agent_conversations ON public.ai_agent_conversations FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_logs tenant_select_ai_agent_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_ai_agent_logs ON public.ai_agent_logs FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_message_queue tenant_select_ai_agent_message_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_ai_agent_message_queue ON public.ai_agent_message_queue FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_tools tenant_select_ai_agent_tools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_ai_agent_tools ON public.ai_agent_tools FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_sales_agents tenant_select_ai_sales_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_ai_sales_agents ON public.ai_sales_agents FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: analysis_templates tenant_select_analysis_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_analysis_templates ON public.analysis_templates FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_customers tenant_select_asaas_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_asaas_customers ON public.asaas_customers FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_webhooks tenant_select_asaas_webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_asaas_webhooks ON public.asaas_webhooks FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: calendar_events tenant_select_calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_calendar_events ON public.calendar_events FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: calendar_sync_channels tenant_select_calendar_sync_channels; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_calendar_sync_channels ON public.calendar_sync_channels FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: call_history tenant_select_call_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_call_history ON public.call_history FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configs tenant_select_chat_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_chat_configs ON public.chat_configs FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configurations tenant_select_chat_configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_chat_configurations ON public.chat_configurations FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_messages tenant_select_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_chat_messages ON public.chat_messages FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_sessions tenant_select_chat_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_chat_sessions ON public.chat_sessions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_playbooks tenant_select_coach_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_coach_playbooks ON public.coach_playbooks FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_sessions tenant_select_coach_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_coach_sessions ON public.coach_sessions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commission_rules tenant_select_commission_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_commission_rules ON public.commission_rules FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commissions tenant_select_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_commissions ON public.commissions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: company_activities tenant_select_company_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_company_activities ON public.company_activities FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_handled tenant_select_cs_conversation_handled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_conversation_handled ON public.cs_conversation_handled FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_notes tenant_select_cs_conversation_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_conversation_notes ON public.cs_conversation_notes FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_engagement_metrics tenant_select_cs_engagement_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_engagement_metrics ON public.cs_engagement_metrics FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_event_rsvps tenant_select_cs_event_rsvps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_event_rsvps ON public.cs_event_rsvps FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_events tenant_select_cs_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_events ON public.cs_events FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_current tenant_select_cs_health_current; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_health_current ON public.cs_health_current FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_scores_history tenant_select_cs_health_scores_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_health_scores_history ON public.cs_health_scores_history FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_inbox_metrics tenant_select_cs_inbox_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_inbox_metrics ON public.cs_inbox_metrics FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_interactions tenant_select_cs_interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_interactions ON public.cs_interactions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_objectives tenant_select_cs_objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_objectives ON public.cs_objectives FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_response_templates tenant_select_cs_response_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_response_templates ON public.cs_response_templates FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_success_metrics tenant_select_cs_success_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_success_metrics ON public.cs_success_metrics FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_touchpoints tenant_select_cs_touchpoints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_cs_touchpoints ON public.cs_touchpoints FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_contacts tenant_select_deal_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_deal_contacts ON public.deal_contacts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_loss_reasons tenant_select_deal_loss_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_deal_loss_reasons ON public.deal_loss_reasons FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payment_installments tenant_select_deal_payment_installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_deal_payment_installments ON public.deal_payment_installments FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payments tenant_select_deal_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_deal_payments ON public.deal_payments FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deals tenant_select_deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_deals ON public.deals FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_accounts tenant_select_financial_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_financial_accounts ON public.financial_accounts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_categories tenant_select_financial_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_financial_categories ON public.financial_categories FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_entries tenant_select_financial_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_financial_entries ON public.financial_entries FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_accounts tenant_select_google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_google_ads_accounts ON public.google_ads_accounts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_campaign_data tenant_select_google_ads_campaign_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_google_ads_campaign_data ON public.google_ads_campaign_data FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_daily_data tenant_select_google_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_google_ads_daily_data ON public.google_ads_daily_data FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_business_accounts tenant_select_instagram_business_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_instagram_business_accounts ON public.instagram_business_accounts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_comments tenant_select_instagram_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_instagram_comments ON public.instagram_comments FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_conversations tenant_select_instagram_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_instagram_conversations ON public.instagram_conversations FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_engagement tenant_select_instagram_engagement; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_instagram_engagement ON public.instagram_engagement FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_messages tenant_select_instagram_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_instagram_messages ON public.instagram_messages FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: integration_settings tenant_select_integration_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_integration_settings ON public.integration_settings FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_conversions tenant_select_lead_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_lead_conversions ON public.lead_conversions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_diagnostics_v2 tenant_select_lead_diagnostics_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_lead_diagnostics_v2 ON public.lead_diagnostics_v2 FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_config tenant_select_lead_distribution_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_lead_distribution_config ON public.lead_distribution_config FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_log tenant_select_lead_distribution_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_lead_distribution_log ON public.lead_distribution_log FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_members tenant_select_lead_distribution_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_lead_distribution_members ON public.lead_distribution_members FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: leads tenant_select_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_leads ON public.leads FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: llm_provider_configs tenant_select_llm_provider_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_llm_provider_configs ON public.llm_provider_configs FOR SELECT USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meetings tenant_select_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meetings ON public.meetings FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_calls_history tenant_select_member_calls_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_member_calls_history ON public.member_calls_history FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_daily_activity tenant_select_member_daily_activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_member_daily_activity ON public.member_daily_activity FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_engagement_snapshots tenant_select_member_engagement_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_member_engagement_snapshots ON public.member_engagement_snapshots FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_lessons_progress tenant_select_member_lessons_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_member_lessons_progress ON public.member_lessons_progress FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_accounts tenant_select_meta_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meta_ads_accounts ON public.meta_ads_accounts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_ad_data tenant_select_meta_ads_ad_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meta_ads_ad_data ON public.meta_ads_ad_data FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_conversions tenant_select_meta_ads_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meta_ads_conversions ON public.meta_ads_conversions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_daily_data tenant_select_meta_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meta_ads_daily_data ON public.meta_ads_daily_data FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_sync_log tenant_select_meta_ads_sync_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_meta_ads_sync_log ON public.meta_ads_sync_log FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: migration_log tenant_select_migration_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_migration_log ON public.migration_log FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_logs tenant_select_notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_notification_logs ON public.notification_logs FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_rules tenant_select_notification_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_notification_rules ON public.notification_rules FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: onboardings tenant_select_onboardings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_onboardings ON public.onboardings FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_members tenant_select_organization_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_organization_members ON public.organization_members FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_products tenant_select_organization_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_organization_products ON public.organization_products FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organizations tenant_select_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_organizations ON public.organizations FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: pain_registrations tenant_select_pain_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_pain_registrations ON public.pain_registrations FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateway_fees tenant_select_payment_gateway_fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_payment_gateway_fees ON public.payment_gateway_fees FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateways tenant_select_payment_gateways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_payment_gateways ON public.payment_gateways FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: products tenant_select_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_products ON public.products FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: profiles tenant_select_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_profiles ON public.profiles FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: receive_lead_logs tenant_select_receive_lead_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_receive_lead_logs ON public.receive_lead_logs FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_alerts tenant_select_sales_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_alerts ON public.sales_alerts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_automation_rules tenant_select_sales_automation_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_automation_rules ON public.sales_automation_rules FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_materials tenant_select_sales_materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_materials ON public.sales_materials FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_notes tenant_select_sales_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_notes ON public.sales_notes FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_stages tenant_select_sales_pipeline_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_pipeline_stages ON public.sales_pipeline_stages FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_transitions tenant_select_sales_pipeline_transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_pipeline_transitions ON public.sales_pipeline_transitions FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipelines tenant_select_sales_pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_pipelines ON public.sales_pipelines FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_playbooks tenant_select_sales_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_sales_playbooks ON public.sales_playbooks FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_alerts tenant_select_social_seller_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_social_seller_alerts ON public.social_seller_alerts FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_rules tenant_select_social_seller_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_social_seller_rules ON public.social_seller_rules FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_stages tenant_select_social_seller_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_social_seller_stages ON public.social_seller_stages FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: team_members tenant_select_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_team_members ON public.team_members FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: wavoip_devices tenant_select_wavoip_devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_wavoip_devices ON public.wavoip_devices FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_group_members tenant_select_whatsapp_group_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_group_members ON public.whatsapp_group_members FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_groups tenant_select_whatsapp_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_groups ON public.whatsapp_groups FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_instances tenant_select_whatsapp_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_instances ON public.whatsapp_instances FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_messages tenant_select_whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_messages ON public.whatsapp_messages FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_config tenant_select_whatsapp_task_bot_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_task_bot_config ON public.whatsapp_task_bot_config FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_logs tenant_select_whatsapp_task_bot_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_select_whatsapp_task_bot_logs ON public.whatsapp_task_bot_logs FOR SELECT TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: team_members tenant_self_update_team_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_self_update_team_members ON public.team_members FOR UPDATE USING (((tenant_id = public.get_tenant_id()) AND (auth_user_id = auth.uid()))) WITH CHECK (((tenant_id = public.get_tenant_id()) AND (auth_user_id = auth.uid())));


--
-- Name: ai_agent_conversations tenant_update_ai_agent_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_ai_agent_conversations ON public.ai_agent_conversations FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_logs tenant_update_ai_agent_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_ai_agent_logs ON public.ai_agent_logs FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_message_queue tenant_update_ai_agent_message_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_ai_agent_message_queue ON public.ai_agent_message_queue FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_agent_tools tenant_update_ai_agent_tools; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_ai_agent_tools ON public.ai_agent_tools FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: ai_sales_agents tenant_update_ai_sales_agents; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_ai_sales_agents ON public.ai_sales_agents FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: analysis_templates tenant_update_analysis_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_analysis_templates ON public.analysis_templates FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_customers tenant_update_asaas_customers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_asaas_customers ON public.asaas_customers FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: asaas_webhooks tenant_update_asaas_webhooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_asaas_webhooks ON public.asaas_webhooks FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: calendar_events tenant_update_calendar_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_calendar_events ON public.calendar_events FOR UPDATE TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (team_member_id = auth.uid())));


--
-- Name: call_history tenant_update_call_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_call_history ON public.call_history FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configs tenant_update_chat_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_chat_configs ON public.chat_configs FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_configurations tenant_update_chat_configurations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_chat_configurations ON public.chat_configurations FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_messages tenant_update_chat_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_chat_messages ON public.chat_messages FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: chat_sessions tenant_update_chat_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_chat_sessions ON public.chat_sessions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_playbooks tenant_update_coach_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_coach_playbooks ON public.coach_playbooks FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: coach_sessions tenant_update_coach_sessions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_coach_sessions ON public.coach_sessions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commission_rules tenant_update_commission_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_commission_rules ON public.commission_rules FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: commissions tenant_update_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_commissions ON public.commissions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: company_activities tenant_update_company_activities; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_company_activities ON public.company_activities FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_handled tenant_update_cs_conversation_handled; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_conversation_handled ON public.cs_conversation_handled FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_conversation_notes tenant_update_cs_conversation_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_conversation_notes ON public.cs_conversation_notes FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_engagement_metrics tenant_update_cs_engagement_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_engagement_metrics ON public.cs_engagement_metrics FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_event_rsvps tenant_update_cs_event_rsvps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_event_rsvps ON public.cs_event_rsvps FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_events tenant_update_cs_events; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_events ON public.cs_events FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_current tenant_update_cs_health_current; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_health_current ON public.cs_health_current FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_health_scores_history tenant_update_cs_health_scores_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_health_scores_history ON public.cs_health_scores_history FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_inbox_metrics tenant_update_cs_inbox_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_inbox_metrics ON public.cs_inbox_metrics FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_interactions tenant_update_cs_interactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_interactions ON public.cs_interactions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_objectives tenant_update_cs_objectives; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_objectives ON public.cs_objectives FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_response_templates tenant_update_cs_response_templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_response_templates ON public.cs_response_templates FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_success_metrics tenant_update_cs_success_metrics; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_success_metrics ON public.cs_success_metrics FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: cs_touchpoints tenant_update_cs_touchpoints; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_cs_touchpoints ON public.cs_touchpoints FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_contacts tenant_update_deal_contacts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_deal_contacts ON public.deal_contacts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_loss_reasons tenant_update_deal_loss_reasons; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_deal_loss_reasons ON public.deal_loss_reasons FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payment_installments tenant_update_deal_payment_installments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_deal_payment_installments ON public.deal_payment_installments FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deal_payments tenant_update_deal_payments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_deal_payments ON public.deal_payments FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: deals tenant_update_deals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_deals ON public.deals FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_accounts tenant_update_financial_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_financial_accounts ON public.financial_accounts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_categories tenant_update_financial_categories; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_financial_categories ON public.financial_categories FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: financial_entries tenant_update_financial_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_financial_entries ON public.financial_entries FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_accounts tenant_update_google_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_google_ads_accounts ON public.google_ads_accounts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_campaign_data tenant_update_google_ads_campaign_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_google_ads_campaign_data ON public.google_ads_campaign_data FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: google_ads_daily_data tenant_update_google_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_google_ads_daily_data ON public.google_ads_daily_data FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_business_accounts tenant_update_instagram_business_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_instagram_business_accounts ON public.instagram_business_accounts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_comments tenant_update_instagram_comments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_instagram_comments ON public.instagram_comments FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_conversations tenant_update_instagram_conversations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_instagram_conversations ON public.instagram_conversations FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_engagement tenant_update_instagram_engagement; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_instagram_engagement ON public.instagram_engagement FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: instagram_messages tenant_update_instagram_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_instagram_messages ON public.instagram_messages FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: integration_settings tenant_update_integration_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_integration_settings ON public.integration_settings FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_conversions tenant_update_lead_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_lead_conversions ON public.lead_conversions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_diagnostics_v2 tenant_update_lead_diagnostics_v2; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_lead_diagnostics_v2 ON public.lead_diagnostics_v2 FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_config tenant_update_lead_distribution_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_lead_distribution_config ON public.lead_distribution_config FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_log tenant_update_lead_distribution_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_lead_distribution_log ON public.lead_distribution_log FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: lead_distribution_members tenant_update_lead_distribution_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_lead_distribution_members ON public.lead_distribution_members FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: leads tenant_update_leads; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_leads ON public.leads FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: llm_provider_configs tenant_update_llm_provider_configs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_llm_provider_configs ON public.llm_provider_configs FOR UPDATE USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meetings tenant_update_meetings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meetings ON public.meetings FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_calls_history tenant_update_member_calls_history; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_member_calls_history ON public.member_calls_history FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_daily_activity tenant_update_member_daily_activity; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_member_daily_activity ON public.member_daily_activity FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_engagement_snapshots tenant_update_member_engagement_snapshots; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_member_engagement_snapshots ON public.member_engagement_snapshots FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: member_lessons_progress tenant_update_member_lessons_progress; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_member_lessons_progress ON public.member_lessons_progress FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_accounts tenant_update_meta_ads_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meta_ads_accounts ON public.meta_ads_accounts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_ad_data tenant_update_meta_ads_ad_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meta_ads_ad_data ON public.meta_ads_ad_data FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_conversions tenant_update_meta_ads_conversions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meta_ads_conversions ON public.meta_ads_conversions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_daily_data tenant_update_meta_ads_daily_data; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meta_ads_daily_data ON public.meta_ads_daily_data FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: meta_ads_sync_log tenant_update_meta_ads_sync_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_meta_ads_sync_log ON public.meta_ads_sync_log FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_logs tenant_update_notification_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_notification_logs ON public.notification_logs FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: notification_rules tenant_update_notification_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_notification_rules ON public.notification_rules FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: onboardings tenant_update_onboardings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_onboardings ON public.onboardings FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_members tenant_update_organization_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_organization_members ON public.organization_members FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organization_products tenant_update_organization_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_organization_products ON public.organization_products FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: organizations tenant_update_organizations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_organizations ON public.organizations FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: pain_registrations tenant_update_pain_registrations; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_pain_registrations ON public.pain_registrations FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateway_fees tenant_update_payment_gateway_fees; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_payment_gateway_fees ON public.payment_gateway_fees FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: payment_gateways tenant_update_payment_gateways; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_payment_gateways ON public.payment_gateways FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: products tenant_update_products; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_products ON public.products FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: receive_lead_logs tenant_update_receive_lead_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_receive_lead_logs ON public.receive_lead_logs FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_alerts tenant_update_sales_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_alerts ON public.sales_alerts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_automation_rules tenant_update_sales_automation_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_automation_rules ON public.sales_automation_rules FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_materials tenant_update_sales_materials; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_materials ON public.sales_materials FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_notes tenant_update_sales_notes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_notes ON public.sales_notes FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_stages tenant_update_sales_pipeline_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_pipeline_stages ON public.sales_pipeline_stages FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipeline_transitions tenant_update_sales_pipeline_transitions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_pipeline_transitions ON public.sales_pipeline_transitions FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_pipelines tenant_update_sales_pipelines; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_pipelines ON public.sales_pipelines FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: sales_playbooks tenant_update_sales_playbooks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_sales_playbooks ON public.sales_playbooks FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: profiles tenant_update_self_profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_self_profiles ON public.profiles FOR UPDATE TO authenticated USING (((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)) AND (id = auth.uid())));


--
-- Name: social_seller_alerts tenant_update_social_seller_alerts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_social_seller_alerts ON public.social_seller_alerts FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_rules tenant_update_social_seller_rules; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_social_seller_rules ON public.social_seller_rules FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: social_seller_stages tenant_update_social_seller_stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_social_seller_stages ON public.social_seller_stages FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: wavoip_devices tenant_update_wavoip_devices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_wavoip_devices ON public.wavoip_devices FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_group_members tenant_update_whatsapp_group_members; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_group_members ON public.whatsapp_group_members FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_groups tenant_update_whatsapp_groups; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_groups ON public.whatsapp_groups FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_instances tenant_update_whatsapp_instances; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_instances ON public.whatsapp_instances FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_messages tenant_update_whatsapp_messages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_messages ON public.whatsapp_messages FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_config tenant_update_whatsapp_task_bot_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_task_bot_config ON public.whatsapp_task_bot_config FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: whatsapp_task_bot_logs tenant_update_whatsapp_task_bot_logs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenant_update_whatsapp_task_bot_logs ON public.whatsapp_task_bot_logs FOR UPDATE TO authenticated USING ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id))) WITH CHECK ((tenant_id = ( SELECT public.get_tenant_id() AS get_tenant_id)));


--
-- Name: tenants; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

--
-- Name: tenants tenants_insert_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_insert_superadmin ON public.tenants FOR INSERT WITH CHECK (public.is_superadmin());


--
-- Name: tenants tenants_select_superadmin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tenants_select_superadmin ON public.tenants FOR SELECT USING (true);


--
-- Name: twilio_call_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.twilio_call_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: wavoip_devices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.wavoip_devices ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_group_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_group_members ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_instances; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_task_bot_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_task_bot_config ENABLE ROW LEVEL SECURITY;

--
-- Name: whatsapp_task_bot_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.whatsapp_task_bot_logs ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


