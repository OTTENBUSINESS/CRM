-- Bucket `call-recordings` para guardar as gravacoes das chamadas WaVoIP.
-- Privado; acesso via signed URLs geradas pelo client.
-- Idempotente: pode rodar varias vezes sem erro.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'call-recordings',
  'call-recordings',
  false,
  104857600, -- 100 MB
  ARRAY['audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav']
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policies: qualquer usuario autenticado pode fazer upload/select/update/delete
-- em recordings/ (path convencionado pelo app: recordings/<call_history_id>.webm).
-- Se precisar segmentar por tenant, adaptar depois com get_tenant_id().

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'call_recordings_authenticated_all'
  ) THEN
    CREATE POLICY call_recordings_authenticated_all
      ON storage.objects
      FOR ALL
      TO authenticated
      USING (bucket_id = 'call-recordings')
      WITH CHECK (bucket_id = 'call-recordings');
  END IF;
END $$;
