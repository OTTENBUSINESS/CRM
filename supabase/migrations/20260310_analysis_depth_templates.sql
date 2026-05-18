-- Atualizar constraint para incluir 'call_analysis_deep'
ALTER TABLE analysis_templates DROP CONSTRAINT IF EXISTS analysis_templates_category_check;
ALTER TABLE analysis_templates ADD CONSTRAINT analysis_templates_category_check
  CHECK (category = ANY (ARRAY['call_analysis', 'call_analysis_deep', 'lead_insights', 'message_generation', 'proposal']));

-- Inserir template de análise aprofundada
INSERT INTO analysis_templates (name, category, prompt, is_default, is_active)
VALUES (
  'Análise Aprofundada de Vendas',
  'call_analysis_deep',
  'Você é um especialista sênior em análise de calls de vendas. Analise a transcrição em profundidade e gere uma análise completa com insights estratégicos.

DATA DE HOJE: {{DATA_HOJE}}

Retorne um JSON válido com EXATAMENTE esta estrutura:

{
  "diagnostico": "Resumo executivo da ligação em 2-3 frases.",
  "perfil_lead": "Parágrafo descritivo completo do perfil do lead.",
  "pontos_chave": ["Ponto 1", "Ponto 2", "Ponto 3"],
  "riscos": ["Risco 1", "Risco 2"],
  "negociacao": { "desfecho": "Resultado da negociação", "detalhes": "Valores e condições discutidos" },
  "pontos_fortes_vendedor": ["Ponto positivo 1", "Ponto positivo 2"],
  "veredicto": { "probabilidade": 65, "justificativa": "Explicação da probabilidade" },
  "recomendacao_estrategica": "Recomendação estratégica detalhada.",
  "proximo_passo": "Ação clara e específica",
  "sentimento": "positive | neutral | negative",
  "tarefas_sugeridas": [{ "titulo": "Tarefa", "descricao": "Descrição", "prioridade": "high | medium | low", "prazo_sugerido": "hoje | amanha | esta_semana | proxima_semana", "data_hora_especifica": "YYYY-MM-DDTHH:mm ou null" }],
  "dados_extraidos": { "empresa": "", "cargo": "", "necessidade": "", "orcamento": "", "timeline": "", "decisor": "", "concorrentes": "", "genero": "masculino | feminino | desconhecido", "tipo_negocio": "digital | varejo | clinica | saas | servicos | industria | outro", "faixa_faturamento": "ate_10k | 10k_50k | 50k_100k | 100k_500k | 500k_plus | desconhecido", "is_icp": "true | false" },
  "score_adjustment": 0
}

INSTRUÇÕES: Extraia APENAS informações explícitas. score_adjustment: -20 a +20. proximo_passo: UMA ação clara. Se data/hora mencionada, calcule (ISO). Retorne APENAS JSON. perfil_lead: detalhista. veredicto.probabilidade: 0-100. pontos_fortes_vendedor: reforço positivo. recomendacao_estrategica: específica e acionável.',
  true,
  true
)
ON CONFLICT DO NOTHING;
