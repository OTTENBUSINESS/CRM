-- Garante a FK entre wavoip_devices.team_member_id e team_members.id.
-- Sem essa FK, o embed do PostgREST (`team_member:team_members(...)`) falha
-- e o admin panel de Telefonia + tabela de membros ficam sem dados.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wavoip_devices_team_member_id_fkey'
      AND conrelid = 'public.wavoip_devices'::regclass
  ) THEN
    ALTER TABLE public.wavoip_devices
      ADD CONSTRAINT wavoip_devices_team_member_id_fkey
      FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
