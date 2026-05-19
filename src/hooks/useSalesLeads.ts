import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  SalesLead,
  SalesLeadFilters,
  UpdateLeadSalesInput,
  SalesStage
} from '@/types/sales.types';

// Fetch all sales leads with pagination
export const useSalesLeads = (filters?: SalesLeadFilters & { page?: number; pageSize?: number }) => {
  return useQuery({
    queryKey: ['sales-leads', filters],
    queryFn: async () => {
      const page = filters?.page || 0;
      const pageSize = filters?.pageSize || 50;
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase as any)
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

      if (filters?.sales_stage) {
        query = query.eq('sales_stage', filters.sales_stage);
      }
      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }
      if (filters?.min_score) {
        query = query.gte('sales_score', filters.min_score);
      }
      if (filters?.search) {
        query = query.or(`name.ilike.%${filters.search}%,email.ilike.%${filters.search}%,phone.ilike.%${filters.search}%,instagram.ilike.%${filters.search}%`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { 
        leads: (data || []) as SalesLead[], 
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    },
  });
};

// Fetch single sales lead
export const useSalesLead = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['sales-lead', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select(`
          *, 
          pipeline_stage:sales_pipeline_stages(id, name, color, position, is_won, is_lost, pipeline_id)
        `)
        .eq('id', leadId)
        .single();

      if (error) throw error;
      
      // Buscar sales_rep separadamente se existir sales_rep_id
      let salesRep = null;
      if (data?.sales_rep_id) {
        const { data: repData } = await supabase
          .from('team_members')
          .select('id, name')
          .eq('id', data.sales_rep_id)
          .single();
        salesRep = repData;
      }

      return {
        ...data,
        sales_rep: salesRep,
      } as SalesLead & {
        pipeline_stage?: { id: string; name: string; color: string; position: number; is_won: boolean; is_lost: boolean; pipeline_id: string } | null;
        sales_rep?: { id: string; name: string } | null;
      };
    },
    enabled: !!leadId,
  });
};

// Fetch leads by stage for pipeline view
export const useSalesLeadsByStage = (stage: SalesStage) => {
  return useQuery({
    queryKey: ['sales-leads-by-stage', stage],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('sales_stage', stage)
        .order('sales_score', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesLead[];
    },
  });
};

// Fetch hot leads (high score, high urgency, or recent alerts)
export const useHotLeads = (limit: number = 10) => {
  return useQuery({
    queryKey: ['hot-leads', limit],
    queryFn: async () => {
      // Get won/lost stage IDs to exclude
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id')
        .or('is_won.eq.true,is_lost.eq.true');

      const excludeStageIds = stages?.map(s => s.id) || [];

      let query = supabase
        .from('leads')
        .select('*')
        .gte('sales_score', 70)
        .not('sales_stage', 'in', '("fechado","perdido")')
        .order('sales_score', { ascending: false })
        .limit(limit);

      // Exclude leads in won/lost pipeline stages
      if (excludeStageIds.length > 0) {
        query = query.not('pipeline_stage_id', 'in', `(${excludeStageIds.join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as SalesLead[];
    },
  });
};

// Update lead sales data
export const useUpdateLeadSales = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateLeadSalesInput) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('leads')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
      queryClient.invalidateQueries({ queryKey: ['hot-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads-by-stage'] });
    },
  });
};

// Assign lead to sales rep
export const useAssignLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, salesRepId }: { contactId: string; salesRepId: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          sales_rep_id: salesRepId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
    },
  });
};

// Update lead stage (legacy - uses sales_stage text field)
export const useUpdateLeadStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ contactId, stage }: { contactId: string; stage: SalesStage }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          sales_stage: stage,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads-by-stage'] });
    },
  });
};

// Update lead pipeline stage (uses pipeline_stage_id foreign key)
export const useUpdateLeadPipelineStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, stageId }: { leadId: string; stageId: string }) => {
      // 1. Atualizar o lead
      const { data, error } = await supabase
        .from('leads')
        .update({
          pipeline_stage_id: stageId,
          stage_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select('*, pipeline_stage:sales_pipeline_stages(id, name, color, position, is_won, is_lost, pipeline_id)')
        .single();

      if (error) throw error;

      // 2. Mover deals abertos do lead no mesmo pipeline para a mesma etapa
      const pipelineStage = (data as any).pipeline_stage;
      const pipelineId = pipelineStage?.pipeline_id;
      const isWon = pipelineStage?.is_won === true;
      const isLost = pipelineStage?.is_lost === true;

      // Helper para sincronizar deals de um lead
      const syncDealsForLead = async (targetLeadId: string) => {
        if (!pipelineId) return;
        const { data: deals } = await supabase
          .from('deals')
          .select('id, pipeline_stage_id, pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(pipeline_id)')
          .eq('lead_id', targetLeadId)
          .not('status', 'in', '("won","lost")');

        if (deals && deals.length > 0) {
          const dealsToMove = deals.filter(
            (d: any) => d.pipeline_stage?.pipeline_id === pipelineId
          );
          for (const deal of dealsToMove) {
            const dealUpdate: Record<string, any> = {
              pipeline_stage_id: stageId,
              updated_at: new Date().toISOString(),
            };
            if (isWon) {
              dealUpdate.status = 'won';
              dealUpdate.won_at = new Date().toISOString();
            } else if (isLost) {
              dealUpdate.status = 'lost';
              dealUpdate.lost_at = new Date().toISOString();
            } else {
              dealUpdate.status = 'negotiation';
            }
            await supabase
              .from('deals')
              .update(dealUpdate)
              .eq('id', deal.id);
          }
        }
      };

      // Sincronizar deals do lead principal
      await syncDealsForLead(leadId);

      // 3. Sincronizar deals de TODOS os leads do cluster (bidirecional)
      // O trigger sync_partner_pipeline_stage já atualiza o pipeline_stage_id dos parceiros
      // Aqui sincronizamos os deals de todos os parceiros também
      const partnerLeadId = (data as any).partner_lead_id;

      // Buscar filhos deste lead (leads que apontam para ele)
      const { data: children } = await supabase
        .from('leads').select('id').eq('partner_lead_id', leadId);

      const partnerIds = [
        partnerLeadId,
        ...(children?.map((c: any) => c.id) || []),
      ].filter(Boolean) as string[];

      for (const pid of partnerIds) {
        await syncDealsForLead(pid);
      }

      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['contact-deals'] });
    },
  });
};

// Update BANT qualification
export const useUpdateBANT = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      contactId,
      bant,
    }: {
      contactId: string;
      bant: {
        budget?: boolean;
        authority?: boolean;
        need?: boolean;
        timeline?: boolean;
      };
    }) => {
      const { data, error } = await supabase
        .from('leads')
        .update({
          bant_budget: bant.budget,
          bant_authority: bant.authority,
          bant_need: bant.need,
          bant_timeline: bant.timeline,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contactId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
    },
  });
};

// Update lead info (name, email, phone, etc)
export const useUpdateLeadInfo = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      data,
    }: {
      leadId: string;
      data: {
        name?: string;
        email?: string;
        phone?: string;
        instagram?: string;
        region?: string;
        utm_source?: string;
        utm_campaign?: string;
        utm_content?: string;
        company_name?: string;
        job_title?: string;
        tags?: string[];
      };
    }) => {
      // Remover campos que não existem na tabela
      const allowedFields = ['name', 'email', 'phone', 'instagram', 'region', 'utm_source', 'utm_campaign', 'utm_content', 'company_name', 'job_title', 'tags'];
      const cleanData: Record<string, any> = {};

      Object.entries(data).forEach(([key, value]) => {
        // Só incluir campos permitidos
        if (!allowedFields.includes(key)) return;

        // Arrays (tags): aceitar [] como valor válido
        if (Array.isArray(value)) {
          cleanData[key] = value;
        } else if (value !== undefined && value !== '') {
          cleanData[key] = value;
        } else if (value === '') {
          cleanData[key] = null;
        }
      });
      
      
      const { data: result, error } = await (supabase as any)
        .from('leads')
        .update({
          ...cleanData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', leadId)
        .select()
        .single();

      if (error) {
        console.error('[useUpdateLeadInfo] Error:', error);
        throw error;
      }
      return result as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
    },
  });
};

// Delete lead
export const useDeleteLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // Delete related records first (deal_contacts, whatsapp_messages handled by cascade or ignored)
      await (supabase.from('deal_contacts' as any).delete().eq('lead_id', leadId) as any);
      await supabase.from('company_activities').delete().eq('lead_id', leadId);
      await supabase.from('whatsapp_messages').delete().eq('lead_id', leadId);
      await (supabase.from('ai_agent_conversations' as any).delete().eq('lead_id', leadId) as any);

      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', leadId);

      if (error) throw error;
      return leadId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    },
  });
};

// Update lead qualification fields (company_name, employee_count, monthly_revenue, challenges)
export const useUpdateLeadQualification = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      field,
      value,
    }: {
      leadId: string;
      field: 'company_name' | 'employee_count' | 'monthly_revenue' | 'challenges';
      value: string | number | null;
    }) => {
      const updateData: Record<string, any> = {
        [field]: value === '' ? null : value,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await (supabase as any)
        .from('leads')
        .update(updateData)
        .eq('id', leadId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesLead;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.id] });
    },
  });
};

// Get leads count by stage
export const useLeadsCountByStage = () => {
  return useQuery({
    queryKey: ['leads-count-by-stage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('leads')
        .select('sales_stage')
        .not('sales_stage', 'is', null);

      if (error) throw error;

      const counts: Record<string, number> = {
        captura: 0,
        qualificacao: 0,
        agendamento: 0,
        negociacao: 0,
        fechado: 0,
        perdido: 0,
      };

      data?.forEach((item) => {
        if (item.sales_stage && counts[item.sales_stage] !== undefined) {
          counts[item.sales_stage]++;
        }
      });

      return counts;
    },
  });
};
