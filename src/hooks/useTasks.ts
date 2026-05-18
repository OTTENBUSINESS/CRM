import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { triggerNotificationEvent, triggerAutomationRules } from '@/hooks/useNotificationEvents';
import { deleteWithUndo } from "@/lib/undoable-delete";

// Pipeline IDs
const PRE_VENDAS_PIPELINE_ID = 'fabb8cee-ca6c-4980-9b88-919c85e0b12f';
const CLOSER_PIPELINE_ID = '9c21bd06-a898-44a1-88db-ad3c6ec7140c';
const CLOSER_CALL_AGENDADA_STAGE_ID = '11111111-0001-0001-0001-000000000004';

export interface Task {
  id: string;
  name: string;
  description: string | null;
  notes: string | null;
  priority: 'high' | 'medium' | 'low';
  task_type: 'call' | 'whatsapp' | 'email' | 'meeting' | 'onboarding' | 'follow_up' | 'support' | 'internal' | 'checkin' | 'review' | 'renewal' | 'upsell' | 'rescue' | 'nps';
  team: 'sales' | 'cs' | 'marketing' | 'internal';
  assignee: string | null;
  responsavel_id: string | null;
  created_by_id: string | null;
  lead_id: string | null;
  organization_id: string | null;
  event_id: string | null;
  date: string | null;
  due_datetime: string | null;
  end_datetime: string | null;
  is_all_day: boolean;
  scheduled_at: string | null;
  reminder_at: string | null;
  status: 'not_started' | 'scheduled' | 'confirmed' | 'in_progress' | 'monitoring_7d' | 'ongoing' | 'completed' | 'cancelled' | 'no_show' | 'rescheduled';
  completed: boolean;
  completed_at: string | null;
  confirmed_by_client: boolean;
  client_contact_method: 'whatsapp' | 'phone' | 'zoom' | 'meet' | 'presencial' | null;
  meeting_link: string | null;
  participants: string[] | null;
  is_recurring: boolean;
  recurrence_interval_days: number | null;
  recurrence_count: number;
  is_critical: boolean;
  critical_last_reminded_at: string | null;
  metadata: {
    call_analysis?: {
      resumo: string;
      sentimento: string;
      interesse: string;
      pontos_principais: string[];
      objecoes: string[];
      proximos_passos: string[];
      compromissos: string[];
      produtos_discutidos: string[];
      bant_updates?: {
        budget?: string;
        authority?: string;
        need?: string;
        timeline?: string;
      };
      score_adjustment?: number;
    };
    transcription_processed?: boolean;
    processed_at?: string;
    recurrence_history?: Array<{
      completed_at: string;
      completed_by?: string;
    }>;
    recurrence_resolved?: boolean;
  } | null;
  created_at: string;
  updated_at: string;
  // Joined data
  lead?: { id: string; name: string; email: string; phone: string } | null;
  organization?: { id: string; name: string } | null;
  responsavel?: { id: string; name: string } | null;
}

export interface CreateTaskInput {
  name: string;
  description?: string;
  notes?: string;
  priority?: 'high' | 'medium' | 'low';
  task_type: Task['task_type'];
  team: Task['team'];
  assignee?: string;
  responsavel_id?: string;
  created_by_id?: string;
  lead_id?: string;
  organization_id?: string;
  event_id?: string;
  marketing_event_id?: string;
  due_datetime?: string;
  end_datetime?: string;
  is_all_day?: boolean;
  scheduled_at?: string;
  reminder_at?: string;
  status?: Task['status'];
  client_contact_method?: Task['client_contact_method'];
  meeting_link?: string;
  participants?: string[];
  is_recurring?: boolean;
  recurrence_interval_days?: number;
  is_critical?: boolean;
}

export interface UpdateTaskInput extends Partial<CreateTaskInput> {
  id: string;
  completed?: boolean;
  completed_at?: string;
  confirmed_by_client?: boolean;
  participants?: string[] | null;
  _previousScheduledAt?: string | null; // For detecting reschedules (not sent to DB)
}

// Buscar todas as tarefas (com filtros opcionais)
export const useTasks = (filters?: {
  responsavel_id?: string;
  team?: string;
  status?: string;
  organization_id?: string;
  lead_id?: string;
}) => {
  return useQuery({
    queryKey: ['tasks', filters],
    queryFn: async () => {
      let query = supabase
        .from('company_activities')
        .select(`
          *,
          lead:leads!company_activities_lead_id_fkey(id, name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(id, name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .order('due_datetime', { ascending: true, nullsFirst: false });

      if (filters?.responsavel_id) {
        query = query.eq('responsavel_id', filters.responsavel_id);
      }
      if (filters?.team) {
        query = query.eq('team', filters.team);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      } else {
        // By default, exclude cancelled tasks
        query = query.neq('status', 'cancelled');
      }
      if (filters?.organization_id) {
        query = query.eq('organization_id', filters.organization_id);
      }
      if (filters?.lead_id) {
        query = query.eq('lead_id', filters.lead_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });
};

// Buscar tarefas pendentes (não concluídas)
export const usePendingTasks = (filters?: {
  responsavel_id?: string;
  team?: string;
  organization_id?: string;
  lead_id?: string;
}) => {
  return useQuery({
    queryKey: ['pending-tasks', filters],
    queryFn: async () => {
      let query = supabase
        .from('company_activities')
        .select(`
          *,
          lead:leads!company_activities_lead_id_fkey(id, name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(id, name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq('completed', false)
        .order('due_datetime', { ascending: true, nullsFirst: false });

      if (filters?.responsavel_id) {
        query = query.eq('responsavel_id', filters.responsavel_id);
      }
      if (filters?.team) {
        query = query.eq('team', filters.team);
      }
      if (filters?.organization_id) {
        query = query.eq('organization_id', filters.organization_id);
      }
      if (filters?.lead_id) {
        query = query.eq('lead_id', filters.lead_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });
};

// Buscar tarefas de um cliente específico (organization ou lead)
// leadId pode ser string (único) ou string[] (cluster de leads vinculados)
export const useClientTasks = (organizationId: string | undefined, leadId?: string | string[] | undefined) => {
  return useQuery({
    queryKey: ['client-tasks', organizationId, leadId],
    queryFn: async () => {
      if (!organizationId && !leadId) return [];

      let query = supabase
        .from('company_activities')
        .select(`
          *,
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `);

      const leadIds = Array.isArray(leadId) ? leadId : leadId ? [leadId] : [];

      // Buscar por organization_id OU lead_id(s)
      if (organizationId && leadIds.length > 0) {
        const leadFilters = leadIds.map(id => `lead_id.eq.${id}`).join(',');
        query = query.or(`organization_id.eq.${organizationId},${leadFilters}`);
      } else if (organizationId) {
        query = query.eq('organization_id', organizationId);
      } else if (leadIds.length === 1) {
        query = query.eq('lead_id', leadIds[0]);
      } else if (leadIds.length > 1) {
        query = query.in('lead_id', leadIds);
      }

      const { data, error } = await query.order('due_datetime', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data || []) as Task[];
    },
    enabled: !!organizationId || !!leadId,
  });
};

// Buscar tarefas de onboarding (para o pipeline) - COM REALTIME
export const useOnboardingTasks = () => {
  const queryClient = useQueryClient();

  // Configurar realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('onboarding-tasks-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'company_activities',
          filter: 'task_type=eq.onboarding',
        },
        (payload) => {
          console.log('🔄 Realtime update:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ['onboarding-tasks'],
    queryFn: async () => {
      // Buscar tasks de onboarding
      const { data, error } = await (supabase as any)
        .from('company_activities')
        .select(`
          *,
          organization:organizations!company_activities_organization_id_fkey(id, name, primary_contact_id),
          product:products!company_activities_product_id_fkey(id, name)
        `)
        .eq('task_type', 'onboarding')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Erro ao buscar onboarding tasks:', error);
        throw error;
      }

      // Enrich tasks with related data — all batch queries in parallel
      const taskOrgIds = (data || []).map((t: any) => t.organization_id).filter(Boolean);
      const contactIds = (data || []).map((t: any) => t.organization?.primary_contact_id).filter(Boolean);

      const PRODUCT_TIER: Record<string, number> = {
        'ia-na-pratica': 1,
        'mentoria-ia-na-pratica': 2,
        'pain': 3,
        'advidor-ia-egqia2': 4,
      };

      let onboardingStatusMap: Record<string, string> = {};
      let contactsMap: Record<string, any> = {};
      let completedAtMap: Record<string, string> = {};
      const completedAtByOrgProduct = new Map<string, string>();
      const journeyStageByOrgProduct = new Map<string, string>();
      let highestProductMap: Record<string, { id: string; name: string }> = {};
      let waGroupMap: Record<string, { group_jid: string; group_name: string }> = {};

      if (taskOrgIds.length > 0) {
        const [onboardingsRes, contactsRes, orgProductsRes, waGroupsRes] = await Promise.all([
          (supabase as any).from('onboardings').select('organization_id, status').in('organization_id', taskOrgIds),
          contactIds.length > 0
            ? (supabase as any).from('leads').select('id, name, email, phone, instagram').in('id', contactIds)
            : { data: [] },
          (supabase as any).from('organization_products').select('organization_id, product_id, onboarding_completed_at, journey_stage, product:products(id, name)').in('organization_id', taskOrgIds),
          (supabase as any).from('whatsapp_groups').select('organization_id, group_jid, group_name').in('organization_id', taskOrgIds).eq('group_type', 'advisor'),
        ]);

        // Map onboarding statuses
        for (const o of onboardingsRes.data || []) {
          onboardingStatusMap[o.organization_id] = o.status;
        }

        // Map contacts
        for (const c of contactsRes.data || []) {
          contactsMap[c.id] = c;
        }

        // Map org products: completed_at (per product) + journey_stage + highest tier product
        // Key: org_id:product_id → completed_at / journey_stage (para não misturar entre produtos)
        for (const op of orgProductsRes.data || []) {
          const key = `${op.organization_id}:${op.product_id}`;
          if (op.onboarding_completed_at) {
            completedAtByOrgProduct.set(key, op.onboarding_completed_at);
            // Fallback: manter mapa global para backward compat
            if (!completedAtMap[op.organization_id] || op.onboarding_completed_at > completedAtMap[op.organization_id]) {
              completedAtMap[op.organization_id] = op.onboarding_completed_at;
            }
          }
          if (op.journey_stage) {
            journeyStageByOrgProduct.set(key, op.journey_stage);
          }
          const currentTier = PRODUCT_TIER[op.product_id] || 0;
          const existingTier = PRODUCT_TIER[highestProductMap[op.organization_id]?.id] || 0;
          if (currentTier > existingTier && op.product) {
            highestProductMap[op.organization_id] = { id: op.product.id, name: op.product.name };
          }
        }

        // Map WA groups
        for (const g of waGroupsRes.data || []) {
          waGroupMap[g.organization_id] = { group_jid: g.group_jid, group_name: g.group_name };
        }
      }

      // Auto-advance: move tasks that exceeded their time window
      // monitoring_7d → ongoing: 7 days after entering monitoring (uses metadata.monitoring_started_at or updated_at)
      // ongoing → completed: only when journey_stage in organization_products is 'success'
      const now = new Date();
      const tasksToAdvance: { id: string; newStatus: string; completed: boolean }[] = [];

      for (const task of data || []) {
        if (task.completed) continue;

        if (task.status === 'monitoring_7d') {
          // Para monitoring_7d → ongoing: 7 dias após a data do onboarding (scheduled_at)
          const onboardingDate = task.scheduled_at || (task.metadata as any)?.monitoring_started_at || task.updated_at;
          if (!onboardingDate) continue;
          const startDate = new Date(onboardingDate);
          if (isNaN(startDate.getTime())) continue;
          const daysSinceOnboarding = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
          if (daysSinceOnboarding >= 7) {
            tasksToAdvance.push({ id: task.id, newStatus: 'ongoing', completed: false });
          }
        } else if (task.status === 'ongoing') {
          // Para ongoing → completed: respeitar o journey_stage da organization_products
          // Só marca como concluída quando a edge function calculate-health-scores
          // avançou o journey_stage para 'success' (health >= 60, NPS >= 7, checkpoints >= 80%)
          const opKey = `${task.organization_id}:${task.product_id}`;
          const journeyStage = journeyStageByOrgProduct.get(opKey);
          if (journeyStage === 'success') {
            tasksToAdvance.push({ id: task.id, newStatus: 'completed', completed: true });
          }
        }
      }

      // Execute advances in parallel (fire-and-forget, don't block the query)
      if (tasksToAdvance.length > 0) {
        Promise.all(
          tasksToAdvance.map(({ id, newStatus, completed }) =>
            supabase
              .from('company_activities')
              .update({
                status: newStatus,
                completed,
                completed_at: completed ? now.toISOString() : null,
                updated_at: now.toISOString(),
              })
              .eq('id', id)
          )
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
        }).catch(err => console.error('Auto-advance error:', err));

        // Update local data immediately so UI reflects changes
        for (const adv of tasksToAdvance) {
          const task = (data as any[]).find(t => t.id === adv.id);
          if (task) {
            task.status = adv.newStatus;
            task.completed = adv.completed;
          }
        }
      }

      // Auto-revert: tasks marcadas como completed erroneamente (journey_stage != success)
      const tasksToRevert: string[] = [];
      for (const task of data || []) {
        if (task.completed && task.status === 'completed') {
          const opKey = `${task.organization_id}:${task.product_id}`;
          const journeyStage = journeyStageByOrgProduct.get(opKey);
          // Se o journey_stage existe e NÃO é success, reverter para ongoing
          if (journeyStage && journeyStage !== 'success') {
            tasksToRevert.push(task.id);
          }
        }
      }

      if (tasksToRevert.length > 0) {
        Promise.all(
          tasksToRevert.map((id) =>
            supabase
              .from('company_activities')
              .update({
                status: 'ongoing',
                completed: false,
                completed_at: null,
                updated_at: now.toISOString(),
              })
              .eq('id', id)
          )
        ).then(() => {
          queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
        }).catch(err => console.error('Auto-revert error:', err));

        // Update local data immediately
        for (const id of tasksToRevert) {
          const task = (data as any[]).find(t => t.id === id);
          if (task) {
            task.status = 'ongoing';
            task.completed = false;
            task.completed_at = null;
          }
        }
      }

      // Combinar dados
      return (data || []).map((task: any) => ({
        ...task,
        onboarding_status: onboardingStatusMap[task.organization_id] || null,
        onboarding_completed_at: completedAtByOrgProduct.get(`${task.organization_id}:${task.product_id}`) || null,
        journey_stage: journeyStageByOrgProduct.get(`${task.organization_id}:${task.product_id}`) || null,
        highest_product: highestProductMap[task.organization_id] || null,
        advisor_wa_group: waGroupMap[task.organization_id] || null,
        organization: task.organization ? {
          ...task.organization,
          primary_contact: contactsMap[task.organization.primary_contact_id] || null,
        } : null,
      })) as (Task & {
        onboarding_status?: string;
        onboarding_completed_at?: string | null;
        journey_stage?: string | null;
        highest_product?: { id: string; name: string } | null;
        advisor_wa_group?: { group_jid: string; group_name: string } | null;
        organization?: {
          id: string;
          name: string;
          primary_contact_id: string;
          primary_contact?: {
            id: string;
            name: string;
            email: string;
            phone: string;
            avatar_url?: string;
            instagram?: string;
          };
        };
        product?: { id: string; name: string };
      })[];
    },
  });
};

// Buscar tarefas de um lead específico
export const useLeadTasks = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['lead-tasks', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      
      const { data, error } = await supabase
        .from('company_activities')
        .select(`
          *,
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq('lead_id', leadId)
        .order('due_datetime', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data || []) as Task[];
    },
    enabled: !!leadId,
  });
};

// Buscar tarefas vinculadas a um evento
export const useEventTasks = (eventId: string | undefined) => {
  return useQuery({
    queryKey: ['event-tasks', eventId],
    queryFn: async () => {
      if (!eventId) return [];

      const { data, error } = await supabase
        .from('company_activities')
        .select(`
          *,
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq('marketing_event_id', eventId)
        .order('scheduled_at', { ascending: true, nullsFirst: false });

      if (error) throw error;
      return (data || []) as Task[];
    },
    enabled: !!eventId,
  });
};

// Buscar tarefas agendadas para hoje
export const useTodayTasks = (responsavelId?: string) => {
  return useQuery({
    queryKey: ['today-tasks', responsavelId],
    queryFn: async () => {
      const today = new Date();
      const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString();
      const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString();

      let query = supabase
        .from('company_activities')
        .select(`
          *,
          lead:leads!company_activities_lead_id_fkey(id, name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(id, name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .gte('due_datetime', startOfDay)
        .lte('due_datetime', endOfDay)
        .eq('completed', false)
        .order('due_datetime', { ascending: true });

      if (responsavelId) {
        query = query.eq('responsavel_id', responsavelId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Task[];
    },
  });
};

// Buscar tarefas onde o usuário é responsável OU participante
export const useMyTasks = (userId: string | undefined, filters?: {
  team?: string;
  status?: string;
  completed?: boolean;
}) => {
  return useQuery({
    queryKey: ['my-tasks', userId, filters],
    queryFn: async () => {
      if (!userId) return [];

      // responsavel_id agora aponta diretamente para team_members.id
      // Buscar tarefas onde é responsável
      let responsavelQuery = supabase
        .from('company_activities')
        .select(`
          *,
          lead:leads!company_activities_lead_id_fkey(id, name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(id, name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .eq('responsavel_id', userId)
        .order('due_datetime', { ascending: true, nullsFirst: false });

      // Buscar tarefas onde é participante
      let participantQuery = supabase
        .from('company_activities')
        .select(`
          *,
          lead:leads!company_activities_lead_id_fkey(id, name, email, phone),
          organization:organizations!company_activities_organization_id_fkey(id, name),
          responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
        `)
        .contains('participants', [userId])
        .order('due_datetime', { ascending: true, nullsFirst: false });

      // Aplicar filtros opcionais
      if (filters?.team) {
        responsavelQuery = responsavelQuery.eq('team', filters.team);
        participantQuery = participantQuery.eq('team', filters.team);
      }
      if (filters?.status) {
        responsavelQuery = responsavelQuery.eq('status', filters.status);
        participantQuery = participantQuery.eq('status', filters.status);
      }
      if (filters?.completed !== undefined) {
        responsavelQuery = responsavelQuery.eq('completed', filters.completed);
        participantQuery = participantQuery.eq('completed', filters.completed);
      }

      const [responsavelResult, participantResult] = await Promise.all([
        responsavelQuery,
        participantQuery
      ]);

      if (responsavelResult.error) throw responsavelResult.error;
      if (participantResult.error) throw participantResult.error;

      // Combinar e remover duplicatas
      const allTasks = [...(responsavelResult.data || []), ...(participantResult.data || [])];
      const uniqueTasks = allTasks.reduce((acc: Task[], task) => {
        if (!acc.find(t => t.id === task.id)) {
          acc.push(task as Task);
        }
        return acc;
      }, []);

      // Ordenar por due_datetime
      return uniqueTasks.sort((a, b) => {
        if (!a.due_datetime && !b.due_datetime) return 0;
        if (!a.due_datetime) return 1;
        if (!b.due_datetime) return -1;
        return new Date(a.due_datetime).getTime() - new Date(b.due_datetime).getTime();
      });
    },
    enabled: !!userId,
  });
};

// Auto-transfer deal from Pré-Vendas to Closer when call/meeting is scheduled
// Auto-assign SDR on deal when someone creates a meeting/call for the lead
async function autoAssignSdrOnDeal(leadId: string, responsavelId: string) {
  try {
    // Find active deal for this lead where sdr_id is null
    const { data: deal } = await supabase
      .from('deals')
      .select('id, sdr_id')
      .eq('lead_id', leadId)
      .is('sdr_id', null)
      .neq('status', 'won')
      .neq('status', 'lost')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!deal) return;

    await supabase
      .from('deals')
      .update({ sdr_id: responsavelId, updated_at: new Date().toISOString() })
      .eq('id', deal.id);
  } catch (err) {
    console.error('Auto-assign SDR error:', err);
  }
}

async function autoTransferDealToCloser(leadId: string) {
  try {
    // Find active deal for this lead in Pré-Vendas
    const { data: deal } = await supabase
      .from('deals')
      .select('id, pipeline_id, pipeline_stage_id, lead_id, title, metadata')
      .eq('lead_id', leadId)
      .eq('pipeline_id', PRE_VENDAS_PIPELINE_ID)
      .neq('status', 'won')
      .neq('status', 'lost')
      .limit(1)
      .maybeSingle();

    if (!deal) return null;

    // Get source info for transfer record
    const { data: fromStage } = await supabase
      .from('sales_pipeline_stages')
      .select('name')
      .eq('id', deal.pipeline_stage_id)
      .single();

    const transferRecord = {
      from_pipeline_id: PRE_VENDAS_PIPELINE_ID,
      from_pipeline_name: 'Pré-Vendas',
      from_stage_name: fromStage?.name || 'N/A',
      to_pipeline_id: CLOSER_PIPELINE_ID,
      to_pipeline_name: 'Closer',
      to_stage_name: 'Call Agendada',
      transferred_at: new Date().toISOString(),
      transferred_by_name: 'Sistema (auto-transfer)',
    };

    const existingMetadata = deal.metadata || {};
    const transfers = existingMetadata.transfers || [];
    transfers.push(transferRecord);

    // Move deal to Closer / Call Agendada
    const { error } = await supabase
      .from('deals')
      .update({
        pipeline_id: CLOSER_PIPELINE_ID,
        pipeline_stage_id: CLOSER_CALL_AGENDADA_STAGE_ID,
        metadata: { ...existingMetadata, transfers },
        updated_at: new Date().toISOString(),
      })
      .eq('id', deal.id);

    if (error) throw error;

    // Sync lead's pipeline_stage_id
    await supabase
      .from('leads')
      .update({
        pipeline_stage_id: CLOSER_CALL_AGENDADA_STAGE_ID,
        updated_at: new Date().toISOString(),
      })
      .eq('id', leadId);

    return deal;
  } catch (err) {
    console.error('Auto-transfer deal error:', err);
    return null;
  }
}

// Notification helper (fire-and-forget)
async function notifyTaskEvent(eventType: 'task_created' | 'task_completed', task: Task) {
  try {
    const { triggerNotificationEvent } = await import('./useNotificationEvents');
    triggerNotificationEvent(eventType, {
      cliente: task.organization?.name || task.lead?.name || '',
      cliente_telefone: task.lead?.phone || null,
      responsavel: task.responsavel?.name || '',
    });
  } catch {}
}

// Criar tarefa
export const useCreateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateTaskInput) => {
      const status = input.status || 'not_started';
      const isCompleted = status === 'completed';

      const { data, error } = await supabase
        .from('company_activities')
        .insert({
          ...input,
          status,
          priority: input.priority || 'medium',
          completed: isCompleted,
          completed_at: isCompleted ? new Date().toISOString() : null,
        })
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: async (data, input) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['event-tasks'] });

      // Notificação no grupo comercial quando reunião/call é criada
      if (['call', 'meeting'].includes(input.task_type)) {
        try {
          const leadName = data.lead_id
            ? (await supabase.from('leads').select('name, company_name, email').eq('id', data.lead_id).single())?.data
            : null;
          const repName = data.responsavel_id
            ? (await supabase.from('team_members').select('name').eq('id', data.responsavel_id).single())?.data?.name
            : null;
          const creatorName = data.created_by_id && data.created_by_id !== data.responsavel_id
            ? (await supabase.from('team_members').select('name').eq('id', data.created_by_id).single())?.data?.name
            : null;
          const meetDate = data.scheduled_at ? new Date(data.scheduled_at) : null;

          triggerNotificationEvent('meeting_scheduled', {
            cliente: leadName?.name || data.name || '-',
            cliente_empresa: leadName?.company_name || '-',
            cliente_email: leadName?.email || '-',
            responsavel: repName || '-',
            agendado_por: creatorName || repName || '-',
            meeting_data: meetDate ? meetDate.toLocaleDateString('pt-BR') : '-',
            meeting_hora: meetDate ? meetDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-',
            meeting_tipo: input.task_type === 'call' ? 'LIGAÇÃO' : (input.meeting_link ? 'REUNIÃO (Video)' : 'REUNIÃO'),
            meeting_notas: (input.description || '').slice(0, 200),
            meeting_source: 'manual',
          });
        } catch (notifErr) {
          console.error('Erro ao disparar notificação de reunião:', notifErr);
        }
      }

      // Auto-mover lead no pipeline quando meeting/call é criada com scheduled_at
      if (['call', 'meeting'].includes(input.task_type) && input.lead_id && data.scheduled_at) {
        await autoMovePipelineOnTaskChange(data as Task);
        queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
        queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      }

      // Fire notification event
      notifyTaskEvent('task_created', data);

      // Auto-transfer deal from Pré-Vendas → Closer when call/meeting is created or has Meet link
      const hasMeetLink = input.meeting_link && input.meeting_link.includes('meet.google');
      if ((['call', 'meeting'].includes(input.task_type) || hasMeetLink) && input.lead_id) {
        const transferred = await autoTransferDealToCloser(input.lead_id);
        if (transferred) {
          toast.success('Deal movido automaticamente para Closer → Call Agendada', {
            description: transferred.title || 'Deal transferido do Pré-Vendas',
          });
          queryClient.invalidateQueries({ queryKey: ['sales-deals'] });
          queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
          queryClient.invalidateQueries({ queryKey: ['deals-by-stage'] });
          queryClient.invalidateQueries({ queryKey: ['contact-deals'] });
        }
      }

      // Auto-assign SDR: when a meeting/call task is created, fill sdr_id with the CREATOR (not the assignee)
      const sdrId = data.created_by_id || data.responsavel_id;
      if (['call', 'meeting'].includes(input.task_type) && input.lead_id && sdrId) {
        await autoAssignSdrOnDeal(input.lead_id, sdrId);
      }

      // Disparar regras de automação
      triggerAutomationRules({
        trigger_type: 'task_created',
        task_id: data.id,
        task_type: data.task_type,
        lead_id: data.lead_id || undefined,
        has_scheduled_date: !!data.scheduled_at,
      });

      // Disparar meeting_scheduled se for tarefa de reunião/call com data
      if (['call', 'meeting'].includes(data.task_type) && data.scheduled_at && data.lead_id) {
        triggerAutomationRules({
          trigger_type: 'meeting_scheduled',
          task_id: data.id,
          task_type: data.task_type,
          lead_id: data.lead_id,
        });
      }
    },
  });
};

// Atualizar tarefa
// IDs dos estágios do pipeline comercial
const PIPELINE_STAGES = {
  CALL_AGENDADA: '11111111-0001-0001-0001-000000000004',
  NOSHOW: '11111111-0001-0001-0001-000000000005',
  CALL_REALIZADA: '11111111-0001-0001-0001-000000000006',
};

// Automação: move lead E deal no pipeline quando call/meeting muda de status
export async function autoMovePipelineOnTaskChange(task: Task) {
  if (!task.lead_id || !['call', 'meeting'].includes(task.task_type)) return;

  // Buscar estágio atual do lead
  const { data: lead } = await supabase
    .from('leads')
    .select('pipeline_stage_id')
    .eq('id', task.lead_id)
    .single();
  if (!lead) return;

  const { data: currentStage } = await supabase
    .from('sales_pipeline_stages')
    .select('name')
    .eq('id', lead.pipeline_stage_id)
    .single();
  if (!currentStage) return;

  const stageName = currentStage.name;
  let targetStageId: string | null = null;
  let targetSalesStage: string | null = null;

  // No-show: mover para No-show (se está em estágios pré-reunião)
  if (task.status === 'no_show') {
    const allowedForNoShow = ['Call Agendada', 'Em Agendamento', 'Qualificado', 'Em Contato'];
    if (allowedForNoShow.includes(stageName)) {
      targetStageId = PIPELINE_STAGES.NOSHOW;
      targetSalesStage = 'no_show';

      // Auto-enroll na cadência de no-show (Seq A ou B baseado em confirmed_by_client)
      const cadenceStage = task.confirmed_by_client
        ? 'No-show_confirmou'
        : 'No-show_nao_confirmou';
      const AGENT_ID = '2d3690f8-3b76-4894-b7e6-8b04e548cc97';
      const firstDelay = task.confirmed_by_client ? 30 : 120; // minutos
      const nextActionAt = new Date(Date.now() + firstDelay * 60 * 1000).toISOString();

      supabase
        .from('ai_agent_cadence_enrollments')
        .upsert(
          {
            lead_id: task.lead_id,
            agent_id: AGENT_ID,
            stage: cadenceStage,
            current_step: 0,
            status: 'active',
            next_action_at: nextActionAt,
            enrolled_at: new Date().toISOString(),
            last_step_at: null,
            completed_at: null,
            metadata: { source: 'auto_noshow', confirmed_by_client: !!task.confirmed_by_client },
          },
          { onConflict: 'lead_id,agent_id,stage' }
        )
        .then(({ error: enrollErr }: any) => {
          if (enrollErr) console.error('Erro ao auto-enroll no-show:', enrollErr);
          else console.log(`✅ Lead auto-enrolled em cadência ${cadenceStage}`);
        });
    }
  }

  // Task com scheduled_at (criação ou reagendamento) → mover para Call Agendada
  if (['pending', 'not_started', 'scheduled'].includes(task.status) && task.scheduled_at) {
    const allowedForScheduled = ['Novo', 'Em Contato', 'Qualificado', 'No-show', 'Em Agendamento'];
    if (allowedForScheduled.includes(stageName)) {
      targetStageId = PIPELINE_STAGES.CALL_AGENDADA;
      targetSalesStage = 'agendamento';
    }
  }

  // Concluída: mover para Call Realizada APENAS se for meeting (reunião)
  // Ligações (call/WaVoIP) não movem — só reuniões contam
  // No-show excluído: completar task de no-show (limpar pendência) NÃO deve mover para Call Realizada
  if (task.status === 'completed' && task.completed && task.task_type === 'meeting') {
    const allowedForRealized = ['Call Agendada', 'Em Agendamento', 'Qualificado', 'Em Contato', 'Novo'];
    if (allowedForRealized.includes(stageName)) {
      targetStageId = PIPELINE_STAGES.CALL_REALIZADA;
      targetSalesStage = 'negotiation';
    }
  }

  if (!targetStageId) return;

  const now = new Date().toISOString();

  // Mapear sales_stage → etapa_funil
  const etapaFunilMap: Record<string, string> = {
    agendamento: 'call_agendada',
    no_show: 'no_show',
    negotiation: 'call_realizada',
  };

  // Mover LEAD
  await supabase
    .from('leads')
    .update({
      pipeline_stage_id: targetStageId,
      sales_stage: targetSalesStage,
      etapa_funil: targetSalesStage ? etapaFunilMap[targetSalesStage] || targetSalesStage : undefined,
      updated_at: now,
    })
    .eq('id', task.lead_id);

  // Mover DEALS do lead (o kanban usa deals.pipeline_stage_id)
  await supabase
    .from('deals')
    .update({
      pipeline_stage_id: targetStageId,
      updated_at: now,
    })
    .eq('lead_id', task.lead_id)
    .eq('pipeline_stage_id', lead.pipeline_stage_id); // só move deals que estão no mesmo estágio
}

export const useUpdateTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateTaskInput) => {
      const { id, _previousScheduledAt, ...updates } = input;

      // Auto-reset status + reminder flags when rescheduling a call/meeting
      if (
        _previousScheduledAt &&
        updates.scheduled_at &&
        _previousScheduledAt !== updates.scheduled_at
      ) {
        // Fetch current status and metadata
        const { data: current } = await supabase
          .from('company_activities')
          .select('status, task_type, metadata')
          .eq('id', id)
          .single();

        if (current && ['call', 'meeting'].includes(current.task_type)) {
          // Reset terminal status
          if (['no_show', 'completed', 'cancelled'].includes(current.status)) {
            updates.status = 'scheduled';
            (updates as any).completed = false;
            (updates as any).completed_at = null;
          }

          // Reset reminder flags so reminders fire again for the new date
          const meta = { ...(current.metadata || {}) };
          delete meta.reminder_today_sent;
          delete meta.reminder_2h_sent;
          delete meta.reminder_30min_sent;
          delete meta.noshow_sent;
          (updates as any).metadata = { ...meta, ...((updates as any).metadata || {}) };
        }
      }

      const { data, error } = await supabase
        .from('company_activities')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Auto-mover lead no pipeline ANTES de invalidar caches
      await autoMovePipelineOnTaskChange(data as Task);

      return { task: data as Task, _previousScheduledAt };
    },
    onSuccess: async (result) => {
      const { task, _previousScheduledAt } = result;

      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['event-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agenda-v2-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      // Pipeline + lead caches para automação no-show/call realizada
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });

      // Notificação meeting_rescheduled quando data de call/meeting muda
      if (
        ['call', 'meeting'].includes(task.task_type) &&
        _previousScheduledAt &&
        task.scheduled_at &&
        _previousScheduledAt !== task.scheduled_at
      ) {
        try {
          const leadData = task.lead_id
            ? (await supabase.from('leads').select('name, company_name, email').eq('id', task.lead_id).single())?.data
            : null;
          const repName = task.responsavel_id
            ? (await supabase.from('team_members').select('name').eq('id', task.responsavel_id).single())?.data?.name
            : null;

          const newDate = new Date(task.scheduled_at);
          const oldDate = new Date(_previousScheduledAt);

          triggerNotificationEvent('meeting_rescheduled', {
            cliente: leadData?.name || task.name || '-',
            cliente_empresa: leadData?.company_name || '-',
            cliente_email: leadData?.email || '-',
            responsavel: repName || '-',
            meeting_data: newDate.toLocaleDateString('pt-BR'),
            meeting_hora: newDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
            meeting_tipo: task.task_type === 'call' ? 'Call' : 'Reunião',
            meeting_source: 'manual',
            meeting_data_anterior: oldDate.toLocaleDateString('pt-BR'),
            meeting_hora_anterior: oldDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          });
        } catch (notifErr) {
          console.error('Erro ao disparar notificação de reagendamento:', notifErr);
        }

        // Sync rescheduled meeting to Google Calendar
        if (task.google_event_id && task.responsavel_id) {
          try {
            const startDt = new Date(task.scheduled_at);
            const endDt = task.end_datetime
              ? new Date(task.end_datetime)
              : new Date(startDt.getTime() + 45 * 60 * 1000);

            await supabase.functions.invoke('create-calendar-event', {
              body: {
                team_member_id: task.responsavel_id,
                event_id: task.google_event_id,
                event: {
                  summary: task.name,
                  startDateTime: startDt.toISOString(),
                  endDateTime: endDt.toISOString(),
                },
              },
            });
            console.log('Google Calendar event updated for rescheduled meeting');
          } catch (calErr) {
            console.error('Error updating Google Calendar event:', calErr);
          }
        }
      }
    },
  });
};

// Completar tarefa
// Onboarding flow: instead of completing, advance to next stage
const ONBOARDING_FLOW: Record<string, string> = {
  not_started: 'monitoring_7d',
  scheduled: 'monitoring_7d',
  confirmed: 'monitoring_7d',
  in_progress: 'monitoring_7d',
  monitoring_7d: 'ongoing',
};

export const useCompleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      // Fetch task details to enforce onboarding flow
      const { data: task, error: fetchErr } = await supabase
        .from('company_activities')
        .select('task_type, status, organization_id, product_id, metadata')
        .eq('id', taskId)
        .single();

      if (fetchErr) throw fetchErr;

      // Onboarding tasks follow a special flow: never go directly to "completed"
      // unless they're already in "ongoing" (90-day accompaniment phase)
      if (task?.task_type === 'onboarding') {
        const nextStage = ONBOARDING_FLOW[task.status];
        if (nextStage) {
          const updatePayload: any = {
            status: nextStage,
            completed: false,
            completed_at: null,
            updated_at: new Date().toISOString(),
          };

          // Quando entra em monitoring_7d, salvar timestamp para auto-advance correto
          if (nextStage === 'monitoring_7d') {
            updatePayload.metadata = {
              ...(task.metadata || {}),
              monitoring_started_at: new Date().toISOString(),
            };
          }

          const { data, error } = await supabase
            .from('company_activities')
            .update(updatePayload)
            .eq('id', taskId)
            .select()
            .single();
          if (error) throw error;

          // Sincronizar organization_products.journey_stage
          const STAGE_TO_JOURNEY: Record<string, string> = {
            monitoring_7d: 'monitoring_7d',
            ongoing: 'ongoing',
          };
          const journeyStage = STAGE_TO_JOURNEY[nextStage];
          if (journeyStage && task.organization_id && task.product_id) {
            await supabase
              .from('organization_products')
              .update({ journey_stage: journeyStage as any })
              .eq('organization_id', task.organization_id)
              .eq('product_id', task.product_id);
          }

          return data as Task;
        }
        // If status is "ongoing" or not in flow map, allow normal completion
      }

      const { data, error } = await supabase
        .from('company_activities')
        .update({
          completed: true,
          completed_at: new Date().toISOString(),
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      // Auto-mover lead no pipeline ANTES de invalidar caches
      await autoMovePipelineOnTaskChange(data as Task);

      return data as Task;
    },
    onMutate: async (taskId) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: ['client-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['tasks'] });
      await queryClient.cancelQueries({ queryKey: ['pending-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['lead-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['today-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['my-tasks'] });
      await queryClient.cancelQueries({ queryKey: ['agenda-v2-tasks'] });

      // Snapshot all task caches for rollback
      const previousCaches = new Map<readonly unknown[], unknown>();
      const taskQueryKeys = ['client-tasks', 'tasks', 'pending-tasks', 'lead-tasks', 'today-tasks', 'my-tasks', 'agenda-v2-tasks'];
      taskQueryKeys.forEach(key => {
        const queries = queryClient.getQueriesData<Task[]>({ queryKey: [key] });
        queries.forEach(([queryKey, data]) => {
          previousCaches.set(queryKey, data);
        });
      });

      // Optimistically update all task caches
      // Para onboarding tasks, avançar ao invés de completar
      const updateFn = (oldData: Task[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(t => {
          if (t.id !== taskId) return t;
          if (t.task_type === 'onboarding') {
            const nextStage = ONBOARDING_FLOW[t.status];
            if (nextStage) {
              return { ...t, status: nextStage as any, completed: false, completed_at: null };
            }
          }
          return { ...t, completed: true, completed_at: new Date().toISOString(), status: 'completed' as const };
        });
      };

      taskQueryKeys.forEach(key => {
        queryClient.setQueriesData<Task[]>({ queryKey: [key] }, updateFn);
      });

      return { previousCaches };
    },
    onSuccess: (data) => {
      // Disparar regras de automação para task_completed
      triggerAutomationRules({
        trigger_type: 'task_completed',
        task_id: data.id,
        task_type: data.task_type,
        lead_id: data.lead_id || undefined,
        has_scheduled_date: !!data.scheduled_at,
      });

      // Disparar meeting_completed se for reunião finalizada com sucesso
      if (data.completed && data.status === 'completed' && ['call', 'meeting'].includes(data.task_type) && data.lead_id) {
        triggerAutomationRules({
          trigger_type: 'meeting_completed',
          task_id: data.id,
          task_type: data.task_type,
          lead_id: data.lead_id,
        });
      }

      // Fire notification only when actually completed (not onboarding advance)
      if (data.completed && data.status === 'completed') {
        notifyTaskEvent('task_completed', data);
      }
    },
    onError: (_err, _taskId, context) => {
      // Rollback all caches on error
      if (context?.previousCaches) {
        context.previousCaches.forEach((data, queryKey) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['event-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['agenda-v2-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['cockpit-agenda'] });
      // Pipeline + lead caches para automação no-show/call realizada
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads-by-stage'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stages'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-stats'] });
    },
  });
};

// Completar check-in de tarefa recorrente (avança scheduled_at, NÃO completa)
export const useCompleteRecurringTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ taskId, completedBy }: { taskId: string; completedBy?: string }) => {
      // Buscar task atual
      const { data: task, error: fetchError } = await supabase
        .from('company_activities')
        .select('*')
        .eq('id', taskId)
        .single();

      if (fetchError || !task) throw fetchError || new Error('Task not found');

      const intervalDays = task.recurrence_interval_days || 1;

      // Próxima data: max(scheduled_at, now) + interval_days
      const baseDate = task.scheduled_at && new Date(task.scheduled_at) > new Date()
        ? new Date(task.scheduled_at)
        : new Date();
      const nextDate = new Date(baseDate);
      nextDate.setDate(nextDate.getDate() + intervalDays);

      // Preservar horário original se existir
      if (task.scheduled_at) {
        const originalDate = new Date(task.scheduled_at);
        nextDate.setHours(originalDate.getHours(), originalDate.getMinutes(), 0, 0);
      }

      // Append ao histórico de recorrência
      const metadata = task.metadata || {};
      const history = metadata.recurrence_history || [];
      history.push({
        completed_at: new Date().toISOString(),
        completed_by: completedBy,
      });

      const { data, error } = await supabase
        .from('company_activities')
        .update({
          completed: false,
          status: 'not_started',
          completed_at: null,
          scheduled_at: nextDate.toISOString(),
          due_datetime: nextDate.toISOString(),
          recurrence_count: (task.recurrence_count || 0) + 1,
          metadata: { ...metadata, recurrence_history: history },
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return { task: data as Task, nextDate };
    },
    onSuccess: () => {
      const keys = ['tasks', 'pending-tasks', 'client-tasks', 'lead-tasks', 'today-tasks', 'my-tasks', 'event-tasks', 'agenda-v2-tasks', 'onboarding-tasks'];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
    },
  });
};

// Resolver tarefa recorrente definitivamente (marca como completed + is_recurring=false)
export const useResolveRecurringTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      // Buscar task para metadata
      const { data: task, error: fetchError } = await supabase
        .from('company_activities')
        .select('*')
        .eq('id', taskId)
        .single();

      if (fetchError || !task) throw fetchError || new Error('Task not found');

      const metadata = task.metadata || {};

      const { data, error } = await supabase
        .from('company_activities')
        .update({
          completed: true,
          status: 'completed',
          completed_at: new Date().toISOString(),
          is_recurring: false,
          metadata: { ...metadata, recurrence_resolved: true },
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;

      // Este SIM move pipeline (é conclusão real)
      await autoMovePipelineOnTaskChange(data as Task);

      return data as Task;
    },
    onSuccess: () => {
      const keys = ['tasks', 'pending-tasks', 'client-tasks', 'lead-tasks', 'today-tasks', 'my-tasks', 'event-tasks', 'agenda-v2-tasks', 'onboarding-tasks'];
      keys.forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));
      // Pipeline caches
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['sales-lead'] });
      queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    },
  });
};

// Deletar tarefa
export const useDeleteTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      await deleteWithUndo({
        table: 'company_activities',
        id: taskId,
        label: 'Tarefa',
        queryClient,
        queryKeys: [['tasks'], ['pending-tasks'], ['client-tasks'], ['lead-tasks'], ['today-tasks'], ['my-tasks'], ['event-tasks'], ['agenda-v2-tasks'], ['onboarding-tasks']],
      });
    },
  });
};

// Agendar tarefa (definir scheduled_at)
export const useScheduleTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      taskId, 
      scheduledAt, 
      contactMethod, 
      meetingLink 
    }: { 
      taskId: string; 
      scheduledAt: string; 
      contactMethod?: Task['client_contact_method'];
      meetingLink?: string;
    }) => {
      const { data, error } = await supabase
        .from('company_activities')
        .update({
          scheduled_at: scheduledAt,
          client_contact_method: contactMethod,
          meeting_link: meetingLink,
          status: 'scheduled',
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
};

// Confirmar agendamento (cliente confirmou)
export const useConfirmTask = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (taskId: string) => {
      const { data, error } = await supabase
        .from('company_activities')
        .update({
          confirmed_by_client: true,
          status: 'confirmed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)
        .select()
        .single();

      if (error) throw error;
      return data as Task;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['today-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });
    },
  });
};

// ============================================
// HOOKS PARA CALLS/REUNIÕES
// ============================================

// Buscar próximas calls agendadas para múltiplos leads (usado no Pipeline)
export const useUpcomingCallsForLeads = (leadIds: string[]) => {
  return useQuery({
    queryKey: ['upcoming-calls-leads', leadIds],
    queryFn: async () => {
      if (!leadIds || leadIds.length === 0) return {};

      const now = new Date().toISOString();

      // Buscar tarefas agendadas - usando OR para scheduled_at ou due_datetime
      const { data, error } = await supabase
        .from('company_activities')
        .select(`
          id,
          name,
          task_type,
          status,
          scheduled_at,
          due_datetime,
          meeting_link,
          lead_id,
          confirmed_by_client
        `)
        .in('lead_id', leadIds)
        .in('task_type', ['call', 'meeting', 'onboarding'])
        .in('status', ['scheduled', 'confirmed', 'not_started', 'in_progress'])
        .eq('completed', false);

      if (error) throw error;

      // Filtrar e ordenar por scheduled_at
      // Incluir calls de hoje (mesmo que já passaram) para mostrar aviso "Call passou!"
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      
      const filteredData = (data || [])
        .map(call => ({
          ...call,
          effective_date: call.scheduled_at,
        }))
        .filter(call => {
          // Se está em andamento, sempre incluir (independente da data)
          if (call.status === 'in_progress') return true;
          // Incluir se tem data futura ou se não tem data (para mostrar "Sem data")
          if (!call.effective_date) return true;
          // Incluir calls de hoje (mesmo que já passaram) para detectar "Call passou!"
          return new Date(call.effective_date) >= todayStart;
        })
        .sort((a, b) => {
          // Ordenar por data (sem data vai pro final)
          if (!a.effective_date && !b.effective_date) return 0;
          if (!a.effective_date) return 1;
          if (!b.effective_date) return -1;
          return new Date(a.effective_date).getTime() - new Date(b.effective_date).getTime();
        });

      // Agrupar por lead_id (pegar apenas a próxima call de cada lead)
      const callsByLead: Record<string, {
        id: string;
        name: string;
        task_type: string;
        status: string;
        scheduled_at: string | null;
        due_datetime: string | null;
        meeting_link: string | null;
        confirmed_by_client: boolean;
      }> = {};

      filteredData.forEach((call) => {
        if (call.lead_id && !callsByLead[call.lead_id]) {
          callsByLead[call.lead_id] = {
            id: call.id,
            name: call.name,
            task_type: call.task_type,
            status: call.status,
            scheduled_at: call.scheduled_at,
            due_datetime: call.due_datetime,
            meeting_link: call.meeting_link,
            confirmed_by_client: call.confirmed_by_client,
          };
        }
      });

      return callsByLead;
    },
    enabled: leadIds.length > 0,
  });
};

// Buscar próximas calls do vendedor logado (usado no Dashboard)
export const useMyUpcomingCalls = (salesRepId: string | undefined, days: number = 7) => {
  return useQuery({
    queryKey: ['my-upcoming-calls', salesRepId, days],
    queryFn: async () => {
      if (!salesRepId) return [];

      const now = new Date();
      const endDate = new Date(now);
      endDate.setDate(endDate.getDate() + days);

      const { data: activities, error } = await supabase
        .from('company_activities')
        .select('*')
        .eq('responsavel_id', salesRepId)
        .in('task_type', ['call', 'meeting', 'onboarding'])
        .in('status', ['scheduled', 'confirmed', 'not_started'])
        .eq('completed', false)
        .gte('scheduled_at', now.toISOString())
        .lte('scheduled_at', endDate.toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(10);

      if (error) throw error;
      if (!activities || activities.length === 0) return [];

      // Fetch related leads separately
      const leadIds = activities.map(a => a.lead_id).filter(Boolean);
      let leadsMap = new Map<string, { id: string; name: string; email: string; phone: string; instagram?: string }>();

      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, email, phone, instagram')
          .in('id', leadIds);

        if (leads) {
          leadsMap = new Map(leads.map(l => [l.id, l]));
        }
      }

      return activities.map(activity => ({
        ...activity,
        lead: activity.lead_id ? leadsMap.get(activity.lead_id) || null : null,
      })) as (Task & { lead?: { id: string; name: string; email: string; phone: string; instagram?: string } })[];
    },
    enabled: !!salesRepId,
  });
};

// Buscar calls de hoje (para widget do dashboard)
export const useTodayCalls = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['today-calls', salesRepId],
    queryFn: async () => {
      const today = new Date();
      const startOfDay = new Date(today);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(today);
      endOfDay.setHours(23, 59, 59, 999);

      let query = supabase
        .from('company_activities')
        .select('*')
        .in('task_type', ['call', 'meeting', 'onboarding'])
        .in('status', ['scheduled', 'confirmed', 'in_progress'])
        .gte('scheduled_at', startOfDay.toISOString())
        .lte('scheduled_at', endOfDay.toISOString())
        .order('scheduled_at', { ascending: true });

      // Filtrar por responsavel_id (team_member_id)
      if (salesRepId) {
        query = query.eq('responsavel_id', salesRepId);
      }

      const { data: activities, error } = await query;
      if (error) throw error;
      if (!activities || activities.length === 0) return [];

      // Fetch related leads separately
      const leadIds = activities.map(a => a.lead_id).filter(Boolean);
      let leadsMap = new Map<string, { id: string; name: string; email: string; phone: string; instagram?: string }>();

      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, email, phone, instagram')
          .in('id', leadIds);

        if (leads) {
          leadsMap = new Map(leads.map(l => [l.id, l]));
        }
      }

      return activities.map(activity => ({
        ...activity,
        lead: activity.lead_id ? leadsMap.get(activity.lead_id) || null : null,
      })) as (Task & { lead?: { id: string; name: string; email: string; phone: string; instagram?: string } })[];
    },
  });
};
