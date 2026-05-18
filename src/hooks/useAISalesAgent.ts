import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from "@/lib/undoable-delete";

// ==================== TYPES ====================

export interface AIAgentSettings {
  // === Horario de Trabalho ===
  working_hours_start: string;        // HH:MM (ex: "08:00")
  working_hours_end: string;          // HH:MM (ex: "20:00")
  working_days: number[];             // 0=Dom, 1=Seg, ..., 6=Sab

  // === Comportamento de Resposta ===
  debounce_seconds: number;           // Tempo de espera apos ultima msg antes de responder
  response_delay_min_ms: number;      // Delay minimo antes de responder (ms)
  response_delay_max_ms: number;      // Delay maximo antes de responder (ms)
  typing_speed_cpm: number;           // Caracteres por minuto (simulacao de digitacao)

  // === Quebra de Mensagens ===
  message_split_max_length: number;   // Tamanho maximo para quebrar mensagens (default: 200)
  delay_between_messages_min_ms: number; // Delay minimo entre msgs quebradas (default: 500)
  delay_between_messages_max_ms: number; // Delay maximo entre msgs quebradas (default: 1500)

  // === Limites de Contexto (enviado para IA) ===
  context_messages_limit: number;     // Quantas msgs do WhatsApp incluir no contexto (default: 20)
  context_deals_limit: number;        // Quantos deals incluir no contexto (default: 5)
  context_products_limit: number;     // Quantos produtos incluir no contexto (default: 10)
  context_tasks_limit: number;        // Quantas tarefas incluir no contexto (default: 5)
  context_notes_limit: number;        // Quantas notas incluir no contexto (default: 5)
  conversation_history_limit: number; // Historico de conversa enviado para OpenAI (default: 20)

  // === Limites de Conversa ===
  max_messages_per_conversation: number; // Maximo de msgs antes de encerrar conversa
  auto_pause_after_human_reply: boolean; // Pausar quando humano responder

  // === Processamento ===
  lock_duration_seconds: number;      // Duracao do lock para evitar processamento duplicado (default: 30)
  max_retry_attempts: number;         // Tentativas maximas em caso de erro (default: 3)
  queue_batch_size: number;           // Itens processados por vez na fila (default: 10)

  // === Mensagens Padrao ===
  fallback_message: string;           // Mensagem quando IA nao retorna nada

  // === Agenda ===
  meeting_duration_minutes: number;       // Duração padrão de reuniões em minutos (ex: 45)

  // === Cadencia ===
  cadence_silence_timeout_minutes: number; // Tempo de silencio para reativar cadencia (0 = desativado)
  cadence_reactivation_map: Record<string, string>; // Mapa de estagios terminais -> estagio destino (ex: {"Perdido": "Em Contato"})
}

// Valores default para settings
export const DEFAULT_AGENT_SETTINGS: AIAgentSettings = {
  // Horario
  working_hours_start: '08:00',
  working_hours_end: '20:00',
  working_days: [1, 2, 3, 4, 5, 6], // Seg-Sab

  // Comportamento
  debounce_seconds: 3,
  response_delay_min_ms: 2000,
  response_delay_max_ms: 5000,
  typing_speed_cpm: 300,

  // Quebra de mensagens
  message_split_max_length: 200,
  delay_between_messages_min_ms: 500,
  delay_between_messages_max_ms: 1500,

  // Contexto
  context_messages_limit: 20,
  context_deals_limit: 5,
  context_products_limit: 10,
  context_tasks_limit: 5,
  context_notes_limit: 5,
  conversation_history_limit: 20,

  // Conversa
  max_messages_per_conversation: 50,
  auto_pause_after_human_reply: true,

  // Processamento
  lock_duration_seconds: 30,
  max_retry_attempts: 3,
  queue_batch_size: 10,

  // Mensagens
  fallback_message: 'Desculpe, nao entendi. Pode repetir?',

  // Agenda
  meeting_duration_minutes: 45,

  // Cadencia
  cadence_silence_timeout_minutes: 120,
  cadence_reactivation_map: {},
};

export interface AISalesAgent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  personality_traits: string[];
  target_stages: string[];
  settings: AIAgentSettings;
  cadence_steps: CadenceConfig;
  model: string;
  temperature: number;
  max_tokens: number;
  is_active: boolean;
  instance_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AIAgentTool {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  parameters: Record<string, any>;
  action_type: string;
  action_config: Record<string, any>;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIAgentConversation {
  id: string;
  lead_id: string;
  agent_id: string;
  status: 'active' | 'paused_by_human' | 'paused_by_schedule' | 'completed' | 'transferred';
  messages_history: any[];
  total_messages_sent: number;
  total_messages_received: number;
  paused_by: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  last_processed_at: string | null;
  created_at: string;
  updated_at: string;
  agent?: AISalesAgent;
}

export interface AIAgentLog {
  id: string;
  conversation_id: string;
  lead_id: string;
  agent_id: string;
  log_type: 'message_received' | 'message_sent' | 'tool_called' | 'tool_result' | 'error' | 'paused' | 'resumed' | 'transferred';
  data: Record<string, any>;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string;
}

// ==================== CADENCE TYPES ====================

export interface CadenceStepPostAction {
  type: 'move_stage' | 'create_task' | 'notify_human';
  target_stage?: string;
  task_title?: string;
}

export interface CadenceStep {
  step_order: number;
  action_type: 'text' | 'ai_message' | 'ai_media' | 'image' | 'video' | 'audio' | 'webhook';
  content: string;
  caption?: string;
  delay_minutes: number;
  only_if_no_reply: boolean;
  post_action?: CadenceStepPostAction;
}

export type CadenceConfig = Record<string, CadenceStep[]>;

export interface CadenceEnrollment {
  id: string;
  lead_id: string;
  agent_id: string;
  stage: string;
  current_step: number;
  status: 'active' | 'paused' | 'completed' | 'replied' | 'cancelled';
  next_action_at: string | null;
  enrolled_at: string;
  last_step_at: string | null;
  completed_at: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  lead?: { name: string; phone: string };
}

export interface AIAgentStatusForLead {
  has_agent: boolean;
  agent_name: string | null;
  conversation_status: string | null;
  messages_sent: number | null;
  last_processed_at: string | null;
  is_paused: boolean;
  paused_by_name: string | null;
  pause_reason: string | null;
}

// ==================== HOOKS ====================

/**
 * Hook para listar todos os agentes
 */
export function useAIAgents() {
  return useQuery({
    queryKey: ['ai-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ai_sales_agents')
        .select('*, instance:whatsapp_instances(name, status), pipeline:sales_pipelines!ai_sales_agents_pipeline_id_fkey(name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((a: any) => ({
        ...a,
        instance_name: a.instance?.name || null,
        instance_status: a.instance?.status || null,
        pipeline_name: a.pipeline?.name || null,
      })) as AISalesAgent[];
    },
  });
}

/**
 * Hook para buscar um agente específico
 */
export function useAIAgent(agentId: string | null) {
  return useQuery({
    queryKey: ['ai-agent', agentId],
    queryFn: async () => {
      if (!agentId) return null;

      const { data, error } = await supabase
        .from('ai_sales_agents')
        .select('*')
        .eq('id', agentId)
        .single();

      if (error) throw error;
      return data as AISalesAgent;
    },
    enabled: !!agentId,
  });
}

/**
 * Hook para buscar tools de um agente
 */
export function useAIAgentTools(agentId: string | null) {
  return useQuery({
    queryKey: ['ai-agent-tools', agentId],
    queryFn: async () => {
      if (!agentId) return [];

      const { data, error } = await supabase
        .from('ai_agent_tools')
        .select('*')
        .eq('agent_id', agentId)
        .order('priority', { ascending: true });

      if (error) throw error;
      return data as AIAgentTool[];
    },
    enabled: !!agentId,
  });
}

/**
 * Hook para criar/atualizar agente
 */
export function useSaveAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (agent: Partial<AISalesAgent> & { id?: string }) => {
      if (agent.id) {
        const { data, error } = await supabase
          .from('ai_sales_agents')
          .update(agent)
          .eq('id', agent.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('ai_sales_agents')
          .insert(agent)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });
}

/**
 * Hook para salvar tool
 */
export function useSaveAIAgentTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (tool: Partial<AIAgentTool> & { id?: string }) => {
      if (tool.id) {
        const { data, error } = await supabase
          .from('ai_agent_tools')
          .update(tool)
          .eq('id', tool.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('ai_agent_tools')
          .insert(tool)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-tools', variables.agent_id] });
    },
  });
}

/**
 * Hook para deletar tool
 */
export function useDeleteAIAgentTool() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ toolId, agentId }: { toolId: string; agentId: string }) => {
      await deleteWithUndo({
        table: 'ai_agent_tools',
        id: toolId,
        label: 'Ferramenta IA',
        queryClient,
        queryKeys: [['ai-agent-tools', agentId]],
      });
      return { toolId, agentId };
    },
  });
}

/**
 * Hook para buscar status do agente para um lead
 */
export function useAIAgentStatusForLead(leadId: string | null) {
  return useQuery({
    queryKey: ['ai-agent-status', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .rpc('get_ai_agent_status_for_lead', { p_lead_id: leadId });

      if (error) throw error;
      return (data?.[0] || null) as AIAgentStatusForLead | null;
    },
    enabled: !!leadId,
    refetchInterval: 30000, // Atualiza a cada 30s
  });
}

/**
 * Hook para buscar conversa do agente com um lead
 */
export function useAIAgentConversation(leadId: string | null) {
  return useQuery({
    queryKey: ['ai-agent-conversation', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from('ai_agent_conversations')
        .select('*, agent:ai_sales_agents(*)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // Ignora "not found"
      return data as AIAgentConversation | null;
    },
    enabled: !!leadId,
  });
}

/**
 * Hook para buscar logs do agente
 */
export function useAIAgentLogs(conversationId: string | null, limit: number = 50) {
  return useQuery({
    queryKey: ['ai-agent-logs', conversationId, limit],
    queryFn: async () => {
      if (!conversationId) return [];

      const { data, error } = await supabase
        .from('ai_agent_logs')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as AIAgentLog[];
    },
    enabled: !!conversationId,
  });
}

/**
 * Hook para pausar/retomar conversa do agente
 */
export function useToggleAIAgentConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      pause,
      reason,
    }: {
      leadId: string;
      pause: boolean;
      reason?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const response = await supabase.functions.invoke('ai-sales-agent', {
        body: {
          action: 'toggle_conversation',
          lead_id: leadId,
          pause,
          paused_by: user?.id,
          reason,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-agent-status', variables.leadId] });
      queryClient.invalidateQueries({ queryKey: ['ai-agent-conversation', variables.leadId] });
    },
  });
}

/**
 * Hook para ativar/desativar agente globalmente
 */
export function useToggleAIAgent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ agentId, isActive }: { agentId: string; isActive: boolean }) => {
      const { data, error } = await supabase
        .from('ai_sales_agents')
        .update({ is_active: isActive })
        .eq('id', agentId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-agents'] });
    },
  });
}

/**
 * Hook para dashboard do agente
 */
export function useAIAgentDashboard() {
  return useQuery({
    queryKey: ['ai-agent-dashboard'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_ai_agent_dashboard')
        .select('*');

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });
}

/**
 * Hook para testar o agente com uma mensagem
 */
export function useTestAIAgent() {
  return useMutation({
    mutationFn: async ({
      leadId,
      message,
    }: {
      leadId: string;
      message: string;
    }) => {
      const response = await supabase.functions.invoke('ai-sales-agent', {
        body: {
          action: 'process_direct',
          lead_id: leadId,
          message_content: message,
        },
      });

      if (response.error) throw response.error;
      return response.data;
    },
  });
}

// ==================== CADENCE HOOKS ====================

/**
 * Hook para listar enrollments de um agente (com dados do lead)
 */
export function useCadenceEnrollments(agentId: string | null) {
  return useQuery({
    queryKey: ['cadence-enrollments', agentId],
    queryFn: async () => {
      if (!agentId) return [];

      const { data, error } = await supabase
        .from('ai_agent_cadence_enrollments')
        .select('*, lead:leads(name, phone)')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as CadenceEnrollment[];
    },
    enabled: !!agentId,
    refetchInterval: 30000,
  });
}

/**
 * Hook para cancelar um enrollment
 */
export function useCancelCadenceEnrollment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ enrollmentId, agentId }: { enrollmentId: string; agentId: string }) => {
      const { data, error } = await supabase
        .from('ai_agent_cadence_enrollments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', enrollmentId)
        .select()
        .single();

      if (error) throw error;
      return { data, agentId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cadence-enrollments', variables.agentId] });
    },
  });
}

/**
 * Hook para inscrever lead manualmente em uma cadência
 */
export function useEnrollLeadInCadence() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      leadId,
      agentId,
      stage,
    }: {
      leadId: string;
      agentId: string;
      stage: string;
    }) => {
      // Buscar cadence_steps do agente para calcular next_action_at
      const { data: agent, error: agentError } = await supabase
        .from('ai_sales_agents')
        .select('cadence_steps')
        .eq('id', agentId)
        .single();

      if (agentError) throw agentError;

      const steps = (agent?.cadence_steps as CadenceConfig)?.[stage];
      if (!steps || steps.length === 0) {
        throw new Error('Nenhum passo configurado para este estágio');
      }

      const firstDelay = steps[0]?.delay_minutes || 0;
      const nextActionAt = new Date(Date.now() + firstDelay * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('ai_agent_cadence_enrollments')
        .upsert(
          {
            lead_id: leadId,
            agent_id: agentId,
            stage,
            current_step: 0,
            status: 'active',
            next_action_at: nextActionAt,
            enrolled_at: new Date().toISOString(),
            last_step_at: null,
            completed_at: null,
          },
          { onConflict: 'lead_id,agent_id,stage' }
        )
        .select()
        .single();

      if (error) throw error;
      return { data, agentId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['cadence-enrollments', variables.agentId] });
    },
  });
}
