-- Adicionar coluna ai_insights na tabela organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS ai_insights JSONB DEFAULT NULL;

COMMENT ON COLUMN organizations.ai_insights IS 'Insights gerados por IA sobre o cliente';
