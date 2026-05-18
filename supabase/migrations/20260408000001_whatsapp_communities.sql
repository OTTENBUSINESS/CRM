-- ============================================================================
-- WhatsApp Communities (Marketing module)
-- Cria estrutura para gerenciar Comunidades + Grupos vinculados,
-- mensagens agendadas e cadências/sequências automatizadas.
-- Membros entram SEMPRE via link de convite (nunca add direto).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Comunidades
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_communities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id     UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE RESTRICT,
  community_jid   TEXT UNIQUE,                          -- preenchido após criar na UAZAPI
  name            TEXT NOT NULL,
  description     TEXT,
  picture_url     TEXT,
  invite_link     TEXT,
  member_count    INTEGER NOT NULL DEFAULT 0,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_communities_instance ON wa_communities(instance_id);
CREATE INDEX IF NOT EXISTS idx_wa_communities_created_at ON wa_communities(created_at DESC);

-- ----------------------------------------------------------------------------
-- 2. Grupos vinculados a uma comunidade
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_community_groups (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID NOT NULL REFERENCES wa_communities(id) ON DELETE CASCADE,
  group_jid       TEXT UNIQUE,                          -- preenchido após criar na UAZAPI
  name            TEXT NOT NULL,
  description     TEXT,
  picture_url     TEXT,
  type            TEXT NOT NULL DEFAULT 'discussion'
                  CHECK (type IN ('announcement','discussion')),
  invite_link     TEXT,
  member_count    INTEGER NOT NULL DEFAULT 0,
  is_default      BOOLEAN NOT NULL DEFAULT false,       -- grupo padrão da comunidade (announcement)
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_community_groups_community ON wa_community_groups(community_id);

-- ----------------------------------------------------------------------------
-- 3. Sequências de mensagens (cadências)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_message_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id    UUID NOT NULL REFERENCES wa_communities(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  trigger         TEXT NOT NULL DEFAULT 'manual'
                  CHECK (trigger IN ('manual','on_join')),
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_sequences_community ON wa_message_sequences(community_id);
CREATE INDEX IF NOT EXISTS idx_wa_sequences_active ON wa_message_sequences(is_active) WHERE is_active = true;

-- ----------------------------------------------------------------------------
-- 4. Steps de cada sequência
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_sequence_steps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     UUID NOT NULL REFERENCES wa_message_sequences(id) ON DELETE CASCADE,
  step_order      INTEGER NOT NULL,
  delay_value     INTEGER NOT NULL DEFAULT 0,           -- 0 = imediato após step anterior
  delay_unit      TEXT NOT NULL DEFAULT 'minutes'
                  CHECK (delay_unit IN ('minutes','hours','days')),
  target_group_id UUID REFERENCES wa_community_groups(id) ON DELETE SET NULL,
  message_type    TEXT NOT NULL DEFAULT 'text'
                  CHECK (message_type IN ('text','image','video','audio','document')),
  content         TEXT,                                  -- texto ou caption da mídia
  media_url       TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, step_order)
);

CREATE INDEX IF NOT EXISTS idx_wa_sequence_steps_sequence ON wa_sequence_steps(sequence_id, step_order);

-- ----------------------------------------------------------------------------
-- 5. Enrollments (membros inscritos numa sequência)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_sequence_enrollments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id     UUID NOT NULL REFERENCES wa_message_sequences(id) ON DELETE CASCADE,
  member_phone    TEXT,
  member_jid      TEXT,
  member_name     TEXT,
  current_step    INTEGER NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed','cancelled','failed')),
  next_run_at     TIMESTAMPTZ,
  enrolled_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wa_enrollments_sequence ON wa_sequence_enrollments(sequence_id);
CREATE INDEX IF NOT EXISTS idx_wa_enrollments_due
  ON wa_sequence_enrollments(next_run_at)
  WHERE status = 'active' AND next_run_at IS NOT NULL;

-- ----------------------------------------------------------------------------
-- 6. Mensagens agendadas (workers leem desta tabela)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wa_scheduled_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id      UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  community_id     UUID REFERENCES wa_communities(id) ON DELETE CASCADE,
  target_group_id  UUID REFERENCES wa_community_groups(id) ON DELETE CASCADE,
  target_jid       TEXT NOT NULL,                        -- JID destino (group ou phone)
  message_type     TEXT NOT NULL DEFAULT 'text'
                   CHECK (message_type IN ('text','image','video','audio','document')),
  content          TEXT,
  media_url        TEXT,
  scheduled_for    TIMESTAMPTZ NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sending','sent','failed','cancelled')),
  attempts         INTEGER NOT NULL DEFAULT 0,
  sent_at          TIMESTAMPTZ,
  error            TEXT,
  whatsapp_message_id TEXT,
  -- Vínculo opcional com sequência (mensagem gerada por uma cadência)
  sequence_id      UUID REFERENCES wa_message_sequences(id) ON DELETE SET NULL,
  sequence_step_id UUID REFERENCES wa_sequence_steps(id) ON DELETE SET NULL,
  enrollment_id    UUID REFERENCES wa_sequence_enrollments(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wa_scheduled_due
  ON wa_scheduled_messages(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_wa_scheduled_community ON wa_scheduled_messages(community_id);
CREATE INDEX IF NOT EXISTS idx_wa_scheduled_group ON wa_scheduled_messages(target_group_id);
CREATE INDEX IF NOT EXISTS idx_wa_scheduled_status ON wa_scheduled_messages(status);

-- ============================================================================
-- updated_at triggers
-- ============================================================================
CREATE OR REPLACE FUNCTION wa_communities_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_communities_updated ON wa_communities;
CREATE TRIGGER trg_wa_communities_updated BEFORE UPDATE ON wa_communities
  FOR EACH ROW EXECUTE FUNCTION wa_communities_touch_updated_at();

DROP TRIGGER IF EXISTS trg_wa_community_groups_updated ON wa_community_groups;
CREATE TRIGGER trg_wa_community_groups_updated BEFORE UPDATE ON wa_community_groups
  FOR EACH ROW EXECUTE FUNCTION wa_communities_touch_updated_at();

DROP TRIGGER IF EXISTS trg_wa_message_sequences_updated ON wa_message_sequences;
CREATE TRIGGER trg_wa_message_sequences_updated BEFORE UPDATE ON wa_message_sequences
  FOR EACH ROW EXECUTE FUNCTION wa_communities_touch_updated_at();

-- ============================================================================
-- RLS — habilitado em todas; acesso para usuários autenticados
-- (ajustes finos por role podem ser feitos depois via app layer)
-- ============================================================================
ALTER TABLE wa_communities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_community_groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_message_sequences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_sequence_steps         ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_sequence_enrollments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_scheduled_messages     ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_communities authenticated all"
  ON wa_communities FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_community_groups authenticated all"
  ON wa_community_groups FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_message_sequences authenticated all"
  ON wa_message_sequences FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_sequence_steps authenticated all"
  ON wa_sequence_steps FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_sequence_enrollments authenticated all"
  ON wa_sequence_enrollments FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_scheduled_messages authenticated all"
  ON wa_scheduled_messages FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE wa_communities IS 'Comunidades do WhatsApp gerenciadas pelo módulo Marketing';
COMMENT ON TABLE wa_community_groups IS 'Grupos vinculados a uma comunidade';
COMMENT ON TABLE wa_scheduled_messages IS 'Fila de mensagens agendadas (worker process-scheduled-messages)';
COMMENT ON TABLE wa_message_sequences IS 'Cadências/sequências de mensagens automatizadas';
COMMENT ON TABLE wa_sequence_steps IS 'Passos de uma sequência (com delay relativo)';
COMMENT ON TABLE wa_sequence_enrollments IS 'Membros inscritos numa sequência';
