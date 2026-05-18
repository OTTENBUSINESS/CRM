import { useState, useCallback, useEffect, useRef, Component, type ReactNode, type ErrorInfo } from 'react';
import { IncomingCallModal } from './IncomingCallModal';
import { ActiveCallModal } from './ActiveCallModal';
import { CallEndedModal } from './CallEndedModal';
import { ActiveCallIndicator } from './ActiveCallIndicator';
import { useCall } from '@/contexts/CallContext';
import { useSalesCoach } from '@/hooks/useSalesCoach';
import { CoachPanel } from '@/components/coach/CoachPanel';
import { getSelectedPlaybook, clearSelectedPlaybook } from '@/components/calls/CallButton';
import type { CoachPlaybook } from '@/types/coach.types';

// ErrorBoundary silencioso para sub-componentes de chamada
// Evita que um erro em um modal derrube todos os outros
class CallComponentBoundary extends Component<{ children: ReactNode; name: string }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[CallModals:${this.props.name}]`, error.message, info.componentStack?.slice(0, 200));
  }
  render() {
    if (this.state.hasError) return null; // Silenciosamente falha — outros componentes continuam
    return this.props.children;
  }
}

/**
 * Componente que renderiza todos os modais de chamada.
 * Deve ser incluído uma vez no layout principal da aplicação.
 *
 * Gerencia:
 * - Modal de chamada recebida
 * - Modal de chamada ativa (com controles)
 * - Modal pós-chamada (resumo)
 * - Painel do Sales Coach
 * - Indicador de chamada ativa (para recuperar painéis)
 */
export function CallModals() {
  const {
    activeCall,
    setShowActiveCallModal,
    transcriptions,
    isTranscribing,
  } = useCall();

  // Coach panel state
  const [showCoachPanel, setShowCoachPanel] = useState(false);
  const [selectedPlaybook, setSelectedPlaybook] = useState<CoachPlaybook | null>(null);
  const hasInitializedRef = useRef(false);
  const lastTranscriptionRef = useRef<string>('');
  const suggestionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Sales Coach hook
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
    leadId: activeCall?.leadId,
    callId: activeCall?.id,
    clientName: activeCall?.peerName,
  });

  // Refs para evitar stale closures nos useEffects
  const startSessionRef = useRef(startSession);
  const generateBriefingRef = useRef(generateBriefing);
  const requestSuggestionRef = useRef(requestSuggestion);
  const endSessionRef = useRef(endSession);

  useEffect(() => {
    startSessionRef.current = startSession;
    generateBriefingRef.current = generateBriefing;
    requestSuggestionRef.current = requestSuggestion;
    endSessionRef.current = endSession;
  }, [startSession, generateBriefing, requestSuggestion, endSession]);

  // Initialize coach when call becomes ACTIVE
  useEffect(() => {
    if (activeCall?.status === 'ACTIVE' && !hasInitializedRef.current) {
      hasInitializedRef.current = true;

      // Get the playbook that was selected before the call
      const playbook = getSelectedPlaybook();

      setSelectedPlaybook(playbook);
      setShowCoachPanel(true);

      // Start session after state update
      setTimeout(() => {
        startSessionRef.current();

        // Generate briefing if we have a lead and a playbook
        if (activeCall.leadId && playbook) {
          generateBriefingRef.current();
        }
      }, 100);
    }
  }, [activeCall?.status, activeCall?.leadId]); // Removido startSession e generateBriefing

  // End coach session when call ends
  useEffect(() => {
    if (!activeCall && coachState.isActive) {
      endSessionRef.current();
      setShowCoachPanel(false);
      setSelectedPlaybook(null);
      clearSelectedPlaybook();
      hasInitializedRef.current = false;
    }
  }, [activeCall, coachState.isActive]); // Removido endSession

  // Feed transcriptions to coach for suggestions
  useEffect(() => {
    if (!isTranscribing || !coachState.isActive || transcriptions.length === 0) {
      return;
    }

    const recentTranscriptions = transcriptions
      .filter(t => t.is_final)
      .slice(-10)
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');

    if (recentTranscriptions === lastTranscriptionRef.current) return;

    lastTranscriptionRef.current = recentTranscriptions;

    if (suggestionTimeoutRef.current) {
      clearTimeout(suggestionTimeoutRef.current);
    }

    suggestionTimeoutRef.current = setTimeout(() => {
      if (recentTranscriptions.length > 30) {
        requestSuggestionRef.current(recentTranscriptions);
      }
    }, 500);

    return () => {
      if (suggestionTimeoutRef.current) {
        clearTimeout(suggestionTimeoutRef.current);
      }
    };
  }, [transcriptions, isTranscribing, coachState.isActive]); // Removido requestSuggestion

  // Handlers
  const handleOpenCallModal = useCallback(() => {
    setShowActiveCallModal(true);
  }, [setShowActiveCallModal]);

  const handleOpenCoachPanel = useCallback(() => {
    setShowCoachPanel(true);
  }, []);

  const handleCloseCoachPanel = useCallback(() => {
    setShowCoachPanel(false);
  }, []);

  return (
    <>
      {/* Modais de chamada — cada um com ErrorBoundary isolado */}
      <CallComponentBoundary name="IncomingCall"><IncomingCallModal /></CallComponentBoundary>
      <CallComponentBoundary name="ActiveCall"><ActiveCallModal /></CallComponentBoundary>
      <CallComponentBoundary name="CallEnded"><CallEndedModal /></CallComponentBoundary>

      {/* Coach Panel - Floating */}
      {activeCall && showCoachPanel && coachState.isActive && (
        <CoachPanel
          playbook={selectedPlaybook}
          state={coachState}
          leadName={activeCall.peerName}
          briefing={coachState.briefing}
          transcriptions={transcriptions}
          isTranscribing={isTranscribing}
          onNextPhase={nextPhase}
          onPreviousPhase={previousPhase}
          onToggleChecklistItem={toggleChecklistItem}
          onDismissSuggestion={dismissSuggestion}
          onDismissAlert={dismissAlert}
          onClose={handleCloseCoachPanel}
        />
      )}

      {/* Indicador de chamada ativa - sempre visível durante chamada */}
      {activeCall && (
        <ActiveCallIndicator
          onOpenCallModal={handleOpenCallModal}
          onOpenCoachPanel={handleOpenCoachPanel}
          isCoachPanelVisible={showCoachPanel && coachState.isActive}
        />
      )}
    </>
  );
}
