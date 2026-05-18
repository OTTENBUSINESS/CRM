-- ============================================================================
-- WhatsApp Community Campaigns (router/distributor)
-- Permite criar uma "campanha" com várias comunidades em ordem.
-- Um link único redireciona pro próximo grupo com vaga (rotação automática).
-- ============================================================================

CREATE TABLE IF NOT EXISTS wa_community_campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  slug            TEXT UNIQUE NOT NULL,
  description     TEXT,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  fallback_url    TEXT,                          -- pra onde redirecionar quando todas estão cheias
  total_clicks    INTEGER NOT NULL DEFAULT 0,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_campaigns_slug
  ON wa_community_campaigns(slug)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS wa_community_campaign_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES wa_community_campaigns(id) ON DELETE CASCADE,
  community_id    UUID NOT NULL REFERENCES wa_communities(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,
  capacity        INTEGER NOT NULL DEFAULT 5000,
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting','active','full','disabled')),
  clicks          INTEGER NOT NULL DEFAULT 0,
  filled_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, community_id),
  UNIQUE (campaign_id, position)
);

CREATE INDEX IF NOT EXISTS idx_wa_campaign_items_campaign
  ON wa_community_campaign_items(campaign_id, position);
CREATE INDEX IF NOT EXISTS idx_wa_campaign_items_status
  ON wa_community_campaign_items(campaign_id, status)
  WHERE status IN ('waiting','active');

ALTER TABLE wa_community_campaigns      ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_community_campaign_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_campaigns authenticated all" ON wa_community_campaigns
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "wa_campaign_items authenticated all" ON wa_community_campaign_items
  FOR ALL USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

DROP TRIGGER IF EXISTS trg_wa_campaigns_updated ON wa_community_campaigns;
CREATE TRIGGER trg_wa_campaigns_updated BEFORE UPDATE ON wa_community_campaigns
  FOR EACH ROW EXECUTE FUNCTION wa_communities_touch_updated_at();

COMMENT ON TABLE wa_community_campaigns IS 'Campanhas de roteamento de comunidades — link único distribui entre várias';
COMMENT ON TABLE wa_community_campaign_items IS 'Comunidades inscritas em uma campanha, com ordem e capacidade';
