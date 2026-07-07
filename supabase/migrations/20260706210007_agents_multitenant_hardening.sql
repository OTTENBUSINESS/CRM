-- =====================================================================
-- AGENTS PLATFORM — hardening MULTI-TENANT (Otten CRM)
-- =====================================================================
-- O pack cria as tabelas agents_*/agent_* com RLS "authenticated USING
-- (true)" (aberto-mas-logado). Regra do Otten: NUNCA RLS aberta.
-- Este hardening:
--   1) adiciona tenant_id NOT NULL DEFAULT get_tenant_id() em todas
--      (backfill automático: linhas existentes/seeds ganham o tenant default)
--   2) troca cada policy ap_authenticated_* pela equivalente tenant-scoped
--      PRESERVANDO a semântica (read-only continua read-only)
-- Edges usam service_role (bypassa RLS) — nada muda pra elas.
-- =====================================================================

DO $$
DECLARE
  t record;
  pol record;
  new_name text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND (tablename LIKE 'agents\_%' ESCAPE '\' OR tablename LIKE 'agent\_%' ESCAPE '\')
  LOOP
    -- 1) tenant_id + índice
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT get_tenant_id();',
      t.tablename);
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id);',
      'idx_' || t.tablename || '_tenant', t.tablename);

    -- 2) troca policies abertas (ap_authenticated_*) por tenant-scoped
    FOR pol IN
      SELECT policyname, cmd FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t.tablename
        AND policyname LIKE 'ap_authenticated%'
    LOOP
      new_name := replace(pol.policyname, 'authenticated', 'tenant');
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', pol.policyname, t.tablename);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', new_name, t.tablename);
      IF pol.cmd = 'SELECT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (tenant_id = get_tenant_id());',
          new_name, t.tablename);
      ELSIF pol.cmd = 'INSERT' THEN
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (tenant_id = get_tenant_id());',
          new_name, t.tablename);
      ELSE
        -- ALL / UPDATE / DELETE
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR %s TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());',
          new_name, t.tablename, pol.cmd);
      END IF;
    END LOOP;
  END LOOP;
END $$;
