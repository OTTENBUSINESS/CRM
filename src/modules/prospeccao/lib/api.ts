// ============================================================
// API client — invoca edge functions do módulo prospeccao
// ============================================================

import { supabase } from "@/lib/supabase";
import type {
  AnalisarInput,
  AnalisarOutput,
  BuscarInput,
  BuscarOutput,
  DetectarIntentOutput,
  Diagnostico,
  LeadDescoberto,
  ProspeccaoBusca,
  TemplateNicho,
} from "../types";

export interface DirectLeadOutput {
  busca_id: string;
  lead_descoberto_id: string;
  lead: LeadDescoberto;
}

export async function criarLeadDireto(input: {
  type: "instagram" | "site";
  value: string;
  fontes?: string[];
}): Promise<DirectLeadOutput> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase.functions.invoke("prospeccao-direct-lead", {
    body: { ...input, user_id: userId },
  });
  if (error) throw new Error(error.message || "Falha ao criar lead direto");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function detectarIntent(query: string): Promise<DetectarIntentOutput> {
  const { data, error } = await supabase.functions.invoke("prospeccao-detectar-intent", {
    body: { query },
  });
  if (error) throw new Error(error.message || "Falha ao detectar intent");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function buscar(input: BuscarInput): Promise<BuscarOutput> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase.functions.invoke("prospeccao-buscar", {
    body: { ...input, user_id: userId },
  });
  if (error) throw new Error(error.message || "Falha ao buscar");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function listarTemplatesNicho(): Promise<TemplateNicho[]> {
  const { data, error } = await supabase
    .from("prospeccao_templates_nicho")
    .select("*")
    .eq("is_active", true)
    .order("display_name");
  if (error) throw error;
  return (data || []) as TemplateNicho[];
}

export async function getBusca(buscaId: string): Promise<ProspeccaoBusca> {
  const { data, error } = await supabase
    .from("prospeccao_buscas")
    .select("*")
    .eq("id", buscaId)
    .single();
  if (error) throw error;
  return data as ProspeccaoBusca;
}

export interface DiagnosticoSummary {
  id: string;
  lead_descoberto_id: string;
  score_geral: number | null;
  status: string;
  created_at: string;
}

// Busca diagnósticos existentes pra um lead específico (por handle IG ou url_site)
export async function buscarDiagnosticosExistentes(
  type: "instagram" | "site",
  value: string
): Promise<Array<{ diagnostico_id: string; lead_descoberto_id: string; lead_nome: string; score_geral: number | null; created_at: string; }>> {
  let leadsQuery;
  if (type === "instagram") {
    const handle = value.replace(/^@/, "").replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, "").replace(/\/$/, "").trim();
    if (!handle) return [];
    leadsQuery = supabase
      .from("prospeccao_leads_descobertos")
      .select("id, nome")
      .ilike("instagram_handle", handle);
  } else {
    let url = value.trim();
    if (!url.startsWith("http")) url = `https://${url}`;
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return [];
    }
    leadsQuery = supabase
      .from("prospeccao_leads_descobertos")
      .select("id, nome")
      .ilike("url_site", `%${host}%`);
  }
  const { data: leadsData } = await leadsQuery;
  if (!leadsData || leadsData.length === 0) return [];
  const leadIds = leadsData.map((l) => l.id);

  const { data: diagsData } = await supabase
    .from("prospeccao_diagnosticos")
    .select("id, lead_descoberto_id, score_geral, created_at")
    .in("lead_descoberto_id", leadIds)
    .order("created_at", { ascending: false })
    .limit(5);

  if (!diagsData) return [];
  return diagsData.map((d) => {
    const l = leadsData.find((x) => x.id === d.lead_descoberto_id);
    return {
      diagnostico_id: d.id,
      lead_descoberto_id: d.lead_descoberto_id,
      lead_nome: l?.nome || "—",
      score_geral: d.score_geral,
      created_at: d.created_at,
    };
  });
}

export async function listarDiagnosticosDaBusca(buscaId: string): Promise<DiagnosticoSummary[]> {
  const { data, error } = await supabase
    .from("prospeccao_diagnosticos")
    .select("id, lead_descoberto_id, score_geral, status, created_at")
    .eq("busca_id", buscaId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as DiagnosticoSummary[];
}

export async function listarLeadsDescobertos(buscaId: string): Promise<LeadDescoberto[]> {
  const { data, error } = await supabase
    .from("prospeccao_leads_descobertos")
    .select("*")
    .eq("busca_id", buscaId)
    .order("nota_google", { ascending: true, nullsFirst: false }) // pior reviews primeiro = mais dor
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as LeadDescoberto[];
}

export async function listarBuscasRecentes(limite = 20): Promise<ProspeccaoBusca[]> {
  const { data, error } = await supabase
    .from("prospeccao_buscas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limite);
  if (error) throw error;
  return (data || []) as ProspeccaoBusca[];
}

// Retorna quantos diagnósticos cada busca já tem
export async function contarDiagnosticosPorBusca(buscaIds: string[]): Promise<Record<string, { total: number; melhor_score: number | null; primeiro_diagnostico_id: string | null }>> {
  if (buscaIds.length === 0) return {};
  const { data, error } = await supabase
    .from("prospeccao_diagnosticos")
    .select("id, busca_id, score_geral")
    .in("busca_id", buscaIds);
  if (error) throw error;
  const result: Record<string, { total: number; melhor_score: number | null; primeiro_diagnostico_id: string | null }> = {};
  for (const d of data || []) {
    const k = (d as { busca_id: string }).busca_id;
    const score = (d as { score_geral: number | null }).score_geral;
    const id = (d as { id: string }).id;
    if (!result[k]) result[k] = { total: 0, melhor_score: null, primeiro_diagnostico_id: null };
    result[k].total++;
    if (score !== null && (result[k].melhor_score === null || score > (result[k].melhor_score as number))) {
      result[k].melhor_score = score;
    }
    if (!result[k].primeiro_diagnostico_id) result[k].primeiro_diagnostico_id = id;
  }
  return result;
}

export async function atualizarLeadDescoberto(
  id: string,
  patch: Partial<LeadDescoberto>
): Promise<LeadDescoberto> {
  const { data, error } = await supabase
    .from("prospeccao_leads_descobertos")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as LeadDescoberto;
}

export interface PromptConfig {
  id: string;
  key: string;
  label: string;
  descricao: string | null;
  prompt_text: string;
  variables_help: Record<string, string>;
  ai_model: string;
  temperature: number;
  tom_voz: string;
  is_active: boolean;
  updated_at: string;
}

export async function listarPromptsConfig(): Promise<PromptConfig[]> {
  const { data, error } = await supabase
    .from("prospeccao_prompts_config")
    .select("*")
    .order("label");
  if (error) throw error;
  return (data || []) as PromptConfig[];
}

export async function atualizarPromptConfig(
  id: string,
  patch: Partial<Pick<PromptConfig, "prompt_text" | "ai_model" | "temperature" | "tom_voz" | "is_active">>
): Promise<PromptConfig> {
  const { data, error } = await supabase
    .from("prospeccao_prompts_config")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data as PromptConfig;
}

export async function descartarLeadsDescobertos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from("prospeccao_leads_descobertos")
    .update({ status: "descartado" })
    .in("id", ids);
  if (error) throw error;
}

export async function analisar(input: AnalisarInput): Promise<AnalisarOutput> {
  const userId = (await supabase.auth.getUser()).data.user?.id;
  const { data, error } = await supabase.functions.invoke("prospeccao-analisar", {
    body: { ...input, user_id: userId },
  });
  if (error) throw new Error(error.message || "Falha ao analisar");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getDiagnostico(diagnosticoId: string): Promise<Diagnostico> {
  const { data, error } = await supabase
    .from("prospeccao_diagnosticos")
    .select("*")
    .eq("id", diagnosticoId)
    .single();
  if (error) throw error;
  return data as unknown as Diagnostico;
}

export async function getDiagnosticoByLead(
  leadDescobertoId: string
): Promise<Diagnostico | null> {
  const { data, error } = await supabase
    .from("prospeccao_diagnosticos")
    .select("*")
    .eq("lead_descoberto_id", leadDescobertoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Diagnostico) || null;
}

export async function getLeadDescoberto(id: string): Promise<LeadDescoberto> {
  const { data, error } = await supabase
    .from("prospeccao_leads_descobertos")
    .select("*")
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as LeadDescoberto;
}
