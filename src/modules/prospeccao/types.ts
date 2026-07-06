// ============================================================
// Tipos do módulo Prospecção
// ============================================================

export type StatusBusca = "pending" | "running" | "completed" | "failed";

export type StatusLeadDescoberto =
  | "descoberto"
  | "analisando"
  | "analisado"
  | "virou_lead"
  | "descartado";

export interface Intent {
  nicho: string;
  tipo?: string;
  cidade?: string | null;
  uf?: string | null;
  fontes_sugeridas: string[];
  query_otimizada?: string;
  confianca: number;
}

export interface TemplateNicho {
  id: string;
  nicho: string;
  emoji: string;
  display_name: string;
  descricao: string;
  fontes_obrigatorias: string[];
  fontes_opcionais: string[];
  pesos_score: Record<string, number>;
  prompt_oportunidades: string;
  custo_estimado_lead: number;
  is_default: boolean;
  is_active: boolean;
}

export interface ProspeccaoBusca {
  id: string;
  query: string;
  query_normalizada: string | null;
  intent_detectada: Intent | Record<string, never>;
  nicho: string | null;
  cidade: string | null;
  uf: string | null;
  fontes_selecionadas: string[];
  limite_solicitado: number;
  total_resultados: number;
  custo: number;
  duracao_ms: number | null;
  status: StatusBusca;
  erro: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

export interface LeadDescoberto {
  id: string;
  busca_id: string | null;
  nome: string;
  categoria: string | null;
  telefone: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  url_maps: string | null;
  url_site: string | null;
  instagram_handle: string | null;
  facebook_url: string | null;
  linkedin_url: string | null;
  youtube_url: string | null;
  tiktok_handle: string | null;
  nota_google: number | null;
  qtd_avaliacoes: number | null;
  faixa_preco: string | null;
  status: StatusLeadDescoberto;
  selecionado_para_analise: boolean;
  virou_lead_em: string | null;
  lead_id: string | null;
  deal_id: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface BuscarInput {
  query: string;
  nicho?: string;
  cidade?: string;
  uf?: string;
  fontes?: string[];
  limite?: number;
}

export interface BuscarOutput {
  busca_id: string;
  total: number;
  leads: LeadDescoberto[];
  custo: number;
  duracao_ms: number;
}

export interface DetectarIntentOutput {
  intent: Intent;
}

export interface Oportunidade {
  titulo: string;
  descricao: string;
  impacto_estimado: string;
  prioridade: "alta" | "media" | "baixa";
  produto_sugerido?: string;
}

export interface Diagnostico {
  id: string;
  lead_descoberto_id: string;
  busca_id: string | null;
  score_site: number | null;
  score_google_maps: number | null;
  score_instagram: number | null;
  score_facebook: number | null;
  score_linkedin: number | null;
  score_youtube: number | null;
  score_tiktok: number | null;
  score_doctoralia: number | null;
  score_reclame_aqui: number | null;
  score_ifood: number | null;
  score_outros: Record<string, number> | null;
  score_geral: number | null;
  achados_site: AchadosCanal | null;
  achados_maps: AchadosCanal | null;
  achados_instagram: AchadosCanal | null;
  achados_facebook: AchadosCanal | null;
  achados_linkedin: AchadosCanal | null;
  achados_youtube: AchadosCanal | null;
  achados_tiktok: AchadosCanal | null;
  achados_doctoralia: AchadosCanal | null;
  achados_reclame_aqui: AchadosCanal | null;
  achados_ifood: AchadosCanal | null;
  achados_outros: Record<string, AchadosCanal> | null;
  oportunidades: Oportunidade[];
  resumo_executivo: string | null;
  custo_total: number;
  tempo_analise_ms: number | null;
  fontes_consultadas: string[];
  fontes_falhadas: string[];
  fontes_pendentes: string[];
  status: "pending" | "running" | "completed" | "failed";
  erro: string | null;
  pdf_url: string | null;
  pdf_imagens_urls: string[];
  created_at: string;
  updated_at: string;
}

export interface AchadosCanal {
  problemas: { texto: string; severidade?: "alta" | "media" | "baixa" }[];
  atencao: { texto: string }[];
  positivos: { texto: string }[];
  metricas?: Record<string, unknown>;
  skipped_reason?: string;
  erro?: string;
}

export interface AnalisarInput {
  lead_descoberto_id: string;
  fontes?: string[];
}

export interface AnalisarOutput {
  diagnostico_id: string;
  lead_descoberto_id: string;
  score_geral: number;
  scores: Record<string, number | null>;
  oportunidades: Oportunidade[];
  resumo: string;
  fontes_consultadas: string[];
  fontes_falhadas: string[];
  fontes_pendentes: string[];
  custo_total: number;
  tempo_analise_ms: number;
}
