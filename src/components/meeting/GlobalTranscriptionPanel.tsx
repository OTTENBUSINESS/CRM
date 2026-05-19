import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMeeting } from '@/contexts/MeetingContext';
import { useAuth } from '@/contexts/AuthContext';
import { TranscriptionPanel } from './TranscriptionPanel';
import { CallEndedModal } from '@/components/calls/CallEndedModal';
// CoachPanel replaced by EmbeddedCoach inline component
import { useSalesCoach } from '@/hooks/useSalesCoach';
import { useCoachPlaybooks } from '@/hooks/useCoachPlaybooks';
import { useToast } from '@/hooks/use-toast';
import { useCreateOnboarding, useProcessTranscription } from '@/hooks/useOnboardings';
import { supabase } from '@/lib/supabase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, Sparkles, Eye, BookOpen, ChevronRight, ChevronLeft, CheckCircle2, Circle, AlertTriangle, AlertCircle, X, MessageSquare, Info, Maximize2 } from 'lucide-react';
import { CoachPanel } from '@/components/coach/CoachPanel';
import { cn } from '@/lib/utils';
import type { CoachPlaybook, CoachState, CoachSuggestion, CoachAlert } from '@/types/coach.types';

// Embedded Coach — renders inline inside TranscriptionPanel left column
function EmbeddedCoach({ playbook, state, onNextPhase, onPreviousPhase, onToggleChecklistItem, onDismissSuggestion, onDismissAlert, onExpand }: {
  playbook: CoachPlaybook;
  state: CoachState;
  onNextPhase: () => void;
  onPreviousPhase: () => void;
  onToggleChecklistItem: (id: string) => void;
  onDismissSuggestion: () => void;
  onDismissAlert: (id: string) => void;
  onExpand?: () => void;
}) {
  const phase = playbook.phases[state.currentPhaseIndex];
  const activeAlerts = state.activeAlerts.filter(a => !a.dismissed);

  if (!phase) return <p className="text-xs text-muted-foreground">Sem fases no playbook</p>;

  // Checklist items (handle both string[] and object[])
  const items = (phase.checklist || []).map((item: any, i: number) => {
    const id = typeof item === 'string' ? `item-${i}` : item.id || `item-${i}`;
    const text = typeof item === 'string' ? item : item.text;
    const required = typeof item === 'object' ? item.required : false;
    const status = state.checklistState[id] || 'pending';
    return { id, text, required, status };
  });

  const completed = items.filter(i => i.status === 'completed').length;

  const typeConfig: Record<string, { bg: string; border: string; color: string; label: string }> = {
    objection_handler: { bg: 'bg-red-50 dark:bg-red-950', border: 'border-l-4 border-l-red-500', color: 'text-red-700 dark:text-red-300', label: '🔴 ERRO' },
    question: { bg: 'bg-purple-50 dark:bg-purple-950', border: 'border-l-4 border-l-purple-500', color: 'text-purple-700 dark:text-purple-300', label: '🟣 PERGUNTA' },
    closing: { bg: 'bg-green-50 dark:bg-green-950', border: 'border-l-4 border-l-green-500', color: 'text-green-700 dark:text-green-300', label: '🟢 FECHAR' },
    tip: { bg: 'bg-amber-50 dark:bg-amber-950', border: 'border-l-4 border-l-amber-500', color: 'text-amber-700 dark:text-amber-300', label: '🟡 DICA' },
    info: { bg: 'bg-blue-50 dark:bg-blue-950', border: 'border-l-4 border-l-blue-500', color: 'text-blue-700 dark:text-blue-300', label: '🔵 INFO' },
  };

  // Deduplicate: current suggestion may already be in history
  const seen = new Set<string>();
  const allSuggestions: typeof state.suggestionHistory = [];
  if (state.currentSuggestion) {
    allSuggestions.push(state.currentSuggestion);
    seen.add(state.currentSuggestion.id);
  }
  for (const s of state.suggestionHistory) {
    if (!seen.has(s.id) && allSuggestions.length < 3) {
      allSuggestions.push(s);
      seen.add(s.id);
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: Phase nav + progress dots */}
      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b">
        <div className="flex items-center gap-0.5">
          <button onClick={onPreviousPhase} disabled={state.currentPhaseIndex === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="font-bold text-[13px]">{phase.name}</span>
          <button onClick={onNextPhase} disabled={state.currentPhaseIndex >= playbook.phases.length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {playbook.phases.map((p, i) => (
            <div key={i} className={cn("w-2.5 h-2.5 rounded-full border", i < state.currentPhaseIndex ? "bg-green-500 border-green-600" : i === state.currentPhaseIndex ? "bg-blue-500 border-blue-600" : "bg-muted border-muted-foreground/20")} title={p.name} />
          ))}
          {onExpand && (
            <button onClick={onExpand} className="p-0.5 rounded hover:bg-muted ml-1" title="Expandir">
              <Maximize2 className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-0.5 mb-2">
        {items.map(item => (
          <button key={item.id} onClick={() => onToggleChecklistItem(item.id)}
            className="flex items-center gap-2 w-full text-left py-1 px-1 rounded hover:bg-muted/50 transition-colors group">
            {item.status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground/40 group-hover:text-blue-400 shrink-0" />
            )}
            <span className={cn("text-[11px] leading-tight", item.status === 'completed' && "line-through text-muted-foreground")}>
              {item.text}
            </span>
          </button>
        ))}
      </div>

      {/* Suggestion feed — max 3 visible, fixed height */}
      <div className="flex-1 overflow-y-auto min-h-0 max-h-[200px] space-y-1.5 pr-0.5">
        {allSuggestions.length === 0 && (
          <p className="text-center text-muted-foreground py-6 text-[11px]">🎙️ Aguardando conversa...</p>
        )}
        {allSuggestions.map((s, idx) => {
          const cfg = typeConfig[s.type] || typeConfig.tip;
          const isCurrent = idx === 0 && state.currentSuggestion;
          const isError = s.type === 'objection_handler';
          return (
            <div key={s.id} className={cn(
              "p-2 rounded-md transition-all",
              cfg.bg, cfg.border,
              isCurrent && "shadow-md",
              isCurrent && isError && "ring-2 ring-red-400/40 animate-pulse",
              !isCurrent && "opacity-70",
            )}>
              <div className="flex items-center justify-between mb-0.5">
                <span className={cn("text-[10px] font-bold uppercase tracking-wider", cfg.color)}>{cfg.label}</span>
                <span className="text-[9px] text-muted-foreground">
                  {isCurrent ? 'agora' : new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              {(() => {
                const parts = (s.text || '').split('\n');
                const headline = parts[0];
                const detail = parts.slice(1).join(' ');
                return (
                  <>
                    <p className={cn("text-[11px] font-black leading-tight", isCurrent && "text-[12px]")}>{headline}</p>
                    {detail && <p className={cn("text-[10px] leading-snug mt-0.5 text-muted-foreground", isCurrent && "text-[11px] text-foreground/80")}>{detail}</p>}
                  </>
                );
              })()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

type ProcessingStep = 'saving' | 'processing' | 'done';

export function GlobalTranscriptionPanel() {
  const navigate = useNavigate();
  const { activeMeeting, endMeeting } = useMeeting();
  const { teamMember } = useAuth();
  const { toast } = useToast();
  
  // Hooks para onboarding
  const createOnboarding = useCreateOnboarding();
  const processTranscription = useProcessTranscription();
  
  // Estado do modal de processamento de onboarding
  const [isProcessingModal, setIsProcessingModal] = useState(false);
  const [processingStep, setProcessingStep] = useState<ProcessingStep>('saving');

  // Estado do CallEndedModal (vive aqui para sobreviver ao desmonte do TranscriptionPanel)
  const [meetingEndedData, setMeetingEndedData] = useState<any>(null);
  const [showCallEndedModal, setShowCallEndedModal] = useState(false);

  // Sales Coach integration for meetings
  const [selectedPlaybook, setSelectedPlaybook] = useState<CoachPlaybook | null>(null);
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [showExpandedCoach, setShowExpandedCoach] = useState(false);
  const [meetingTranscriptions, setMeetingTranscriptions] = useState<any[]>([]);
  const { data: playbooks } = useCoachPlaybooks();

  const {
    state: coachState,
    startSession,
    endSession,
    nextPhase,
    previousPhase,
    toggleChecklistItem,
    requestSuggestion,
    dismissSuggestion,
    dismissAlert,
    generateBriefing,
  } = useSalesCoach({
    playbook: selectedPlaybook,
    leadId: activeMeeting?.leadId,
    callId: activeMeeting?.meetingId,
    sellerName: teamMember?.name,
    clientName: activeMeeting?.entityName,
  });

  const startSessionRef = useRef(startSession);
  const generateBriefingRef = useRef(generateBriefing);
  const requestSuggestionRef = useRef(requestSuggestion);
  const endSessionRef = useRef(endSession);
  const lastTranscriptionRef = useRef<string>('');
  const suggestionTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    startSessionRef.current = startSession;
    generateBriefingRef.current = generateBriefing;
    requestSuggestionRef.current = requestSuggestion;
    endSessionRef.current = endSession;
  }, [startSession, generateBriefing, requestSuggestion, endSession]);

  // Auto-start coach when playbook selected
  const handleSelectPlaybook = useCallback((playbook: CoachPlaybook) => {
    setSelectedPlaybook(playbook);
    setShowCoachPanel(true);
  }, []);

  // Start session when playbook changes (after re-render with new playbook)
  const coachStartedRef = useRef(false);
  useEffect(() => {
    if (selectedPlaybook && !coachState.isActive && !coachStartedRef.current) {
      coachStartedRef.current = true;
      startSessionRef.current().then(() => {
        if (activeMeeting?.leadId) {
          generateBriefingRef.current(activeMeeting.leadId);
        }
      });
    }
    if (!selectedPlaybook) {
      coachStartedRef.current = false;
    }
  }, [selectedPlaybook, coachState.isActive, activeMeeting?.leadId]);

  // Feed meeting transcriptions to coach (use ref to avoid stale closure)
  const coachActiveRef = useRef(coachState.isActive);
  coachActiveRef.current = coachState.isActive;

  const handleTranscriptionsUpdate = useCallback((transcriptions: any[]) => {
    setMeetingTranscriptions(transcriptions);

    if (!coachActiveRef.current || transcriptions.length === 0) return;

    const finalTranscriptions = transcriptions.filter((t: any) => t.is_final);
    if (finalTranscriptions.length === 0) return;

    const recentTranscriptions = finalTranscriptions
      .slice(-10)
      .map((t: any) => `${t.speaker || 'Speaker'}: ${t.text}`)
      .join('\n');

    if (recentTranscriptions === lastTranscriptionRef.current) return;
    // Only trigger if at least 30 new chars (avoid calling for minor changes)
    const diff = Math.abs(recentTranscriptions.length - (lastTranscriptionRef.current?.length || 0));
    if (diff < 30 && lastTranscriptionRef.current) return;
    lastTranscriptionRef.current = recentTranscriptions;

    console.log('[MeetingCoach] 📡 Feeding', finalTranscriptions.length, 'transcriptions to coach, text length:', recentTranscriptions.length);

    if (suggestionTimeoutRef.current) clearTimeout(suggestionTimeoutRef.current);
    const textToSend = recentTranscriptions;
    suggestionTimeoutRef.current = setTimeout(() => {
      if (textToSend.length > 30) {
        console.log('[MeetingCoach] 🤖 Requesting suggestion, isActive:', coachActiveRef.current);
        requestSuggestionRef.current(textToSend);
      }
    }, 500);
  }, []);

  // Cleanup coach on meeting end
  useEffect(() => {
    if (!activeMeeting && coachState.isActive) {
      endSessionRef.current();
      setShowCoachPanel(false);
      setSelectedPlaybook(null);
    }
  }, [activeMeeting, coachState.isActive]);

  // Memoizar clientData para evitar re-renders desnecessários
  const clientData = useMemo(() => ({
    name: activeMeeting?.clientData?.name,
    healthScore: activeMeeting?.clientData?.healthScore,
    aiInsightsContent: activeMeeting?.clientData?.aiInsights,
  }), [activeMeeting?.clientData?.name, activeMeeting?.clientData?.healthScore, activeMeeting?.clientData?.aiInsights]);

  // Memoizar callbacks para evitar re-renders
  // IMPORTANTE: handleClose NÃO deve finalizar a meeting, apenas minimizar/fechar o painel
  // A meeting só deve ser finalizada quando o usuário clicar em "Encerrar"
  const handleClose = useCallback(() => {
    // Não fazer nada - o usuário precisa clicar em "Encerrar" para finalizar
    // Isso evita que a meeting seja marcada como completed ao clicar fora do modal
  }, []);

  const handleFinish = useCallback(async (transcriptions: any[]) => {
    // Guardar referência do meeting ANTES de qualquer mudança de estado
    const currentMeeting = activeMeeting;

    // Se for onboarding, usar fluxo específico com modal
    if (currentMeeting?.taskType === 'onboarding' && currentMeeting?.entityType === 'organization') {
      // Validar transcrições — com fallback do banco e localStorage
      let validTranscriptions = transcriptions;

      if (!validTranscriptions || validTranscriptions.length === 0) {
        console.warn('[GlobalTranscription] ⚠️ Transcrições vazias recebidas, tentando fallback...');

        // Fallback 1: Buscar do meeting no banco (handleConfirmFinish já salvou)
        if (currentMeeting?.meetingId) {
          try {
            const { data: meetingData } = await supabase
              .from('meetings')
              .select('transcriptions')
              .eq('id', currentMeeting.meetingId)
              .single();
            if (meetingData?.transcriptions && Array.isArray(meetingData.transcriptions) && meetingData.transcriptions.length > 0) {
              validTranscriptions = meetingData.transcriptions;
              console.log(`[GlobalTranscription] ✅ Recuperado ${validTranscriptions.length} transcrições do banco`);
            }
          } catch (e) {
            console.error('[GlobalTranscription] ❌ Falha ao buscar fallback do banco');
          }
        }

        // Fallback 2: Buscar do localStorage
        if (!validTranscriptions || validTranscriptions.length === 0) {
          try {
            const backup = localStorage.getItem(`meeting_transcriptions_${currentMeeting?.meetingId}`);
            if (backup) {
              validTranscriptions = JSON.parse(backup);
              console.log(`[GlobalTranscription] ✅ Recuperado ${validTranscriptions.length} transcrições do localStorage`);
            }
          } catch (e) {
            console.error('[GlobalTranscription] ❌ Falha ao buscar fallback do localStorage');
          }
        }
      }

      if (!validTranscriptions || validTranscriptions.length === 0) {
        toast({
          title: "Transcrição vazia",
          description: "Não foi possível capturar a transcrição. Tente novamente.",
          variant: "destructive",
        });
        return;
      }

      // Formatar transcrições
      const transcriptionText = validTranscriptions
        .map((t: any) => `${t.speaker || 'Speaker'}: ${t.text}`)
        .join('\n');
      
      if (transcriptionText.length < 10) {
        toast({
          title: "Transcrição muito curta",
          description: "A transcrição capturada é muito curta. Tente novamente.",
          variant: "destructive",
        });
        return;
      }
      
      // Mostrar modal e fechar painel de transcrição
      setIsProcessingModal(true);
      setProcessingStep('saving');
      endMeeting('completed');
      
      try {
        // 1. Criar onboarding
        const onboarding = await createOnboarding.mutateAsync({
          organization_id: currentMeeting.entityId,
          meeting_id: currentMeeting.meetingId,
          activity_id: currentMeeting.activityId,
          transcription_source: 'meeting',
          transcription_raw: transcriptionText,
          created_by: teamMember?.id,
        });
        
        setProcessingStep('processing');
        
        // 2. Processar com IA
        await processTranscription.mutateAsync({
          id: onboarding.id,
          transcription: transcriptionText,
          source: 'meeting',
        });
        
        // 3. Mover tarefa de onboarding para "monitoramento 7 dias" (reunião finalizada)
        if (currentMeeting.activityId) {
          await supabase
            .from('company_activities')
            .update({ status: 'monitoring_7d' })
            .eq('id', currentMeeting.activityId);
        }
        
        setProcessingStep('done');
        
        // 3. Aguardar 1.5s e redirecionar
        setTimeout(() => {
          setIsProcessingModal(false);
          setProcessingStep('saving');
          navigate(`/clientes/${currentMeeting.entityId}?tab=onboarding`);
        }, 1500);
        
      } catch (error: any) {
        console.error('[GlobalTranscription] ❌ Erro ao processar onboarding:', error?.message || error);
        setIsProcessingModal(false);
        toast({
          title: "Erro ao processar",
          description: `${error?.message || 'Ocorreu um erro'}. A transcrição foi salva na reunião — você pode processar manualmente na aba Onboarding do cliente.`,
          variant: "destructive",
        });
      }
      
      return;
    }
    
    // Fluxo padrão para sales calls e outros tipos
    // O TranscriptionPanel chama onMeetingEnded com os dados para o CallEndedModal
    // O endMeeting será chamado por handleMeetingEnded abaixo
  }, [activeMeeting, endMeeting, toast, createOnboarding, processTranscription, teamMember, navigate]);

  // Callback quando TranscriptionPanel finaliza uma meeting (sales call / meeting)
  // Recebe os dados para exibir o CallEndedModal e encerra a meeting
  const handleMeetingEnded = useCallback((data: any) => {
    console.log('[GlobalTranscription] 📥 handleMeetingEnded recebido', data);
    setMeetingEndedData(data);
    setShowCallEndedModal(true);
    // Encerrar a meeting DEPOIS de guardar os dados para o modal
    endMeeting('completed');
  }, [endMeeting]);

  // Só renderiza se tiver reunião ativa OU modal aberto
  if (!activeMeeting && !isProcessingModal && !showCallEndedModal) return null;

  const isRecovered = activeMeeting?.isRecovered || false;
  
  return (
    <>
      {activeMeeting && (
        <>
          <TranscriptionPanel
            key={activeMeeting.meetingId}
            meetingId={activeMeeting.meetingId}
            activityId={activeMeeting.activityId}
            organizationId={activeMeeting.entityType === 'organization' ? activeMeeting.entityId : undefined}
            organizationName={activeMeeting.entityName}
            meetingLink={activeMeeting.meetingLink}
            speakerName={teamMember?.name || 'Você'}
            clientData={clientData}
            isRecoveredSession={isRecovered}
            taskType={activeMeeting.taskType}
            meetingType={activeMeeting.meetingType}
            onClose={handleClose}
            onFinish={handleFinish}
            onMeetingEnded={handleMeetingEnded}
            onTranscriptionsUpdate={handleTranscriptionsUpdate}
            coachButton={
              !showCoachPanel && playbooks && playbooks.length > 0 ? (
                <div className="flex gap-1">
                  {playbooks.filter(p => p.is_active).slice(0, 3).map((pb) => (
                    <Button
                      key={pb.id}
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-xs h-7"
                      onClick={() => handleSelectPlaybook(pb)}
                    >
                      <BookOpen className="h-3 w-3" />
                      {pb.name}
                    </Button>
                  ))}
                </div>
              ) : showCoachPanel ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs h-7 border-green-500/50 text-green-600"
                  onClick={() => setShowCoachPanel(!showCoachPanel)}
                >
                  <BookOpen className="h-3 w-3" />
                  Coach Ativo
                </Button>
              ) : null
            }
            coachContent={showCoachPanel && coachState.isActive && selectedPlaybook ? (
              <EmbeddedCoach
                playbook={selectedPlaybook}
                state={coachState}
                onNextPhase={nextPhase}
                onPreviousPhase={previousPhase}
                onToggleChecklistItem={toggleChecklistItem}
                onDismissSuggestion={dismissSuggestion}
                onDismissAlert={dismissAlert}
                onExpand={() => setShowExpandedCoach(true)}
              />
            ) : undefined}
          />

          {/* Expanded Coach — floating draggable */}
          {showExpandedCoach && coachState.isActive && selectedPlaybook && (
            <CoachPanel
              playbook={selectedPlaybook}
              state={coachState}
              leadName={activeMeeting.entityName}
              briefing={coachState.briefing}
              transcriptions={meetingTranscriptions}
              isTranscribing={true}
              onNextPhase={nextPhase}
              onPreviousPhase={previousPhase}
              onToggleChecklistItem={toggleChecklistItem}
              onDismissSuggestion={dismissSuggestion}
              onDismissAlert={dismissAlert}
              onClose={() => setShowExpandedCoach(false)}
            />
          )}
        </>
      )}

      {/* Modal de Processamento de Onboarding */}
      <Dialog open={isProcessingModal} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-orange-500" />
              Processando Onboarding
            </DialogTitle>
            <DialogDescription>Aguarde enquanto a transcrição é analisada pela IA.</DialogDescription>
          </DialogHeader>
          
          <div className="py-6 space-y-6">
            {/* Step 1: Salvando */}
            <div className={cn(
              "flex items-center gap-4 p-4 rounded-lg border-2 transition-all",
              processingStep === 'saving' ? "border-blue-500 bg-blue-50" : 
              processingStep !== 'saving' ? "border-green-500 bg-green-50" : "border-muted"
            )}>
              {processingStep === 'saving' ? (
                <Loader2 className="h-6 w-6 text-blue-500 animate-spin" />
              ) : (
                <CheckCircle className="h-6 w-6 text-green-500" />
              )}
              <div>
                <p className="font-medium">Salvando transcrição</p>
                <p className="text-sm text-muted-foreground">Criando registro de onboarding...</p>
              </div>
            </div>

            {/* Step 2: Processando IA */}
            <div className={cn(
              "flex items-center gap-4 p-4 rounded-lg border-2 transition-all",
              processingStep === 'processing' ? "border-orange-500 bg-orange-50" : 
              processingStep === 'done' ? "border-green-500 bg-green-50" : "border-muted bg-muted/30"
            )}>
              {processingStep === 'processing' ? (
                <Loader2 className="h-6 w-6 text-orange-500 animate-spin" />
              ) : processingStep === 'done' ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <Sparkles className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Processando com IA</p>
                <p className="text-sm text-muted-foreground">Gerando dossiê estruturado...</p>
              </div>
            </div>

            {/* Step 3: Concluído */}
            <div className={cn(
              "flex items-center gap-4 p-4 rounded-lg border-2 transition-all",
              processingStep === 'done' ? "border-green-500 bg-green-50" : "border-muted bg-muted/30"
            )}>
              {processingStep === 'done' ? (
                <CheckCircle className="h-6 w-6 text-green-500" />
              ) : (
                <Eye className="h-6 w-6 text-muted-foreground" />
              )}
              <div>
                <p className="font-medium">Redirecionando</p>
                <p className="text-sm text-muted-foreground">Abrindo aba de Onboarding do cliente...</p>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* CallEndedModal — vive aqui para sobreviver ao desmonte do TranscriptionPanel */}
      {showCallEndedModal && meetingEndedData && (
        <CallEndedModal
          externalData={meetingEndedData}
          externalOpen={showCallEndedModal}
          onExternalClose={() => {
            setShowCallEndedModal(false);
            setMeetingEndedData(null);
          }}
        />
      )}
    </>
  );
}
