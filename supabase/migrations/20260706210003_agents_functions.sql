-- ============================================================
-- 0003 — Funções da Plataforma (extraídas da PRODUÇÃO validada)
--
-- TODAS as 42 funções do agent-runner e das skills, incluindo:
--  - Core: route_lookup, get_credential_data, execute_readonly (com blacklist)
--  - Jobs/Lembretes: create_job, reminders_due, reminder_complete (recorrência),
--    schedule_reminder (mínimo configurável por agente)
--  - Notas/Memória: save/read/list/search_notes, core memory, archival
--  - Vendas: qualify_lead, change_stage, schedule_meeting, check_availability...
--  - Kit CRM: create_lead, create_deal, create_task, complete_task (escopadas)
--  - Clone: agent_create_from_template (copia tools + interpola variáveis)
--  - Time: agent_team_roster (nome+telefone, sem PII sensível)
-- ============================================================

CREATE OR REPLACE FUNCTION public._agent_blacklist_tables()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT ARRAY[
    'agents_registry','agents_tools','agents_deployments','agents_sessions','agents_messages',
    'agents_action_log','agents_skill_catalog','agents_provider_credentials','agents_integration_providers',
    'profiles','team_members','auth.users',
    'bank_accounts','bank_transactions','asaas_customers','asaas_webhooks',
    'nfse_emissions','payment_gateways','payment_gateway_fees',
    'config','fiscal_config','twilio_settings','wavoip_devices',
    'whatsapp_instances','whatsapp_task_bot_config',
    'ai_critical_decisions','user_action_log','ai_agent_logs',
    'ai_sales_agents','ai_agent_tools','ai_agent_conversations'
  ]::text[];
$function$
;

CREATE OR REPLACE FUNCTION public.agent_change_stage(p_deal_id uuid, p_agent_id uuid, p_stage_name text DEFAULT NULL::text, p_stage_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_allow_regression boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_target_stage_id uuid; v_target_stage_name text; v_target_position int;
  v_current_stage_id uuid; v_current_position int; v_pipeline_id uuid; v_lead_id uuid;
BEGIN
  SELECT pipeline_stage_id, pipeline_id, lead_id INTO v_current_stage_id, v_pipeline_id, v_lead_id
  FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','deal_not_found'); END IF;
  IF p_stage_id IS NOT NULL THEN
    SELECT id, name, position INTO v_target_stage_id, v_target_stage_name, v_target_position
    FROM sales_pipeline_stages WHERE id = p_stage_id;
  ELSIF p_stage_name IS NOT NULL THEN
    SELECT id, name, position INTO v_target_stage_id, v_target_stage_name, v_target_position
    FROM sales_pipeline_stages WHERE pipeline_id = v_pipeline_id AND lower(name) = lower(p_stage_name)
    ORDER BY position ASC LIMIT 1;
  ELSE RETURN jsonb_build_object('ok',false,'error','missing_stage'); END IF;
  IF v_target_stage_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','stage_not_found','stage_name',p_stage_name); END IF;
  IF v_current_stage_id = v_target_stage_id THEN
    RETURN jsonb_build_object('ok',true,'already_in_stage',true,'stage_id',v_target_stage_id,'stage_name',v_target_stage_name);
  END IF;
  IF NOT p_allow_regression THEN
    SELECT position INTO v_current_position FROM sales_pipeline_stages WHERE id = v_current_stage_id;
    IF v_target_position < v_current_position THEN
      -- Otten drift: ai_critical_decisions nao existe. Audit tolerante (no-op se tabela ausente).
      BEGIN
        INSERT INTO ai_critical_decisions (lead_id, agent_id, deal_id, conversation_id, decision_type, decision, reason, severity, snapshot_data, requires_review)
        VALUES (v_lead_id, p_agent_id, p_deal_id, p_session_id, 'change_stage', 'blocked_regression',
          format('Tentou voltar de pos %s pra pos %s', v_current_position, v_target_position),
          'high', jsonb_build_object('from_stage_id',v_current_stage_id,'to_stage_id',v_target_stage_id), true);
      EXCEPTION WHEN undefined_table THEN NULL; END;
      RETURN jsonb_build_object('ok',false,'error','regression_blocked');
    END IF;
  END IF;
  UPDATE deals SET pipeline_stage_id = v_target_stage_id, updated_at = now() WHERE id = p_deal_id;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, deal_id, conversation_id, decision_type, decision, reason, severity, snapshot_data)
    VALUES (v_lead_id, p_agent_id, p_deal_id, p_session_id, 'change_stage', 'success', p_reason, 'low',
      jsonb_build_object('from_stage_id',v_current_stage_id,'to_stage_id',v_target_stage_id,'to_stage_name',v_target_stage_name));
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'deal_id',p_deal_id,'to_stage_id',v_target_stage_id,'to_stage_name',v_target_stage_name);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_check_availability(p_closer_ids uuid[], p_days_ahead integer DEFAULT 7, p_duration_minutes integer DEFAULT 30, p_working_hour_start text DEFAULT '08:00'::text, p_working_hour_end text DEFAULT '18:00'::text, p_buffer_minutes integer DEFAULT 15, p_max_slots integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_slot_start timestamptz; v_slot_end timestamptz;
  v_day_offset int; v_hour_iter int; v_minute_iter int;
  v_slots jsonb := '[]'::jsonb; v_busy_count int;
  v_start_h int := (split_part(p_working_hour_start,':',1))::int;
  v_end_h   int := (split_part(p_working_hour_end,':',1))::int;
  v_now timestamptz := now(); v_added int := 0;
BEGIN
  IF p_closer_ids IS NULL OR array_length(p_closer_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok',false,'error','no_closers_provided','slots','[]'::jsonb);
  END IF;
  FOR v_day_offset IN 0..p_days_ahead LOOP
    EXIT WHEN v_added >= p_max_slots;
    IF EXTRACT(DOW FROM v_now + (v_day_offset||' days')::interval) IN (0,6) THEN CONTINUE; END IF;
    FOR v_hour_iter IN v_start_h..v_end_h-1 LOOP
      EXIT WHEN v_added >= p_max_slots;
      FOREACH v_minute_iter IN ARRAY ARRAY[0,30] LOOP
        EXIT WHEN v_added >= p_max_slots;
        v_slot_start := date_trunc('day', v_now + (v_day_offset||' days')::interval)
                        + (v_hour_iter||' hours')::interval + (v_minute_iter||' minutes')::interval;
        v_slot_end := v_slot_start + (p_duration_minutes||' minutes')::interval;
        IF v_slot_start < v_now + interval '30 minutes' THEN CONTINUE; END IF;
        SELECT COUNT(*) INTO v_busy_count FROM company_activities ca
        WHERE ca.responsavel_id = ANY(p_closer_ids) AND ca.task_type IN ('meeting','call')
          AND ca.completed = false
          AND ca.scheduled_at >= v_slot_start - (p_buffer_minutes||' minutes')::interval
          AND ca.scheduled_at <  v_slot_end   + (p_buffer_minutes||' minutes')::interval;
        IF v_busy_count < array_length(p_closer_ids,1) THEN
          v_slots := v_slots || jsonb_build_object('start',v_slot_start,'end',v_slot_end,
            'duration_minutes',p_duration_minutes,'available_closers',array_length(p_closer_ids,1)-v_busy_count);
          v_added := v_added + 1;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('ok',true,'slots',v_slots,'total_found',v_added,'pool_size',array_length(p_closer_ids,1));
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_complete_task(p_task_id uuid, p_agent_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_name text;
BEGIN
  UPDATE company_activities SET completed=true, status='completed', updated_at=now()
  WHERE id=p_task_id RETURNING name INTO v_name;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','tarefa nao encontrada'); END IF;
  RETURN jsonb_build_object('ok',true,'task_id',p_task_id,'message','Tarefa concluida: '||v_name);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_confirm_meeting(p_activity_id uuid, p_agent_id uuid, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead_id uuid;
BEGIN
  SELECT lead_id INTO v_lead_id FROM company_activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','activity_not_found'); END IF;
  UPDATE company_activities SET
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('confirmed',true,'confirmed_at',now()),
    updated_at = now() WHERE id = p_activity_id;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, conversation_id, decision_type, decision, reason, severity, snapshot_data)
    VALUES (v_lead_id, p_agent_id, p_session_id, 'meeting_confirmed', 'success', 'Lead confirmou', 'low',
      jsonb_build_object('activity_id',p_activity_id));
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'activity_id',p_activity_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_create_deal(p_agent_id uuid, p_lead_id uuid, p_title text DEFAULT NULL::text, p_value numeric DEFAULT NULL::numeric, p_pipeline_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_deal uuid; v_pipe uuid; v_stage uuid; v_lead_name text;
BEGIN
  IF p_lead_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','lead_id obrigatorio'); END IF;
  v_tenant := agent_resolve_tenant(p_user_id);
  SELECT name INTO v_lead_name FROM leads WHERE id=p_lead_id;
  IF v_lead_name IS NULL THEN RETURN jsonb_build_object('ok',false,'error','lead nao encontrado'); END IF;

  v_pipe := COALESCE(p_pipeline_id, (SELECT id FROM sales_pipelines WHERE tenant_id=v_tenant ORDER BY created_at LIMIT 1));
  SELECT id INTO v_stage FROM sales_pipeline_stages WHERE pipeline_id=v_pipe ORDER BY position LIMIT 1;

  INSERT INTO deals (lead_id, title, original_price, negotiated_price, pipeline_id, pipeline_stage_id, status, sales_rep_id, tenant_id)
  VALUES (p_lead_id, COALESCE(p_title,'Oportunidade — '||v_lead_name), p_value, p_value, v_pipe, v_stage, 'open', p_user_id, v_tenant)
  RETURNING id INTO v_deal;

  RETURN jsonb_build_object('ok',true,'deal_id',v_deal,'message','Deal criado para '||v_lead_name);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_create_from_template(p_template_id uuid, p_name text, p_slug text, p_emoji text DEFAULT NULL::text, p_color text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_vars jsonb DEFAULT '{}'::jsonb, p_credential_id uuid DEFAULT NULL::uuid, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tpl RECORD; new_id uuid; final_prompt text; final_provider text; final_model text; final_cred uuid; kv RECORD;
BEGIN
  SELECT * INTO tpl FROM agents_registry WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Template % não encontrado', p_template_id; END IF;
  final_prompt := tpl.system_prompt;
  FOR kv IN SELECT key, value FROM jsonb_each_text(COALESCE(p_vars, '{}'::jsonb)) LOOP
    final_prompt := replace(final_prompt, '{{' || kv.key || '}}', kv.value);
  END LOOP;
  final_cred := COALESCE(p_credential_id, tpl.credential_id);
  IF final_cred IS NOT NULL THEN
    SELECT provider_type INTO final_provider FROM agents_provider_credentials WHERE id = final_cred;
  END IF;
  final_provider := COALESCE(final_provider, tpl.provider);
  final_model := tpl.model;
  INSERT INTO agents_registry (
    slug, display_name, description, emoji, provider, model, system_prompt, settings,
    tier, avatar_color, is_active, is_template, credential_id, parent_agent_id,
    daily_token_limit, daily_cost_limit_brl
  ) VALUES (
    p_slug, p_name, COALESCE(p_description, tpl.description), COALESCE(p_emoji, tpl.emoji),
    final_provider, final_model, final_prompt, tpl.settings,
    tpl.tier, COALESCE(p_color, tpl.avatar_color), true, false, final_cred, NULL,  -- parent NULL (não é o template)
    tpl.daily_token_limit, tpl.daily_cost_limit_brl
  ) RETURNING id INTO new_id;
  INSERT INTO agents_tools (agent_id, name, description, parameters_schema, action_type, action_config, usage_mode, is_active, provider)
  SELECT new_id, name, description, parameters_schema, action_type, action_config, usage_mode, is_active, provider
  FROM agents_tools WHERE agent_id = tpl.id;
  INSERT INTO agents_versions (agent_id, system_prompt, settings, change_summary, is_published, published_at)
  VALUES (new_id, final_prompt, tpl.settings, 'Criado a partir do template ' || tpl.display_name, true, now());
  INSERT INTO agents_deployments (agent_id, channel, config) VALUES (new_id, 'chat_web', '{}'::jsonb);
  RETURN p_slug;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_create_job(p_agent_id uuid, p_session_id uuid, p_channel text, p_tool_name text, p_external_id text, p_poll_config jsonb, p_provider text DEFAULT NULL::text, p_resume_context jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid;
BEGIN
  INSERT INTO agent_jobs (agent_id, session_id, channel, tool_name, external_id, poll_config, provider, resume_context)
  VALUES (p_agent_id, p_session_id, p_channel, p_tool_name, p_external_id, p_poll_config, p_provider, p_resume_context)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'job_id', v_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_create_lead(p_agent_id uuid, p_name text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text, p_source text DEFAULT 'agente'::text, p_create_deal boolean DEFAULT true, p_deal_title text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_tenant uuid; v_lead uuid; v_deal uuid; v_pipe uuid; v_stage uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name obrigatorio'); END IF;
  v_tenant := agent_resolve_tenant(p_user_id);

  -- pipeline padrao = primeiro criado; primeira etapa por posicao
  SELECT id INTO v_pipe FROM sales_pipelines WHERE tenant_id=v_tenant ORDER BY created_at LIMIT 1;
  SELECT id INTO v_stage FROM sales_pipeline_stages WHERE pipeline_id=v_pipe ORDER BY position LIMIT 1;

  INSERT INTO leads (name, phone, email, source, sales_stage, pipeline_stage_id, status, sales_rep_id, tenant_id)
  VALUES (trim(p_name), p_phone, p_email, COALESCE(p_source,'agente'), 'new', v_stage, 'active', p_user_id, v_tenant)
  RETURNING id INTO v_lead;

  IF p_create_deal THEN
    INSERT INTO deals (lead_id, title, pipeline_id, pipeline_stage_id, status, sales_rep_id, tenant_id)
    VALUES (v_lead, COALESCE(p_deal_title, 'Oportunidade — '||trim(p_name)), v_pipe, v_stage, 'open', p_user_id, v_tenant)
    RETURNING id INTO v_deal;
  END IF;

  RETURN jsonb_build_object('ok',true,'lead_id',v_lead,'deal_id',v_deal,
    'message','Lead criado: '||trim(p_name)||CASE WHEN v_deal IS NOT NULL THEN ' (+ deal no pipeline)' ELSE '' END);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_create_task(p_agent_id uuid, p_name text, p_description text DEFAULT NULL::text, p_priority text DEFAULT 'medium'::text, p_due_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_responsavel_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_id uuid; v_tenant uuid;
BEGIN
  IF p_name IS NULL OR trim(p_name)='' THEN RETURN jsonb_build_object('ok',false,'error','name obrigatorio'); END IF;
  v_tenant := agent_resolve_tenant(p_user_id);
  INSERT INTO company_activities (name, description, priority, scheduled_at, responsavel_id, task_type, status, completed, tenant_id)
  VALUES (trim(p_name), p_description,
    COALESCE(NULLIF(p_priority,''),'medium'), p_due_at, COALESCE(p_responsavel_id, p_user_id),
    'internal', 'not_started', false, v_tenant)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok',true,'task_id',v_id,
    'message','Tarefa criada no CRM: '||trim(p_name)||COALESCE(' (prazo '||to_char(p_due_at AT TIME ZONE 'America/Sao_Paulo','DD/MM HH24:MI')||')',''));
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_describe_function(p_fn_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_desc text; v_args text; v_returns text;
BEGIN
  SELECT obj_description(p.oid, 'pg_proc'), pg_get_function_arguments(p.oid), pg_get_function_result(p.oid)
  INTO v_desc, v_args, v_returns FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname='public' AND p.proname = p_fn_name LIMIT 1;
  IF v_desc IS NULL AND v_args IS NULL THEN RETURN jsonb_build_object('found', false); END IF;
  RETURN jsonb_build_object('found',true,'name',p_fn_name,'description',v_desc,'arguments',v_args,'returns',v_returns);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_describe_table(p_table text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_columns jsonb; v_fks jsonb;
BEGIN
  IF p_table = ANY(_agent_blacklist_tables()) THEN
    RETURN jsonb_build_object('error', format('Tabela "%s" nao permitida (sensivel).', p_table));
  END IF;
  SELECT jsonb_agg(jsonb_build_object('column',column_name,'type',data_type,'nullable',is_nullable='YES','default',column_default,'comment',col_description((p_table)::regclass, ordinal_position)) ORDER BY ordinal_position)
  INTO v_columns FROM information_schema.columns WHERE table_schema='public' AND table_name=p_table;
  IF v_columns IS NULL THEN RETURN jsonb_build_object('error', format('Tabela "%s" nao existe.', p_table)); END IF;
  SELECT jsonb_agg(jsonb_build_object('column',kcu.column_name,'references_table',ccu.table_name,'references_column',ccu.column_name))
  INTO v_fks FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' AND tc.table_name=p_table;
  RETURN jsonb_build_object('table',p_table,'comment',obj_description((p_table)::regclass,'pg_class'),'columns',v_columns,'foreign_keys',COALESCE(v_fks,'[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_execute_readonly(p_sql text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clean text; v_normalized text;
  v_destructive text[] := ARRAY['INSERT','UPDATE','DELETE','DROP','ALTER','TRUNCATE','CREATE','GRANT','REVOKE','COMMENT','COPY','EXECUTE','CALL','DO','MERGE','REINDEX','VACUUM','CLUSTER','LOCK','NOTIFY','LISTEN','UNLISTEN'];
  v_keyword text; v_blacklist text[]; v_blocked text; v_result jsonb;
  v_t0 timestamptz := clock_timestamp();
BEGIN
  v_clean := regexp_replace(p_sql, '--[^\n]*', '', 'g');
  v_clean := regexp_replace(v_clean, '/\*.*?\*/', '', 'g');
  v_clean := regexp_replace(trim(v_clean), ';\s*$', '');
  IF position(';' IN v_clean) > 0 THEN
    RETURN jsonb_build_object('error','Multiplos statements nao permitidos. Use um unico SELECT.');
  END IF;
  v_normalized := upper(trim(v_clean));
  IF NOT (v_normalized LIKE 'SELECT%' OR v_normalized LIKE 'WITH%') THEN
    RETURN jsonb_build_object('error','Apenas SELECT e WITH (CTE) sao permitidos.');
  END IF;
  FOREACH v_keyword IN ARRAY v_destructive LOOP
    IF v_normalized ~* ('\m'||v_keyword||'\M') THEN
      RETURN jsonb_build_object('error', format('Keyword "%s" nao permitida.', v_keyword), 'sql', p_sql);
    END IF;
  END LOOP;
  v_blacklist := _agent_blacklist_tables();
  FOREACH v_blocked IN ARRAY v_blacklist LOOP
    IF v_normalized ~* ('\m'||v_blocked||'\M') THEN
      RETURN jsonb_build_object('error', format('Tabela "%s" nao permitida.', v_blocked));
    END IF;
  END LOOP;
  IF NOT (v_normalized ~* '\mLIMIT\M\s+\d+') THEN v_clean := v_clean || ' LIMIT 1000'; END IF;
  BEGIN
    SET LOCAL statement_timeout = '30s';
    SET LOCAL transaction_read_only = on;
    EXECUTE format('SELECT jsonb_agg(row_to_json(t)) FROM (%s) t', v_clean) INTO v_result;
    RETURN jsonb_build_object('data',COALESCE(v_result,'[]'::jsonb),'count',jsonb_array_length(COALESCE(v_result,'[]'::jsonb)),'duration_ms',extract(epoch FROM (clock_timestamp()-v_t0))*1000,'sql',v_clean);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('error', SQLERRM, 'sql', v_clean);
  END;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_get_credential_data(p_provider_type text, p_owner_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_auth jsonb;
BEGIN
  SELECT auth_data INTO v_auth FROM agents_provider_credentials
  WHERE provider_type = p_provider_type AND is_active = true
  ORDER BY
    CASE WHEN p_owner_user_id IS NOT NULL AND owner_user_id = p_owner_user_id THEN 0 ELSE 1 END,
    CASE WHEN is_shared THEN 0 ELSE 1 END,
    created_at DESC
  LIMIT 1;
  IF v_auth IS NULL THEN RETURN jsonb_build_object('found', false, 'provider_type', p_provider_type); END IF;
  RETURN jsonb_build_object('found', true, 'data', v_auth);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_jobs_mark_timeouts()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_count int;
BEGIN
  UPDATE agent_jobs SET status='timeout', error='Timeout', updated_at=now(), completed_at=now()
  WHERE status='processing' AND now() > timeout_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_list_notes(p_agent_id uuid, p_tag text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_limit integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'tags',tags,'preview',left(content,100),'updated_at',updated_at) ORDER BY updated_at DESC)
  INTO v_rows FROM (
    SELECT * FROM agent_notes WHERE agent_id=p_agent_id AND NOT archived
      AND (p_tag IS NULL OR p_tag = ANY(tags))
      AND (p_search IS NULL OR title ILIKE '%'||p_search||'%' OR content ILIKE '%'||p_search||'%')
    ORDER BY updated_at DESC LIMIT p_limit
  ) t;
  RETURN jsonb_build_object('ok',true,'count',jsonb_array_length(COALESCE(v_rows,'[]'::jsonb)),'notes',COALESCE(v_rows,'[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_list_tables(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(table_name text, comment text, row_count_estimate bigint)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT c.relname::text, obj_description(c.oid, 'pg_class'), c.reltuples::bigint
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND NOT (c.relname = ANY(_agent_blacklist_tables()))
  ORDER BY c.relname;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_mark_deal_lost(p_deal_id uuid, p_agent_id uuid, p_reason text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead_id uuid; v_old_stage uuid;
BEGIN
  SELECT lead_id, pipeline_stage_id INTO v_lead_id, v_old_stage FROM deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','deal_not_found'); END IF;
  UPDATE deals SET status = 'lost', lost_at = now(), lost_reason = p_reason, updated_at = now() WHERE id = p_deal_id;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, deal_id, conversation_id, decision_type, decision, reason,
      severity, requires_review, snapshot_data)
    VALUES (v_lead_id, p_agent_id, p_deal_id, p_session_id, 'mark_lost', 'success', p_reason, 'high', true,
      jsonb_build_object('previous_stage_id', v_old_stage));
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'deal_id',p_deal_id,'reason',p_reason);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_notes_enqueue_embedding()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_url text; v_key text;
BEGIN
  IF NEW.embedding IS NULL AND coalesce(NEW.content,'') <> '' THEN
    BEGIN
      SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name='supabase_url' LIMIT 1;
      SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name='service_role_key' LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_url := NULL; v_key := NULL;
    END;
    IF v_url IS NULL OR v_key IS NULL THEN RETURN NEW; END IF;
    PERFORM net.http_post(
      url := v_url || '/functions/v1/generate-embedding',
      body := jsonb_build_object('table','agent_notes','row_id',NEW.id,'text', NEW.title||E'\n\n'||NEW.content),
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||v_key)
    );
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_notes_snapshot_version()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.content IS DISTINCT FROM NEW.content OR OLD.title IS DISTINCT FROM NEW.title) THEN
    INSERT INTO agent_note_versions (note_id, content, title, author, author_id)
    VALUES (OLD.id, OLD.content, OLD.title, COALESCE((NEW.metadata->>'last_author'), 'human'), OLD.owner_user_id);
    NEW.updated_at := now();
    IF OLD.content IS DISTINCT FROM NEW.content THEN NEW.embedding := NULL; NEW.embedding_at := NULL; END IF;
  END IF;
  RETURN NEW;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_qualify_lead(p_lead_id uuid, p_agent_id uuid, p_monthly_revenue_min numeric DEFAULT NULL::numeric, p_monthly_revenue_max numeric DEFAULT NULL::numeric, p_potential_revenue numeric DEFAULT NULL::numeric, p_revenue_confidence text DEFAULT 'low'::text, p_revenue_notes text DEFAULT NULL::text, p_authority text DEFAULT NULL::text, p_timeline_months integer DEFAULT NULL::integer, p_need_score integer DEFAULT NULL::integer, p_icp_decision text DEFAULT 'unknown'::text, p_reason text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_criteria_used jsonb DEFAULT NULL::jsonb, p_llm_input jsonb DEFAULT NULL::jsonb, p_llm_output jsonb DEFAULT NULL::jsonb, p_llm_model text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_max_revenue numeric; v_score int; v_classification text; v_next_action text; v_decision_id uuid; v_deal_id uuid;
BEGIN
  v_max_revenue := GREATEST(COALESCE(p_monthly_revenue_max,0), COALESCE(p_monthly_revenue_min,0), COALESCE(p_potential_revenue,0));
  v_score := LEAST(100, GREATEST(0,
    COALESCE(p_need_score,50)
    + CASE WHEN p_authority='decisor' THEN 20 WHEN p_authority='influenciador' THEN 10 ELSE 0 END
    + CASE WHEN COALESCE(p_timeline_months,99) <= 3 THEN 15 ELSE 0 END
    + CASE WHEN v_max_revenue >= 100000 THEN 15 ELSE 0 END));
  v_classification := COALESCE(p_icp_decision, CASE
    WHEN v_score >= 70 THEN 'qualified' WHEN v_score >= 40 THEN 'borderline' ELSE 'rejected' END);
  v_next_action := CASE v_classification
    WHEN 'qualified' THEN 'schedule_meeting'
    WHEN 'borderline' THEN 'qualify_call'
    WHEN 'rejected' THEN 'soft_decline'
    ELSE 'continue_conversation' END;
  UPDATE leads SET
    -- Otten drift: monthly_revenue_min/max, potential_revenue_brl, revenue_confidence, revenue_notes NAO existem em leads. Removidos.
    bant_budget           = (v_max_revenue >= 100000),
    bant_authority        = (p_authority IN ('decisor','influenciador')),
    bant_need             = (COALESCE(p_need_score,0) >= 50),
    bant_timeline         = (COALESCE(p_timeline_months,99) <= 3),
    sales_score           = v_score,
    updated_at = now()
  WHERE id = p_lead_id;
  SELECT id INTO v_deal_id FROM deals WHERE lead_id = p_lead_id ORDER BY created_at DESC LIMIT 1;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante (v_decision_id fica NULL se ausente).
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, deal_id, conversation_id, decision_type, decision, reason,
      severity, impact_value_brl, requires_review, snapshot_data, criteria_used, llm_model, llm_input, llm_output)
    VALUES (p_lead_id, p_agent_id, v_deal_id, p_session_id, 'qualification', v_classification, p_reason,
      CASE v_classification WHEN 'rejected' THEN 'high' WHEN 'borderline' THEN 'medium' ELSE 'low' END,
      v_max_revenue, v_classification IN ('borderline','rejected'),
      jsonb_build_object('monthly_revenue_min',p_monthly_revenue_min,'monthly_revenue_max',p_monthly_revenue_max,
        'potential_revenue',p_potential_revenue,'authority',p_authority,'timeline_months',p_timeline_months,
        'need_score',p_need_score,'computed_score',v_score),
      p_criteria_used, p_llm_model, p_llm_input, p_llm_output)
    RETURNING id INTO v_decision_id;
  EXCEPTION WHEN undefined_table THEN v_decision_id := NULL; END;
  RETURN jsonb_build_object('ok',true,'lead_id',p_lead_id,'classification',v_classification,
    'score',v_score,'next_action',v_next_action,'max_revenue_brl',v_max_revenue,'decision_id',v_decision_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_read_note(p_agent_id uuid, p_title text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_slug text; v_row record;
BEGIN
  v_slug := lower(regexp_replace(translate(p_title,
    'áàâãéèêíïóôõöúüçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ','aaaaeeeiioooouucnaaaaeeeiioooouucn'),
    '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  SELECT * INTO v_row FROM agent_notes WHERE agent_id=p_agent_id AND (slug=v_slug OR lower(title)=lower(p_title)) LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','note_not_found','searched',p_title); END IF;
  RETURN jsonb_build_object('ok',true,'id',v_row.id,'title',v_row.title,'slug',v_row.slug,'content',v_row.content,'tags',v_row.tags,'updated_at',v_row.updated_at);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_reminder_complete(p_reminder_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r record; v_next timestamptz;
BEGIN
  SELECT * INTO r FROM agent_reminders WHERE id = p_reminder_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  -- Sempre marca o disparo atual como enviado
  UPDATE agent_reminders
    SET status='sent', sent_at=now(), times_fired = times_fired + 1
    WHERE id = p_reminder_id;

  -- Recorrente? cria o próximo (a menos que tenha passado repeat_until)
  IF r.repeat_every_minutes IS NOT NULL THEN
    v_next := now() + (r.repeat_every_minutes || ' minutes')::interval;
    IF r.repeat_until IS NULL OR v_next <= r.repeat_until THEN
      INSERT INTO agent_reminders (agent_id, session_id, channel, fire_at, message, resume_context, repeat_every_minutes, repeat_until)
      VALUES (r.agent_id, r.session_id, r.channel, v_next, r.message, r.resume_context, r.repeat_every_minutes, r.repeat_until);
      RETURN jsonb_build_object('ok', true, 'rescheduled', true, 'next_fire_at', v_next);
    END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'rescheduled', false);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_reminders_due()
 RETURNS SETOF agent_reminders
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT * FROM public.agent_reminders WHERE status='pending' AND fire_at <= now() ORDER BY fire_at LIMIT 20;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_reschedule_meeting(p_activity_id uuid, p_agent_id uuid, p_new_start_at timestamp with time zone, p_reason text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_lead_id uuid; v_old_start timestamptz;
BEGIN
  SELECT lead_id, scheduled_at INTO v_lead_id, v_old_start FROM company_activities WHERE id = p_activity_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok',false,'error','activity_not_found'); END IF;
  UPDATE company_activities SET scheduled_at = p_new_start_at,
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('rescheduled_at',now(),'rescheduled_from',v_old_start,'reschedule_reason',p_reason),
    updated_at = now() WHERE id = p_activity_id;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, conversation_id, decision_type, decision, reason, severity, snapshot_data)
    VALUES (v_lead_id, p_agent_id, p_session_id, 'meeting_rescheduled', 'success', p_reason, 'medium',
      jsonb_build_object('activity_id',p_activity_id,'old_start',v_old_start,'new_start',p_new_start_at));
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'activity_id',p_activity_id,'old_start',v_old_start,'new_start',p_new_start_at);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_resolve_tenant(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    NULLIF(get_tenant_id(), '00000000-0000-0000-0000-000000000000'::uuid),
    (SELECT tenant_id FROM team_members WHERE id = p_user_id AND tenant_id IS NOT NULL LIMIT 1),
    (SELECT tenant_id FROM team_members WHERE tenant_id IS NOT NULL GROUP BY tenant_id ORDER BY count(*) DESC LIMIT 1)
  );
$function$
;

CREATE OR REPLACE FUNCTION public.agent_route_lookup(p_channel text, p_instance_id text, p_ctx jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(agent_slug text, agent_id uuid, deployment_id uuid, priority integer, match_used jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row record; v_clean_match jsonb; v_keywords jsonb; v_kw_mode text;
  v_text text; v_kw text; v_kw_hit boolean;
BEGIN
  v_text := lower(COALESCE(p_ctx->>'text', ''));
  FOR v_row IN
    SELECT d.id AS dep_id, d.config, d.agent_id, r.slug,
           COALESCE((d.config->>'priority')::int, 100) AS pri
    FROM agents_deployments d
    JOIN agents_registry r ON r.id = d.agent_id
    WHERE d.channel = p_channel AND d.is_active AND r.is_active
      AND (p_instance_id IS NULL OR d.config->>'instance_id' IS NULL OR d.config->>'instance_id' = p_instance_id)
    ORDER BY COALESCE((d.config->>'priority')::int, 100) ASC, d.created_at ASC
  LOOP
    v_keywords := v_row.config->'match'->'keywords';
    v_kw_mode  := COALESCE(v_row.config->'match'->>'keywords_mode', 'any');
    SELECT COALESCE(jsonb_object_agg(je.key, je.value), '{}'::jsonb) INTO v_clean_match
    FROM jsonb_each(COALESCE(v_row.config->'match', '{}'::jsonb)) AS je
    WHERE je.key NOT LIKE '\_\_%' ESCAPE '\'
      AND je.key NOT IN ('keywords','keywords_mode')
      AND je.value IS NOT NULL AND je.value <> 'null'::jsonb;
    IF NOT (v_clean_match = '{}'::jsonb OR p_ctx @> v_clean_match) THEN CONTINUE; END IF;
    IF v_keywords IS NOT NULL AND jsonb_typeof(v_keywords) = 'array' AND jsonb_array_length(v_keywords) > 0 THEN
      IF v_kw_mode = 'all' THEN
        v_kw_hit := true;
        FOR v_kw IN SELECT lower(x) FROM jsonb_array_elements_text(v_keywords) AS x LOOP
          IF v_kw = '' OR position(v_kw IN v_text) = 0 THEN v_kw_hit := false; EXIT; END IF;
        END LOOP;
      ELSE
        v_kw_hit := false;
        FOR v_kw IN SELECT lower(x) FROM jsonb_array_elements_text(v_keywords) AS x LOOP
          IF v_kw <> '' AND position(v_kw IN v_text) > 0 THEN v_kw_hit := true; EXIT; END IF;
        END LOOP;
      END IF;
      IF NOT v_kw_hit THEN CONTINUE; END IF;
    END IF;
    agent_slug := v_row.slug; agent_id := v_row.agent_id; deployment_id := v_row.dep_id; priority := v_row.pri;
    match_used := v_clean_match || CASE WHEN v_keywords IS NOT NULL THEN jsonb_build_object('keywords', v_keywords) ELSE '{}'::jsonb END;
    RETURN NEXT; RETURN;
  END LOOP;
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_save_note(p_agent_id uuid, p_user_id uuid, p_title text, p_content text, p_mode text DEFAULT 'overwrite'::text, p_tags text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_slug text; v_existing record; v_final_content text; v_id uuid;
  v_author text := CASE WHEN p_user_id IS NULL THEN 'agent' ELSE 'human' END;
BEGIN
  v_slug := lower(regexp_replace(translate(p_title,
    'áàâãéèêíïóôõöúüçñÁÀÂÃÉÈÊÍÏÓÔÕÖÚÜÇÑ','aaaaeeeiioooouucnaaaaeeeiioooouucn'),
    '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);
  IF v_slug = '' THEN v_slug := 'nota-'||extract(epoch from now())::bigint; END IF;
  SELECT * INTO v_existing FROM agent_notes WHERE agent_id=p_agent_id AND slug=v_slug LIMIT 1;
  IF v_existing IS NULL THEN
    INSERT INTO agent_notes (agent_id, owner_user_id, title, slug, content, tags, metadata)
    VALUES (p_agent_id, p_user_id, p_title, v_slug, p_content, COALESCE(p_tags,'{}'), jsonb_build_object('last_author', v_author))
    RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok',true,'created',true,'id',v_id,'slug',v_slug);
  END IF;
  v_final_content := CASE p_mode WHEN 'append' THEN v_existing.content||E'\n\n'||p_content ELSE p_content END;
  UPDATE agent_notes SET content=v_final_content, title=COALESCE(p_title,title), tags=COALESCE(p_tags,tags),
    metadata=metadata||jsonb_build_object('last_author', v_author), updated_at=now()
  WHERE id=v_existing.id;
  RETURN jsonb_build_object('ok',true,'created',false,'id',v_existing.id,'slug',v_slug,'mode',p_mode);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_schedule_followup(p_lead_id uuid, p_agent_id uuid, p_scheduled_for timestamp with time zone, p_message_brief text, p_reason text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_followup_id uuid;
BEGIN
  INSERT INTO ai_agent_scheduled_followups (lead_id, agent_id, scheduled_at, status, context_note)
  VALUES (p_lead_id, p_agent_id, p_scheduled_for, 'pending',
    COALESCE(p_message_brief,'') || CASE WHEN p_reason IS NOT NULL THEN E'\n[reason] '||p_reason ELSE '' END)
  RETURNING id INTO v_followup_id;
  RETURN jsonb_build_object('ok',true,'followup_id',v_followup_id,'scheduled_for',p_scheduled_for);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_schedule_meeting(p_lead_id uuid, p_agent_id uuid, p_closer_id uuid, p_start_at timestamp with time zone, p_duration_minutes integer DEFAULT 30, p_title text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_activity_id uuid; v_existing_id uuid; v_lead_name text;
BEGIN
  SELECT id INTO v_existing_id FROM company_activities
  WHERE lead_id = p_lead_id AND task_type IN ('meeting','call')
    AND scheduled_at = p_start_at AND created_at > now() - interval '60 seconds'
  ORDER BY created_at DESC LIMIT 1;
  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'deduped',true,'activity_id',v_existing_id,'scheduled_at',p_start_at);
  END IF;
  SELECT COALESCE(name, email, 'Lead') INTO v_lead_name FROM leads WHERE id = p_lead_id;
  -- Otten drift: company_activities NAO tem duration_minutes. Guardado em metadata.
  INSERT INTO company_activities (lead_id, responsavel_id, task_type, name, description,
    scheduled_at, completed, team, metadata)
  VALUES (p_lead_id, p_closer_id, 'meeting',
    COALESCE(p_title, 'Reuniao com '||v_lead_name), p_notes,
    p_start_at, false, 'comercial',
    jsonb_build_object('created_by','agent_v2','agent_id',p_agent_id,'duration_minutes',p_duration_minutes))
  RETURNING id INTO v_activity_id;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, conversation_id, decision_type, decision, reason, severity, snapshot_data)
    VALUES (p_lead_id, p_agent_id, p_session_id, 'meeting_scheduled', 'success', 'Reuniao criada via agente', 'medium',
      jsonb_build_object('activity_id',v_activity_id,'closer_id',p_closer_id,'start_at',p_start_at,'duration_minutes',p_duration_minutes));
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'activity_id',v_activity_id,'scheduled_at',p_start_at,'closer_id',p_closer_id);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_schedule_reminder(p_agent_id uuid, p_session_id uuid, p_channel text, p_fire_at timestamp with time zone, p_message text, p_user_id uuid DEFAULT NULL::uuid, p_lead_id uuid DEFAULT NULL::uuid, p_recipient text DEFAULT NULL::text, p_instance_id uuid DEFAULT NULL::uuid, p_deal_id uuid DEFAULT NULL::uuid, p_repeat_every_minutes integer DEFAULT NULL::integer, p_repeat_until timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_min int;
BEGIN
  IF p_fire_at IS NULL OR p_message IS NULL OR trim(p_message)='' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fire_at e message obrigatorios');
  END IF;
  IF p_fire_at < now() - interval '30 seconds' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'fire_at no passado');
  END IF;

  -- 0 / negativo = lembrete ÚNICO (não recorrência). Trata como NULL.
  IF p_repeat_every_minutes IS NOT NULL AND p_repeat_every_minutes <= 0 THEN
    p_repeat_every_minutes := NULL;
  END IF;

  -- Mínimo de recorrência CONFIGURÁVEL por agente (settings.min_recurrence_minutes). Default 5.
  IF p_repeat_every_minutes IS NOT NULL THEN
    SELECT GREATEST(1, COALESCE((settings->>'min_recurrence_minutes')::int, 5))
      INTO v_min FROM agents_registry WHERE id = p_agent_id;
    v_min := COALESCE(v_min, 5);
    IF p_repeat_every_minutes < v_min THEN
      RETURN jsonb_build_object('ok', false,
        'error', 'intervalo minimo de recorrencia deste agente e '||v_min||' min (ajustavel em settings.min_recurrence_minutes)');
    END IF;
  END IF;

  INSERT INTO agent_reminders (agent_id, session_id, channel, fire_at, message, resume_context, repeat_every_minutes, repeat_until)
  VALUES (p_agent_id, p_session_id, COALESCE(p_channel,'chat_web'), p_fire_at, p_message,
    jsonb_strip_nulls(jsonb_build_object('user_id',p_user_id,'lead_id',p_lead_id,'deal_id',p_deal_id,'recipient',p_recipient,'instance_id',p_instance_id)),
    p_repeat_every_minutes, p_repeat_until)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'reminder_id', v_id, 'fire_at', p_fire_at,
    'recurring', p_repeat_every_minutes IS NOT NULL,
    'message', CASE WHEN p_repeat_every_minutes IS NOT NULL
      THEN 'Rotina criada: repete a cada '||p_repeat_every_minutes||' min, começando '||to_char(p_fire_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM HH24:MI')||' (BR).'
      ELSE 'Lembrete único agendado para '||to_char(p_fire_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')||' (BR).' END);
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_search_notes(p_agent_id uuid, p_query text, p_query_embedding vector DEFAULT NULL::vector, p_top_k integer DEFAULT 3)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_rows jsonb;
BEGIN
  IF p_query_embedding IS NULL THEN
    SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'preview',left(content,150),'match_type','fts') ORDER BY rank DESC)
    INTO v_rows FROM (
      SELECT *, ts_rank(to_tsvector('portuguese', title||' '||content), plainto_tsquery('portuguese', p_query)) AS rank
      FROM agent_notes WHERE agent_id=p_agent_id AND NOT archived
        AND to_tsvector('portuguese', title||' '||content) @@ plainto_tsquery('portuguese', p_query)
      ORDER BY rank DESC LIMIT p_top_k
    ) t;
  ELSE
    SELECT jsonb_agg(jsonb_build_object('id',id,'title',title,'slug',slug,'preview',left(content,150),'similarity',round((1-distance)::numeric,3),'match_type','semantic') ORDER BY distance ASC)
    INTO v_rows FROM (
      SELECT id,title,slug,content, embedding <=> p_query_embedding AS distance
      FROM agent_notes WHERE agent_id=p_agent_id AND NOT archived AND embedding IS NOT NULL
      ORDER BY embedding <=> p_query_embedding LIMIT p_top_k
    ) t;
  END IF;
  RETURN jsonb_build_object('ok',true,'query',p_query,'method',CASE WHEN p_query_embedding IS NULL THEN 'fts' ELSE 'semantic' END,'results',COALESCE(v_rows,'[]'::jsonb));
END $function$
;

CREATE OR REPLACE FUNCTION public.agent_skill_my_deals(p_user_id uuid, p_stage text DEFAULT NULL::text, p_days_min integer DEFAULT NULL::integer)
 RETURNS TABLE(id uuid, title text, lead_name text, value numeric, stage text, days_in_stage integer, status text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT d.id, d.title, l.name, d.negotiated_price, ps.name,
    EXTRACT(day FROM (now() - d.updated_at))::int, d.status
  FROM deals d
  LEFT JOIN sales_pipeline_stages ps ON ps.id = d.pipeline_stage_id
  LEFT JOIN leads l ON l.id = d.lead_id
  WHERE d.sales_rep_id = p_user_id AND d.status IN ('open','negotiation')
    AND (p_stage IS NULL OR ps.name = p_stage)
    AND (p_days_min IS NULL OR d.updated_at < now() - (p_days_min||' days')::interval)
  ORDER BY d.negotiated_price DESC NULLS LAST LIMIT 50;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_skill_my_hot_leads(p_user_id uuid, p_limit integer DEFAULT 20)
 RETURNS TABLE(id uuid, name text, phone text, temperature text, temperature_reason text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Otten drift: leads NAO tem lead_temperature/temperature_reason.
  -- Equivalente: sales_score (int) como sinal de "hot" e sales_score_reason como motivo.
  SELECT l.id, l.name, l.phone,
    CASE WHEN COALESCE(l.sales_score,0) >= 70 THEN 'hot'
         WHEN COALESCE(l.sales_score,0) >= 40 THEN 'warm'
         ELSE 'cold' END::text AS temperature,
    l.sales_score_reason AS temperature_reason,
    l.created_at
  FROM leads l
  WHERE l.sales_rep_id = p_user_id AND COALESCE(l.sales_score,0) >= 70
  ORDER BY l.sales_score DESC NULLS LAST, l.created_at DESC LIMIT p_limit;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_skill_my_pipeline_summary(p_user_id uuid, p_pipeline_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(stage text, deal_count integer, total_value numeric, avg_days_in_stage numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT ps.name, COUNT(d.id)::int, COALESCE(SUM(d.negotiated_price),0),
         ROUND(AVG(EXTRACT(day FROM (now() - d.updated_at)))::numeric, 1)
  FROM sales_pipeline_stages ps
  LEFT JOIN deals d ON d.pipeline_stage_id = ps.id
    AND d.sales_rep_id = p_user_id AND d.status IN ('open','negotiation')
  WHERE p_pipeline_id IS NULL OR ps.pipeline_id = p_pipeline_id
  GROUP BY ps.name, ps.position
  HAVING COUNT(d.id) > 0
  ORDER BY COALESCE(SUM(d.negotiated_price),0) DESC;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_skill_notify_human(p_agent_id uuid, p_user_id uuid, p_session_id uuid, p_reason text)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  INSERT INTO agents_action_log (agent_id, session_id, user_id, tool_name, input, status)
  VALUES (p_agent_id, p_session_id, p_user_id, 'notify_human', jsonb_build_object('reason', p_reason), 'pending_approval')
  RETURNING id;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_skill_now_br()
 RETURNS TABLE(now_br timestamp with time zone, date_br text, time_br text, weekday text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::timestamptz,
         TO_CHAR(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
         TO_CHAR(now() AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI'),
         CASE EXTRACT(DOW FROM (now() AT TIME ZONE 'America/Sao_Paulo'))
           WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terca'
           WHEN 3 THEN 'Quarta'  WHEN 4 THEN 'Quinta'  WHEN 5 THEN 'Sexta'
           WHEN 6 THEN 'Sabado' END;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_team_roster()
 RETURNS TABLE(member_id uuid, name text, phone text, role text, is_active boolean)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT id, name, phone, role, is_active
  FROM team_members
  WHERE is_active = true AND phone IS NOT NULL AND phone <> ''
  ORDER BY name;
$function$
;

CREATE OR REPLACE FUNCTION public.agent_update_lead(p_lead_id uuid, p_agent_id uuid, p_patch jsonb, p_reason text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
-- Otten drift: whitelist reduzida SOMENTE pras colunas que existem em leads (Otten).
  -- Removidos (nao existem): company, city, employee_count, website, linkedin,
  --   monthly_revenue_min/max, potential_revenue_brl, revenue_confidence, revenue_notes,
  --   challenges, goals, objections, lead_source.
  DECLARE v_allowed_fields text[] := ARRAY[
    'name','email','company_name','job_title','city_name','state','instagram',
    'source','utm_source','utm_campaign'];
  v_field text; v_set_parts text[] := ARRAY[]::text[]; v_sql text; v_applied jsonb := '{}'::jsonb;
BEGIN
  FOR v_field IN SELECT jsonb_object_keys(p_patch) LOOP
    IF v_field = ANY(v_allowed_fields) THEN
      v_set_parts := v_set_parts || format('%I = $1->>%L', v_field, v_field);
      v_applied := v_applied || jsonb_build_object(v_field, p_patch->v_field);
    END IF;
  END LOOP;
  IF array_length(v_set_parts,1) IS NULL THEN RETURN jsonb_build_object('ok',false,'error','no_allowed_fields_in_patch'); END IF;
  v_sql := format('UPDATE leads SET %s, updated_at = now() WHERE id = %L', array_to_string(v_set_parts,', '), p_lead_id);
  EXECUTE v_sql USING p_patch;
  -- Otten drift: ai_critical_decisions nao existe. Audit tolerante.
  BEGIN
    INSERT INTO ai_critical_decisions (lead_id, agent_id, conversation_id, decision_type, decision, reason, severity, snapshot_data)
    VALUES (p_lead_id, p_agent_id, p_session_id, 'update_lead', 'success', p_reason, 'low', v_applied);
  EXCEPTION WHEN undefined_table THEN NULL; END;
  RETURN jsonb_build_object('ok',true,'applied',v_applied);
END $function$
;

CREATE OR REPLACE FUNCTION public.agents_search_archival(p_agent_id uuid, p_user_id uuid, p_query_embedding vector, p_k integer DEFAULT 5)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT '[]'::jsonb;
$function$
;

CREATE OR REPLACE FUNCTION public.agents_working_memory_merge(p_session_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_new jsonb;
BEGIN
  UPDATE agents_sessions
    SET working_memory = COALESCE(working_memory, '{}'::jsonb) || COALESCE(p_patch, '{}'::jsonb),
        updated_at = now()
    WHERE id = p_session_id
    RETURNING working_memory INTO v_new;
  RETURN COALESCE(v_new, '{}'::jsonb);
END $function$
;

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN NEW.updated_at := now(); RETURN NEW; END $function$
;

-- ============================================================
-- TRIGGERS (estado de produção)
-- ============================================================
DROP TRIGGER IF EXISTS tg_agent_notes_updated_at ON public.agent_notes;
CREATE TRIGGER tg_agent_notes_updated_at BEFORE UPDATE ON public.agent_notes FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
DROP TRIGGER IF EXISTS trg_agent_notes_embed ON public.agent_notes;
CREATE TRIGGER trg_agent_notes_embed AFTER INSERT OR UPDATE OF content, title ON public.agent_notes FOR EACH ROW EXECUTE FUNCTION agent_notes_enqueue_embedding();
DROP TRIGGER IF EXISTS trg_agent_notes_snapshot ON public.agent_notes;
CREATE TRIGGER trg_agent_notes_snapshot BEFORE UPDATE ON public.agent_notes FOR EACH ROW EXECUTE FUNCTION agent_notes_snapshot_version();
DROP TRIGGER IF EXISTS tg_agents_provider_credentials_updated_at ON public.agents_provider_credentials;
CREATE TRIGGER tg_agents_provider_credentials_updated_at BEFORE UPDATE ON public.agents_provider_credentials FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
DROP TRIGGER IF EXISTS tg_agents_registry_updated_at ON public.agents_registry;
CREATE TRIGGER tg_agents_registry_updated_at BEFORE UPDATE ON public.agents_registry FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
DROP TRIGGER IF EXISTS tg_agents_sessions_updated_at ON public.agents_sessions;
CREATE TRIGGER tg_agents_sessions_updated_at BEFORE UPDATE ON public.agents_sessions FOR EACH ROW EXECUTE FUNCTION tg_set_updated_at();
DROP TRIGGER IF EXISTS tg_agents_versions_autonum ON public.agents_versions;
CREATE TRIGGER tg_agents_versions_autonum BEFORE INSERT ON public.agents_versions FOR EACH ROW EXECUTE FUNCTION tg_agents_versions_autonum();
DROP TRIGGER IF EXISTS tg_agents_versions_sync_vn ON public.agents_versions;
CREATE TRIGGER tg_agents_versions_sync_vn BEFORE INSERT OR UPDATE ON public.agents_versions FOR EACH ROW EXECUTE FUNCTION tg_agents_versions_sync_vn();

-- ============================================================
-- PERMISSÕES
-- ============================================================
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'agent_get_credential_data','agent_route_lookup',
    'agent_create_job','agent_jobs_mark_timeouts','agent_reminders_due','agent_reminder_complete',
    'agent_save_note','agent_read_note','agent_list_notes','agent_search_notes',
    'agent_list_tables','agent_describe_table','agent_describe_function','agent_execute_readonly',
    'agent_skill_now_br','agent_skill_notify_human','agent_team_roster','agent_resolve_tenant',
    'agent_create_task','agent_complete_task','agent_create_lead','agent_create_deal',
    'agent_create_from_template'
  ] LOOP
    BEGIN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM PUBLIC', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated, service_role', fn);
    EXCEPTION WHEN OTHERS THEN NULL; -- overloads/ausentes não travam a migration
    END;
  END LOOP;
END $$;
