-- =====================================================================
-- LIVEKIT — sala própria de videochamada (Otten CRM)
-- =====================================================================
-- A tabela meetings já existe (multi-tenant, com meeting_link,
-- transcriptions, participants, activity_id). Aqui entram só as
-- colunas do LiveKit, conforme o acelerador livekit-acelerador.
-- =====================================================================

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS recording_status TEXT
  CHECK (recording_status IS NULL OR recording_status IN ('pending','recording','completed','failed'));

-- unicidade do nome da sala (parcial: ignora NULLs das reuniões antigas)
CREATE UNIQUE INDEX IF NOT EXISTS idx_meetings_livekit_room
  ON public.meetings (livekit_room_name) WHERE livekit_room_name IS NOT NULL;
