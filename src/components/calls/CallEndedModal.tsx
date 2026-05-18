import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  Clock,
  Sparkles,
  ListTodo,
  Loader2,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Mic,
  User,
  Plus,
  Check,
  RefreshCw,
  Settings2,
  Calendar,
  ExternalLink,
  Copy,
  ClipboardCheck,
  BookOpen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

import { useCall, formatCallDuration } from "@/contexts/CallContext";
import { useCallRecord } from "@/hooks/useWavoip";
import { useAnalyzeSalesCall, SuggestedTask, SalesCallAnalysis, AnalysisDepth } from "@/hooks/useAnalyzeSalesCall";
import { CallAnalysisView } from "./CallAnalysisView";
import { useAnalysisTemplates } from "@/hooks/useAnalysisTemplates";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { cn } from "@/lib/utils";
import type { TranscriptionSegment } from "@/hooks/useCallTranscription";
import { PostCallNextSteps } from "./PostCallNextSteps";
import { CallRating } from "./CallRating";
import { SaveToTrainingModal } from "@/components/sales/training/SaveToTrainingModal";

// Helper para inferir task_type
function inferTaskType(titulo: string, descricao?: string): 'call' | 'meeting' | 'whatsapp' | 'email' | 'follow_up' {
  const text = `${titulo} ${descricao || ''}`.toLowerCase();
  if (text.includes('ligar') || text.includes('ligação') || text.includes('telefonar') || text.includes('call')) return 'call';
  if (text.includes('reunião') || text.includes('reuniao') || text.includes('meeting') || text.includes('demo')) return 'meeting';
  if (text.includes('whatsapp') || text.includes('mensagem') || text.includes('zap')) return 'whatsapp';
  if (text.includes('email') || text.includes('e-mail') || text.includes('enviar')) return 'email';
  return 'follow_up';
}

// Helper para calcular prazo
function getPrazoDueDate(prazo: string): string {
  const now = new Date();
  const dueDate = new Date();

  switch (prazo) {
    case "imediato":
    case "hoje":
      // Tarefas imediatas/hoje: 30 minutos a partir de agora
      dueDate.setMinutes(now.getMinutes() + 30);
      break;
    case "amanha":
      dueDate.setDate(now.getDate() + 1);
      dueDate.setHours(10, 0, 0, 0);
      break;
    case "esta_semana":
      const daysUntilFriday = 5 - now.getDay();
      dueDate.setDate(now.getDate() + (daysUntilFriday > 0 ? daysUntilFriday : 7));
      dueDate.setHours(10, 0, 0, 0);
      break;
    case "proxima_semana":
      dueDate.setDate(now.getDate() + 7 + (1 - now.getDay())); // Próxima segunda
      dueDate.setHours(10, 0, 0, 0);
      break;
    default:
      // Default: 30 minutos a partir de agora (tarefas pós-chamada são urgentes)
      dueDate.setMinutes(now.getMinutes() + 30);
  }

  return dueDate.toISOString();
}

// Props para reutilização com meetings
interface CallEndedModalProps {
  // Props externas (para meetings)
  externalData?: {
    callId: string;
    duration: number;
    direction?: 'INCOMING' | 'OUTGOING';
    peerPhone?: string;
    peerName?: string;
    leadId?: string;
    activityId?: string; // Para meetings
    meetingType?: string; // cs_meeting, sales_call, onboarding, internal
    transcriptions?: TranscriptionSegment[];
    // Análise já salva (para evitar reprocessar)
    savedAnalysis?: any;
  };
  externalOpen?: boolean;
  onExternalClose?: () => void;
}

export function CallEndedModal({ externalData, externalOpen, onExternalClose }: CallEndedModalProps = {}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const {
    callEndedResult: contextCallEndedResult,
    showCallEndedModal: contextShowModal,
    setShowCallEndedModal: contextSetShowModal,
  } = useCall();

  // Usar dados externos se fornecidos, senão usar do contexto
  const callEndedResult = externalData || contextCallEndedResult;
  const showCallEndedModal = externalOpen !== undefined ? externalOpen : contextShowModal;
  const setShowCallEndedModal = onExternalClose 
    ? (show: boolean) => { if (!show) onExternalClose(); }
    : contextSetShowModal;

  // UI State
  const [showTranscription, setShowTranscription] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [copiedTranscription, setCopiedTranscription] = useState(false);

  // Training
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  // Task State
  const [tasks, setTasks] = useState<(SuggestedTask & { created: boolean })[]>([]);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [taskToCreate, setTaskToCreate] = useState<{
    name: string;
    description?: string;
    task_type: 'call' | 'meeting' | 'whatsapp' | 'email' | 'follow_up';
    due_datetime?: string;
  } | null>(null);

  // Hooks - só buscar callRecord se NÃO for dados externos (meetings não têm call_history)
  const isExternalData = !!externalData;
  const { data: callRecord, refetch: refetchCallRecord } = useCallRecord(
    !isExternalData && showCallEndedModal && callEndedResult?.callId ? callEndedResult.callId : undefined
  );
  const { analyze, isAnalyzing, analysis, error: analyzeError, reset: resetAnalysis } = useAnalyzeSalesCall();
  const { data: templates = [] } = useAnalysisTemplates('call_analysis');

  // Reset state quando modal abre para uma NOVA call/meeting (não quando leadId é resolvido)
  const callIdForReset = callEndedResult?.callId;
  useEffect(() => {
    if (showCallEndedModal && callIdForReset) {
      resetAnalysis();
      setTasks([]);
      setShowTranscription(false);
      setShowAdvanced(false);
      setSelectedTemplateId("default");
      setShowCreateTaskModal(false);
      setTaskToCreate(null);
    }
  }, [showCallEndedModal, callIdForReset, resetAnalysis]);

  // Iniciar análise automaticamente quando temos transcrição
  // OU usar análise já salva se disponível
  // IMPORTANTE: usar callEndedResultRef para evitar re-trigger quando leadId é resolvido em background
  const callEndedResultRef = useRef(callEndedResult);
  callEndedResultRef.current = callEndedResult;

  useEffect(() => {
    console.log(`[CallEndedModal] useEffect — open: ${showCallEndedModal}, hasCallId: ${!!callIdForReset}, isExternal: ${isExternalData}`);

    if (!showCallEndedModal || !callIdForReset) return;

    const currentResult = callEndedResultRef.current;
    if (!currentResult) return;

    // Se já tem análise salva (externalData.savedAnalysis), não reprocessar
    if (externalData?.savedAnalysis) {
      console.log(`[CallEndedModal] ⏭️ savedAnalysis já existe, skip`);
      return;
    }

    const transcriptions = currentResult.transcriptions || [];
    const finalTranscriptions = transcriptions.filter((t: TranscriptionSegment) => t.is_final);
    console.log(`[CallEndedModal] 📊 Transcriptions: ${transcriptions.length} total, ${finalTranscriptions.length} finais`);

    if (analysis) {
      console.log(`[CallEndedModal] ⏭️ analysis já existe, skip`);
      return;
    }
    if (callRecord?.ai_summary) {
      console.log(`[CallEndedModal] ⏭️ callRecord.ai_summary já existe, skip`);
      return;
    }

    console.log(`[CallEndedModal] 🔍 Conditions: finalLen=${finalTranscriptions.length}, isAnalyzing=${isAnalyzing}, analyzeError=${analyzeError}`);

    if (finalTranscriptions.length > 0 && !isAnalyzing && !analyzeError) {
      console.log(`[CallEndedModal] 🚀 Chamando analyze()...`);
      analyze({
        callId: currentResult.callId,
        transcription: finalTranscriptions,
        leadId: currentResult.leadId,
        leadName: currentResult.peerName,
        // Se for meeting (externalData), passar meetingId para salvar análise na tabela meetings
        meetingId: isExternalData ? currentResult.callId : undefined,
        activityId: currentResult.activityId,
        meetingType: externalData?.meetingType,
      }).then((result) => {
        console.log(`[CallEndedModal] ✅ analyze() retornou:`, result ? 'success' : 'null');
        if (result) {
          setTimeout(() => refetchCallRecord(), 500);
        }
      }).catch((err) => {
        console.error(`[CallEndedModal] ❌ analyze() falhou:`, err);
      });
    } else {
      console.log(`[CallEndedModal] ⚠️ Condições NÃO atendidas para análise`);
      // Se falhou antes e temos transcrições, limpar erro para permitir retry automático
      if (analyzeError && finalTranscriptions.length > 0 && !isAnalyzing) {
        console.log(`[CallEndedModal] 🔄 Limpando analyzeError para retry automático`);
        resetAnalysis();
      }
    }
  }, [showCallEndedModal, callIdForReset, callRecord?.ai_summary, analysis, isAnalyzing, analyzeError, analyze, resetAnalysis, refetchCallRecord, externalData?.savedAnalysis, isExternalData]);

  // Carregar tarefas já criadas do metadata
  const createdSuggestedTasks: string[] = callRecord?.metadata?.created_suggested_tasks || [];

  // Atualizar tasks locais quando análise completa
  useEffect(() => {
    if (analysis?.tarefas_sugeridas) {
      setTasks(analysis.tarefas_sugeridas.map(t => ({
        ...t,
        // Marcar como criada se o título está na lista de tarefas já criadas
        created: createdSuggestedTasks.includes(t.titulo)
      })));
    }
  }, [analysis, callRecord?.id]);

  // Função para salvar tarefa criada no metadata do call_history
  const markTaskAsCreated = useCallback(async (taskTitle: string) => {
    const callId = callEndedResult?.callId || callRecord?.id;
    if (!callId) return;

    try {
      const currentMetadata = callRecord?.metadata || {};
      const currentCreatedTasks = currentMetadata.created_suggested_tasks || [];

      // Evitar duplicatas
      if (currentCreatedTasks.includes(taskTitle)) {
        // Apenas atualizar estado local
        setTasks(prev => prev.map(t =>
          t.titulo === taskTitle ? { ...t, created: true } : t
        ));
        return;
      }

      const updatedCreatedTasks = [...currentCreatedTasks, taskTitle];

      await supabase
        .from('call_history')
        .update({
          metadata: {
            ...currentMetadata,
            created_suggested_tasks: updatedCreatedTasks
          }
        })
        .eq('id', callId);

      // Atualizar estado local
      setTasks(prev => prev.map(t =>
        t.titulo === taskTitle ? { ...t, created: true } : t
      ));

      // Invalidar cache
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record', callId] });

      // Refetch do callRecord
      refetchCallRecord();
    } catch (error) {
      console.error('[CallEndedModal] Erro ao marcar tarefa como criada:', error);
    }
  }, [callEndedResult?.callId, callRecord?.id, callRecord?.metadata, queryClient, refetchCallRecord]);

  // Abrir modal de criação com tarefa sugerida
  const handleCreateFromSuggestion = useCallback((task: SuggestedTask, index: number) => {
    // Usar data/hora específica se a IA extraiu da conversa, senão usar prazo genérico
    const dueDateTime = task.data_hora_especifica || getPrazoDueDate(task.prazo_sugerido);

    console.log('[CallEndedModal] Criando tarefa:', {
      titulo: task.titulo,
      data_hora_especifica: task.data_hora_especifica,
      prazo_sugerido: task.prazo_sugerido,
      due_datetime_final: dueDateTime,
    });

    setTaskToCreate({
      name: task.titulo,
      description: task.descricao,
      task_type: inferTaskType(task.titulo, task.descricao),
      due_datetime: dueDateTime,
    });
    setShowCreateTaskModal(true);
  }, []);

  // Abrir modal para criar tarefa manual
  const handleCreateManualTask = useCallback(() => {
    setTaskToCreate({
      name: '',
      task_type: 'follow_up',
    });
    setShowCreateTaskModal(true);
  }, []);

  // Reprocessar análise
  const handleReprocess = useCallback(async () => {
    if (!callEndedResult) return;

    const transcriptions = callEndedResult.transcriptions || [];
    const finalTranscriptions = transcriptions.filter((t: TranscriptionSegment) => t.is_final);

    if (finalTranscriptions.length === 0) {
      toast({
        title: "Sem transcrição",
        description: "Não há transcrição disponível para analisar",
        variant: "destructive",
      });
      return;
    }

    resetAnalysis();
    setTasks([]);

    const result = await analyze({
      callId: callEndedResult.callId,
      transcription: finalTranscriptions,
      leadId: callEndedResult.leadId,
      leadName: callEndedResult.peerName,
      activityId: callEndedResult.activityId,
    });

    if (result) {
      toast({
        title: "Análise reprocessada!",
        description: "A chamada foi analisada novamente",
      });
      setTimeout(() => refetchCallRecord(), 500);
    }
  }, [callEndedResult, analyze, resetAnalysis, refetchCallRecord, toast]);

  // Handler para aprofundar análise (deve ficar antes do early return para manter hook order)
  const handleDeepAnalyze = useCallback(async () => {
    if (!callEndedResult) return;

    const transcriptions = callEndedResult.transcriptions || [];
    const finalTrans = transcriptions.filter((t: TranscriptionSegment) => t.is_final);

    if (finalTrans.length === 0) return;

    resetAnalysis();
    setTasks([]);

    const result = await analyze({
      callId: callEndedResult.callId,
      transcription: finalTrans,
      leadId: callEndedResult.leadId,
      leadName: callEndedResult.peerName,
      activityId: callEndedResult.activityId,
      meetingId: isExternalData ? callEndedResult.callId : undefined,
      depth: 'deep',
    });

    if (result) {
      toast({
        title: "Análise aprofundada concluída!",
        description: "Análise completa com IA Pro disponível",
      });
      setTimeout(() => refetchCallRecord(), 500);
    }
  }, [callEndedResult, analyze, resetAnalysis, isExternalData, refetchCallRecord, toast]);

  if (!showCallEndedModal || !callEndedResult) return null;

  // Dados da chamada
  const transcriptions: TranscriptionSegment[] =
    callEndedResult.transcriptions ||
    (callRecord?.transcriptions as TranscriptionSegment[] | undefined) ||
    [];
  const finalTranscriptions = transcriptions.filter(t => t.is_final);
  const isIncoming = callEndedResult.direction === "INCOMING";

  // Normalizar análise - priorizar savedAnalysis (para meetings já processadas)
  const rawAnalysis = externalData?.savedAnalysis || analysis || (callRecord?.metadata as any)?.ai_analysis || null;

  const buildTarefasFromLegacy = (raw: any): SuggestedTask[] => {
    if (Array.isArray(raw.tarefas_sugeridas) && raw.tarefas_sugeridas.length > 0) return raw.tarefas_sugeridas;
    const tarefas: SuggestedTask[] = [];
    if (Array.isArray(raw.proximos_passos) && raw.proximos_passos.length > 0) {
      raw.proximos_passos.forEach((passo: string) => {
        tarefas.push({
          titulo: passo.length > 60 ? passo.substring(0, 60) + '...' : passo,
          descricao: passo,
          prioridade: 'high',
          prazo_sugerido: 'amanha',
        });
      });
    }
    if (Array.isArray(raw.compromissos) && raw.compromissos.length > 0) {
      raw.compromissos.forEach((compromisso: string) => {
        tarefas.push({
          titulo: compromisso.length > 60 ? compromisso.substring(0, 60) + '...' : compromisso,
          descricao: compromisso,
          prioridade: 'medium',
          prazo_sugerido: 'esta_semana',
        });
      });
    }
    return tarefas;
  };

  const currentAnalysis: SalesCallAnalysis | null = rawAnalysis ? {
    diagnostico: rawAnalysis.diagnostico || rawAnalysis.resumo || '',
    pontos_chave: Array.isArray(rawAnalysis.pontos_chave) ? rawAnalysis.pontos_chave : Array.isArray(rawAnalysis.pontos_principais) ? rawAnalysis.pontos_principais : [],
    riscos: Array.isArray(rawAnalysis.riscos) ? rawAnalysis.riscos : Array.isArray(rawAnalysis.objecoes) ? rawAnalysis.objecoes : [],
    proximo_passo: rawAnalysis.proximo_passo || (rawAnalysis.proximos_passos?.[0]) || '',
    sentimento: (['positive', 'negative', 'neutral'].includes(rawAnalysis.sentimento) ? rawAnalysis.sentimento :
                rawAnalysis.sentimento === 'positivo' ? 'positive' :
                rawAnalysis.sentimento === 'negativo' ? 'negative' :
                'neutral') as 'positive' | 'negative' | 'neutral',
    tarefas_sugeridas: buildTarefasFromLegacy(rawAnalysis),
    dados_extraidos: rawAnalysis.dados_extraidos || rawAnalysis.bant_updates || {},
    score_adjustment: rawAnalysis.score_adjustment || 0,
    // Deep fields (opcionais)
    perfil_lead: rawAnalysis.perfil_lead,
    negociacao: rawAnalysis.negociacao,
    pontos_fortes_vendedor: rawAnalysis.pontos_fortes_vendedor,
    veredicto: rawAnalysis.veredicto,
    recomendacao_estrategica: rawAnalysis.recomendacao_estrategica,
    analysis_depth: rawAnalysis.analysis_depth,
  } : null;

  const hasAnalysis = !!currentAnalysis && (currentAnalysis.diagnostico || currentAnalysis.pontos_chave?.length > 0);
  const aiProcessing = isAnalyzing && !hasAnalysis;

  const createdTaskCount = tasks.filter(t => t.created).length;
  const pendingTaskCount = tasks.filter(t => !t.created).length;

  return (
    <>
      <Dialog
        open={showCallEndedModal}
        onOpenChange={(open) => {
          // Se o CreateTaskModal está aberto, ignorar tentativas de fechar
          // (Radix tenta fechar dialogs não-modais quando um modal abre)
          if (!open && showCreateTaskModal) return;
          // Se está analisando com IA, não fechar automaticamente
          if (!open && isAnalyzing) return;
          setShowCallEndedModal(open);
        }}
        modal={false}
      >
        <DialogContent
          className="sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden z-[90]"
          overlayClassName="z-[90]"
          aria-describedby="call-ended-description"
          // Impedir Radix de fechar o dialog por interação externa
          // (o clique no "Finalizar" do dialog anterior dispara onPointerDownOutside)
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Header fixo */}
          <DialogHeader className="px-6 py-4 border-b bg-gradient-to-r from-emerald-50 to-green-50 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-full",
                  isIncoming ? "bg-blue-100" : "bg-emerald-100"
                )}>
                  {isIncoming ? (
                    <PhoneIncoming className="h-5 w-5 text-blue-600" />
                  ) : (
                    <PhoneOutgoing className="h-5 w-5 text-emerald-600" />
                  )}
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold">
                    {callEndedResult.peerName || callEndedResult.peerPhone}
                  </DialogTitle>
                  <DialogDescription id="call-ended-description" className="text-sm text-muted-foreground">
                    {callEndedResult.peerName && callEndedResult.peerPhone}
                    {!callEndedResult.peerName && "Chamada encerrada"}
                  </DialogDescription>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1.5 text-xl font-mono font-semibold text-slate-700">
                  <Clock className="h-5 w-5 text-slate-400" />
                  {formatCallDuration(callEndedResult.duration)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {isIncoming ? "Chamada recebida" : "Chamada realizada"}
                </p>
                {callEndedResult.callId && !isExternalData && (
                  <CallRating callId={callEndedResult.callId} currentRating={callRecord?.rating ?? null} size="sm" showLabel={false} />
                )}
              </div>
            </div>
          </DialogHeader>

          {/* Conteúdo com scroll */}
          <div className="overflow-y-auto max-h-[calc(90vh-180px)] px-6">
            <div className="py-4 space-y-4">

              {/* Status de processamento */}
              {aiProcessing && (
                <div className="flex items-center gap-3 p-4 bg-violet-50 rounded-xl border border-violet-200">
                  <div className="relative">
                    <div className="p-2 bg-violet-100 rounded-lg">
                      <Sparkles className="h-5 w-5 text-violet-600" />
                    </div>
                    <Loader2 className="h-4 w-4 text-violet-600 animate-spin absolute -bottom-1 -right-1 bg-white rounded-full" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-violet-800">Analisando chamada com IA</p>
                    <p className="text-sm text-violet-600">Processando transcrição e gerando insights...</p>
                  </div>
                </div>
              )}

              {/* Erro */}
              {analyzeError && (
                <div className="flex items-center justify-between gap-3 p-4 bg-red-50 rounded-xl border border-red-200">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-red-800">Erro na análise</p>
                      <p className="text-sm text-red-600">{analyzeError}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReprocess} disabled={isAnalyzing}>
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* Análise da IA */}
              {hasAnalysis && currentAnalysis && (
                <div className="space-y-4">
                  <CallAnalysisView
                    analysis={currentAnalysis}
                    onDeepAnalyze={handleDeepAnalyze}
                    isAnalyzing={isAnalyzing}
                    showDeepButton={finalTranscriptions.length > 0}
                  />

                  {/* Próximo Passo do Closer */}
                  {(callEndedResult?.leadId || callRecord?.lead_id) && (
                    <div className="p-3 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200">
                      <PostCallNextSteps
                        callId={callEndedResult?.callId || callRecord?.id || ''}
                        leadId={callEndedResult?.leadId || callRecord?.lead_id || ''}
                        leadName={callEndedResult?.peerName || callRecord?.peer_name}
                      />
                    </div>
                  )}

                  {/* Tarefas Sugeridas */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold flex items-center gap-2 text-slate-800">
                        <ListTodo className="h-4 w-4 text-blue-600" />
                        <span>Tarefas Sugeridas</span>
                        {tasks.length > 0 && (
                          <Badge variant="secondary" className="ml-1 font-normal">
                            {pendingTaskCount} pendente{pendingTaskCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </div>
                      {createdTaskCount > 0 && (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">
                          <Check className="h-3 w-3 mr-1" />
                          {createdTaskCount} criada{createdTaskCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {tasks.length > 0 ? (
                      <div className="space-y-2">
                        {tasks.map((task, index) => (
                          <div
                            key={index}
                            className={cn(
                              "p-3 rounded-xl border transition-all",
                              task.created
                                ? "bg-emerald-50 border-emerald-200"
                                : "bg-white border-slate-200 hover:border-blue-300 hover:shadow-sm"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {task.created ? (
                                  <div className="w-5 h-5 mt-0.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                    <Check className="h-3 w-3 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 mt-0.5 rounded-full border-2 border-slate-300 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "font-medium text-sm",
                                    task.created ? "text-emerald-800" : "text-slate-800"
                                  )}>
                                    {task.titulo}
                                  </p>
                                  {task.descricao && task.descricao !== task.titulo && (
                                    <p className={cn(
                                      "text-xs mt-0.5 line-clamp-2",
                                      task.created ? "text-emerald-600" : "text-slate-500"
                                    )}>
                                      {task.descricao}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] h-5",
                                        task.prioridade === "high" ? "border-red-200 bg-red-50 text-red-700" :
                                        task.prioridade === "medium" ? "border-amber-200 bg-amber-50 text-amber-700" :
                                        "border-slate-200 bg-slate-50 text-slate-600"
                                      )}
                                    >
                                      {task.prioridade === "high" ? "Alta" : task.prioridade === "medium" ? "Média" : "Baixa"}
                                    </Badge>
                                    {task.data_hora_especifica ? (
                                      <Badge variant="outline" className="text-[10px] h-5 border-blue-200 bg-blue-50 text-blue-700">
                                        <Calendar className="h-2.5 w-2.5 mr-1" />
                                        {new Date(task.data_hora_especifica).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] h-5 border-slate-200 bg-slate-50">
                                        <Calendar className="h-2.5 w-2.5 mr-1" />
                                        {task.prazo_sugerido === 'hoje' ? 'Hoje' :
                                         task.prazo_sugerido === 'amanha' ? 'Amanhã' :
                                         task.prazo_sugerido === 'esta_semana' ? 'Esta semana' : 'Próx. semana'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {!task.created && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCreateFromSuggestion(task, index)}
                                  className="h-8 px-3 text-xs shrink-0"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Criar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : !aiProcessing && (
                      <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center">
                        <p className="text-sm text-slate-500">Nenhuma tarefa sugerida pela IA</p>
                      </div>
                    )}

                    {/* Botão adicionar tarefa */}
                    <Button
                      variant="outline"
                      onClick={handleCreateManualTask}
                      className="w-full h-10 border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar tarefa manualmente
                    </Button>
                  </div>
                </div>
              )}

              {/* Sem análise e sem transcrição */}
              {!hasAnalysis && !aiProcessing && !analyzeError && finalTranscriptions.length === 0 && (
                <div className="p-6 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-center">
                  <MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Sem transcrição disponível para análise</p>
                </div>
              )}

              {/* Opções avançadas */}
              {finalTranscriptions.length > 0 && (
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 text-sm text-slate-500 hover:text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Opções avançadas
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-slate-600">Template de Análise</label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                          <SelectTrigger className="h-9 bg-white">
                            <SelectValue placeholder="Selecione um template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Padrão (Análise de Vendas)</SelectItem>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name} {template.is_default && "(Padrão)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReprocess}
                        disabled={isAnalyzing}
                        className="w-full"
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-2", isAnalyzing && "animate-spin")} />
                        {isAnalyzing ? "Processando..." : "Reprocessar análise"}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Transcrição */}
              {finalTranscriptions.length > 0 && (
                <Collapsible open={showTranscription} onOpenChange={setShowTranscription}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
                        <MessageSquare className="h-4 w-4 text-slate-500" />
                        Transcrição da chamada
                        <Badge variant="secondary" className="ml-1 font-normal">
                          {finalTranscriptions.length} mensagens
                        </Badge>
                      </span>
                      {showTranscription ? (
                        <ChevronUp className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 border border-slate-200 rounded-xl overflow-hidden">
                      <div className="flex justify-end px-3 pt-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1.5"
                          onClick={() => {
                            const text = finalTranscriptions
                              .map((s: any) => `${s.speaker}: ${s.text}`)
                              .join('\n');
                            navigator.clipboard.writeText(text);
                            setCopiedTranscription(true);
                            setTimeout(() => setCopiedTranscription(false), 2000);
                            toast({ title: "Transcrição copiada!" });
                          }}
                        >
                          {copiedTranscription ? (
                            <><ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" /> Copiado</>
                          ) : (
                            <><Copy className="h-3.5 w-3.5" /> Copiar transcrição</>
                          )}
                        </Button>
                      </div>
                      <ScrollArea className="h-64">
                        <div className="p-4 pt-2 space-y-3">
                          {finalTranscriptions.map((segment, index) => (
                            <div key={segment.id || index} className="flex gap-3">
                              <div
                                className={cn(
                                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                                  segment.speakerType === "local"
                                    ? "bg-blue-100 text-blue-600"
                                    : "bg-slate-100 text-slate-600"
                                )}
                              >
                                {segment.speakerType === "local" ? (
                                  <Mic className="h-4 w-4" />
                                ) : (
                                  <User className="h-4 w-4" />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-xs font-semibold mb-0.5",
                                  segment.speakerType === "local" ? "text-blue-600" : "text-slate-600"
                                )}>
                                  {segment.speaker}
                                </p>
                                <p className="text-sm text-slate-700 leading-relaxed">{segment.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          </div>

          {/* Footer fixo */}
          <div className="px-6 py-4 border-t bg-slate-50 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => setShowCallEndedModal(false)}>
              Fechar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTrainingModal(true)}
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Treinamento
              </Button>
              {callRecord?.lead_id && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowCallEndedModal(false);
                    window.location.href = `/comercial/leads/${callRecord.lead_id}`;
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Lead
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showTrainingModal && (
        <SaveToTrainingModal
          open={showTrainingModal}
          onOpenChange={setShowTrainingModal}
          defaultData={{
            title: `Call: ${callEndedResult?.peerName || callRecord?.peer_name || 'Sem nome'}`,
            source_type: 'call',
            call_history_id: callEndedResult?.callId || callRecord?.id,
            transcription: callRecord?.transcriptions || callEndedResult?.transcriptions,
            ai_analysis: rawAnalysis,
            record_url: callRecord?.record_url || undefined,
            lead_id: callEndedResult?.leadId || callRecord?.lead_id || undefined,
            sales_rep_id: undefined,
          }}
        />
      )}

      {/* Modal de criação de tarefa */}
      <CreateTaskModal
        open={showCreateTaskModal}
        onOpenChange={(open) => {
          if (!open) {
            setTaskToCreate(null);
            // Invalidar queries para atualizar a lista de tarefas
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
          setShowCreateTaskModal(open);
        }}
        onSuccess={() => {
          // Marcar a tarefa como criada e persistir no banco
          if (taskToCreate?.name) {
            markTaskAsCreated(taskToCreate.name);
          }
        }}
        zClass="z-[95]"
        defaultValues={{
          lead_id: callEndedResult?.leadId || callRecord?.lead_id,
          lead_name: callEndedResult?.peerName || callRecord?.peer_name,
          team: 'sales',
          task_type: taskToCreate?.task_type,
          // Pré-preencher com dados da tarefa sugerida
          title: taskToCreate?.name,
          description: taskToCreate?.description,
          due_datetime: taskToCreate?.due_datetime,
        }}
      />
    </>
  );
}
