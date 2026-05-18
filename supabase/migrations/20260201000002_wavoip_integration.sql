-- =====================================================
-- WAVOIP INTEGRATION SCHEMA
-- Migration: 20260201_wavoip_integration
-- =====================================================

-- Dispositivos WaVoIP (vinculados a usuários)
CREATE TABLE IF NOT EXISTS wavoip_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  token TEXT NOT NULL UNIQUE,
  name TEXT,
  phone_number TEXT,
  status TEXT DEFAULT 'disconnected',
  webhook_configured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para wavoip_devices
CREATE INDEX IF NOT EXISTS idx_wavoip_devices_team_member ON wavoip_devices(team_member_id);
CREATE INDEX IF NOT EXISTS idx_wavoip_devices_token ON wavoip_devices(token);

-- Histórico de chamadas
CREATE TABLE IF NOT EXISTS call_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wavoip_device_id UUID REFERENCES wavoip_devices(id) ON DELETE SET NULL,
  wavoip_call_id TEXT,
  wavoip_session_id TEXT,
  team_member_id UUID REFERENCES team_members(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Tipo de chamada (para futuro Telnyx)
  call_type TEXT NOT NULL DEFAULT 'whatsapp',  -- 'whatsapp' | 'voip'

  -- Info da chamada
  direction TEXT NOT NULL,                      -- 'INCOMING' | 'OUTGOING'
  status TEXT NOT NULL DEFAULT 'CALLING',       -- Status WaVoIP
  caller_phone TEXT,
  receiver_phone TEXT,
  peer_phone TEXT,                              -- Número do outro lado
  peer_name TEXT,
  peer_profile_picture TEXT,
  duration_seconds INTEGER DEFAULT 0,

  -- Gravação
  record_status TEXT,                           -- 'READY' | 'RECORDING' | 'MIXING' | etc
  record_url TEXT,

  -- Processamento IA
  transcription TEXT,
  ai_summary TEXT,
  ai_sentiment TEXT,                            -- 'positive' | 'neutral' | 'negative'
  ai_key_points JSONB DEFAULT '[]',
  ai_suggested_tasks JSONB DEFAULT '[]',
  ai_processed_at TIMESTAMPTZ,
  ai_processing_error TEXT,

  -- Timestamps
  started_at TIMESTAMPTZ DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata extra
  metadata JSONB DEFAULT '{}'
);

-- Índices para call_history
CREATE INDEX IF NOT EXISTS idx_call_history_lead ON call_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_call_history_team_member ON call_history(team_member_id);
CREATE INDEX IF NOT EXISTS idx_call_history_wavoip_call ON call_history(wavoip_call_id);
CREATE INDEX IF NOT EXISTS idx_call_history_wavoip_device ON call_history(wavoip_device_id);
CREATE INDEX IF NOT EXISTS idx_call_history_peer_phone ON call_history(peer_phone);
CREATE INDEX IF NOT EXISTS idx_call_history_started_at ON call_history(started_at DESC);

-- Adicionar coluna wavoip_device_id em team_members se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'team_members' AND column_name = 'wavoip_device_id'
  ) THEN
    ALTER TABLE team_members
    ADD COLUMN wavoip_device_id UUID REFERENCES wavoip_devices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Aplicar trigger nas tabelas
DROP TRIGGER IF EXISTS update_wavoip_devices_updated_at ON wavoip_devices;
CREATE TRIGGER update_wavoip_devices_updated_at
  BEFORE UPDATE ON wavoip_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_call_history_updated_at ON call_history;
CREATE TRIGGER update_call_history_updated_at
  BEFORE UPDATE ON call_history
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE wavoip_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_history ENABLE ROW LEVEL SECURITY;

-- Política para wavoip_devices
DROP POLICY IF EXISTS "Users can view their own devices" ON wavoip_devices;
CREATE POLICY "Users can view their own devices" ON wavoip_devices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can manage their own devices" ON wavoip_devices;
CREATE POLICY "Users can manage their own devices" ON wavoip_devices
  FOR ALL USING (true);

-- Política para call_history
DROP POLICY IF EXISTS "Users can view call history" ON call_history;
CREATE POLICY "Users can view call history" ON call_history
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert call history" ON call_history;
CREATE POLICY "Users can insert call history" ON call_history
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Users can update call history" ON call_history;
CREATE POLICY "Users can update call history" ON call_history
  FOR UPDATE USING (true);

-- Função para buscar lead pelo telefone
CREATE OR REPLACE FUNCTION find_lead_by_phone(p_phone TEXT)
RETURNS UUID AS $$
DECLARE
  v_lead_id UUID;
  v_clean_phone TEXT;
BEGIN
  -- Limpa o telefone removendo caracteres não numéricos
  v_clean_phone := regexp_replace(p_phone, '[^0-9]', '', 'g');

  -- Busca lead pelo telefone (com ou sem prefixo 55)
  SELECT id INTO v_lead_id
  FROM leads
  WHERE regexp_replace(phone, '[^0-9]', '', 'g') = v_clean_phone
     OR regexp_replace(phone, '[^0-9]', '', 'g') = '55' || v_clean_phone
     OR '55' || regexp_replace(phone, '[^0-9]', '', 'g') = v_clean_phone
  LIMIT 1;

  RETURN v_lead_id;
END;
$$ LANGUAGE plpgsql;
