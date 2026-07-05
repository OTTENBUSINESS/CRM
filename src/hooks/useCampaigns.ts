import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  Campaign,
  CampaignLead,
  CampaignLeadStatus,
  CampaignTemplate,
  AudienceFilters,
  CampaignMetrics,
} from '@/types/campaign.types';

// ────────────────────────────────────────────────────────────────────────────
// NOTA: as tabelas de campanha (campaigns, campaign_leads, campaign_instance_stats,
// campaign_templates) nao estao no database.types.ts gerado, entao usamos
// `.from('tabela' as any)` — mesmo padrao ja usado em CampaignInstancesManager.
// Multi-tenant: RLS filtra leituras por tenant_id (via JWT). Nos INSERTs setamos
// created_by = teamMember?.id e NAO setamos tenant_id (default do banco).
// ────────────────────────────────────────────────────────────────────────────

const sb = supabase as any;

// ═══════════════════════════════════════════════════════════════════════════
// CAMPANHAS — CRUD + acoes de estado
// ═══════════════════════════════════════════════════════════════════════════

/** Cria uma campanha (rascunho). Retorna a linha criada. */
export function useCreateCampaign() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async (payload: Partial<Campaign> & Record<string, any>) => {
      const { data, error } = await sb
        .from('campaigns')
        .insert({
          ...payload,
          status: payload.status ?? 'draft',
          created_by: teamMember?.id ?? null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });
    },
  });
}

/**
 * Dispara a campanha: popula os leads (RPC), marca como 'sending' e aciona o
 * processador. Recebe o id da campanha.
 */
export function useStartCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // 1. Popula campaign_leads a partir dos filtros da audiencia
      const { error: rpcError } = await sb.rpc('populate_campaign_leads', {
        p_campaign_id: campaignId,
      });
      if (rpcError) throw rpcError;

      // 2. Marca como enviando
      const { data, error } = await sb
        .from('campaigns')
        .update({ status: 'sending', started_at: new Date().toISOString() })
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;

      // 3. Aciona o processador (best-effort — nao quebra o fluxo se falhar)
      try {
        await supabase.functions.invoke('campaign-processor', { body: {} });
      } catch (e) {
        console.warn('[useStartCampaign] campaign-processor invoke falhou:', e);
      }

      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });
    },
  });
}

/** Agenda a campanha para uma data futura. */
export function useScheduleCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, scheduledAt }: { campaignId: string; scheduledAt: string }) => {
      const { data, error } = await sb
        .from('campaigns')
        .update({
          status: 'scheduled',
          scheduled_at: new Date(scheduledAt).toISOString(),
        })
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/** Pausa a campanha (com motivo opcional). */
export function usePauseCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ campaignId, reason }: { campaignId: string; reason?: string }) => {
      const { data, error } = await sb
        .from('campaigns')
        .update({
          status: 'paused',
          paused_at: new Date().toISOString(),
          pause_reason: reason ?? null,
        })
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/** Retoma uma campanha pausada. Recebe o id. */
export function useResumeCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await sb
        .from('campaigns')
        .update({ status: 'sending', paused_at: null, pause_reason: null })
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;

      // Reaciona o processador ao retomar
      try {
        await supabase.functions.invoke('campaign-processor', { body: {} });
      } catch (e) {
        console.warn('[useResumeCampaign] campaign-processor invoke falhou:', e);
      }

      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    },
  });
}

/** Cancela a campanha. Recebe o id. */
export function useCancelCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      const { data, error } = await sb
        .from('campaigns')
        .update({ status: 'cancelled' })
        .eq('id', campaignId)
        .select()
        .single();
      if (error) throw error;
      return data as Campaign;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      queryClient.invalidateQueries({ queryKey: ['campaign-metrics'] });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIENCIA
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Conta quantos leads batem com os filtros.
 * Se houver lead_ids selecionados manualmente, retorna esse tamanho direto.
 * Caso contrario, usa a RPC get_campaign_audience_count.
 */
export function useAudienceCount(filters: AudienceFilters) {
  const leadIds = (filters as any)?.lead_ids as string[] | undefined;

  return useQuery({
    queryKey: ['campaign-audience-count', filters],
    queryFn: async () => {
      if (leadIds?.length) return leadIds.length;

      const { data, error } = await sb.rpc('get_campaign_audience_count', {
        p_filters: filters,
      });
      if (error) throw error;
      return (typeof data === 'number' ? data : Number(data) || 0) as number;
    },
    staleTime: 30_000,
  });
}

/** Retorna uma amostra (ate ~8) de leads que batem com os filtros, pra preview. */
export function useAudienceSample(filters: AudienceFilters) {
  return useQuery({
    queryKey: ['campaign-audience-sample', filters],
    queryFn: async () => {
      const leadIds = (filters as any)?.lead_ids as string[] | undefined;

      let query = sb
        .from('leads')
        .select('id, name, phone, email, city_name, state')
        .not('phone', 'is', null)
        .neq('phone', '')
        .limit(8);

      if (leadIds?.length) {
        query = query.in('id', leadIds.slice(0, 8));
      } else {
        // Aplica os filtros mais comuns pra dar uma amostra representativa
        if (filters.pipeline_stage_ids?.length) {
          query = query.in('pipeline_stage_id', filters.pipeline_stage_ids);
        }
        if (filters.states?.length) query = query.in('state', filters.states);
        if (filters.cities?.length) query = query.in('city_name', filters.cities);
        if (filters.utm_sources?.length) query = query.in('utm_source', filters.utm_sources);
        if (filters.utm_campaigns?.length) query = query.in('utm_campaign', filters.utm_campaigns);
        if (filters.sales_rep_ids?.length) query = query.in('sales_rep_id', filters.sales_rep_ids);
        if (filters.no_sales_rep) query = query.is('sales_rep_id', null);
        if (filters.created_after) query = query.gte('created_at', filters.created_after);
        if (filters.created_before) query = query.lte('created_at', filters.created_before);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string | null;
        phone: string | null;
        email: string | null;
        city_name: string | null;
        state: string | null;
      }>;
    },
    staleTime: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES DE CAMPANHA
// ═══════════════════════════════════════════════════════════════════════════

/** Lista os templates de mensagem salvos (ativos). */
export function useCampaignTemplates() {
  return useQuery({
    queryKey: ['campaign-templates'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('campaign_templates')
        .select('*')
        .eq('is_active', true)
        .order('usage_count', { ascending: false });
      if (error) throw error;
      return (data || []) as CampaignTemplate[];
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTROS — pipeline stages e valores distintos (city/state/utm)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Etapas do pipeline, com o nome do pipeline via join (sales_pipelines).
 * O componente usa stage.sales_pipelines?.name e stage.sales_pipelines?.id.
 */
export function usePipelineStages() {
  return useQuery({
    queryKey: ['campaign-pipeline-stages'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('sales_pipeline_stages')
        .select('id, name, pipeline_id, position, sales_pipelines(id, name)')
        .order('position', { ascending: true });
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        name: string;
        pipeline_id: string;
        position: number;
        sales_pipelines?: { id: string; name: string } | null;
      }>;
    },
  });
}

/** Helper: busca valores distintos (nao nulos) de uma coluna de `leads`. */
function useDistinctLeadColumn(column: string, key: string) {
  return useQuery({
    queryKey: ['campaign-distinct', key],
    queryFn: async () => {
      const { data, error } = await sb
        .from('leads')
        .select(column)
        .not(column, 'is', null)
        .neq(column, '')
        .limit(5000);
      if (error) throw error;

      const values = new Set<string>();
      for (const row of (data || []) as Array<Record<string, any>>) {
        const v = row[column];
        if (v != null && String(v).trim() !== '') values.add(String(v));
      }
      return Array.from(values).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    },
    staleTime: 5 * 60_000,
  });
}

export function useDistinctCities() {
  return useDistinctLeadColumn('city_name', 'cities');
}

export function useDistinctStates() {
  return useDistinctLeadColumn('state', 'states');
}

export function useDistinctUtmSources() {
  return useDistinctLeadColumn('utm_source', 'utm-sources');
}

export function useDistinctUtmCampaigns() {
  return useDistinctLeadColumn('utm_campaign', 'utm-campaigns');
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCIAS WHATSAPP
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Instancias WhatsApp. Se `provider` for passado, filtra por metadata->>provider;
 * senao retorna todas. Usada pelo InstanceSelector e pelo CampaignDetailPanel.
 */
export function useWhatsAppInstances(provider?: string) {
  return useQuery({
    queryKey: ['whatsapp-instances', provider ?? 'all'],
    queryFn: async () => {
      let query = sb
        .from('whatsapp_instances')
        .select('*')
        .order('name', { ascending: true });

      if (provider) {
        query = query.eq('metadata->>provider', provider);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/**
 * Estatisticas de saude por instancia. Retorna o formato que o CampaignDetailPanel
 * espera: { instanceId, name, phone, health, cooldownUntil, messagesSentDay, apiKey, apiUrl }.
 * `health`: 'ok' | 'disconnected' | 'cooldown' | 'blocked'.
 */
export function useCampaignInstanceStats(instanceIds: string[]) {
  return useQuery({
    queryKey: ['campaign-instance-stats', instanceIds],
    enabled: (instanceIds?.length ?? 0) > 0,
    queryFn: async () => {
      if (!instanceIds?.length) return [];

      const { data: instances, error } = await sb
        .from('whatsapp_instances')
        .select('*')
        .in('id', instanceIds);
      if (error) throw error;

      // Tenta enriquecer com a tabela de stats (se existir). Best-effort.
      let statsById: Record<string, any> = {};
      try {
        const { data: stats } = await sb
          .from('campaign_instance_stats')
          .select('*')
          .in('instance_id', instanceIds);
        for (const s of (stats || []) as any[]) {
          statsById[s.instance_id] = s;
        }
      } catch {
        // tabela pode nao existir ainda — segue sem stats
      }

      return ((instances || []) as any[]).map((inst) => {
        const stat = statsById[inst.id] || {};
        const meta = inst.metadata || {};
        const cooldownUntil: string | null =
          stat.cooldown_until || meta.cooldown_until || null;

        let health: 'ok' | 'disconnected' | 'cooldown' | 'blocked' = 'ok';
        if (inst.status === 'blocked' || meta.blocked) {
          health = 'blocked';
        } else if (cooldownUntil && new Date(cooldownUntil) > new Date()) {
          health = 'cooldown';
        } else if (inst.status !== 'connected') {
          health = 'disconnected';
        }

        return {
          instanceId: inst.id,
          name: inst.name,
          phone: inst.phone_number ?? null,
          health,
          cooldownUntil,
          messagesSentDay:
            stat.messages_sent_day ?? stat.messages_sent_today ?? 0,
          apiKey: inst.api_key ?? undefined,
          apiUrl: inst.api_url ?? inst.webhook_url ?? undefined,
        };
      });
    },
    refetchInterval: 30_000,
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// LEADS DA CAMPANHA (tabela paginada)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Lista paginada de leads de uma campanha, com join do lead e do membro atribuido.
 * Retorna { leads, total }.
 */
export function useCampaignLeads(
  campaignId: string,
  status?: CampaignLeadStatus,
  page = 0,
  pageSize = 50,
  campaignStatus?: string,
) {
  return useQuery({
    queryKey: ['campaign-leads', campaignId, status ?? 'all', page, pageSize],
    enabled: !!campaignId,
    // Enquanto a campanha esta enviando, atualiza sozinho pra ver o progresso
    refetchInterval: campaignStatus === 'sending' ? 5_000 : false,
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = sb
        .from('campaign_leads')
        .select(
          `*,
           lead:leads(id, name, phone, email, city_name, state, sales_rep_id),
           assigned_member:team_members!campaign_leads_assigned_to_fkey(id, name)`,
          { count: 'exact' },
        )
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: true })
        .range(from, to);

      if (status) query = query.eq('status', status);

      const { data, error, count } = await query;
      if (error) throw error;

      return {
        leads: (data || []) as CampaignLead[],
        total: count ?? 0,
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// METRICAS DO DASHBOARD
// ═══════════════════════════════════════════════════════════════════════════

/** Agrega metricas de todas as campanhas pro dashboard. */
export function useCampaignMetrics() {
  return useQuery({
    queryKey: ['campaign-metrics'],
    queryFn: async (): Promise<CampaignMetrics> => {
      const { data, error } = await sb
        .from('campaigns')
        .select(
          'status, sent_count, responded_count, blocked_count',
        );
      if (error) throw error;

      const rows = (data || []) as Array<{
        status: string;
        sent_count: number | null;
        responded_count: number | null;
        blocked_count: number | null;
      }>;

      const activeStatuses = new Set(['sending', 'scheduled', 'paused']);
      let totalContacted = 0;
      let totalResponded = 0;
      let totalBlocked = 0;
      let activeCampaigns = 0;

      for (const c of rows) {
        totalContacted += c.sent_count || 0;
        totalResponded += c.responded_count || 0;
        totalBlocked += c.blocked_count || 0;
        if (activeStatuses.has(c.status)) activeCampaigns += 1;
      }

      const avgResponseRate =
        totalContacted > 0
          ? Math.round((totalResponded / totalContacted) * 100)
          : 0;

      return {
        total_campaigns: rows.length,
        active_campaigns: activeCampaigns,
        total_leads_contacted: totalContacted,
        total_responded: totalResponded,
        avg_response_rate: avgResponseRate,
        total_blocked: totalBlocked,
      };
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCIAS DEDICADAS DE CAMPANHA (CRUD)
// ═══════════════════════════════════════════════════════════════════════════
// Instancias whatsapp criadas especificamente pra disparos em massa, separadas
// do inbox. Marcadas via metadata.is_campaign = true.

/** Lista as instancias dedicadas a campanhas. */
export function useCampaignInstances() {
  return useQuery({
    queryKey: ['campaign-instances'],
    queryFn: async () => {
      const { data, error } = await sb
        .from('whatsapp_instances')
        .select('*')
        .eq('metadata->>is_campaign', 'true')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });
}

/** Cria uma instancia de campanha. So precisa do nome. */
export function useCreateCampaignInstance() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      const { data, error } = await sb
        .from('whatsapp_instances')
        .insert({
          name,
          status: 'disconnected',
          metadata: { is_campaign: true },
          created_by: teamMember?.id ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

/** Atualiza uma instancia de campanha (nome). */
export function useUpdateCampaignInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const { data, error } = await sb
        .from('whatsapp_instances')
        .update({ name })
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as any;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}

/** Exclui uma instancia de campanha. Recebe o id. */
export function useDeleteCampaignInstance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('whatsapp_instances')
        .delete()
        .eq('id', id);
      if (error) throw error;
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign-instances'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
    },
  });
}
