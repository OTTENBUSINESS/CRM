-- =============================================
-- SISTEMA DE EVENTOS RSVP PRESENCIAL (CS)
-- =============================================

-- Tabela de Eventos CS
CREATE TABLE IF NOT EXISTS cs_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Básico
  name VARCHAR NOT NULL,
  description TEXT,
  slug VARCHAR UNIQUE,

  -- Datas
  start_date DATE NOT NULL,
  end_date DATE,
  start_time TIME,
  end_time TIME,

  -- Local
  location VARCHAR,
  location_details TEXT,
  is_online BOOLEAN DEFAULT FALSE,
  online_link VARCHAR,

  -- Capacidade
  capacity INTEGER,

  -- RSVP Config
  rsvp_token VARCHAR UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),
  rsvp_enabled BOOLEAN DEFAULT TRUE,
  rsvp_deadline TIMESTAMPTZ,
  allow_companion BOOLEAN DEFAULT FALSE,
  max_companions_per_guest INTEGER DEFAULT 1,

  -- Associações (product_id como TEXT para match com products.id)
  product_id TEXT REFERENCES products(id),

  -- Campos customizáveis
  custom_questions JSONB DEFAULT '[]',
  settings JSONB DEFAULT '{}',

  -- Imagem/Banner
  banner_url VARCHAR,

  -- Status
  status VARCHAR DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'completed')),

  -- Meta
  created_by UUID REFERENCES team_members(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de RSVPs
CREATE TABLE IF NOT EXISTS cs_event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES cs_events(id) ON DELETE CASCADE,

  -- Dados do convidado
  guest_name VARCHAR NOT NULL,
  guest_email VARCHAR NOT NULL,
  guest_phone VARCHAR,
  guest_company VARCHAR,

  -- Match interno
  lead_id UUID REFERENCES leads(id),
  organization_id UUID REFERENCES organizations(id),
  is_client BOOLEAN DEFAULT FALSE,

  -- Status RSVP
  rsvp_status VARCHAR NOT NULL DEFAULT 'confirmed' CHECK (rsvp_status IN ('confirmed', 'declined', 'maybe', 'pending')),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),

  -- Acompanhante
  has_companion BOOLEAN DEFAULT FALSE,
  companion_name VARCHAR,
  companion_email VARCHAR,
  companion_phone VARCHAR,

  -- Check-in
  checked_in_at TIMESTAMPTZ,
  checked_in_by UUID REFERENCES team_members(id),
  companion_checked_in BOOLEAN DEFAULT FALSE,
  companion_checked_in_at TIMESTAMPTZ,

  -- Extras
  dietary_restrictions VARCHAR,
  notes TEXT,
  custom_answers JSONB DEFAULT '{}',

  -- Meta
  source VARCHAR DEFAULT 'public_form' CHECK (source IN ('public_form', 'manual', 'import')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Evitar duplicatas
  UNIQUE(event_id, guest_email)
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_cs_events_rsvp_token ON cs_events(rsvp_token);
CREATE INDEX IF NOT EXISTS idx_cs_events_status ON cs_events(status);
CREATE INDEX IF NOT EXISTS idx_cs_events_start_date ON cs_events(start_date);
CREATE INDEX IF NOT EXISTS idx_cs_event_rsvps_event_id ON cs_event_rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_cs_event_rsvps_status ON cs_event_rsvps(rsvp_status);
CREATE INDEX IF NOT EXISTS idx_cs_event_rsvps_email ON cs_event_rsvps(guest_email);
CREATE INDEX IF NOT EXISTS idx_cs_event_rsvps_checked_in ON cs_event_rsvps(checked_in_at);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_cs_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_cs_events_updated_at ON cs_events;
CREATE TRIGGER trigger_cs_events_updated_at
  BEFORE UPDATE ON cs_events
  FOR EACH ROW
  EXECUTE FUNCTION update_cs_events_updated_at();

DROP TRIGGER IF EXISTS trigger_cs_event_rsvps_updated_at ON cs_event_rsvps;
CREATE TRIGGER trigger_cs_event_rsvps_updated_at
  BEFORE UPDATE ON cs_event_rsvps
  FOR EACH ROW
  EXECUTE FUNCTION update_cs_events_updated_at();

-- RLS Policies
ALTER TABLE cs_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cs_event_rsvps ENABLE ROW LEVEL SECURITY;

-- Política para cs_events
CREATE POLICY "CS Events são visíveis para todos" ON cs_events
  FOR SELECT USING (true);

CREATE POLICY "CS Events podem ser modificados por autenticados" ON cs_events
  FOR ALL USING (auth.role() = 'authenticated');

-- Política para cs_event_rsvps
CREATE POLICY "CS RSVPs podem ser criados por qualquer um" ON cs_event_rsvps
  FOR INSERT WITH CHECK (true);

CREATE POLICY "CS RSVPs são visíveis para autenticados" ON cs_event_rsvps
  FOR SELECT USING (true);

CREATE POLICY "CS RSVPs podem ser modificados por autenticados" ON cs_event_rsvps
  FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "CS RSVPs podem ser deletados por autenticados" ON cs_event_rsvps
  FOR DELETE USING (auth.role() = 'authenticated');
