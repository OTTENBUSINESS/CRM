import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { DealPayment } from '@/types/payment.types';

// ────────────────────────────────────────────────────────────────────────────
// NOTA: as tabelas nfse_emissions e fiscal_config nao estao no database.types.ts
// gerado, entao usamos `supabase as any` — mesmo padrao do useCampaigns.ts.
// ────────────────────────────────────────────────────────────────────────────

const sb = supabase as any;

// ═══════════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════════

export type NFSeStatus = 'processando' | 'autorizado' | 'erro' | 'cancelado';

export interface NFSeEmission {
  id: string;
  deal_payment_id: string;
  lead_id: string;
  deal_id?: string | null;
  product_id?: string | null;
  reference_id?: string | null;
  focus_nfe_status: NFSeStatus | null;
  nfse_number?: string | null;
  verification_code?: string | null;
  pdf_url?: string | null;
  xml_url?: string | null;
  valor_servico?: number | null;
  aliquota_iss?: number | null;
  valor_iss?: number | null;
  email_sent_to?: string | null;
  email_sent_at?: string | null;
  error_message?: string | null;
  created_at: string;
  updated_at?: string | null;
}

export interface FiscalConfig {
  id?: string;
  // Prestador
  razao_social?: string | null;
  cnpj?: string | null;
  inscricao_municipal?: string | null;
  regime_tributario?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
  codigo_municipio?: string | null;
  // Focus NFe
  api_token?: string | null;
  ambiente?: 'homologacao' | 'producao' | string | null;
  natureza_operacao?: string | null;
  serie_rps?: string | null;
  codigo_opcao_simples_nacional?: number | null;
  regime_especial_tributacao?: number | null;
  ultimo_numero_dps?: number | null;
  // Cobranca
  pix_key?: string | null;
  pix_type?: string | null;
  pix_name?: string | null;
  billing_reminder_template?: string | null;
}

export interface LeadFiscalData {
  cpf_cnpj?: string | null;
  nfse_email?: string | null;
  address?: string | null;
  cep?: string | null;
  city_name?: string | null;
  state?: string | null;
  company_name?: string | null;
}

export interface ExtractedCNPJData {
  cnpj?: string;
  razao_social?: string;
  nome_fantasia?: string;
  logradouro?: string;
  numero?: string;
  complemento?: string;
  bairro?: string;
  cep?: string;
  cidade?: string;
  uf?: string;
}

/** Resposta (generica) das edge functions emit-nfse / cancel-nfse */
export interface NFSeFunctionResult {
  status?: string;
  focus_nfe_status?: string;
  emission_id?: string;
  emission?: Partial<NFSeEmission> & { id?: string };
  nfse_number?: string;
  pdf_url?: string;
  error?: string;
  error_message?: string;
  message?: string;
  [key: string]: any;
}

/** Extrai o status "final" de uma resposta da edge function */
export function getNFSeResultStatus(data: NFSeFunctionResult | null | undefined): string | undefined {
  if (!data) return undefined;
  const raw = data.focus_nfe_status || data.status || data.emission?.focus_nfe_status || undefined;
  if (!raw) return undefined;
  if (raw === 'processando_autorizacao') return 'processando';
  if (raw === 'erro_autorizacao') return 'erro';
  return raw;
}

/** Extrai o id da emissao de uma resposta da edge function */
export function getNFSeResultEmissionId(data: NFSeFunctionResult | null | undefined): string | undefined {
  return data?.emission_id || data?.emission?.id || undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// Queries
// ═══════════════════════════════════════════════════════════════════════════

/** Historico de notas emitidas para um lead */
export function useNFSeEmissions(leadId?: string) {
  return useQuery({
    queryKey: ['nfse-emissions', leadId],
    queryFn: async () => {
      const { data, error } = await sb
        .from('nfse_emissions')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as NFSeEmission[];
    },
    enabled: !!leadId,
  });
}

/** Config fiscal do tenant (1 linha) */
export function useFiscalConfig() {
  return useQuery({
    queryKey: ['fiscal-config'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('fiscal_config')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return (data || null) as FiscalConfig | null;
    },
  });
}

/** Pagamentos PAGOS de um lead (payer ou dono do deal) — pra selecao na emissao */
export function useLeadPaidPayments(leadId?: string) {
  return useQuery({
    queryKey: ['nfse-paid-payments', leadId],
    queryFn: async () => {
      const paidStatuses = ['received', 'confirmed'];

      // Deals do lead (mesma estrategia do useLeadPayments)
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id')
        .eq('lead_id', leadId!);

      if (dealsError) throw dealsError;
      const dealIds = (deals || []).map((d) => d.id);

      let query = supabase
        .from('deal_payments')
        .select(`
          *,
          payer_lead:leads!deal_payments_payer_lead_id_fkey(id, name),
          deal:deals!deal_payments_deal_id_fkey(
            id,
            product:products!deals_product_id_fkey(id, name)
          )
        `)
        .in('status', paidStatuses);

      if (dealIds.length > 0) {
        query = query.or(`payer_lead_id.eq.${leadId},deal_id.in.(${dealIds.join(',')})`);
      } else {
        query = query.eq('payer_lead_id', leadId!);
      }

      const { data, error } = await query.order('paid_at', { ascending: false });
      if (error) throw error;
      return (data || []) as DealPayment[];
    },
    enabled: !!leadId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// Mutations
// ═══════════════════════════════════════════════════════════════════════════

/** Emite uma NFSe pra um pagamento pago */
export function useEmitNFSe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealPaymentId, leadId }: { dealPaymentId: string; leadId: string }) => {
      const { data, error } = await supabase.functions.invoke('emit-nfse', {
        body: { deal_payment_id: dealPaymentId, lead_id: leadId },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as NFSeFunctionResult;
    },
    onSuccess: (_data, { leadId }) => {
      queryClient.invalidateQueries({ queryKey: ['nfse-emissions', leadId] });
      queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
    },
  });
}

/** Verifica o status de uma emissao pendente (action: check_status) */
export function useCheckNFSeStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      emissionId,
      dealPaymentId,
      leadId,
    }: {
      emissionId: string;
      dealPaymentId?: string;
      leadId?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('emit-nfse', {
        body: {
          action: 'check_status',
          emission_id: emissionId,
          deal_payment_id: dealPaymentId,
          lead_id: leadId,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as NFSeFunctionResult;
    },
    onSuccess: (_data, { leadId }) => {
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: ['nfse-emissions', leadId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['nfse-emissions'] });
      }
    },
  });
}

/** Cancela uma NFSe autorizada (motivo min 15 chars) */
export function useCancelNFSe() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      emissionId,
      motivo,
      leadId,
    }: {
      emissionId: string;
      motivo: string;
      leadId?: string;
    }) => {
      if (motivo.trim().length < 15) {
        throw new Error('O motivo do cancelamento deve ter no minimo 15 caracteres.');
      }

      const { data, error } = await supabase.functions.invoke('cancel-nfse', {
        body: { emission_id: emissionId, motivo: motivo.trim() },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as NFSeFunctionResult;
    },
    onSuccess: (_data, { leadId }) => {
      if (leadId) {
        queryClient.invalidateQueries({ queryKey: ['nfse-emissions', leadId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ['nfse-emissions'] });
      }
    },
  });
}

/** Extrai dados do Cartao CNPJ (PDF/imagem) via IA */
export function useExtractCNPJCard() {
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('extract-cnpj-card', {
        body: formData,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as ExtractedCNPJData;
    },
  });
}

/** Salva a fiscal_config (upsert de 1 linha: insert se nao existir, update se existir) */
export function useUpdateFiscalConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: Partial<FiscalConfig>) => {
      const { data: existing, error: existingError } = await sb
        .from('fiscal_config')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (existingError) throw existingError;

      if (existing?.id) {
        const { data, error } = await sb
          .from('fiscal_config')
          .update({ ...values, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        return data as FiscalConfig;
      }

      const { data, error } = await sb
        .from('fiscal_config')
        .insert(values)
        .select()
        .single();

      if (error) throw error;
      return data as FiscalConfig;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fiscal-config'] });
      queryClient.invalidateQueries({ queryKey: ['billing-reminder-template'] });
    },
  });
}

/** Atualiza os dados fiscais do lead (tomador) */
export function useUpdateLeadFiscal(leadId?: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (values: LeadFiscalData) => {
      if (!leadId) throw new Error('Lead nao informado');

      const { data, error } = await sb
        .from('leads')
        .update(values)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-lead', leadId] });
    },
  });
}
