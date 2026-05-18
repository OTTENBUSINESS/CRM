import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

export interface SuggestedTask {
  titulo: string;
  descricao: string;
  prioridade: 'high' | 'medium' | 'low';
  prazo_sugerido: 'hoje' | 'amanha' | 'esta_semana' | 'proxima_semana';
  // Data/hora específica extraída da conversa (ISO string ou formato "YYYY-MM-DD HH:mm")
  data_hora_especifica?: string;
  selected?: boolean;
}

export interface ExtractedData {
  empresa?: string;
  cargo?: string;
  necessidade?: string;
  orcamento?: string;
  timeline?: string;
  decisor?: string;
  concorrentes?: string;
}

export interface SalesCallAnalysis {
  // Campos essenciais (quick + deep)
  diagnostico: string;
  pontos_chave: string[];
  riscos: string[];
  proximo_passo: string;
  sentimento: 'positive' | 'neutral' | 'negative';
  tarefas_sugeridas: SuggestedTask[];
  dados_extraidos: ExtractedData;
  score_adjustment: number;

  // Campos deep (opcionais — só presentes na análise aprofundada)
  perfil_lead?: string;
  negociacao?: { desfecho: string; detalhes?: string };
  pontos_fortes_vendedor?: string[];
  veredicto?: { probabilidade: number; justificativa: string };
  recomendacao_estrategica?: string;
  analysis_depth?: 'quick' | 'deep';
}

export type AnalysisDepth = 'quick' | 'deep';

interface UseAnalyzeSalesCallReturn {
  isAnalyzing: boolean;
  analysis: SalesCallAnalysis | null;
  error: string | null;
  analyze: (params: {
    callId: string;
    transcription: string | any[];
    leadId?: string;
    leadName?: string;
    teamMemberId?: string;
    meetingId?: string;
    activityId?: string;
    depth?: AnalysisDepth;
  }) => Promise<SalesCallAnalysis | null>;
  reset: () => void;
}

// Chama edge function usando supabase.functions.invoke() oficial.
// O cliente oficial cuida do JWT automaticamente (sempre usa access_token atual,
// faz refresh quando expirado, não tem bug de fallback pra anon key).
// Mantém retry pra erros transientes (502, 503, Failed to fetch).
async function invokeEdgeFunction(fnName: string, body: Record<string, any>, maxRetries = 2): Promise<any> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AnalyzeSalesCall] 📡 Chamando ${fnName} (tentativa ${attempt}/${maxRetries})...`);

      const { data, error } = await supabase.functions.invoke(fnName, { body });

      if (error) {
        // FunctionsHttpError tem context.response com status
        const status = (error as any)?.context?.response?.status;
        const isTransient = status === 502 || status === 503 || error.message?.includes('Failed to fetch');

        if (isTransient && attempt < maxRetries) {
          console.warn(`[AnalyzeSalesCall] ⚠️ erro transiente (${status || error.message}) na tentativa ${attempt}, retrying em 3s...`);
          await new Promise(r => setTimeout(r, 3000));
          lastError = new Error(error.message);
          continue;
        }

        throw new Error(`Erro na análise${status ? ` (${status})` : ''}: ${error.message}`);
      }

      return data;
    } catch (err: any) {
      lastError = err;

      // Network errors fora do invoke (muito raro) — retry
      if (err.message?.includes('Failed to fetch') && attempt < maxRetries) {
        console.warn(`[AnalyzeSalesCall] ⚠️ Failed to fetch na tentativa ${attempt}, retrying em 3s...`);
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      // Se for o último attempt ou erro não-transiente, sai do loop
      if (attempt >= maxRetries) break;
    }
  }

  throw lastError || new Error('Erro desconhecido ao chamar edge function');
}

export function useAnalyzeSalesCall(): UseAnalyzeSalesCallReturn {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<SalesCallAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (params: {
    callId: string;
    transcription: string | any[];
    leadId?: string;
    leadName?: string;
    teamMemberId?: string;
    meetingId?: string;
    activityId?: string;
    depth?: AnalysisDepth;
    meetingType?: string; // cs_meeting, sales_call, onboarding, internal
  }): Promise<SalesCallAnalysis | null> => {
    setIsAnalyzing(true);
    setError(null);

    try {
      // Usar fetch direto (não supabase.functions.invoke) — mais resiliente a token issues
      const data = await invokeEdgeFunction('analyze-sales-call', {
        call_id: params.callId,
        transcription: params.transcription,
        lead_id: params.leadId,
        lead_name: params.leadName,
        team_member_id: params.teamMemberId,
        meeting_id: params.meetingId,
        depth: params.depth || 'quick',
        meeting_type: params.meetingType,
      });

      if (!data?.success || !data?.analysis) {
        throw new Error(data?.error || 'Análise não retornou dados');
      }

      const analysisWithSelection: SalesCallAnalysis = {
        ...data.analysis,
        tarefas_sugeridas: (data.analysis.tarefas_sugeridas || []).map((t: SuggestedTask) => ({
          ...t,
          selected: true,
        })),
      };

      // Se for meeting, salvar análise na tabela meetings (background, não bloqueia)
      if (params.meetingId) {
        supabase
          .from('meetings' as any)
          .update({
            ai_analysis: analysisWithSelection,
            processed_at: new Date().toISOString()
          })
          .eq('id', params.meetingId)
          .then(({ error: saveErr }) => {
            if (saveErr) console.warn('[AnalyzeSalesCall] Save meeting analysis falhou:', saveErr.message);
            else console.log('[AnalyzeSalesCall] ✅ Análise salva no meeting');
          });
      }

      // Automação: marcar tarefa como concluída + lead como call_realizada
      if (params.leadId || params.activityId) {
        (async () => {
          try {
            // 1. Marcar tarefa (company_activity) como concluída
            if (params.activityId) {
              const { error: taskErr } = await supabase
                .from('company_activities')
                .update({
                  completed: true,
                  completed_at: new Date().toISOString(),
                  status: 'completed',
                })
                .eq('id', params.activityId)
                .in('task_type', ['call', 'meeting', 'onboarding']);
              if (taskErr) console.warn('[AnalyzeSalesCall] Erro ao concluir tarefa:', taskErr.message);
              else console.log('[AnalyzeSalesCall] ✅ Tarefa marcada como concluída');
            }

            // 2. Se não tiver activityId mas tiver leadId, buscar tarefa de call/meeting do lead agendada para hoje
            if (!params.activityId && params.leadId) {
              const today = new Date().toISOString().split('T')[0];
              const { data: tasks } = await supabase
                .from('company_activities')
                .select('id')
                .eq('lead_id', params.leadId)
                .in('task_type', ['call', 'meeting'])
                .eq('completed', false)
                .gte('scheduled_at', today + 'T00:00:00')
                .lte('scheduled_at', today + 'T23:59:59')
                .order('scheduled_at', { ascending: true })
                .limit(1);

              if (tasks && tasks.length > 0) {
                await supabase
                  .from('company_activities')
                  .update({
                    completed: true,
                    completed_at: new Date().toISOString(),
                    status: 'completed',
                  })
                  .eq('id', tasks[0].id);
                console.log('[AnalyzeSalesCall] ✅ Tarefa do lead concluída (fallback por data)');
              }
            }

            // 3. Atualizar sales_stage do lead para 'call_realizada' (se estiver em etapa anterior)
            if (params.leadId) {
              const stagesBeforeCall = ['novo', 'em_contato', 'qualificado', 'call_agendada', 'no_show'];
              const { error: leadErr } = await supabase
                .from('leads')
                .update({ sales_stage: 'call_realizada' })
                .eq('id', params.leadId)
                .in('sales_stage', stagesBeforeCall);
              if (leadErr) console.warn('[AnalyzeSalesCall] Erro ao atualizar sales_stage:', leadErr.message);
              else console.log('[AnalyzeSalesCall] ✅ Lead atualizado para call_realizada');
            }
          } catch (autoErr) {
            console.error('[AnalyzeSalesCall] Erro na automação pós-análise:', autoErr);
          }
        })();
      }

      setAnalysis(analysisWithSelection);
      console.log(`[AnalyzeSalesCall] ✅ Análise concluída (${params.depth || 'quick'})`);
      return analysisWithSelection;
    } catch (err: any) {
      console.error('[useAnalyzeSalesCall] Erro:', err);
      const errorMsg = err.message || 'Erro ao analisar chamada';
      setError(errorMsg);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setAnalysis(null);
    setError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    isAnalyzing,
    analysis,
    error,
    analyze,
    reset,
  };
}
