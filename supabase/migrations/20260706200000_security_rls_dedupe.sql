-- =====================================================================
-- SEGURANÇA — remove policies duplicadas ABERTAS (USING true)
-- =====================================================================
-- Auditoria 2026-07-06: call_history, email_templates e wavoip_devices
-- têm policies tenant-scoped corretas (tenant_select_*/tenant_update_*/
-- tenant_delete_*/tenant_insert_*, ou *_tenant), MAS também têm policies
-- legadas abertas (USING true). Como RLS combina policies permissivas com
-- OR, a policy aberta ANULA o isolamento por tenant. Basta DROPAR as
-- abertas — as tenant-scoped já cobrem todo o CRUD.
--
-- Seguro: as 3 tabelas estão vazias hoje e get_tenant_id() resolve pro
-- tenant do usuário (mesmo default dos 86 inserts já em produção).
-- Idempotente (DROP POLICY IF EXISTS).
-- =====================================================================

-- call_history — mantém tenant_select/update/delete/insert_call_history
DROP POLICY IF EXISTS "Users can view call history"   ON public.call_history;
DROP POLICY IF EXISTS "Users can update call history" ON public.call_history;
DROP POLICY IF EXISTS "Users can insert call history" ON public.call_history;

-- email_templates — mantém email_templates_tenant (ALL, tenant-scoped)
DROP POLICY IF EXISTS email_templates_authenticated_all ON public.email_templates;

-- wavoip_devices — mantém tenant_select/update/delete/insert_wavoip_devices
DROP POLICY IF EXISTS "Users can manage their own devices" ON public.wavoip_devices;
DROP POLICY IF EXISTS "Users can view their own devices"   ON public.wavoip_devices;
