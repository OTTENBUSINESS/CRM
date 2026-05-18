import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// =====================================================
// TYPES
// =====================================================

export interface InboxMetrics {
  total_pending: number;
  critical_count: number;
  warning_count: number;
  ok_count: number;
  avg_wait_minutes: number;
  max_wait_minutes: number;
  resolved_today: number;
  total_conversations: number;
  follow_up_count: number;
}

export interface InboxConversation {
  conversation_id: string;
  conversation_type: "individual" | "grupo";
  lead_id: string | null;
  group_id: string | null;
  contact_phone: string | null;
  conversation_name: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_name: string | null;
  is_from_me: boolean;
  unread_count: number;
  organization_id: string | null;
  organization_name: string | null;
  health_status: "healthy" | "alert" | "risk" | "unknown";
  health_score: number | null;
  instance_id: string | null;
  instance_name: string | null;
  lead_photo_url: string | null;
  lead_products: string[];
  pending_reply: boolean;
  wait_minutes: number;
  sla_status: "ok" | "warning" | "critical";
  assigned_agent_id: string | null;
  assigned_agent_name: string | null;
  // Campos de conversa marcada como resolvida
  is_handled: boolean;
  handled_at: string | null;
  handled_reason: string | null;
  // Tarefas pendentes
  pending_tasks_count: number;
  // Campos B2B (empresa)
  lead_company_name: string | null;
  lead_job_title: string | null;
  // Follow-up pendente (última msg nossa em dia anterior, sem resposta)
  needs_follow_up: boolean;
  // Status do agente IA (da tabela ai_agent_conversations)
  ai_agent_status: string | null;
  // Qualificação (faturamento / funcionários)
  lead_monthly_revenue: string | null;
  lead_employee_count: number | null;
  // Etapa do funil
  lead_sales_stage: string | null;
  had_meeting: boolean;
  lead_reply_count: number;
}

export interface ResponseTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  shortcut: string | null;
  usage_count: number;
}

export interface ConversationNote {
  id: string;
  content: string;
  note_type: "general" | "warning" | "important" | "followup";
  is_pinned: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
}

export type SortMode = "recent" | "priority";

export interface InboxFilters {
  instanceId?: string;
  teamFilter?: string; // Filtrar por team da instância (ex: 'cs', 'comercial')
  productFilter?: string;
  healthFilter?: string;
  slaFilter?: string;
  onlyPending?: boolean;
  search?: string;
  sortMode?: SortMode;
  hideHandled?: boolean;
  onlyWithTasks?: boolean; // Mostrar apenas conversas com tarefas pendentes
  aiAgentFilter?: string; // "transferred" | "active" | "paused" etc.
  funnelFilter?: string; // "novo" | "em_contato" | "closer" | "fechado" | "perdido"
  pipelineId?: string; // UUID do pipeline pra filtrar no banco
  stageId?: string; // UUID da etapa pra filtrar no banco
}

// =====================================================
// HOOKS
// =====================================================

// Métricas do dashboard
export const useInboxMetrics = (instanceId?: string, teamFilter?: string) => {
  return useQuery({
    queryKey: ["inbox-metrics", instanceId, teamFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_inbox_dashboard_metrics", {
        p_instance_id: instanceId || null,
        p_team_filter: teamFilter || null,
      });
      if (error) throw error;
      // RPC pode retornar array ou objeto
      const result = Array.isArray(data) ? data[0] : data;
      return (result || {
        total_pending: 0,
        critical_count: 0,
        warning_count: 0,
        ok_count: 0,
        avg_wait_minutes: 0,
        max_wait_minutes: 0,
        resolved_today: 0,
        total_conversations: 0,
        follow_up_count: 0,
      }) as InboxMetrics;
    },
    refetchInterval: 30000, // 30s — aligned with conversations
  });
};

// Lista de conversas com métricas
export const useInboxConversations = (filters: InboxFilters = {}, limit = 50) => {
  return useQuery({
    queryKey: ["inbox-conversations", filters, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_cs_inbox_with_metrics", {
        p_instance_id: filters.instanceId || null,
        p_team_filter: filters.teamFilter || null,
        p_product_filter: filters.productFilter || null,
        p_health_filter: filters.healthFilter || null,
        p_sla_filter: filters.slaFilter || null,
        p_only_pending: filters.onlyPending || false,
        p_search: filters.search || null,
        p_sort_mode: filters.sortMode || "recent",
        p_limit: limit,
        p_hide_handled: filters.hideHandled ?? false,
        p_only_with_tasks: filters.onlyWithTasks || false,
        p_funnel_filter: (filters.funnelFilter && !filters.funnelFilter.includes('-')) ? filters.funnelFilter : null,
        p_pipeline_id: filters.pipelineId || null,
        p_stage_id: filters.stageId || null,
      });
      if (error) throw error;
      return (data || []) as InboxConversation[];
    },
    refetchInterval: 30000, // 30s — Realtime handles instant updates
  });
};

// Templates de resposta
export const useResponseTemplates = (team = "cs", category?: string) => {
  return useQuery({
    queryKey: ["response-templates", team, category],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_response_templates", {
        p_team: team,
        p_category: category || null,
      });
      if (error) throw error;
      return (data || []) as ResponseTemplate[];
    },
  });
};

// Usar template (incrementa contador)
export const useUseTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase.rpc("use_response_template", {
        p_template_id: templateId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
  });
};

// Notas da conversa
export const useConversationNotes = (leadId?: string, groupId?: string) => {
  return useQuery({
    queryKey: ["conversation-notes", leadId, groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_conversation_notes", {
        p_lead_id: leadId || null,
        p_group_id: groupId || null,
      });
      if (error) throw error;
      return (data || []) as ConversationNote[];
    },
    enabled: !!(leadId || groupId),
  });
};

// Criar nota
export const useCreateNote = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      groupId,
      content,
      noteType = "general",
      createdBy,
    }: {
      leadId?: string;
      groupId?: string;
      content: string;
      noteType?: ConversationNote["note_type"];
      createdBy?: string;
    }) => {
      const { data, error } = await supabase
        .from("cs_conversation_notes")
        .insert({
          lead_id: leadId || null,
          group_id: groupId || null,
          content,
          note_type: noteType,
          created_by: createdBy || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["conversation-notes", variables.leadId, variables.groupId],
      });
    },
  });
};

// Atribuir agente
export const useAssignAgent = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationKey,
      agentId,
    }: {
      conversationKey: string;
      agentId: string | null;
    }) => {
      const { error } = await supabase.rpc("assign_conversation_agent", {
        p_conversation_key: conversationKey,
        p_agent_id: agentId,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
    },
  });
};

// Marcar conversa como resolvida (sai do radar de pendências)
export const useMarkAsHandled = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      groupId,
      handledBy,
      reason = "replied_manually",
      notes,
    }: {
      leadId?: string;
      groupId?: string;
      handledBy?: string;
      reason?: "replied_manually" | "no_action_needed" | "resolved" | "other";
      notes?: string;
    }) => {
      const { data, error } = await supabase.rpc("mark_conversation_handled", {
        p_lead_id: leadId || null,
        p_group_id: groupId || null,
        p_handled_by: handledBy || null,
        p_reason: reason,
        p_notes: notes || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-metrics"] });
    },
  });
};

// Desmarcar conversa como resolvida (volta pro radar)
export const useUnmarkAsHandled = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      groupId,
    }: {
      leadId?: string;
      groupId?: string;
    }) => {
      const { data, error } = await supabase.rpc("unmark_conversation_handled", {
        p_lead_id: leadId || null,
        p_group_id: groupId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inbox-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-metrics"] });
    },
  });
};

// Criar template
export const useCreateTemplate = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      name,
      content,
      category = "geral",
      shortcut,
      team = "cs",
      createdBy,
    }: {
      name: string;
      content: string;
      category?: string;
      shortcut?: string;
      team?: string;
      createdBy?: string;
    }) => {
      const { data, error } = await supabase
        .from("cs_response_templates")
        .insert({
          name,
          content,
          category,
          shortcut: shortcut || null,
          team,
          created_by: createdBy || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["response-templates"] });
    },
  });
};

// Buscar produtos disponíveis (para filtro)
export const useAvailableProducts = () => {
  return useQuery({
    queryKey: ["available-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });
};

// Helper: formatar tempo de espera
export const formatWaitTime = (minutes: number | null | undefined): string => {
  if (minutes == null || isNaN(minutes) || minutes < 1) return "agora";
  if (minutes < 60) return `${Math.floor(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  if (hours < 24) return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
};

// Helper: cor do SLA
export const getSLAColor = (status: string): string => {
  switch (status) {
    case "critical":
      return "text-red-600 bg-red-50 border-red-200";
    case "warning":
      return "text-amber-600 bg-amber-50 border-amber-200";
    default:
      return "text-green-600 bg-green-50 border-green-200";
  }
};

// Helper: etapa do funil da conversa
export type FunnelStage = 'novo' | 'em_contato' | 'agendado' | 'closer' | 'fechado' | 'perdido' | null;

export const getConversationFunnelStage = (conv: InboxConversation): FunnelStage => {
  if (conv.conversation_type === 'grupo') return null;
  const stage = conv.lead_sales_stage || 'new';

  if (['fechado', 'won', 'customer'].includes(stage)) return 'fechado';
  if (['perdido', 'lost'].includes(stage)) return 'perdido';
  if (['negotiation', 'negociacao', 'no_show'].includes(stage) || (conv.had_meeting && stage !== 'agendamento')) return 'closer';
  if (stage === 'agendamento') return 'agendado';
  if (['new', 'captura', 'qualificacao'].includes(stage) && conv.lead_reply_count > 0) return 'em_contato';
  if (['new', 'captura'].includes(stage) && conv.lead_reply_count === 0) return 'novo';
  return null;
};

// Helper: cor do Health
export const getHealthColor = (status: string): string => {
  switch (status) {
    case "risk":
      return "text-red-600";
    case "alert":
      return "text-amber-600";
    case "healthy":
      return "text-green-600";
    default:
      return "text-gray-400";
  }
};
