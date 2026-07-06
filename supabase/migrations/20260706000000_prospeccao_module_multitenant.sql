-- =====================================================================
-- MÓDULO PROSPECÇÃO v2 — adaptação MULTI-TENANT (Otten CRM)
-- =====================================================================
-- Pacote original: RLS aberta (authenticated USING true). Aqui tudo vira
-- multi-tenant: tenant_id NOT NULL DEFAULT get_tenant_id() + RLS por tenant,
-- mesmo padrão do módulo Marketing (20260701000000).
--
-- 6 tabelas autônomas (prefixo prospeccao_*), sem FK rígido com leads/deals
-- (ponte via colunas lead_id/deal_id sem constraint — remoção limpa).
-- UNIQUEs viram compostos com tenant: (tenant_id, nicho) e (tenant_id, key).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. prospeccao_buscas — toda busca/sessão
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_buscas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  query_normalizada TEXT,
  intent_detectada JSONB DEFAULT '{}'::jsonb,
  nicho TEXT,
  cidade TEXT,
  uf TEXT,
  fontes_selecionadas TEXT[] DEFAULT ARRAY[]::text[],
  limite_solicitado INTEGER DEFAULT 20,
  total_resultados INTEGER DEFAULT 0,
  custo NUMERIC DEFAULT 0,
  duracao_ms INTEGER,
  status TEXT DEFAULT 'pending',
  erro TEXT,
  resultados_raw JSONB,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);
CREATE INDEX IF NOT EXISTS idx_pb_user ON public.prospeccao_buscas (created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pb_nicho ON public.prospeccao_buscas (nicho);
CREATE INDEX IF NOT EXISTS idx_pb_status ON public.prospeccao_buscas (status);
CREATE INDEX IF NOT EXISTS idx_pb_tenant ON public.prospeccao_buscas (tenant_id);

-- ---------------------------------------------------------------------
-- 2. prospeccao_leads_descobertos — cada lead no funil de descoberta
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_leads_descobertos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  busca_id UUID REFERENCES public.prospeccao_buscas(id) ON DELETE CASCADE,
  -- Dados básicos do lead descoberto
  nome TEXT NOT NULL,
  categoria TEXT,
  telefone TEXT,
  endereco TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  url_maps TEXT,
  url_site TEXT,
  instagram_handle TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  youtube_url TEXT,
  tiktok_handle TEXT,
  nota_google NUMERIC,
  qtd_avaliacoes INTEGER,
  faixa_preco TEXT,
  -- Status no funil
  status TEXT DEFAULT 'descoberto', -- descoberto | analisado | virou_lead | descartado
  selecionado_para_analise BOOLEAN DEFAULT false,
  virou_lead_em TIMESTAMPTZ,
  -- Pontes pro CRM (sem FK pra evitar acoplamento)
  lead_id UUID,
  deal_id UUID,
  -- Dados crus extras
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);
CREATE INDEX IF NOT EXISTS idx_pld_busca ON public.prospeccao_leads_descobertos (busca_id);
CREATE INDEX IF NOT EXISTS idx_pld_status ON public.prospeccao_leads_descobertos (status);
CREATE INDEX IF NOT EXISTS idx_pld_lead ON public.prospeccao_leads_descobertos (lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pld_user ON public.prospeccao_leads_descobertos (created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pld_tenant ON public.prospeccao_leads_descobertos (tenant_id);

-- ---------------------------------------------------------------------
-- 3. prospeccao_diagnosticos — análise multi-canal de cada lead
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_diagnosticos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_descoberto_id UUID REFERENCES public.prospeccao_leads_descobertos(id) ON DELETE CASCADE,
  busca_id UUID REFERENCES public.prospeccao_buscas(id) ON DELETE SET NULL,
  -- Scores por canal (0-100)
  score_site INTEGER,
  score_google_maps INTEGER,
  score_instagram INTEGER,
  score_facebook INTEGER,
  score_linkedin INTEGER,
  score_youtube INTEGER,
  score_tiktok INTEGER,
  score_doctoralia INTEGER,
  score_reclame_aqui INTEGER,
  score_ifood INTEGER,
  score_meta_ads INTEGER,
  score_google_ads INTEGER,
  score_posicao_google INTEGER,
  score_pagespeed INTEGER,
  score_outros JSONB DEFAULT '{}'::jsonb,
  score_geral NUMERIC,
  -- Scores por pilar (0-10)
  score_atracao NUMERIC,
  score_qualificacao NUMERIC,
  score_conversao NUMERIC,
  score_retencao NUMERIC,
  -- Achados raspados de cada fonte
  achados_site JSONB DEFAULT '{}'::jsonb,
  achados_maps JSONB DEFAULT '{}'::jsonb,
  achados_instagram JSONB DEFAULT '{}'::jsonb,
  achados_facebook JSONB DEFAULT '{}'::jsonb,
  achados_linkedin JSONB DEFAULT '{}'::jsonb,
  achados_youtube JSONB DEFAULT '{}'::jsonb,
  achados_tiktok JSONB DEFAULT '{}'::jsonb,
  achados_doctoralia JSONB DEFAULT '{}'::jsonb,
  achados_reclame_aqui JSONB DEFAULT '{}'::jsonb,
  achados_ifood JSONB DEFAULT '{}'::jsonb,
  achados_meta_ads JSONB DEFAULT '{}'::jsonb,
  achados_google_ads JSONB DEFAULT '{}'::jsonb,
  achados_posicao_google JSONB DEFAULT '{}'::jsonb,
  achados_pagespeed JSONB DEFAULT '{}'::jsonb,
  achados_contexto_negocio JSONB DEFAULT '{}'::jsonb,
  achados_outros JSONB DEFAULT '{}'::jsonb,
  -- Output IA
  oportunidades JSONB DEFAULT '[]'::jsonb,
  resumo_executivo TEXT,
  -- Auditoria
  custo_total NUMERIC DEFAULT 0,
  tempo_analise_ms INTEGER,
  fontes_consultadas TEXT[] DEFAULT ARRAY[]::text[],
  fontes_falhadas TEXT[] DEFAULT ARRAY[]::text[],
  fontes_pendentes TEXT[] DEFAULT ARRAY[]::text[],
  status TEXT DEFAULT 'pending',
  erro TEXT,
  pdf_url TEXT,
  pdf_imagens_urls TEXT[] DEFAULT ARRAY[]::text[],
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);
CREATE INDEX IF NOT EXISTS idx_pd_lead ON public.prospeccao_diagnosticos (lead_descoberto_id);
CREATE INDEX IF NOT EXISTS idx_pd_busca ON public.prospeccao_diagnosticos (busca_id);
CREATE INDEX IF NOT EXISTS idx_pd_status ON public.prospeccao_diagnosticos (status);
CREATE INDEX IF NOT EXISTS idx_pd_user ON public.prospeccao_diagnosticos (created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pd_tenant ON public.prospeccao_diagnosticos (tenant_id);

-- ---------------------------------------------------------------------
-- 4. prospeccao_templates_nicho — config de fontes/pesos por nicho
--    UNIQUE(nicho) vira UNIQUE(tenant_id, nicho)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_templates_nicho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nicho TEXT NOT NULL,
  emoji TEXT DEFAULT '🎯',
  display_name TEXT NOT NULL,
  descricao TEXT,
  fontes_obrigatorias TEXT[] DEFAULT ARRAY[]::text[],
  fontes_opcionais TEXT[] DEFAULT ARRAY[]::text[],
  pesos_score JSONB DEFAULT '{}'::jsonb,
  prompt_oportunidades TEXT,
  custo_estimado_lead NUMERIC DEFAULT 0.13,
  is_default BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id(),
  CONSTRAINT prospeccao_templates_nicho_tenant_nicho_uniq UNIQUE (tenant_id, nicho)
);
CREATE INDEX IF NOT EXISTS idx_ptn_nicho ON public.prospeccao_templates_nicho (nicho);
CREATE INDEX IF NOT EXISTS idx_ptn_active ON public.prospeccao_templates_nicho (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------
-- 5. prospeccao_prompts_config — prompts da IA editáveis pela UI
--    UNIQUE(key) vira UNIQUE(tenant_id, key)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_prompts_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  descricao TEXT,
  prompt_text TEXT NOT NULL,
  variables_help JSONB DEFAULT '{}'::jsonb,
  ai_model TEXT DEFAULT 'gemini-2.5-flash',
  temperature NUMERIC DEFAULT 0.4,
  tom_voz TEXT DEFAULT 'neutro',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id(),
  CONSTRAINT prospeccao_prompts_config_tenant_key_uniq UNIQUE (tenant_id, key)
);
CREATE INDEX IF NOT EXISTS idx_ppc_key ON public.prospeccao_prompts_config (key);
CREATE INDEX IF NOT EXISTS idx_ppc_active ON public.prospeccao_prompts_config (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------
-- 6. prospeccao_uso_api — auditoria de chamadas externas + custo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospeccao_uso_api (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_provider TEXT NOT NULL,
  endpoint TEXT,
  fonte TEXT,
  custo NUMERIC DEFAULT 0,
  sucesso BOOLEAN DEFAULT true,
  duracao_ms INTEGER,
  busca_id UUID REFERENCES public.prospeccao_buscas(id) ON DELETE SET NULL,
  lead_descoberto_id UUID REFERENCES public.prospeccao_leads_descobertos(id) ON DELETE SET NULL,
  erro TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  tenant_id uuid NOT NULL DEFAULT get_tenant_id()
);
CREATE INDEX IF NOT EXISTS idx_pua_provider ON public.prospeccao_uso_api (api_provider);
CREATE INDEX IF NOT EXISTS idx_pua_user_month ON public.prospeccao_uso_api (created_by_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pua_tenant ON public.prospeccao_uso_api (tenant_id);

-- ---------------------------------------------------------------------
-- RLS por tenant + GRANTS + trigger updated_at (padrão do módulo Marketing)
-- ---------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'prospeccao_buscas','prospeccao_leads_descobertos','prospeccao_diagnosticos',
    'prospeccao_templates_nicho','prospeccao_prompts_config','prospeccao_uso_api'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t||'_tenant_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (tenant_id = get_tenant_id()) WITH CHECK (tenant_id = get_tenant_id());', t||'_tenant_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated;', t);
  END LOOP;

  -- updated_at nas que têm a coluna (reusa update_updated_at_column existente)
  FOREACH t IN ARRAY ARRAY[
    'prospeccao_leads_descobertos','prospeccao_diagnosticos',
    'prospeccao_templates_nicho','prospeccao_prompts_config'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I;', 'set_updated_at_'||t, t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();', 'set_updated_at_'||t, t);
  END LOOP;
END $$;
