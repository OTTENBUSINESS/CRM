// ============================================================
// useProspeccao — hooks TanStack Query
// ============================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as api from "../lib/api";
import type { AnalisarInput, BuscarInput } from "../types";

export const PROSPECCAO_KEYS = {
  templates: ["prospeccao", "templates"] as const,
  busca: (id: string) => ["prospeccao", "busca", id] as const,
  leads: (buscaId: string) => ["prospeccao", "leads", buscaId] as const,
  recentes: ["prospeccao", "recentes"] as const,
  diagnostico: (id: string) => ["prospeccao", "diagnostico", id] as const,
  diagnosticoPorLead: (leadId: string) => ["prospeccao", "diagnostico", "by-lead", leadId] as const,
  leadDescoberto: (id: string) => ["prospeccao", "lead-descoberto", id] as const,
};

export function useTemplatesNicho() {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.templates,
    queryFn: api.listarTemplatesNicho,
    staleTime: 1000 * 60 * 10,
  });
}

export function useDetectarIntent() {
  return useMutation({
    mutationFn: (query: string) => api.detectarIntent(query),
  });
}

export function useBuscar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BuscarInput) => api.buscar(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: PROSPECCAO_KEYS.recentes });
      qc.setQueryData(PROSPECCAO_KEYS.leads(data.busca_id), data.leads);
      toast.success(`${data.total} leads encontrados em ${(data.duracao_ms / 1000).toFixed(1)}s`);
    },
    onError: (err: Error) => {
      toast.error(`Erro na busca: ${err.message}`);
    },
  });
}

export function useBusca(buscaId: string | undefined) {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.busca(buscaId || ""),
    queryFn: () => api.getBusca(buscaId!),
    enabled: !!buscaId,
  });
}

export function useLeadsDescobertos(buscaId: string | undefined) {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.leads(buscaId || ""),
    queryFn: () => api.listarLeadsDescobertos(buscaId!),
    enabled: !!buscaId,
  });
}

export function useDiagnosticosExistentes(type: "instagram" | "site" | null, value: string) {
  return useQuery({
    queryKey: ["prospeccao", "existentes", type || "", value],
    queryFn: () => api.buscarDiagnosticosExistentes(type!, value),
    enabled: !!type && value.length > 2,
    staleTime: 1000 * 30,
  });
}

export function useDiagnosticosDaBusca(buscaId: string | undefined) {
  return useQuery({
    queryKey: ["prospeccao", "diagnosticos-busca", buscaId || ""],
    queryFn: () => api.listarDiagnosticosDaBusca(buscaId!),
    enabled: !!buscaId,
  });
}

export function useBuscasRecentes() {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.recentes,
    queryFn: () => api.listarBuscasRecentes(20),
    staleTime: 1000 * 30,
  });
}

export function useDiagnosticosPorBusca(buscaIds: string[]) {
  return useQuery({
    queryKey: ["prospeccao", "diag-por-busca", buscaIds.sort().join(",")],
    queryFn: () => api.contarDiagnosticosPorBusca(buscaIds),
    enabled: buscaIds.length > 0,
    staleTime: 1000 * 30,
  });
}

export function usePromptsConfig() {
  return useQuery({
    queryKey: ["prospeccao", "prompts-config"],
    queryFn: api.listarPromptsConfig,
    staleTime: 30000,
  });
}

export function useUpdatePromptConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof api.atualizarPromptConfig>[1] }) =>
      api.atualizarPromptConfig(id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospeccao", "prompts-config"] });
      toast.success("Prompt salvo — próxima análise já usa a nova versão");
    },
    onError: (err: Error) => toast.error(`Erro: ${err.message}`),
  });
}

export function useDescartarLeads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.descartarLeadsDescobertos(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["prospeccao", "leads"] });
      toast.success("Leads descartados");
    },
  });
}

export function useAnalisar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AnalisarInput) => api.analisar(input),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["prospeccao", "leads"] });
      // Não cacheia output direto — shape é diferente do Diagnostico (faltam colunas
      // score_X e achados_X). Deixa o useQuery rebuscar do DB.
      qc.invalidateQueries({ queryKey: PROSPECCAO_KEYS.diagnostico(data.diagnostico_id) });
    },
    onError: (err: Error) => {
      toast.error(`Erro na análise: ${err.message}`);
    },
  });
}

export function useDiagnostico(diagnosticoId: string | undefined) {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.diagnostico(diagnosticoId || ""),
    queryFn: () => api.getDiagnostico(diagnosticoId!),
    enabled: !!diagnosticoId,
  });
}

export function useDirectLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { type: "instagram" | "site"; value: string; fontes?: string[] }) =>
      api.criarLeadDireto(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PROSPECCAO_KEYS.recentes });
    },
    onError: (err: Error) => {
      toast.error(`Erro: ${err.message}`);
    },
  });
}

export function useLeadDescoberto(id: string | undefined) {
  return useQuery({
    queryKey: PROSPECCAO_KEYS.leadDescoberto(id || ""),
    queryFn: () => api.getLeadDescoberto(id!),
    enabled: !!id,
  });
}
