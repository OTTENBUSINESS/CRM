-- Phase 1A: Add new columns to cs_touchpoints for unified checkpoint system
ALTER TABLE cs_touchpoints
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'completed'
    CHECK (status IN ('initiated','awaiting_response','client_replied','no_response','completed')),
  ADD COLUMN IF NOT EXISTS follow_up_deadline TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS checkpoint_day INTEGER CHECK (checkpoint_day IN (3,7,14,30,45,60,75,90)),
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'
    CHECK (source IN ('manual','cockpit','webhook','cadence','system'));

-- Partial indexes for common queries
CREATE INDEX IF NOT EXISTS idx_touchpoints_awaiting
  ON cs_touchpoints(organization_id, status) WHERE status = 'awaiting_response';
CREATE INDEX IF NOT EXISTS idx_touchpoints_checkpoint
  ON cs_touchpoints(organization_id, checkpoint_day) WHERE checkpoint_day IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_touchpoints_follow_up_deadline
  ON cs_touchpoints(follow_up_deadline) WHERE status = 'awaiting_response' AND follow_up_deadline IS NOT NULL;

-- Phase 1B: Migrate existing checkpoint data from company_activities.metadata.checkpoints
INSERT INTO cs_touchpoints (organization_id, product_id, touchpoint_date, type, channel, summary, sentiment, source, status, checkpoint_day, metadata)
SELECT
  ca.organization_id,
  COALESCE(ca.product_id, 'pain'),
  CASE
    WHEN jsonb_typeof(ca.metadata->'checkpoints'->key) = 'object'
      THEN (ca.metadata->'checkpoints'->key->>'date')::date
    ELSE (ca.metadata->'checkpoints'->>key)::date
  END AS touchpoint_date,
  'checkin'::touchpoint_type AS type,
  'whatsapp'::touchpoint_channel AS channel,
  COALESCE(
    ca.metadata->'checkpoints'->key->>'notes',
    'Checkpoint ' || key || ' dias (migrado do sistema anterior)'
  ) AS summary,
  NULL AS sentiment,
  'system' AS source,
  'completed' AS status,
  key::integer AS checkpoint_day,
  jsonb_build_object(
    'migrated_from', 'company_activities',
    'original_task_id', ca.id,
    'migration_date', now()::text
  ) AS metadata
FROM company_activities ca,
     jsonb_object_keys(COALESCE(ca.metadata->'checkpoints', '{}'::jsonb)) AS key
WHERE ca.metadata->'checkpoints' IS NOT NULL
  AND jsonb_typeof(ca.metadata->'checkpoints') = 'object'
  AND ca.organization_id IS NOT NULL
  AND key IN ('30', '60', '90')
ON CONFLICT DO NOTHING;
