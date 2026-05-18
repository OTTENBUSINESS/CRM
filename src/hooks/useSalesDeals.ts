import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import type {
  Deal,
  DealFilters,
  CreateDealInput,
  UpdateDealInput,
  DealStatus
} from '@/types/sales.types';
import { triggerNotificationEvent, getDealNotificationContext, triggerAutomationRules } from './useNotificationEvents';

// Fetch all deals with filters
export const useSalesDeals = (filters?: DealFilters) => {
  return useQuery({
    queryKey: ['sales-deals', filters],
    queryFn: async () => {
      let query = supabase
        .from('deals')
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(id, name, email, phone, sales_score),
          product:products!deals_product_id_fkey(id, name),
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color, position, is_won, is_lost, pipeline_id, pipeline:sales_pipelines(id, name)),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.pipeline_stage_id) {
        query = query.eq('pipeline_stage_id', filters.pipeline_stage_id);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }
      if (filters?.product_id) {
        query = query.eq('product_id', filters.product_id);
      }
      if (filters?.min_value) {
        query = query.gte('negotiated_price', filters.min_value);
      }
      if (filters?.max_value) {
        query = query.lte('negotiated_price', filters.max_value);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Deal[];
    },
  });
};

// Fetch single deal
export const useSalesDeal = (dealId: string | undefined) => {
  return useQuery({
    queryKey: ['sales-deal', dealId],
    queryFn: async () => {
      if (!dealId) return null;

      const { data, error } = await supabase
        .from('deals')
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(id, name, email, phone, sales_score, sales_stage),
          product:products!deals_product_id_fkey(id, name),
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color, position, is_won, is_lost, pipeline_id, pipeline:sales_pipelines(id, name)),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .eq('id', dealId)
        .single();

      if (error) throw error;
      return data as Deal;
    },
    enabled: !!dealId,
  });
};

// Fetch deals by contact/lead
export const useContactDeals = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['contact-deals', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      // 1. Deals onde lead é primário (lead_id direto)
      const { data: directDeals, error: directError } = await supabase
        .from('deals')
        .select(`
          *,
          product:products!deals_product_id_fkey(id, name, price),
          lead:leads!deals_lead_id_fkey(id, name, email, phone, sales_score, utm_source),
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color, position, is_won, is_lost, pipeline_id, pipeline:sales_pipelines(id, name)),
          sales_rep:team_members!deals_sales_rep_id_fkey(id, name),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (directError) throw directError;

      // 2. Deals onde lead participa via deal_contacts (contato secundário)
      const { data: participations } = await (supabase as any)
        .from('deal_contacts')
        .select('deal_id')
        .eq('lead_id', leadId);

      const participationDealIds = (participations || [])
        .map((p: any) => p.deal_id)
        .filter((did: string) => !(directDeals || []).some((d: any) => d.id === did));

      let secondaryDeals: any[] = [];
      if (participationDealIds.length > 0) {
        const { data: extra, error: extraError } = await supabase
          .from('deals')
          .select(`
            *,
            product:products!deals_product_id_fkey(id, name, price),
            lead:leads!deals_lead_id_fkey(id, name, email, phone, sales_score, utm_source),
            pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color, position, is_won, is_lost, pipeline_id, pipeline:sales_pipelines(id, name)),
            sales_rep:team_members!deals_sales_rep_id_fkey(id, name),
            sdr:team_members!deals_sdr_id_fkey(id, name)
          `)
          .in('id', participationDealIds)
          .order('created_at', { ascending: false });

        if (extraError) throw extraError;
        secondaryDeals = extra || [];
      }

      const allDeals = [...(directDeals || []), ...secondaryDeals];

      // 3. Carregar deal_contacts para cada deal (para mostrar contatos no card)
      if (allDeals.length > 0) {
        const allDealIds = allDeals.map(d => d.id);
        const { data: allContacts } = await (supabase as any)
          .from('deal_contacts')
          .select('*')
          .in('deal_id', allDealIds)
          .order('is_primary', { ascending: false });

        if (allContacts && allContacts.length > 0) {
          // Carregar leads dos contatos
          const contactLeadIds = [...new Set(allContacts.map((c: any) => c.lead_id))];
          const { data: contactLeads } = await supabase
            .from('leads')
            .select('id, name, email, phone, company_name')
            .in('id', contactLeadIds as string[]);

          const leadsMap = new Map((contactLeads || []).map(l => [l.id, l]));

          // Agrupar por deal
          const contactsByDeal = new Map<string, any[]>();
          for (const c of allContacts) {
            if (!contactsByDeal.has(c.deal_id)) contactsByDeal.set(c.deal_id, []);
            contactsByDeal.get(c.deal_id)!.push({ ...c, lead: leadsMap.get(c.lead_id) || null });
          }

          // Injetar nos deals
          for (const deal of allDeals) {
            (deal as any).contacts = contactsByDeal.get(deal.id) || [];
          }
        }
      }

      // 4. Enriquecer com webinar enrollment + atendencia
      if (allDeals.length > 0) {
        const allDealIds = allDeals.map(d => d.id);
        const { data: enrollments } = await supabase
          .from('lead_webinar_enrollments')
          .select('deal_id, lead_id, webinar_config_id, webinar_config:webinar_config!lead_webinar_enrollments_webinar_config_id_fkey(id, title, event_date)')
          .in('deal_id', allDealIds);

        // Buscar atendencia em event_registrations via webinar_config_id (FK direta)
        const enrollmentLeadIds = [...new Set((enrollments || []).map((e: any) => e.lead_id).filter(Boolean))];
        const attendanceByLeadAndConfig = new Map<string, { attended: boolean | null; total_duration_minutes: number | null }>();
        if (enrollmentLeadIds.length > 0) {
          const { data: regs } = await supabase
            .from('event_registrations')
            .select('lead_id, webinar_config_id, attended, total_duration_minutes')
            .in('lead_id', enrollmentLeadIds)
            .not('webinar_config_id', 'is', null);
          (regs || []).forEach((r: any) => {
            if (r.lead_id && r.webinar_config_id) {
              attendanceByLeadAndConfig.set(`${r.lead_id}::${r.webinar_config_id}`, {
                attended: r.attended,
                total_duration_minutes: r.total_duration_minutes,
              });
            }
          });
        }

        const enrollmentByDealId = new Map<string, any>();
        (enrollments || []).forEach((e: any) => {
          if (e.deal_id && e.webinar_config) {
            const key = `${e.lead_id}::${e.webinar_config_id}`;
            const att = attendanceByLeadAndConfig.get(key);
            enrollmentByDealId.set(e.deal_id, {
              webinar_config_id: e.webinar_config_id,
              webinar_title: e.webinar_config.title,
              event_date: e.webinar_config.event_date,
              attended: att?.attended ?? null,
              attended_duration: att?.total_duration_minutes ?? null,
            });
          }
        });

        for (const deal of allDeals) {
          (deal as any).webinar_enrollment = enrollmentByDealId.get(deal.id) || null;
        }
      }

      return allDeals as Deal[];
    },
    enabled: !!leadId,
  });
};

// Fetch deals by pipeline stage
export const useDealsByStage = (stageId: string | undefined) => {
  return useQuery({
    queryKey: ['deals-by-stage', stageId],
    queryFn: async () => {
      if (!stageId) return [];

      const { data, error } = await supabase
        .from('deals')
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(id, name, email, phone, sales_score),
          product:products!deals_product_id_fkey(id, name),
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color, position),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .eq('pipeline_stage_id', stageId)
        .order('negotiated_price', { ascending: false });

      if (error) throw error;
      return (data || []) as Deal[];
    },
    enabled: !!stageId,
  });
};

// Create deal
export const useCreateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateDealInput) => {
      // Resolve pipeline_id from the stage if not provided
      let pipelineId = input.pipeline_id;
      let pipelineStageId = input.pipeline_stage_id;

      if (!pipelineStageId) {
        // Get first stage of the specified pipeline, or default pipeline
        let stagesQuery = supabase
          .from('sales_pipeline_stages')
          .select('id, pipeline_id')
          .eq('is_won', false)
          .eq('is_lost', false)
          .order('position', { ascending: true })
          .limit(1);

        if (pipelineId) {
          stagesQuery = stagesQuery.eq('pipeline_id', pipelineId);
        }

        const { data: firstStage } = await stagesQuery.single();
        pipelineStageId = firstStage?.id;
        if (!pipelineId && firstStage) {
          pipelineId = firstStage.pipeline_id;
        }
      } else if (!pipelineId) {
        // Derive pipeline_id from stage
        const { data: stageData } = await supabase
          .from('sales_pipeline_stages')
          .select('pipeline_id')
          .eq('id', pipelineStageId)
          .single();
        pipelineId = stageData?.pipeline_id;
      }

      // If no sales_rep_id provided, check pipeline's default
      let salesRepId = input.sales_rep_id;
      if (!salesRepId && pipelineId) {
        const { data: pipelineData } = await supabase
          .from('sales_pipelines')
          .select('default_sales_rep_id')
          .eq('id', pipelineId)
          .single();
        salesRepId = pipelineData?.default_sales_rep_id || undefined;
      }

      const leadId = input.lead_id || input.contact_id;

      const { data, error } = await supabase
        .from('deals')
        .insert({
          lead_id: leadId, // support both for compatibility
          product_id: input.product_id,
          pipeline_id: pipelineId,
          pipeline_stage_id: pipelineStageId,
          sales_rep_id: salesRepId,
          sdr_id: input.sdr_id || null,
          original_price: input.original_price,
          negotiated_price: input.negotiated_price,
          discount_percent: input.discount_percent,
          discount_reason: input.discount_reason,
          payment_method: input.payment_method,
          installments: input.installments,
          expected_close_date: input.expected_close_date,
          notes: input.notes,
          status: 'negotiation',
          ai_win_probability: 0,
        })
        .select(`
          *,
          product:products!deals_product_id_fkey(id, name, price)
        `)
        .single();

      if (error) throw error;

      // Atualizar o lead com o mesmo responsável do deal
      if (salesRepId && leadId) {
        await supabase
          .from('leads')
          .update({ sales_rep_id: salesRepId })
          .eq('id', leadId);
      }

      return data as Deal;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['contact-deals', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });
      // Invalidar cache do lead para atualizar o responsável
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });

      // Disparar notificação de deal criado
      const context = await getDealNotificationContext(data.id);
      if (context) {
        triggerNotificationEvent('deal_created', context);
      }

      // Disparar regras de automação
      triggerAutomationRules({
        trigger_type: 'deal_created',
        deal_id: data.id,
        lead_id: data.lead_id,
        stage_id: data.pipeline_stage_id,
      });
    },
  });
};

// Update deal
export const useUpdateDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateDealInput) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('deals')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(id, name),
          product:products!deals_product_id_fkey(id, name),
          pipeline_stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, color),
          sdr:team_members!deals_sdr_id_fkey(id, name)
        `)
        .single();

      if (error) throw error;
      return data as Deal;
    },
    onSuccess: async (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-deal', data.id] });
      queryClient.invalidateQueries({ queryKey: ['contact-deals', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });

      // Disparar notificação de proposta enviada
      if (variables.status === 'proposal_sent' || variables.proposal_sent_at) {
        const context = await getDealNotificationContext(data.id);
        if (context) {
          triggerNotificationEvent('deal_proposal_sent', context);
        }
      }
    },
  });
};

// Move deal to different pipeline stage
export const useMoveDealStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, stageId }: { dealId: string; stageId: string }) => {
      // Get stage info to check if it's won/lost
      const { data: stage } = await supabase
        .from('sales_pipeline_stages')
        .select('id, pipeline_id, is_won, is_lost')
        .eq('id', stageId)
        .single();

      // Buscar deal atual para saber status anterior
      const { data: currentDeal } = await supabase
        .from('deals')
        .select('status')
        .eq('id', dealId)
        .single();

      const updates: Record<string, unknown> = {
        pipeline_stage_id: stageId,
        updated_at: new Date().toISOString(),
      };

      // Auto-set status and timestamps based on stage
      if (stage?.is_won) {
        updates.status = 'won';
        updates.won_at = new Date().toISOString();
      } else if (stage?.is_lost) {
        updates.status = 'lost';
        updates.lost_at = new Date().toISOString();
      } else if (currentDeal?.status === 'won' || currentDeal?.status === 'lost') {
        // Resetar status quando sai de won/lost para estágio normal
        updates.status = 'negotiation';
      }

      const { data, error } = await supabase
        .from('deals')
        .update(updates)
        .eq('id', dealId)
        .select()
        .single();

      if (error) throw error;

      // Sync lead's pipeline_stage_id with deal's stage
      if (data?.lead_id) {
        await supabase
          .from('leads')
          .update({
            pipeline_stage_id: stageId,
            updated_at: new Date().toISOString()
          })
          .eq('id', data.lead_id);
      }

      // Check for pipeline transitions
      if (stage?.pipeline_id) {
        const { data: transitions } = await supabase
          .from('sales_pipeline_transitions')
          .select('*')
          .eq('source_pipeline_id', stage.pipeline_id)
          .eq('source_stage_id', stageId)
          .eq('is_active', true);

        if (transitions && transitions.length > 0) {
          for (const transition of transitions) {
            if (transition.action === 'move') {
              // Move deal to target pipeline/stage
              await supabase
                .from('deals')
                .update({
                  pipeline_id: transition.target_pipeline_id,
                  pipeline_stage_id: transition.target_stage_id,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', dealId);
            } else if (transition.action === 'duplicate') {
              // Duplicate deal in target pipeline
              const { id: _, created_at: __, updated_at: ___, ...dealCopy } = data;
              await supabase
                .from('deals')
                .insert({
                  ...dealCopy,
                  pipeline_id: transition.target_pipeline_id,
                  pipeline_stage_id: transition.target_stage_id,
                  status: 'negotiation',
                  won_at: null,
                  lost_at: null,
                  lost_reason: null,
                });
            }
          }
        }
      }

      return data as Deal;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });

      // Disparar notificação de mudança de etapa (se não for won/lost - esses têm triggers próprios)
      if (data.status !== 'won' && data.status !== 'lost') {
        const context = await getDealNotificationContext(data.id);
        if (context) {
          triggerNotificationEvent('deal_stage_changed', context);
        }
      }

      // Disparar regras de automação
      triggerAutomationRules({
        trigger_type: 'deal_stage_changed',
        deal_id: data.id,
        lead_id: data.lead_id,
        stage_id: data.pipeline_stage_id,
      });

      // Auto-criar tarefa recorrente ao mover para Call Realizada ou No-show
      const CALL_REALIZADA_ID = '11111111-0001-0001-0001-000000000006';
      const NO_SHOW_ID = '11111111-0001-0001-0001-000000000005';

      if (data.lead_id && (data.pipeline_stage_id === CALL_REALIZADA_ID || data.pipeline_stage_id === NO_SHOW_ID)) {
        try {
          // Verificar se já existe tarefa recorrente ativa para o lead
          const { data: existingTasks } = await supabase
            .from('company_activities')
            .select('id')
            .eq('lead_id', data.lead_id)
            .eq('is_recurring', true)
            .eq('completed', false)
            .eq('task_type', 'follow_up')
            .limit(1);

          if (!existingTasks || existingTasks.length === 0) {
            // Buscar nome do lead para o título
            const { data: lead } = await supabase
              .from('leads')
              .select('name')
              .eq('id', data.lead_id)
              .single();

            const firstName = lead?.name?.split(' ')[0] || 'lead';
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);
            tomorrow.setHours(10, 0, 0, 0);

            await supabase
              .from('company_activities')
              .insert({
                task_type: 'follow_up',
                name: `Pegar sim ou não de ${firstName}`,
                description: 'Follow-up recorrente automático - confirmar interesse do lead',
                lead_id: data.lead_id,
                team: 'sales',
                is_recurring: true,
                recurrence_interval_days: 2,
                scheduled_at: tomorrow.toISOString(),
                assigned_to: data.sales_rep_id || null,
                status: 'pending',
                completed: false,
              });
          }
        } catch (err) {
          console.error('Erro ao criar tarefa recorrente:', err);
        }
      }
    },
  });
};

// Transfer deal to another pipeline
export const useTransferDealPipeline = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      dealId,
      targetPipelineId,
      targetStageId,
      transferredByName,
    }: {
      dealId: string;
      targetPipelineId: string;
      targetStageId: string;
      transferredByName?: string;
    }) => {
      // 1. Get current deal info (pipeline + stage names)
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select('*, pipeline_stage:sales_pipeline_stages(id, name, pipeline_id), lead_id, metadata')
        .eq('id', dealId)
        .single();

      if (dealError || !deal) throw dealError || new Error('Deal not found');

      // 2. Get source pipeline name
      const fromPipelineId = deal.pipeline_stage?.pipeline_id || deal.pipeline_id;
      let fromPipelineName = 'Desconhecido';
      if (fromPipelineId) {
        const { data: fromPipeline } = await supabase
          .from('sales_pipelines')
          .select('name')
          .eq('id', fromPipelineId)
          .single();
        if (fromPipeline) fromPipelineName = fromPipeline.name;
      }

      // 3. Get target pipeline + stage names
      const { data: targetPipeline } = await supabase
        .from('sales_pipelines')
        .select('name')
        .eq('id', targetPipelineId)
        .single();

      const { data: targetStage } = await supabase
        .from('sales_pipeline_stages')
        .select('name')
        .eq('id', targetStageId)
        .single();

      // 4. Build transfer record for metadata
      const transferRecord = {
        from_pipeline_id: fromPipelineId,
        from_pipeline_name: fromPipelineName,
        from_stage_name: deal.pipeline_stage?.name || 'N/A',
        to_pipeline_id: targetPipelineId,
        to_pipeline_name: targetPipeline?.name || 'N/A',
        to_stage_name: targetStage?.name || 'N/A',
        transferred_at: new Date().toISOString(),
        transferred_by_name: transferredByName || null,
      };

      const existingMetadata = deal.metadata || {};
      const transfers = existingMetadata.transfers || [];
      transfers.push(transferRecord);

      // 5. Update deal
      const { data: updated, error: updateError } = await supabase
        .from('deals')
        .update({
          pipeline_id: targetPipelineId,
          pipeline_stage_id: targetStageId,
          metadata: { ...existingMetadata, transfers },
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 6. Sync lead's pipeline_stage_id
      if (deal.lead_id) {
        await supabase
          .from('leads')
          .update({
            pipeline_stage_id: targetStageId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', deal.lead_id);
      }

      return { deal: updated, transfer: transferRecord };
    },
    onSuccess: async (result) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['deals-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['contact-deals'] });
      queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['focus-queue'] });

      // Disparar notificação de mudança de etapa (transferência entre pipelines)
      const context = await getDealNotificationContext(result.deal.id);
      if (context) {
        triggerNotificationEvent('deal_stage_changed', context);
      }
    },
  });
};

// Mark deal as won - Creates organization, onboarding and transaction
export const useWinDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, notes, wonAt, negotiationDetails }: { 
      dealId: string; 
      notes?: string; 
      wonAt?: string;
      negotiationDetails?: {
        entrada_completa: boolean;
        valor_faltante: number;
        garantia_cdc: boolean;
        garantia_cdc_inicio: string | null;
        tempo_acesso_meses: number;
        bonus_saas: boolean;
        observacoes_cs: string | null;
      };
    }) => {
      // 1. Get the deal with lead and product info
      const { data: deal, error: dealError } = await supabase
        .from('deals')
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(id, name, email, phone),
          product:products!deals_product_id_fkey(id, name)
        `)
        .eq('id', dealId)
        .single();

      if (dealError) throw dealError;
      if (!deal) throw new Error('Deal not found');

      const lead = deal.lead;
      const productId = deal.product_id;
      const productName = deal.product?.name || productId;

      // 2. Get the "won" stage from the deal's pipeline
      let wonStage: { id: string } | null = null;
      if (deal.pipeline_stage_id) {
        // Find which pipeline this deal belongs to
        const { data: currentStage } = await supabase
          .from('sales_pipeline_stages')
          .select('pipeline_id')
          .eq('id', deal.pipeline_stage_id)
          .single();

        if (currentStage?.pipeline_id) {
          const { data: stage } = await supabase
            .from('sales_pipeline_stages')
            .select('id')
            .eq('pipeline_id', currentStage.pipeline_id)
            .eq('is_won', true)
            .single();
          wonStage = stage;
        }
      }
      // Fallback: any won stage
      if (!wonStage) {
        const { data: stage } = await supabase
          .from('sales_pipeline_stages')
          .select('id')
          .eq('is_won', true)
          .limit(1)
          .maybeSingle();
        wonStage = stage;
      }

      // 3. Update deal status to won
      const { data: updatedDeal, error: updateError } = await supabase
        .from('deals')
        .update({
          status: 'won' as DealStatus,
          won_at: wonAt || new Date().toISOString(),
          pipeline_stage_id: wonStage?.id,
          notes: notes,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId)
        .select()
        .single();

      if (updateError) throw updateError;

      // 3a. Save negotiation details if provided
      if (negotiationDetails) {
        const { error: negError } = await supabase
          .from('deal_negotiation_details')
          .upsert({
            deal_id: dealId,
            entrada_completa: negotiationDetails.entrada_completa,
            valor_faltante: negotiationDetails.valor_faltante,
            garantia_cdc: negotiationDetails.garantia_cdc,
            garantia_cdc_inicio: negotiationDetails.garantia_cdc_inicio,
            tempo_acesso_meses: negotiationDetails.tempo_acesso_meses,
            bonus_saas: negotiationDetails.bonus_saas,
            observacoes_cs: negotiationDetails.observacoes_cs,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'deal_id' });

        if (negError) {
          console.error('Error saving negotiation details');
        }
      }

      // 3b. Sync lead pipeline_stage_id
      if (wonStage?.id && deal.lead_id) {
        await supabase
          .from('leads')
          .update({ pipeline_stage_id: wonStage.id, updated_at: new Date().toISOString() })
          .eq('id', deal.lead_id);
      }

      // 4. Check if organization exists for this lead
      let org = null;
      if (lead?.id) {
        const { data: existingOrg } = await supabase
          .from('organizations')
          .select('*')
          .eq('primary_contact_id', lead.id)
          .limit(1)
          .maybeSingle();

        org = existingOrg;

        // 5. If no organization, create one
        if (!org && lead.name) {
          const slug = lead.name.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            + '-' + Date.now().toString(36);

          const { data: newOrg, error: orgError } = await supabase
            .from('organizations')
            .insert({
              name: lead.name,
              slug: slug,
              primary_contact_id: lead.id,
            })
            .select()
            .single();

          if (orgError) {
            console.error('Error creating organization');
          } else {
            org = newOrg;
          }
        }

        // 6. Create organization_products (onboarding) if org exists
        if (org && productId) {
          // Check if already exists
          const { data: existingOp } = await supabase
            .from('organization_products')
            .select('*')
            .eq('organization_id', org.id)
            .eq('product_id', productId)
            .limit(1)
            .maybeSingle();

          if (!existingOp) {
            const { error: opError } = await supabase
              .from('organization_products')
              .insert({
                organization_id: org.id,
                product_id: productId,
                deal_id: dealId,
                journey_stage: 'pending_onboard', // Goes to "aguardando agendamento"
              });

            if (opError) {
              console.error('Error creating organization_products');
            }
          }

          // 7. Create onboarding task
          // Check if task already exists
          const { data: existingTask } = await supabase
            .from('company_activities')
            .select('*')
            .eq('organization_id', org.id)
            .eq('product_id', productId)
            .eq('task_type', 'onboarding')
            .eq('completed', false)
            .limit(1)
            .maybeSingle();

          if (!existingTask) {
            const { error: taskError } = await supabase
              .from('company_activities')
              .insert({
                name: `Onboarding - ${lead.name}`,
                description: `Realizar call de onboarding com ${lead.name} para ${productName}. Apresentar área de membros, definir objetivos e tirar dúvidas.`,
                task_type: 'onboarding',
                team: 'cs',
                priority: 'high',
                organization_id: org.id,
                lead_id: lead.id,
                product_id: productId,
                status: 'not_started',
                due_datetime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24h
              });

            if (taskError) {
              console.error('Error creating onboarding task');
            }
          }

          // 7b. Auto-populate cs_success_metrics for upsell detection
          // existingOrg !== null means the organization already existed = UPSELL
          if (existingOrg) {
            const { data: existingMetrics } = await supabase
              .from('cs_success_metrics')
              .select('id, upsell_done')
              .eq('organization_id', org.id)
              .eq('product_id', productId)
              .maybeSingle();

            // Don't overwrite existing upsell data
            if (!existingMetrics?.upsell_done) {
              await supabase
                .from('cs_success_metrics')
                .upsert({
                  organization_id: org.id,
                  product_id: productId,
                  upsell_done: true,
                  upsell_product: productName,
                  upsell_value: deal.negotiated_price || 0,
                  upsell_date: (wonAt || new Date().toISOString()).split('T')[0],
                }, { onConflict: 'organization_id,product_id' });

              console.log('✅ Upsell auto-detected for existing organization');
            }
          }
        }

        // 7c. Auto-create WhatsApp group for Advisor (tier 4) products
        if (org && lead?.id && productId?.includes('advidor')) {
          try {
            const { data: fnResult, error: fnError } = await supabase.functions.invoke('create-advisor-group', {
              body: {
                organization_id: org.id,
                organization_name: org.name || lead.name,
                client_phone: lead.phone,
                client_name: lead.name,
              },
            });

            if (fnError) {
              console.warn('⚠️ Advisor group creation failed (non-blocking):', fnError);
            } else {
              console.log('✅ Advisor WhatsApp group:', fnResult);
            }
          } catch (advisorError) {
            console.warn('⚠️ Advisor group creation error (non-blocking):', advisorError);
          }
        }

        // 8. Generate Sales → CS Briefing from meeting AI analysis
        if (org && lead?.id) {
          try {
            // 8a. Find the most recent meeting with AI analysis for this lead
            const { data: recentMeetings } = await supabase
              .from('meetings')
              .select('id, ai_analysis, title, started_at, transcriptions')
              .eq('lead_id', lead.id)
              .not('ai_analysis', 'is', null)
              .order('started_at', { ascending: false })
              .limit(1);

            const salesMeeting = recentMeetings?.[0];
            const aiAnalysis = salesMeeting?.ai_analysis as any;

            if (aiAnalysis) {
              // 8b. Build structured briefing for CS
              const negFlags: string[] = [];
              if (negotiationDetails?.garantia_cdc) negFlags.push('🔴 CDC 7 dias ativo');
              if (negotiationDetails && !negotiationDetails.entrada_completa) {
                negFlags.push(`🟠 Entrada parcial — falta R$${negotiationDetails.valor_faltante?.toFixed(2)}`);
                negFlags.push('⚠️ NÃO LIBERAR ACESSO até pagamento completo');
              }
              if (negotiationDetails?.bonus_saas) negFlags.push('🟢 Bônus SaaS incluso');
              if (negotiationDetails?.tempo_acesso_meses) {
                negFlags.push(`🔵 Acesso: ${negotiationDetails.tempo_acesso_meses === 0 ? 'Vitalício' : `${negotiationDetails.tempo_acesso_meses} meses`}`);
              }

              // Use sales-specific fields (diagnostico, pontos_chave, riscos, proximo_passo)
              // or team-meeting fields (resumo_executivo, pontos_importantes, riscos_identificados, proximos_passos)
              const resumo = aiAnalysis.diagnostico || aiAnalysis.resumo_executivo || '';
              const pontosChave = aiAnalysis.pontos_chave || aiAnalysis.pontos_importantes || [];
              const riscos = aiAnalysis.riscos || aiAnalysis.riscos_identificados || [];
              const proximoPasso = aiAnalysis.proximo_passo || (aiAnalysis.proximos_passos || []).join('; ') || '';
              const tarefasSugeridas = aiAnalysis.tarefas_sugeridas || [];

              // 8c. Build markdown briefing content
              const briefingParts: string[] = [
                `## 📋 Briefing de Vendas → CS`,
                `**Deal:** ${deal.title || lead.name} | **Produto:** ${productName}`,
                `**Valor:** R$${(deal.negotiated_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
                `**Data de fechamento:** ${new Date(wonAt || Date.now()).toLocaleDateString('pt-BR')}`,
                '',
              ];

              if (negFlags.length > 0) {
                briefingParts.push('### ⚠️ Flags da Negociação');
                negFlags.forEach(f => briefingParts.push(`- ${f}`));
                briefingParts.push('');
              }

              if (resumo) {
                briefingParts.push('### 📝 Resumo da Reunião de Vendas');
                briefingParts.push(resumo);
                briefingParts.push('');
              }

              if (pontosChave.length > 0) {
                briefingParts.push('### 🎯 Pontos-Chave');
                pontosChave.forEach((p: string) => briefingParts.push(`- ${p}`));
                briefingParts.push('');
              }

              if (riscos.length > 0) {
                briefingParts.push('### ⚡ Riscos / Objeções Identificadas');
                riscos.forEach((r: string) => briefingParts.push(`- ${r}`));
                briefingParts.push('');
              }

              if (proximoPasso) {
                briefingParts.push('### ➡️ Próximo Passo');
                briefingParts.push(proximoPasso);
                briefingParts.push('');
              }

              if (negotiationDetails?.observacoes_cs) {
                briefingParts.push('### 💬 Observações do Closer para CS');
                briefingParts.push(negotiationDetails.observacoes_cs);
                briefingParts.push('');
              }

              const briefingContent = briefingParts.join('\n');

              // 8d. Save briefing to organization.ai_insights
              const { error: insightsError } = await supabase
                .from('organizations')
                .update({
                  ai_insights: {
                    content: briefingContent,
                    source: 'sales_briefing',
                    meeting_id: salesMeeting.id,
                    deal_id: dealId,
                    updated_at: new Date().toISOString(),
                  },
                })
                .eq('id', org.id);

              if (insightsError) {
                console.error('Error saving sales briefing to org');
              }

              // 8e. Extract objectives from AI analysis and create in cs_objectives
              const aiObjectives = tarefasSugeridas.filter((t: any) =>
                t.titulo && !t.titulo.toLowerCase().includes('follow') // Filter out generic follow-ups
              ).slice(0, 5); // Max 5 objectives

              if (aiObjectives.length > 0 && productId) {
                for (const obj of aiObjectives) {
                  const deadline = new Date();
                  if (obj.prazo_sugerido === 'hoje') deadline.setDate(deadline.getDate());
                  else if (obj.prazo_sugerido === 'amanha') deadline.setDate(deadline.getDate() + 1);
                  else if (obj.prazo_sugerido === 'esta_semana') deadline.setDate(deadline.getDate() + 5);
                  else if (obj.prazo_sugerido === 'proxima_semana') deadline.setDate(deadline.getDate() + 10);
                  else deadline.setDate(deadline.getDate() + 30); // Default 30 days

                  await supabase
                    .from('cs_objectives')
                    .insert({
                      organization_id: org.id,
                      product_id: productId,
                      description: obj.titulo + (obj.descricao ? ` — ${obj.descricao}` : ''),
                      days_target: 30,
                      deadline: deadline.toISOString().split('T')[0],
                      status: 'pending',
                      metadata: {
                        source: 'sales_ai_extraction',
                        deal_id: dealId,
                        meeting_id: salesMeeting.id,
                        priority: obj.prioridade || 'medium',
                      },
                    });
                }
              }
            }
          } catch (briefingError) {
            console.error('Error generating sales briefing (non-blocking)');
          }
        }

        // 9. Create transaction for LTV tracking
        // ONLY create transaction here if there are NO deal_payments
        // If deal_payments exist, transactions are created when each payment is marked as paid
        if (deal.negotiated_price && deal.negotiated_price > 0) {
          // Check if deal has any deal_payments
          const { data: dealPayments } = await supabase
            .from('deal_payments')
            .select('id')
            .eq('deal_id', dealId)
            .limit(1);

          const hasDealPayments = dealPayments && dealPayments.length > 0;

          if (!hasDealPayments) {
            // Only create transaction if NO deal_payments exist (legacy flow)
            // Check if transaction already exists for this deal
            const { data: existingTx } = await supabase
              .from('transactions')
              .select('id')
              .eq('deal_id', dealId)
              .maybeSingle();

            if (!existingTx) {
              const { error: txError } = await supabase
                .from('transactions')
                .insert({
                  lead_id: lead.id,
                  product_id: productId,
                  product_name: productName,
                  amount: deal.negotiated_price,
                  status: 'paid',
                  payment_method: deal.payment_method || 'manual',
                  payment_platform: 'crm',
                  deal_id: dealId,
                });

              if (txError) {
                console.error('Error creating transaction for LTV');
              }
            }
          }
          // If hasDealPayments, transaction will be created via useMarkPaymentAsPaid
        }
      }

      return updatedDeal as Deal;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['organization-products'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-ltv'] });
      queryClient.invalidateQueries({ queryKey: ['cs-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['organization'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-by-org'] });
      queryClient.invalidateQueries({ queryKey: ['cs-success-metrics'] });
      queryClient.invalidateQueries({ queryKey: ['cs-success-metric'] });

      // Disparar notificação de deal ganho
      const context = await getDealNotificationContext(data.id);
      if (context) {
        triggerNotificationEvent('deal_won', context);
      }
    },
  });
};

// Mark deal as lost
export const useLoseDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dealId, reason, keepLeadAlive }: { dealId: string; reason: string; keepLeadAlive?: boolean }) => {
      // Get the deal to find its pipeline
      const { data: currentDeal } = await supabase
        .from('deals')
        .select('lead_id, pipeline_stage_id')
        .eq('id', dealId)
        .single();

      // Get the "lost" stage from the deal's pipeline
      let lostStage: { id: string } | null = null;
      if (currentDeal?.pipeline_stage_id) {
        const { data: currentStage } = await supabase
          .from('sales_pipeline_stages')
          .select('pipeline_id')
          .eq('id', currentDeal.pipeline_stage_id)
          .single();

        if (currentStage?.pipeline_id) {
          const { data: stage } = await supabase
            .from('sales_pipeline_stages')
            .select('id')
            .eq('pipeline_id', currentStage.pipeline_id)
            .eq('is_lost', true)
            .single();
          lostStage = stage;
        }
      }
      if (!lostStage) {
        const { data: stage } = await supabase
          .from('sales_pipeline_stages')
          .select('id')
          .eq('is_lost', true)
          .limit(1)
          .maybeSingle();
        lostStage = stage;
      }

      const { data, error } = await supabase
        .from('deals')
        .update({
          status: 'lost' as DealStatus,
          lost_at: new Date().toISOString(),
          lost_reason: reason,
          pipeline_stage_id: lostStage?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dealId)
        .select()
        .single();

      if (error) throw error;

      // Sync lead pipeline_stage_id (skip if keepLeadAlive — lead will get a new deal)
      if (lostStage?.id && currentDeal?.lead_id && !keepLeadAlive) {
        await supabase
          .from('leads')
          .update({ pipeline_stage_id: lostStage.id, updated_at: new Date().toISOString() })
          .eq('id', currentDeal.lead_id);
      }

      return data as Deal;
    },
    onSuccess: async (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });

      // Disparar notificação de deal perdido
      const context = await getDealNotificationContext(data.id);
      if (context) {
        triggerNotificationEvent('deal_lost', context);
      }
    },
  });
};

// Delete deal (cascade: commissions, calendar_events, payments, onboarding, etc.)
export const useDeleteDeal = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dealId: string) => {
      // 1. Get deal info to find related onboarding records
      const { data: deal } = await supabase
        .from('deals')
        .select('id, lead_id, product_id')
        .eq('id', dealId)
        .single();

      // 2. Clean up onboarding records if deal had lead + product
      if (deal?.lead_id && deal?.product_id) {
        // Find organization linked to this lead
        const { data: org } = await supabase
          .from('organizations')
          .select('id')
          .eq('primary_contact_id', deal.lead_id)
          .maybeSingle();

        if (org) {
          // Delete onboarding task (company_activities)
          await supabase
            .from('company_activities')
            .delete()
            .eq('organization_id', org.id)
            .eq('product_id', deal.product_id)
            .eq('task_type', 'onboarding');

          // Delete onboarding dossier
          await supabase
            .from('onboardings')
            .delete()
            .eq('organization_id', org.id)
            .eq('product_id', deal.product_id);

          // organization_products is deleted by CASCADE via deal_id FK
        }
      }

      // 3. Delete commissions and calendar_events (belt-and-suspenders with DB CASCADE)
      await supabase.from('commissions').delete().eq('deal_id', dealId);
      await supabase.from('calendar_events').delete().eq('deal_id', dealId);

      // 4. Delete the deal (cascades: deal_payments, deal_contacts, deal_negotiation_details, sales_notes, organization_products)
      const { error } = await supabase.from('deals').delete().eq('id', dealId);
      if (error) throw error;

      toast('Deal excluído');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['contact-deals'] });
      queryClient.invalidateQueries({ queryKey: ['sales-dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['commissions'] });
      queryClient.invalidateQueries({ queryKey: ['deal-payments'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['organization-products'] });
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
    },
  });
};

// Get deals summary stats
export const useDealsSummary = () => {
  return useQuery({
    queryKey: ['deals-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deals')
        .select('status, negotiated_price');

      if (error) throw error;

      const summary = {
        total: data?.length || 0,
        total_value: 0,
        won: 0,
        won_value: 0,
        lost: 0,
        active: 0,
        active_value: 0,
      };

      data?.forEach((deal) => {
        const value = Number(deal.negotiated_price) || 0;
        summary.total_value += value;

        if (deal.status === 'won') {
          summary.won++;
          summary.won_value += value;
        } else if (deal.status === 'lost') {
          summary.lost++;
        } else {
          summary.active++;
          summary.active_value += value;
        }
      });

      return summary;
    },
  });
};
