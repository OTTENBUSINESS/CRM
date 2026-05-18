import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { usePlaybookContent } from '@/hooks/useSalesPlaybook';
import { supabase } from '@/lib/supabase';

// Helper para chamar Edge Functions via supabase.functions.invoke
async function callEdgeFunction<T>(functionName: string, body: Record<string, any>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  });

  if (error) {
    throw error;
  }

  return data as T;
}

// ==================== TYPES ====================

export interface LeadScoreResult {
  success: boolean;
  lead_id: string;
  score: number;
  reason: string;
  factors: {
    engagement: number;
    intent: number;
    profile: number;
    timing: number;
  };
  bant: {
    budget: boolean;
    authority: boolean;
    need: boolean;
    timeline: boolean;
  };
}

export interface ConversationAnalysis {
  success: boolean;
  lead_id: string;
  messages_analyzed: number;
  analysis: {
    sentiment: 'positive' | 'neutral' | 'negative';
    interest_level: 'high' | 'medium' | 'low';
    objections: string[];
    interests: string[];
    questions_unanswered: string[];
    products_mentioned: string[];
    urgency_detected: boolean;
    key_insights: string[];
    recommended_action: string;
    summary: string;
  };
}

export interface GeneratedMessage {
  success: boolean;
  lead_id: string;
  message_type: string;
  message: string;
  tone: string;
  call_to_action: string;
  best_send_time: string;
  alternative_messages: string[];
}

export interface ProposalSuggestion {
  success: boolean;
  lead_id: string;
  proposal: {
    recommended_product: {
      id: string;
      name: string;
      original_price: number;
    };
    suggested_price: number;
    discount_percent: number;
    discount_reason: string;
    payment_suggestion: {
      method: string;
      installments: number;
      installment_value: number;
    };
    closing_arguments: string[];
    urgency_tactics: string[];
    bonus_suggestions: string[];
    win_probability: number;
    reasoning: string;
  };
}

// ==================== HOOKS ====================

/**
 * Hook para calcular o Lead Score usando IA
 * Analisa TODOS os dados disponíveis: conversas, timeline, transações, checkouts, deals, Instagram
 */
export function useCalculateLeadScore() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();

  return useMutation({
    mutationFn: async (leadId: string) => {
      return callEdgeFunction<LeadScoreResult>('calculate-lead-score', {
        lead_id: leadId,
        playbook_context: playbookContent || undefined,
      });
    },
    onSuccess: (data) => {
      // Invalida queries relacionadas ao lead
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.lead_id] });
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      queryClient.invalidateQueries({ queryKey: ['hot-leads'] });

      toast({
        title: 'Score calculado!',
        description: `Score: ${data.score}/100 - ${data.reason.substring(0, 100)}...`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao calcular score',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para analisar conversas do lead usando IA
 * Identifica: sentimento, objeções, interesses, urgência, ações recomendadas
 */
export function useAnalyzeConversation() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();

  return useMutation({
    mutationFn: async ({ leadId, messageLimit = 50 }: { leadId: string; messageLimit?: number }) => {
      return callEdgeFunction<ConversationAnalysis>('analyze-conversation', {
        lead_id: leadId,
        message_limit: messageLimit,
        playbook_context: playbookContent || undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.lead_id] });

      toast({
        title: 'Análise concluída!',
        description: `${data.messages_analyzed} mensagens analisadas`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro na análise',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para gerar mensagens de vendas personalizadas
 * Tipos: first_contact, follow_up, objection_handling, proposal, reengagement
 */
export function useGenerateSalesMessage() {
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();

  return useMutation({
    mutationFn: async ({
      leadId,
      messageType,
      customContext,
    }: {
      leadId: string;
      messageType: 'first_contact' | 'follow_up' | 'objection_handling' | 'proposal' | 'reengagement';
      customContext?: string;
    }) => {
      return callEdgeFunction<GeneratedMessage>('generate-sales-message', {
        lead_id: leadId,
        message_type: messageType,
        custom_context: customContext,
        playbook_context: playbookContent || undefined,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Mensagem gerada!',
        description: 'Copie e personalize antes de enviar',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao gerar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para sugerir proposta comercial inteligente
 * Considera: score, BANT, conversas, benchmark de conversão, produtos
 */
export function useSuggestProposal() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: playbookContent } = usePlaybookContent();

  return useMutation({
    mutationFn: async ({
      leadId,
      productId,
    }: {
      leadId: string;
      productId?: string;
    }) => {
      return callEdgeFunction<ProposalSuggestion>('suggest-proposal', {
        lead_id: leadId,
        product_id: productId,
        playbook_context: playbookContent || undefined,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sales-lead', data.lead_id] });

      toast({
        title: 'Proposta sugerida!',
        description: `${data.proposal.win_probability}% de chance de conversão`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao sugerir proposta',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}

/**
 * Hook para recalcular score e atualizar insights de um lead
 * Combina calculate-lead-score + analyze-conversation
 */
export function useRefreshLeadAI() {
  const calculateScore = useCalculateLeadScore();
  const analyzeConversation = useAnalyzeConversation();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (leadId: string) => {
      // Executa ambas análises em paralelo
      const [scoreResult, analysisResult] = await Promise.all([
        calculateScore.mutateAsync(leadId),
        analyzeConversation.mutateAsync({ leadId }),
      ]);

      return {
        score: scoreResult,
        analysis: analysisResult,
      };
    },
    onSuccess: () => {
      toast({
        title: 'Lead atualizado!',
        description: 'Score e insights atualizados com sucesso',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Erro ao atualizar lead',
        description: error.message,
        variant: 'destructive',
      });
    },
  });
}
