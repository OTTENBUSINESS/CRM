-- Adicionar coluna participants (array de UUIDs) na tabela company_activities
-- Permite múltiplos participantes por tarefa além do responsável principal

ALTER TABLE company_activities
ADD COLUMN IF NOT EXISTS participants UUID[] DEFAULT NULL;

-- Comentário descritivo
COMMENT ON COLUMN company_activities.participants IS 'Array de IDs de responsáveis que participam da tarefa além do responsável principal';
