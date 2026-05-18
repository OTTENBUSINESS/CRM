-- ============================================================================
-- CLEANUP DAS TABELAS QUE NAO SAO MAIS USADAS
-- ============================================================================
-- Rode este script no SQL Editor do Supabase APOS confirmar que nao precisa
-- mais destes modulos. Os DROPs sao em CASCADE — vao remover indices, policies
-- e triggers das tabelas afetadas.
--
-- IMPORTANTE:
--   * O CRM comercial (leads, deals, pipelines, produtos, comissoes, tarefas,
--     times, reunioes, chamadas, WhatsApp, IA) NAO e afetado.
--   * As tabelas abaixo foram criadas por modulos que removemos:
--       - Customer Success (onboarding, churn, NPS, advisor, suporte)
--       - Eventos + Event App
--       - RH (tabelas HR_*)
--       - Financeiro detalhado (NFSe, Asaas, DRE)
--       - Instagram DMs
--       - Knowledge Base
--       - Organograma
--
-- Se tiver duvida em alguma tabela especifica, comente a linha para nao dropar.
-- ============================================================================

BEGIN;

-- Customer Success (health scores, churn, NPS, onboarding, advisor)
DROP TABLE IF EXISTS cs_health_scores CASCADE;
DROP TABLE IF EXISTS cs_health_overrides CASCADE;
DROP TABLE IF EXISTS cs_touchpoints CASCADE;
DROP TABLE IF EXISTS cs_interactions CASCADE;
DROP TABLE IF EXISTS cs_engagement_metrics CASCADE;
DROP TABLE IF EXISTS cs_success_metrics CASCADE;
DROP TABLE IF EXISTS cs_objectives CASCADE;
DROP TABLE IF EXISTS cs_alerts CASCADE;
DROP TABLE IF EXISTS cs_ai_actions CASCADE;
DROP TABLE IF EXISTS cs_ai_daily_briefings CASCADE;
DROP TABLE IF EXISTS cs_journey_stages CASCADE;
DROP TABLE IF EXISTS cs_onboardings CASCADE;
DROP TABLE IF EXISTS cs_onboarding_steps CASCADE;
DROP TABLE IF EXISTS cs_advisor_meetings CASCADE;
DROP TABLE IF EXISTS cs_advisor_clients CASCADE;
DROP TABLE IF EXISTS cs_advisors CASCADE;
DROP TABLE IF EXISTS cs_support_tickets CASCADE;
DROP TABLE IF EXISTS cs_support_metrics CASCADE;
DROP TABLE IF EXISTS cs_testimonials CASCADE;
DROP TABLE IF EXISTS cs_churn_overrides CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS client_timeline_events CASCADE;
DROP TABLE IF EXISTS client_insights CASCADE;
DROP TABLE IF EXISTS client_checkins CASCADE;
DROP TABLE IF EXISTS member_engagement CASCADE;
DROP TABLE IF EXISTS member_status CASCADE;

-- NPS
DROP TABLE IF EXISTS nps_responses CASCADE;
DROP TABLE IF EXISTS nps_survey_schedule CASCADE;

-- Tickets (suporte)
DROP TABLE IF EXISTS tickets CASCADE;
DROP TABLE IF EXISTS support_tickets CASCADE;

-- Eventos + Event App
DROP TABLE IF EXISTS cs_events CASCADE;
DROP TABLE IF EXISTS cs_event_rsvps CASCADE;
DROP TABLE IF EXISTS cs_event_participant_sessions CASCADE;
DROP TABLE IF EXISTS cs_event_participant_profiles CASCADE;
DROP TABLE IF EXISTS cs_event_feed_posts CASCADE;
DROP TABLE IF EXISTS cs_event_feed_likes CASCADE;
DROP TABLE IF EXISTS cs_event_schedule_items CASCADE;
DROP TABLE IF EXISTS cs_event_schedule_bookmarks CASCADE;
DROP TABLE IF EXISTS cs_event_materials CASCADE;
DROP TABLE IF EXISTS cs_event_connections CASCADE;
DROP TABLE IF EXISTS event_costs CASCADE;
DROP TABLE IF EXISTS event_invitations CASCADE;
DROP TABLE IF EXISTS marketing_events CASCADE;
DROP TABLE IF EXISTS webinar_configs CASCADE;
DROP TABLE IF EXISTS webinar_registrations CASCADE;

-- RH
DROP TABLE IF EXISTS hr_vacancies CASCADE;
DROP TABLE IF EXISTS hr_candidates CASCADE;
DROP TABLE IF EXISTS hr_applications CASCADE;
DROP TABLE IF EXISTS hr_interviews CASCADE;
DROP TABLE IF EXISTS hr_assessments CASCADE;
DROP TABLE IF EXISTS hr_offers CASCADE;
DROP TABLE IF EXISTS hr_pipeline_stages CASCADE;
DROP TABLE IF EXISTS hr_scoring_rubrics CASCADE;
DROP TABLE IF EXISTS hr_timeline_events CASCADE;

-- Financeiro detalhado
DROP TABLE IF EXISTS financial_accounts CASCADE;
DROP TABLE IF EXISTS financial_categories CASCADE;
DROP TABLE IF EXISTS financial_entries CASCADE;
DROP TABLE IF EXISTS financial_ledger CASCADE;
DROP TABLE IF EXISTS transactions CASCADE;
DROP TABLE IF EXISTS dre_lines CASCADE;
DROP TABLE IF EXISTS accounts_receivable CASCADE;

-- Asaas (cobrancas)
DROP TABLE IF EXISTS asaas_customers CASCADE;
DROP TABLE IF EXISTS asaas_webhooks CASCADE;

-- NFSe (notas fiscais)
DROP TABLE IF EXISTS nfse CASCADE;
DROP TABLE IF EXISTS nfse_config CASCADE;
DROP TABLE IF EXISTS nfse_webhooks CASCADE;
DROP TABLE IF EXISTS nfse_history CASCADE;
DROP TABLE IF EXISTS fiscal_config CASCADE;

-- Instagram
DROP TABLE IF EXISTS instagram_profiles CASCADE;
DROP TABLE IF EXISTS instagram_accounts CASCADE;
DROP TABLE IF EXISTS instagram_messages CASCADE;
DROP TABLE IF EXISTS instagram_conversations CASCADE;
DROP TABLE IF EXISTS instagram_posts CASCADE;
DROP TABLE IF EXISTS instagram_stories CASCADE;
DROP TABLE IF EXISTS instagram_webhooks CASCADE;

-- Knowledge Base
DROP TABLE IF EXISTS kb_pages CASCADE;
DROP TABLE IF EXISTS kb_presence CASCADE;
DROP TABLE IF EXISTS kb_autosaves CASCADE;
DROP TABLE IF EXISTS kb_page_versions CASCADE;

-- Organograma / Growth / CEO
DROP TABLE IF EXISTS org_chart_nodes CASCADE;
DROP TABLE IF EXISTS growth_metrics CASCADE;
DROP TABLE IF EXISTS ceo_briefings CASCADE;
DROP TABLE IF EXISTS business_context CASCADE;
DROP TABLE IF EXISTS objectives CASCADE;

-- Depoimentos
DROP TABLE IF EXISTS testimonials CASCADE;

-- WhatsApp Communities (modulo de comunidades/campanhas - NAO CONFUNDIR COM
-- cadencias de follow-up do comercial, que usam wa_message_sequences +
-- wa_sequence_steps + wa_sequence_enrollments — MANTIDAS).
DROP TABLE IF EXISTS wa_communities CASCADE;
DROP TABLE IF EXISTS wa_community_groups CASCADE;
DROP TABLE IF EXISTS wa_community_campaigns CASCADE;
DROP TABLE IF EXISTS wa_community_campaign_items CASCADE;

-- Email automations (campanhas)
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS email_automation_runs CASCADE;

COMMIT;

-- ============================================================================
-- FIM
-- ============================================================================
-- Depois de rodar, verifique com:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' ORDER BY table_name;
-- ============================================================================
