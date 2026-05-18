import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PipelineStage, Deal, PipelineColumn } from '@/types/sales.types';

// Fetch all pipeline stages (optionally filtered by pipelineId)
export const usePipelineStages = (pipelineId?: string) => {
  return useQuery({
    queryKey: ['pipeline-stages', pipelineId],
    queryFn: async () => {
      let query = supabase
        .from('sales_pipeline_stages')
        .select('*')
        .order('position', { ascending: true });

      if (pipelineId) {
        query = query.eq('pipeline_id', pipelineId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as PipelineStage[];
    },
  });
};

// Fetch single stage
export const usePipelineStage = (stageId: string | undefined) => {
  return useQuery({
    queryKey: ['pipeline-stage', stageId],
    queryFn: async () => {
      if (!stageId) return null;

      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .select('*')
        .eq('id', stageId)
        .single();

      if (error) throw error;
      return data as PipelineStage;
    },
    enabled: !!stageId,
  });
};

// Fetch complete pipeline with deals (for Kanban view)
// webinarConfigId: filtra por inscricao em um webinario especifico (via lead_webinar_enrollments)
export const usePipelineDeals = (salesRepId?: string, pipelineId?: string, webinarConfigId?: string) => {
  return useQuery({
    queryKey: ['pipeline-deals', salesRepId, pipelineId, webinarConfigId],
    staleTime: 3 * 60 * 1000,  // 3 min — evita refetch ao trocar abas no cockpit
    gcTime: 10 * 60 * 1000,    // 10 min no garbage collector
    queryFn: async () => {
      // Get stages (filtered by pipeline if provided)
      let stagesQuery = supabase
        .from('sales_pipeline_stages')
        .select('*')
        .order('position', { ascending: true });

      if (pipelineId) {
        stagesQuery = stagesQuery.eq('pipeline_id', pipelineId);
      }

      const { data: stages, error: stagesError } = await stagesQuery;

      if (stagesError) throw stagesError;

      // Get all deals (para o vendedor mover para etapa correta)
      let dealsQuery = supabase
        .from('deals')
        .select(`
          *,
          lead:leads!deals_lead_id_fkey(
            id, name, phone, sales_score, star_type, acao_de_hoje,
            utm_source, utm_campaign, status_de_resposta, etapa_funil, sales_rep_id,
            instagram_profile_id, stage_changed_at, monthly_revenue, company_name, webinar_config_id
          ),
          product:products!deals_product_id_fkey(id, name),
          sales_rep:team_members!deals_sales_rep_id_fkey(id, name)
        `)
        .not('pipeline_stage_id', 'is', null)
        .order('negotiated_price', { ascending: false });

      if (pipelineId) {
        dealsQuery = dealsQuery.eq('pipeline_id', pipelineId);
      }

      if (salesRepId) {
        dealsQuery = dealsQuery.or(`sales_rep_id.eq.${salesRepId},sdr_id.eq.${salesRepId}`);
      }

      // Filtro por webinario: pega deal_ids dos enrollments do webinario antes da query principal
      if (webinarConfigId) {
        const { data: enrollments } = await supabase
          .from('lead_webinar_enrollments')
          .select('deal_id')
          .eq('webinar_config_id', webinarConfigId)
          .not('deal_id', 'is', null);
        const dealIdsFiltered = (enrollments || []).map((e: any) => e.deal_id);
        if (dealIdsFiltered.length === 0) {
          // Sem deals nesse webinario — retorna estrutura vazia mas mantem stages
          return (stages || []).map((stage) => ({ stage, deals: [], total_value: 0, count: 0 }));
        }
        dealsQuery = dealsQuery.in('id', dealIdsFiltered);
      }

      const { data: deals, error: dealsError } = await dealsQuery.limit(1000);
      if (dealsError) throw dealsError;

      const leadIds = [...new Set((deals || []).map((d: any) => d.lead_id).filter(Boolean))] as string[];

      // Buscar enrollments + nome + data do webinario pra cada deal (pra mostrar no card)
      const enrollmentByDeal = new Map<string, {
        webinar_config_id: string;
        webinar_title: string;
        event_date: string | null;
        attended: boolean | null;
        attended_duration: number | null;
      }>();
      if (deals && deals.length > 0) {
        const allDealIds = deals.map((d: any) => d.id);
        const { data: enrollments } = await supabase
          .from('lead_webinar_enrollments')
          .select('deal_id, lead_id, webinar_config_id, webinar_config:webinar_config!lead_webinar_enrollments_webinar_config_id_fkey(id, title, event_date)')
          .in('deal_id', allDealIds);

        // Buscar atendencia em event_registrations via webinar_config_id (FK direta, sem match por nome)
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

        (enrollments || []).forEach((e: any) => {
          if (e.deal_id && e.webinar_config) {
            const key = `${e.lead_id}::${e.webinar_config_id}`;
            const att = attendanceByLeadAndConfig.get(key);
            enrollmentByDeal.set(e.deal_id, {
              webinar_config_id: e.webinar_config_id,
              webinar_title: e.webinar_config.title,
              event_date: e.webinar_config.event_date,
              attended: att?.attended ?? null,
              attended_duration: att?.total_duration_minutes ?? null,
            });
          }
        });
      }

      // === FASE PARALELA: Buscar diagnósticos, interações, unreads, tasks e handled em paralelo ===
      const diagnosticsByLead = new Map<string, { qualification_score: number; monthly_revenue: string }>();
      const lastInteractions = new Map<string, Date>();
      const nextTasks = new Map<string, { id: string; name: string; due_datetime: string; task_type: string }>();
      const unreadMessages = new Map<string, { count: number; lastMessageAt: Date }>();
      const todayTaskTypes = new Map<string, Set<string>>();
      const hasOverdueTask = new Set<string>();
      const hasAnyTask = new Set<string>();
      const hasPendingCallOrMeeting = new Set<string>();

      // Preparar IDs para queries paralelas (disponíveis antes do Promise.all)
      const dealIds = (deals || []).map((d: any) => d.id);
      const instagramProfileIds = (deals || [])
        .map((d: any) => d.lead?.instagram_profile_id)
        .filter(Boolean);
      const profilePictures = new Map<string, string>();
      const contactsByDeal = new Map<string, Array<{ id: string; deal_id: string; lead_id: string; role: string | null; is_primary: boolean; lead?: { id: string; name: string; phone: string | null; company_name: string | null } }>>();

      if (leadIds.length > 0) {
        // Helper: chunk array and run query per chunk, merging results
        const CHUNK = 150;
        const chunks = <T>(arr: T[]): T[][] => {
          const result: T[][] = [];
          for (let i = 0; i < arr.length; i += CHUNK) result.push(arr.slice(i, i + CHUNK));
          return result;
        };
        const mergeChunked = async (fn: (ids: string[]) => Promise<{ data: any[] | null }>): Promise<any[]> => {
          const results = await Promise.all(chunks(leadIds).map(fn));
          return results.flatMap(r => r.data || []);
        };

        // Disparar TODAS as queries em paralelo (com chunking para listas grandes)
        const [
          diagnosticsData,
          lastInteractionData,
          unreadData,
          handledData,
          pendingTasksData,
          instagramResult,
          dealContactsResult,
        ] = await Promise.all([
          // Diagnósticos filtrados por leadIds
          mergeChunked((ids) => supabase
            .from('lead_diagnostics_v2' as any)
            .select('lead_id, qualification_score, monthly_revenue')
            .in('lead_id', ids)
            .order('created_at', { ascending: false }) as any),
          // Última interação por lead via RPC
          mergeChunked((ids) => supabase.rpc('get_last_interaction_by_leads', { p_lead_ids: ids })),
          // Mensagens não respondidas via RPC
          mergeChunked((ids) => supabase.rpc('get_unread_messages_by_leads', { p_lead_ids: ids })),
          // Conversas marcadas como concluídas
          mergeChunked((ids) => supabase.from('cs_conversation_handled').select('lead_id, handled_at').in('lead_id', ids)),
          // Tarefas pendentes
          mergeChunked((ids) => supabase.from('company_activities')
            .select('id, name, lead_id, scheduled_at, task_type, status')
            .in('lead_id', ids)
            .eq('completed', false)
            .order('scheduled_at', { ascending: true, nullsFirst: false })),
          // Fotos de perfil Instagram
          instagramProfileIds.length > 0
            ? (async () => {
                const results = await Promise.all(
                  chunks(instagramProfileIds).map(ids =>
                    supabase.from('instagram_profiles')
                      .select('id, stored_profile_picture_url, profile_picture_url_hd')
                      .in('id', ids)
                  )
                );
                return { data: results.flatMap(r => r.data || []) };
              })()
            : Promise.resolve({ data: [] }),
          // Deal contacts em batch
          dealIds.length > 0
            ? (async () => {
                const results = await Promise.all(
                  chunks(dealIds).map(ids =>
                    supabase.from('deal_contacts' as any)
                      .select('id, deal_id, lead_id, role, is_primary')
                      .in('deal_id', ids) as any
                  )
                );
                return { data: results.flatMap(r => r.data || []) };
              })()
            : Promise.resolve({ data: [] }),
        ]);

        // Processar diagnósticos
        (diagnosticsData || []).forEach((diag: any) => {
          if (diag.lead_id && !diagnosticsByLead.has(diag.lead_id)) {
            diagnosticsByLead.set(diag.lead_id, {
              qualification_score: diag.qualification_score,
              monthly_revenue: diag.monthly_revenue,
            });
          }
        });

        // Fallback: buscar faturamento de pain_registrations para leads sem diagnóstico
        const leadsWithoutRevenue = leadIds.filter((id: string) => {
          const diag = diagnosticsByLead.get(id);
          return !diag || !diag.monthly_revenue;
        });

        if (leadsWithoutRevenue.length > 0) {
          const painRegs = await mergeChunked((ids) => supabase
            .from('pain_registrations' as any)
            .select('lead_id, monthly_revenue, company_name')
            .in('lead_id', ids)
            .not('monthly_revenue', 'is', null)
            .order('created_at', { ascending: false }) as any);

          painRegs.forEach((reg: any) => {
            if (reg.lead_id && !diagnosticsByLead.has(reg.lead_id)) {
              diagnosticsByLead.set(reg.lead_id, {
                qualification_score: 0,
                monthly_revenue: reg.monthly_revenue,
              });
            }
          });
        }

        // Processar última interação
        (lastInteractionData || []).forEach((row: any) => {
          if (row.lead_id && row.last_interaction_at) {
            lastInteractions.set(row.lead_id, new Date(row.last_interaction_at));
          }
        });

        // Processar unreads + handled
        const unreadRows = unreadData;
        const handledConversations = handledData;

        const handledByLead = new Map<string, Date>();
        (handledConversations || []).forEach((h: any) => {
          if (h.lead_id && h.handled_at) {
            handledByLead.set(h.lead_id, new Date(h.handled_at));
          }
        });

        (unreadRows || []).forEach((row: any) => {
          if (!row.lead_id || !row.last_message_at) return;
          const lastMsgDate = new Date(row.last_message_at);
          const handledAt = handledByLead.get(row.lead_id);
          if (handledAt && handledAt >= lastMsgDate) return;
          unreadMessages.set(row.lead_id, {
            count: row.unread_count,
            lastMessageAt: lastMsgDate,
          });
        });

        // Processar tarefas
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const pendingTasks = pendingTasksData;
        
        // Mapear próxima tarefa por lead (pegar a mais próxima) + tarefas de hoje
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const nowForOverdue = new Date();

        (pendingTasks || []).forEach((task: any) => {
          if (!task.lead_id) return;

          const taskDate = new Date(task.scheduled_at || task.due_datetime);

          // Registrar que o lead tem tarefa pendente
          hasAnyTask.add(task.lead_id);

          // Registrar se tem call ou meeting pendente
          if (task.task_type === 'call' || task.task_type === 'meeting') {
            hasPendingCallOrMeeting.add(task.lead_id);
          }

          // Checar se é atrasada (data anterior a agora)
          if (taskDate < nowForOverdue) {
            hasOverdueTask.add(task.lead_id);
          }

          // Mapear próxima tarefa (a mais próxima no futuro, a partir de hoje)
          if (taskDate >= todayStart && !nextTasks.has(task.lead_id)) {
            nextTasks.set(task.lead_id, {
              id: task.id,
              name: task.name,
              due_datetime: task.scheduled_at || task.due_datetime,
              task_type: task.task_type,
              status: task.status,
            });
          }

          // Checar se a tarefa é de hoje
          if (taskDate >= todayStart && taskDate <= todayEnd) {
            if (!todayTaskTypes.has(task.lead_id)) {
              todayTaskTypes.set(task.lead_id, new Set());
            }
            todayTaskTypes.get(task.lead_id)!.add(task.task_type || 'other');
          }
        });

        // Processar fotos de perfil Instagram (resultado do Promise.all)
        (instagramResult?.data || []).forEach((profile: any) => {
          const pictureUrl = profile.stored_profile_picture_url || profile.profile_picture_url_hd;
          if (pictureUrl) {
            profilePictures.set(profile.id, pictureUrl);
          }
        });

        // Processar deal_contacts (resultado do Promise.all)
        const allDealContacts = dealContactsResult?.data;

        if (allDealContacts && allDealContacts.length > 0) {
          // Buscar dados dos leads dos contatos (única query sequencial restante)
          const contactLeadIds = [...new Set(allDealContacts.map((c: any) => c.lead_id))];
          const { data: contactLeads } = await supabase
            .from('leads')
            .select('id, name, phone, company_name')
            .in('id', contactLeadIds as string[]);

          const contactLeadsMap = new Map((contactLeads || []).map((l: any) => [l.id, l]));

          // Agrupar por deal_id
          allDealContacts.forEach((contact: any) => {
            if (!contactsByDeal.has(contact.deal_id)) {
              contactsByDeal.set(contact.deal_id, []);
            }
            contactsByDeal.get(contact.deal_id)!.push({
              ...contact,
              lead: contactLeadsMap.get(contact.lead_id) || undefined,
            });
          });

          // Ordenar: primário primeiro
          contactsByDeal.forEach((contacts, dealId) => {
            contacts.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
          });
        }
      }

      // Mapa vazio — last message não é carregado no pipeline (seria muito pesado)
      const lastMessageByLead = new Map<string, { content: string; isFromMe: boolean }>();

      // Adicionar dados do diagnóstico, última interação, próxima tarefa, foto e msgs não respondidas aos deals
      const now = new Date();
      const dealsWithDiagnostics = (deals || []).map((deal: any) => {
        const diagnostic = deal.lead_id ? diagnosticsByLead.get(deal.lead_id) : null;
        const lastInteraction = deal.lead_id ? lastInteractions.get(deal.lead_id) : null;
        const nextTask = deal.lead_id ? nextTasks.get(deal.lead_id) : null;
        const unread = deal.lead_id ? unreadMessages.get(deal.lead_id) : null;
        const lastMsgData = deal.lead_id ? lastMessageByLead.get(deal.lead_id) : null;
        const todayTypes = deal.lead_id ? todayTaskTypes.get(deal.lead_id) : null;
        const todayTypesArray = todayTypes ? Array.from(todayTypes) : [];
        const referenceDate = lastInteraction || new Date(deal.created_at);

        // Buscar foto do Instagram do lead
        const instagramProfileId = deal.lead?.instagram_profile_id;
        const profilePictureUrl = instagramProfileId ? profilePictures.get(instagramProfileId) : null;

        // Calcular tempo desde última interação em minutos e dias corridos
        const msSinceInteraction = now.getTime() - referenceDate.getTime();
        const minutesSinceInteraction = Math.floor(msSinceInteraction / (1000 * 60));
        const hoursSinceInteraction = Math.floor(msSinceInteraction / (1000 * 60 * 60));
        // Dias corridos (por calendário, não por 24h)
        const todayMidnight = new Date(now); todayMidnight.setHours(0, 0, 0, 0);
        const refMidnight = new Date(referenceDate); refMidnight.setHours(0, 0, 0, 0);
        const daysSinceInteraction = Math.floor((todayMidnight.getTime() - refMidnight.getTime()) / 86400000);

        // Calcular dias nesta etapa
        const stageChangeRef = deal.lead?.stage_changed_at || deal.created_at;
        const stageChangeMidnight = new Date(stageChangeRef); stageChangeMidnight.setHours(0, 0, 0, 0);
        const daysInStage = Math.floor((todayMidnight.getTime() - stageChangeMidnight.getTime()) / 86400000);

        return {
          ...deal,
          diagnostic_score: diagnostic?.qualification_score || null,
          diagnostic_revenue: diagnostic?.monthly_revenue || null,
          last_interaction_at: lastInteraction?.toISOString() || null,
          minutes_since_interaction: minutesSinceInteraction,
          hours_since_interaction: hoursSinceInteraction,
          days_since_interaction: daysSinceInteraction,
          next_task: nextTask,
          has_next_task: !!nextTask,
          has_call_today: todayTypesArray.includes('call'),
          has_task_today: todayTypesArray.length > 0,
          today_task_types: todayTypesArray,
          has_any_task: deal.lead_id ? hasAnyTask.has(deal.lead_id) : false,
          has_overdue_task: deal.lead_id ? hasOverdueTask.has(deal.lead_id) : false,
          has_pending_call_or_meeting: deal.lead_id ? hasPendingCallOrMeeting.has(deal.lead_id) : false,
          days_in_stage: daysInStage,
          profile_picture_url: profilePictureUrl,
          unread_messages_count: unread?.count || 0,
          last_unread_message_at: unread?.lastMessageAt?.toISOString() || null,
          last_message_content: lastMsgData?.content || null,
          last_message_is_from_me: lastMsgData?.isFromMe ?? null,
          contacts: contactsByDeal.get(deal.id) || [],
          webinar_enrollment: enrollmentByDeal.get(deal.id) || null,
        };
      });

      // Organize deals by stage
      const pipeline: PipelineColumn[] = (stages || []).map((stage) => {
        const stageDeals = dealsWithDiagnostics.filter(
          (deal) => deal.pipeline_stage_id === stage.id
        );
        const totalValue = stageDeals.reduce(
          (sum, deal) => sum + (Number(deal.negotiated_price) || 0),
          0
        );

        return {
          stage,
          deals: stageDeals as Deal[],
          total_value: totalValue,
          count: stageDeals.length,
        };
      });

      return pipeline;
    },
  });
};

// Get pipeline stats (deals count and value by stage)
export const usePipelineStats = (pipelineId?: string) => {
  return useQuery({
    queryKey: ['pipeline-stats', pipelineId],
    queryFn: async () => {
      let stagesQuery = supabase
        .from('sales_pipeline_stages')
        .select('*')
        .order('position', { ascending: true });

      if (pipelineId) {
        stagesQuery = stagesQuery.eq('pipeline_id', pipelineId);
      }

      const { data: stages, error: stagesError } = await stagesQuery;

      if (stagesError) throw stagesError;

      let dealsQuery = supabase
        .from('deals')
        .select('pipeline_stage_id, negotiated_price, status');

      if (pipelineId) {
        dealsQuery = dealsQuery.eq('pipeline_id', pipelineId);
      }

      const { data: deals, error: dealsError } = await dealsQuery;

      if (dealsError) throw dealsError;

      const stats = (stages || []).map((stage) => {
        const stageDeals = (deals || []).filter(
          (deal) => deal.pipeline_stage_id === stage.id
        );
        const totalValue = stageDeals.reduce(
          (sum, deal) => sum + (Number(deal.negotiated_price) || 0),
          0
        );
        const avgValue = stageDeals.length > 0 ? totalValue / stageDeals.length : 0;

        return {
          stage_id: stage.id,
          stage_name: stage.name,
          stage_color: stage.color,
          stage_position: stage.position,
          is_won: stage.is_won,
          is_lost: stage.is_lost,
          deals_count: stageDeals.length,
          total_value: totalValue,
          avg_value: avgValue,
        };
      });

      // Calculate totals
      const totalDeals = stats.reduce((sum, s) => sum + s.deals_count, 0);
      const totalValue = stats.reduce((sum, s) => sum + s.total_value, 0);
      const wonDeals = stats.filter((s) => s.is_won).reduce((sum, s) => sum + s.deals_count, 0);
      const wonValue = stats.filter((s) => s.is_won).reduce((sum, s) => sum + s.total_value, 0);

      return {
        stages: stats,
        totals: {
          total_deals: totalDeals,
          total_value: totalValue,
          won_deals: wonDeals,
          won_value: wonValue,
          conversion_rate: totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0,
        },
      };
    },
  });
};

// Create new pipeline stage
export const useCreatePipelineStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      position: number;
      color?: string;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .insert({
          name: input.name,
          position: input.position,
          color: input.color || 'gray',
          description: input.description,
        })
        .select()
        .single();

      if (error) throw error;
      return data as PipelineStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    },
  });
};

// Update pipeline stage
export const useUpdatePipelineStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      name?: string;
      position?: number;
      color?: string;
      description?: string;
    }) => {
      const { id, ...updates } = input;

      const { data, error } = await supabase
        .from('sales_pipeline_stages')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as PipelineStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    },
  });
};

// Reorder pipeline stages
export const useReorderPipelineStages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderedStageIds: string[]) => {
      // Update each stage with new position
      const updates = orderedStageIds.map((id, index) =>
        supabase
          .from('sales_pipeline_stages')
          .update({ position: index + 1 })
          .eq('id', id)
      );

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    },
  });
};

// Get stage conversion rates
export const useStageConversions = () => {
  return useQuery({
    queryKey: ['stage-conversions'],
    queryFn: async () => {
      const { data: stages, error: stagesError } = await supabase
        .from('sales_pipeline_stages')
        .select('*')
        .order('position', { ascending: true });

      if (stagesError) throw stagesError;

      // This would ideally be calculated from historical data
      // For now, we return placeholder conversion rates
      // In production, you'd track stage transitions
      return (stages || []).map((stage, index, arr) => ({
        from_stage: stage.name,
        to_next_stage: arr[index + 1]?.name || 'Fim',
        conversion_rate: 100 - index * 15, // Placeholder
      }));
    },
  });
};

// Get average time in each stage
export const useAverageTimeInStage = () => {
  return useQuery({
    queryKey: ['avg-time-in-stage'],
    queryFn: async () => {
      // This would require tracking stage transition timestamps
      // For now, return placeholder data
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id, name')
        .order('position');

      return (stages || []).map((stage) => ({
        stage_id: stage.id,
        stage_name: stage.name,
        avg_days: Math.floor(Math.random() * 7) + 1, // Placeholder
      }));
    },
  });
};
