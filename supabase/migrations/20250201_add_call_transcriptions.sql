-- Adicionar coluna de transcrições na tabela call_history
ALTER TABLE call_history 
ADD COLUMN IF NOT EXISTS transcriptions JSONB DEFAULT '[]'::jsonb;

-- Comentário para documentação
COMMENT ON COLUMN call_history.transcriptions IS 'Array de transcrições da chamada capturadas via Soniox em tempo real';

-- Índice para buscas em transcrições (opcional, para futuras buscas full-text)
CREATE INDEX IF NOT EXISTS idx_call_history_transcriptions 
ON call_history USING GIN (transcriptions);
