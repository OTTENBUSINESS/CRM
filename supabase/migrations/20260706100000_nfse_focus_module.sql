-- =====================================================================
-- MÓDULO NFSe (Focus NFe) — Otten CRM, multi-tenant
-- =====================================================================
-- Spec: INTEGRACAO-FOCUS-NFE.md (acelerador integracao-focus-nfse).
-- O CRM já tinha fiscal_config como stub de cobrança (pix/lembrete) —
-- aqui ela ganha os dados do prestador + config Focus NFe.
-- nfse_emissions é nova (multi-tenant, padrão dos módulos Marketing/Prospecção).
-- products.id é TEXT (não UUID) — por isso product_id TEXT em nfse_emissions.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) fiscal_config — completar com dados do prestador + Focus NFe
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS razao_social TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS cnpj TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS inscricao_municipal TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS regime_tributario TEXT DEFAULT 'simples_nacional';
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS logradouro TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS numero TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS complemento TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS bairro TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS cidade TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS uf TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS cep TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS codigo_municipio TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS api_token TEXT;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS ambiente TEXT DEFAULT 'homologacao';
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS natureza_operacao TEXT DEFAULT 'Prestacao de servicos';
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS serie_rps TEXT DEFAULT '900';
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS codigo_opcao_simples_nacional INTEGER DEFAULT 1;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS regime_especial_tributacao INTEGER DEFAULT 0;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS ultimo_numero_dps INTEGER DEFAULT 200;
ALTER TABLE public.fiscal_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ---------------------------------------------------------------------
-- 2) nfse_emissions — histórico de notas (multi-tenant)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.nfse_emissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Vinculação
  deal_payment_id UUID NOT NULL REFERENCES public.deal_payments(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  deal_id UUID,
  product_id TEXT,                 -- products.id é TEXT
  -- Focus NFe
  reference_id TEXT,               -- nfse-{payment_id}-{timestamp}
  focus_nfe_status TEXT,           -- processando | autorizado | erro | cancelado
  nfse_number TEXT,
  verification_code TEXT,
  -- Documentos
  pdf_url TEXT,
  xml_url TEXT,
  -- Valores
  valor_servico DECIMAL(12,2),
  aliquota_iss DECIMAL(5,2),
  valor_iss DECIMAL(12,2),
  -- Email
  email_sent_to TEXT,
  email_sent_at TIMESTAMPTZ,
  -- Erros / debug
  error_message TEXT,
  focus_nfe_response JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);
CREATE INDEX IF NOT EXISTS idx_nfse_payment ON public.nfse_emissions (deal_payment_id);
CREATE INDEX IF NOT EXISTS idx_nfse_lead ON public.nfse_emissions (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nfse_status ON public.nfse_emissions (focus_nfe_status);
CREATE INDEX IF NOT EXISTS idx_nfse_ref ON public.nfse_emissions (reference_id);
CREATE INDEX IF NOT EXISTS idx_nfse_tenant ON public.nfse_emissions (tenant_id);

-- ---------------------------------------------------------------------
-- 3) leads — campos fiscais que faltam (cpf_cnpj/address/city_name/
--    state/company_name já existem no Otten)
-- ---------------------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS nfse_email TEXT;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS cep TEXT;

-- ---------------------------------------------------------------------
-- 4) products — dados fiscais do serviço
-- ---------------------------------------------------------------------
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_codigo_tributacao_nacional TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_codigo_nbs TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_cnae TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_aliquota_iss DECIMAL(5,2);
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_description TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_service_code TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS nfse_item_lista_servico TEXT;

-- ---------------------------------------------------------------------
-- 5) RLS + GRANTS + updated_at (nfse_emissions nova; fiscal_config já tem RLS)
-- ---------------------------------------------------------------------
DO $$
BEGIN
  ALTER TABLE public.nfse_emissions ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS nfse_emissions_tenant_all ON public.nfse_emissions;
  CREATE POLICY nfse_emissions_tenant_all ON public.nfse_emissions
    FOR ALL TO authenticated
    USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());
  GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_emissions TO authenticated;

  DROP TRIGGER IF EXISTS set_updated_at_nfse_emissions ON public.nfse_emissions;
  CREATE TRIGGER set_updated_at_nfse_emissions
    BEFORE UPDATE ON public.nfse_emissions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

  DROP TRIGGER IF EXISTS set_updated_at_fiscal_config ON public.fiscal_config;
  CREATE TRIGGER set_updated_at_fiscal_config
    BEFORE UPDATE ON public.fiscal_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
END $$;
