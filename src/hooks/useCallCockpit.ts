import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

const CLOSER_PIPELINE_ID = '9c21bd06-a898-44a1-88db-ad3c6ec7140c';

export interface CockpitLead {
  deal_id: string;
  lead_id: string;
  lead_name: string;
  lead_phone: string | null;
  lead_email: string | null;
  company_name: string | null;
  sales_score: number | null;
  utm_source: string | null;
  utm_campaign: string | null;
  stage_name: string;
  stage_position: number;
  deal_title: string;
  deal_value: number | null;
  monthly_revenue: string | null;
  created_at: string;
  last_interaction_at: string | null;
  sales_rep_id: string | null;
  sales_rep_name: string | null;
  sdr_id: string | null;
  sdr_name: string | null;
  pipeline_id: string;
  pipeline_stage_id: string;
  bant_budget: string | null;
  bant_authority: string | null;
  bant_need: string | null;
  bant_timeline: string | null;
  ai_conversation_insights: string | null;
}

export interface CockpitFilters {
  stages?: string[];        // filter by specific stage names
  minRevenue?: number;
  maxRevenue?: number;
  dateFrom?: string;        // ISO date
  dateTo?: string;          // ISO date
  utmSource?: string;
  utmCampaign?: string;
  search?: string;
  sortBy?: 'recent' | 'revenue' | 'score' | 'stage_priority';
}

// SDR focuses on stages before the call
const SDR_STAGE_NAMES = ['Novo', 'Não atendeu', 'Em Contato', 'Qualificado', 'Em Agendamento'];
// SDR priority: Novo first (most recent leads are always priority), then the rest
const SDR_PRIORITY_ORDER = ['Novo', 'Em Contato', 'Qualificado', 'Em Agendamento', 'Não atendeu'];

// Closer focuses on stages after the call
const CLOSER_STAGE_NAMES = ['Call Agendada', 'No-show', 'Call Realizada', 'Em Fechamento'];
const CLOSER_PRIORITY_ORDER = ['Call Realizada', 'Em Fechamento', 'No-show', 'Call Agendada'];

export const ALL_COCKPIT_STAGES = {
  sdr: SDR_STAGE_NAMES,
  closer: CLOSER_STAGE_NAMES,
};

function parseRevenue(rev: string | null): number {
  if (!rev) return 0;
  const cleaned = rev.replace(/[^\d.,]/g, '').replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function normalizeSearch(str: string): string {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export const useCockpitQueue = (
  mode: 'sdr' | 'closer',
  salesRepId?: string,
  filters?: CockpitFilters,
) => {
  const allowedStageNames = mode === 'sdr' ? SDR_STAGE_NAMES : CLOSER_STAGE_NAMES;
  const priorityOrder = mode === 'sdr' ? SDR_PRIORITY_ORDER : CLOSER_PRIORITY_ORDER;

  return useQuery({
    queryKey: ['cockpit-queue', mode, salesRepId, filters],
    queryFn: async () => {
      // 1. Fetch stages for the Closer pipeline (where all deals live)
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, name, position')
        .eq('pipeline_id', CLOSER_PIPELINE_ID)
        .eq('is_won', false)
        .eq('is_lost', false)
        .order('position');

      if (!stages?.length) return [];

      // Filter stages by mode (SDR vs Closer)
      const activeStageNames = filters?.stages?.length ? filters.stages : allowedStageNames;
      const relevantStages = stages.filter(s => activeStageNames.includes(s.name));
      if (!relevantStages.length) return [];

      // 2. Fetch deals with lead data (exclude won/lost, limit for performance)
      let dealsQuery = supabase
        .from('deals')
        .select(`
          id,
          title,
          negotiated_price,
          pipeline_stage_id,
          pipeline_id,
          sales_rep_id,
          created_at,
          lead_id,
          lead:leads!deals_lead_id_fkey(
            id, name, phone, email, company_name,
            sales_score, utm_source, utm_campaign,
            bant_budget, bant_authority, bant_need, bant_timeline,
            ai_conversation_insights
          ),
          sales_rep:team_members!deals_sales_rep_id_fkey(id, name),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .eq('pipeline_id', CLOSER_PIPELINE_ID)
        .in('pipeline_stage_id', relevantStages.map(s => s.id))
        .not('status', 'in', '(won,lost)');

      if (salesRepId) {
        if (mode === 'sdr') {
          // SDR sees deals where they are SDR, or they are sales_rep (closer working SDR stages)
          dealsQuery = dealsQuery.or(
            `sdr_id.eq.${salesRepId},sales_rep_id.eq.${salesRepId}`
          );
        } else {
          dealsQuery = dealsQuery.eq('sales_rep_id', salesRepId);
        }
      }

      // Date filters at query level
      if (filters?.dateFrom) {
        dealsQuery = dealsQuery.gte('created_at', filters.dateFrom);
      }
      if (filters?.dateTo) {
        dealsQuery = dealsQuery.lte('created_at', filters.dateTo + 'T23:59:59');
      }

      const { data: deals } = await dealsQuery.order('created_at', { ascending: false }).limit(500);
      if (!deals?.length) return [];

      const leadIds = deals.map((d: any) => d.lead_id).filter(Boolean);
      const uniqueLeadIds = [...new Set(leadIds)] as string[];

      // 3. Fetch revenue data (filtered by lead_ids)
      const revenueMap = new Map<string, string>();

      if (uniqueLeadIds.length > 0) {
        // Batch in chunks of 200 to avoid URL length limits
        const CHUNK = 200;
        for (let i = 0; i < uniqueLeadIds.length; i += CHUNK) {
          const chunk = uniqueLeadIds.slice(i, i + CHUNK);
          const { data: diagnostics } = await supabase
            .from('lead_diagnostics_v2' as any)
            .select('lead_id, monthly_revenue')
            .in('lead_id', chunk) as any;

          (diagnostics || []).forEach((d: any) => {
            if (d.lead_id && d.monthly_revenue) revenueMap.set(d.lead_id, d.monthly_revenue);
          });
        }

        // Fallback: pain_registrations
        const missingIds = uniqueLeadIds.filter((id: string) => !revenueMap.has(id));
        if (missingIds.length > 0) {
          for (let i = 0; i < missingIds.length; i += CHUNK) {
            const chunk = missingIds.slice(i, i + CHUNK);
            const { data: painRegs } = await supabase
              .from('pain_registrations' as any)
              .select('lead_id, monthly_revenue')
              .in('lead_id', chunk)
              .not('monthly_revenue', 'is', null) as any;

            (painRegs || []).forEach((r: any) => {
              if (r.lead_id && r.monthly_revenue && !revenueMap.has(r.lead_id)) {
                revenueMap.set(r.lead_id, r.monthly_revenue);
              }
            });
          }
        }
      }

      // 4. Fetch last interactions (batch to avoid huge RPC calls)
      const lastInteractions = new Map<string, string>();
      if (uniqueLeadIds.length > 0) {
        const CHUNK = 200;
        for (let i = 0; i < uniqueLeadIds.length; i += CHUNK) {
          const chunk = uniqueLeadIds.slice(i, i + CHUNK);
          const { data: rows } = await supabase
            .rpc('get_last_interaction_by_leads', { p_lead_ids: chunk });

          (rows || []).forEach((r: any) => {
            if (r.lead_id && r.last_interaction_at) {
              lastInteractions.set(r.lead_id, r.last_interaction_at);
            }
          });
        }
      }

      // 5. Build stage maps
      const stagePriorityMap = new Map<string, number>();
      priorityOrder.forEach((name, idx) => stagePriorityMap.set(name, idx));
      const stageMap = new Map(stages.map(s => [s.id, s]));

      // 6. Map deals to CockpitLead
      let items: CockpitLead[] = deals.map((deal: any) => {
        const stage = stageMap.get(deal.pipeline_stage_id);
        const lead = deal.lead;
        return {
          deal_id: deal.id,
          lead_id: deal.lead_id,
          lead_name: lead?.name || 'Sem nome',
          lead_phone: lead?.phone || null,
          lead_email: lead?.email || null,
          company_name: lead?.company_name || null,
          sales_score: lead?.sales_score || null,
          utm_source: lead?.utm_source || null,
          utm_campaign: lead?.utm_campaign || null,
          stage_name: stage?.name || 'Desconhecido',
          stage_position: stage?.position || 99,
          deal_title: deal.title,
          deal_value: deal.negotiated_price ? Number(deal.negotiated_price) : null,
          monthly_revenue: revenueMap.get(deal.lead_id) || null,
          created_at: deal.created_at,
          last_interaction_at: lastInteractions.get(deal.lead_id) || null,
          sales_rep_id: deal.sales_rep_id,
          sales_rep_name: deal.sales_rep?.name || null,
          sdr_id: deal.sdr_id || null,
          sdr_name: deal.sdr?.name || null,
          pipeline_id: deal.pipeline_id,
          pipeline_stage_id: deal.pipeline_stage_id,
          bant_budget: lead?.bant_budget || null,
          bant_authority: lead?.bant_authority || null,
          bant_need: lead?.bant_need || null,
          bant_timeline: lead?.bant_timeline || null,
          ai_conversation_insights: lead?.ai_conversation_insights || null,
        };
      });

      // 7. Apply client-side filters
      if (filters?.search) {
        const q = normalizeSearch(filters.search);
        items = items.filter(i =>
          normalizeSearch(i.lead_name).includes(q) ||
          (i.lead_phone && i.lead_phone.includes(filters.search!)) ||
          (i.lead_email && normalizeSearch(i.lead_email).includes(q)) ||
          (i.company_name && normalizeSearch(i.company_name).includes(q))
        );
      }

      if (filters?.utmSource && filters.utmSource !== 'all') {
        items = items.filter(i => i.utm_source?.toLowerCase() === filters.utmSource!.toLowerCase());
      }

      if (filters?.utmCampaign && filters.utmCampaign !== 'all') {
        items = items.filter(i => i.utm_campaign?.toLowerCase() === filters.utmCampaign!.toLowerCase());
      }

      if (filters?.minRevenue) {
        items = items.filter(i => parseRevenue(i.monthly_revenue) >= filters.minRevenue!);
      }

      if (filters?.maxRevenue) {
        items = items.filter(i => {
          const rev = parseRevenue(i.monthly_revenue);
          return rev > 0 && rev <= filters.maxRevenue!;
        });
      }

      // 8. Sort
      const sortBy = filters?.sortBy || 'stage_priority';

      items.sort((a, b) => {
        if (sortBy === 'stage_priority') {
          const aPriority = stagePriorityMap.get(a.stage_name) ?? 99;
          const bPriority = stagePriorityMap.get(b.stage_name) ?? 99;
          if (aPriority !== bPriority) return aPriority - bPriority;
          // Then newest first
          const diff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          if (diff !== 0) return diff;
          // Then highest revenue
          return parseRevenue(b.monthly_revenue) - parseRevenue(a.monthly_revenue);
        }

        if (sortBy === 'recent') {
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }

        if (sortBy === 'revenue') {
          return parseRevenue(b.monthly_revenue) - parseRevenue(a.monthly_revenue);
        }

        if (sortBy === 'score') {
          return (b.sales_score || 0) - (a.sales_score || 0);
        }

        return 0;
      });

      return items;
    },
    refetchInterval: 30000,
  });
};

// Generate the "não atendeu" WhatsApp messages (2 separate messages)
// Tom: tudo minúsculo, sem emoji (máx 1 no final), sem "!", parceiro que manja
// Objetivo: curiosidade + dopamina → fazer o lead RESPONDER, não vender
export function generateNotAnsweredMessages(leadName: string, attempts: number = 1): [string, string] {
  const firstName = ((leadName || '').split(' ')[0] || '').toLowerCase();
  const hour = new Date().getHours();

  let callBack: string;
  if (hour < 12) {
    callBack = 'te ligo mais tarde, fechou?';
  } else if (hour < 18) {
    callBack = 'te ligo amanhã de manhã, fechou?';
  } else {
    callBack = 'te ligo amanhã de manhã, fechou?';
  }

  const msg1 = `oi ${firstName}, tudo bem?`;

  let msg2: string;
  if (attempts >= 2) {
    // 2ª tentativa: tom diferente, menciona que tentou de novo
    msg2 = `tentei te ligar de novo aqui.. queria trocar uma ideia contigo, acho que posso te ajudar com umas coisas.. ${callBack}`;
  } else {
    // 1ª tentativa: mensagem genérica de curiosidade
    msg2 = `tentei te ligar aqui.. queria trocar uma ideia contigo sobre umas coisas que podem te ajudar bastante.. ${callBack}`;
  }

  return [msg1, msg2];
}

// Generate follow-up task data
export function generateFollowUpTask(leadName: string, leadId: string, responsavelId: string) {
  const firstName = (leadName || '').split(' ')[0];
  const hour = new Date().getHours();

  const scheduledAt = new Date();
  if (hour < 12) {
    scheduledAt.setHours(17, 0, 0, 0);
  } else if (hour < 18) {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(10, 0, 0, 0);
  } else {
    scheduledAt.setDate(scheduledAt.getDate() + 1);
    scheduledAt.setHours(10, 0, 0, 0);
  }

  return {
    name: `Ligar para ${firstName} - não atendeu`,
    description: `Retornar ligação para ${leadName}. Não atendeu nas tentativas anteriores.`,
    task_type: 'call' as const,
    team: 'sales' as const,
    priority: 'high' as const,
    lead_id: leadId,
    responsavel_id: responsavelId,
    scheduled_at: scheduledAt.toISOString(),
    status: 'scheduled' as const,
  };
}
