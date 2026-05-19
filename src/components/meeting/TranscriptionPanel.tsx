import { useState, useEffect, useRef, useCallback } from 'react';
import { useSoniox, type ChannelHealth } from '@/hooks/useSoniox';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { toast as sonnerToast } from 'sonner';
import { useMeeting } from '@/contexts/MeetingContext';
// CallEndedModal movido para GlobalTranscriptionPanel
import {
  Mic, Square, Minimize2, Maximize2, X,
  ExternalLink, Pause, Play, Video, Volume2,
  User, Calendar, MessageSquare, TrendingUp, Eye, Loader2,
  Sparkles, CheckCircle2, XCircle, AlertTriangle, Copy, ArrowDown, Check, RotateCcw
} from 'lucide-react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { cn, ensureHttps } from '@/lib/utils';
import { triggerAutomationRules } from '@/hooks/useNotificationEvents';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface TranscriptionPanelProps {
  meetingId: string;
  activityId?: string;
  organizationId?: string;
  organizationName?: string;
  meetingLink?: string;
  speakerName?: string;
  clientData?: {
    name?: string;
    since?: string;
    healthScore?: number;
    lastWhatsapp?: string;
    lastActivity?: string;
    insights?: string;
    aiInsightsContent?: string;
  };
  onClose?: () => void;
  onFinish?: (transcriptions: any[]) => void;
  onMeetingEnded?: (data: any) => void; // Sinaliza que a meeting terminou e precisa mostrar CallEndedModal
  onViewClient360?: () => void;
  onTranscriptionsUpdate?: (transcriptions: any[]) => void;
  coachButton?: React.ReactNode;
  coachContent?: React.ReactNode;
  isRecoveredSession?: boolean;
  taskType?: string; // 'onboarding' | 'call' | 'meeting' etc
  meetingType?: string; // 'cs_meeting' | 'sales_call' | 'onboarding' | 'internal'
}

export function TranscriptionPanel({
  meetingId,
  activityId,
  organizationId,
  organizationName = 'Cliente',
  meetingLink,
  speakerName = 'Você',
  clientData,
  onClose,
  onFinish,
  onMeetingEnded,
  onViewClient360,
  onTranscriptionsUpdate,
  coachButton,
  coachContent,
  isRecoveredSession: isRecoveredSessionProp = false,
  taskType,
  meetingType,
}: TranscriptionPanelProps) {
  const { toast } = useToast();
  const { endMeeting } = useMeeting();
  const [isMinimized, setIsMinimized] = useState(false);
  // isPaused agora vem do hook useSoniox (pause real no audio pipeline)
  const [duration, setDuration] = useState(0);
  const [meetingStatus, setMeetingStatus] = useState<string>('em_andamento');
  
  // Estados para modal de encerramento
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishStatus, setFinishStatus] = useState<'completed' | 'no_show' | 'rescheduled'>('completed');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [noShowReason, setNoShowReason] = useState('');
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // CallEndedModal state movido para GlobalTranscriptionPanel
  const [step, setStep] = useState<'instructions' | 'transcribing'>('instructions');
  const [instructionStep, setInstructionStep] = useState<1 | 2>(meetingLink ? 1 : 2);
  const [savedTranscriptions, setSavedTranscriptions] = useState<any[]>([]);
  const [isRecoveredSession, setIsRecoveredSession] = useState(isRecoveredSessionProp);
  const [isLoadingSession, setIsLoadingSession] = useState(isRecoveredSessionProp); // Loading enquanto carrega transcrições
  const [isStartingTranscription, setIsStartingTranscription] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);
  const transcriptionContainerRef = useRef<HTMLDivElement>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [showCopied, setShowCopied] = useState(false);
  const lastBeepRef = useRef(0); // cooldown de 30s entre beeps
  const prevHealthRef = useRef<ChannelHealth>({ mic: 'active', system: 'unavailable' });
  // Debounce: só mostra toast "Reconectando..." se o estado reconnecting durar > 3s
  // (evita ruído visual em reconexões rápidas que o user nem percebe)
  const reconnectToastTimersRef = useRef<Record<'mic' | 'system', NodeJS.Timeout | null>>({ mic: null, system: null });
  const reconnectToastIdsRef = useRef<Record<'mic' | 'system', string | number | null>>({ mic: null, system: null });
  // Cooldown por canal — não spammar toast se ficar oscilando
  const lastToastAtRef = useRef<Record<'mic' | 'system', number>>({ mic: 0, system: 0 });

  // V3: SEMPRE carregar transcrições salvas do banco ao montar
  // (protege contra HMR, refresh, e sessões recuperadas)
  useEffect(() => {
    if (!meetingId) return;

    supabase
      .from('meetings')
      .select('transcriptions, started_at')
      .eq('id', meetingId)
      .single()
      .then(({ data, error }) => {
        if (data?.transcriptions && data.transcriptions.length > 0) {
          setSavedTranscriptions(data.transcriptions);
          // Evitar que o save automático sobrescreva com menos dados
          lastSavedCountRef.current = data.transcriptions.length;

          // Calcular duração desde o início
          if (data.started_at) {
            const startedAt = new Date(data.started_at);
            const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
            setDuration(elapsed);
          }
        }

        if (isRecoveredSessionProp) {
          // Sessão recuperada: ir para etapa 2 (re-autorizar captura)
          setInstructionStep(2);
          setIsLoadingSession(false);
        }
      })
      .catch(() => {
        if (isRecoveredSessionProp) {
          setIsLoadingSession(false);
          setInstructionStep(2);
        }
      });
  }, [meetingId]);

  const {
    isConnected,
    isTranscribing,
    isPaused,
    isStale,
    isFatalError,
    channelHealth,
    transcriptions,
    transcriptionsRef,
    error,
    startTranscription,
    stopTranscription,
    finalizeTranscription,
    restartTranscription,
    togglePause,
  } = useSoniox({
    speakerName,
    remoteSpeakerName: `👤 ${organizationName}`,
    initialTranscriptions: savedTranscriptions,
  });

  // Smart auto-scroll: só rola se o usuário NÃO scrollou para cima manualmente
  const handleTranscriptionScroll = useCallback(() => {
    const el = transcriptionContainerRef.current;
    if (!el) return;
    const threshold = 60;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
    setUserScrolledUp(!isAtBottom);
  }, []);

  useEffect(() => {
    if (!userScrolledUp && transcriptionEndRef.current && !isMinimized) {
      transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptions, isMinimized, userScrolledUp]);

  const scrollToBottom = useCallback(() => {
    if (transcriptionEndRef.current) {
      transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setUserScrolledUp(false);
    }
  }, []);

  const handleCopyTranscription = useCallback(() => {
    const finalTexts = transcriptions
      .filter(t => t.is_final)
      .map(t => `${t.speaker}: ${t.text}`)
      .join('\n');
    if (!finalTexts) return;
    navigator.clipboard.writeText(finalTexts).then(() => {
      setShowCopied(true);
      setTimeout(() => setShowCopied(false), 2000);
    });
  }, [transcriptions]);

  // Feed transcriptions to parent (for Sales Coach integration)
  useEffect(() => {
    onTranscriptionsUpdate?.(transcriptions);
  }, [transcriptions, onTranscriptionsUpdate]);

  // === HEALTH MONITOR: toasts + beep quando canal morre ===
  // Reset prevHealthRef quando transcrição para (evita toast falso no restart)
  useEffect(() => {
    if (!isTranscribing) {
      prevHealthRef.current = { mic: 'active', system: 'unavailable' };
    }
  }, [isTranscribing]);

  useEffect(() => {
    if (!isTranscribing) return;
    const prev = prevHealthRef.current;
    const curr = channelHealth;

    // Helper: beep curto (800Hz, 0.3s) com cooldown de 30s
    const playBeep = () => {
      if (Date.now() - lastBeepRef.current < 30000) return;
      lastBeepRef.current = Date.now();
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.value = 800;
        osc.type = 'sine';
        gain.gain.value = 0.3;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
        setTimeout(() => ctx.close(), 500);
      } catch {}
    };

    const RECONNECT_TOAST_DELAY_MS = 3000; // só avisa se demorar > 3s
    const TOAST_COOLDOWN_MS = 15000; // cooldown entre toasts do mesmo canal

    for (const ch of ['mic', 'system'] as const) {
      const prevStatus = prev[ch];
      const currStatus = curr[ch];
      if (prevStatus === currStatus) continue;

      const label = ch === 'mic' ? 'Microfone' : 'Sistema';

      // Cancela qualquer toast pendente de "reconectando" pra este canal
      const cancelPendingReconnectToast = () => {
        if (reconnectToastTimersRef.current[ch]) {
          clearTimeout(reconnectToastTimersRef.current[ch]!);
          reconnectToastTimersRef.current[ch] = null;
        }
        if (reconnectToastIdsRef.current[ch] !== null) {
          sonnerToast.dismiss(reconnectToastIdsRef.current[ch]!);
          reconnectToastIdsRef.current[ch] = null;
        }
      };

      if (currStatus === 'dead') {
        cancelPendingReconnectToast();
        playBeep();
        if (isFatalError) {
          // Erro fatal do servidor (quota, auth) — não oferece reconexão, toast expira
          sonnerToast.error('Transcrição indisponível', {
            description: 'Serviço Soniox fora do ar ou sem créditos. Contate o administrador.',
            duration: 8000,
          });
        } else {
          sonnerToast.error(`${label} desconectou`, {
            action: { label: 'Reconectar', onClick: () => restartTranscription() },
            duration: Infinity,
          });
        }
        lastToastAtRef.current[ch] = Date.now();
      } else if (currStatus === 'reconnecting' && prevStatus !== 'dead') {
        // Agenda toast — só aparece se ficar reconectando por mais de RECONNECT_TOAST_DELAY_MS
        cancelPendingReconnectToast();
        const sinceLast = Date.now() - lastToastAtRef.current[ch];
        if (sinceLast < TOAST_COOLDOWN_MS) continue; // cooldown ativo
        reconnectToastTimersRef.current[ch] = setTimeout(() => {
          reconnectToastIdsRef.current[ch] = sonnerToast.warning(`Reconectando ${label.toLowerCase()}...`, { duration: 10000 }) as any;
          lastToastAtRef.current[ch] = Date.now();
          reconnectToastTimersRef.current[ch] = null;
        }, RECONNECT_TOAST_DELAY_MS);
      } else if (currStatus === 'active' && (prevStatus === 'dead' || prevStatus === 'reconnecting')) {
        const hadPendingToast = reconnectToastTimersRef.current[ch] !== null;
        const hadVisibleToast = reconnectToastIdsRef.current[ch] !== null;
        cancelPendingReconnectToast();
        // Só mostra "reconectado" se o user realmente viu o "reconectando"
        if (hadVisibleToast && !hadPendingToast) {
          sonnerToast.success(`${label} reconectado`, { duration: 3000 });
        }
      }
    }

    prevHealthRef.current = curr;
  }, [channelHealth, isTranscribing, restartTranscription]);

  // === AUTO-RECOVERY: reconectar ao voltar para a tab ===
  // Só dispara quando um canal está efetivamente dead E o erro NÃO é fatal (quota/auth)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isTranscribing) return;
      if (isFatalError) return; // erro irrecuperável — não tentar auto-reconectar
      const hasDead = channelHealth.mic === 'dead' || channelHealth.system === 'dead';
      if (!hasDead) return;
      console.log('[Meeting] Tab visível + canal morto → auto-recovery');
      restartTranscription().then(() => {
        sonnerToast.success('Transcrição recuperada automaticamente', { duration: 3000 });
      }).catch(() => {
        sonnerToast.error('Falha ao recuperar transcrição', { duration: 5000 });
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isTranscribing, channelHealth, restartTranscription, isFatalError]);

  // Salvar transcrições em tempo real no banco (a cada 10 segundos)
  const lastSavedCountRef = useRef(0);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // === BACKUP LOCAL STORAGE (proteção contra perda de dados) ===
  const localStorageKey = `meeting_transcriptions_${meetingId}`;

  // Salvar no localStorage sempre que transcriptions mudar
  useEffect(() => {
    const finals = transcriptions.filter(t => t.is_final);
    if (finals.length > 0) {
      try {
        localStorage.setItem(localStorageKey, JSON.stringify(finals));
      } catch (e) {
        // localStorage cheio? Tentar limpar backups antigos
        try {
          Object.keys(localStorage)
            .filter(k => k.startsWith('meeting_transcriptions_') && k !== localStorageKey)
            .forEach(k => localStorage.removeItem(k));
          localStorage.setItem(localStorageKey, JSON.stringify(finals));
        } catch {}
      }
    }
  }, [transcriptions, localStorageKey]);

  // Função para salvar transcrições
  const saveTranscriptions = async (force = false) => {
    const finalTranscriptions = transcriptionsRef.current.filter(t => t.is_final);
    if (finalTranscriptions.length > 0 && (force || finalTranscriptions.length > lastSavedCountRef.current)) {
      console.log(`[Meeting/${meetingId.slice(0,8)}] 💾 Salvando ${finalTranscriptions.length} transcrições no banco...`);
      const { error } = await supabase
        .from('meetings')
        .update({ transcriptions: finalTranscriptions })
        .eq('id', meetingId);

      if (!error) {
        lastSavedCountRef.current = finalTranscriptions.length;
        console.log(`[Meeting/${meetingId.slice(0,8)}] ✅ Salvo ${finalTranscriptions.length} transcrições`);
      } else {
        console.error(`[Meeting/${meetingId.slice(0,8)}] ❌ Erro ao salvar transcrições:`, error.message);
      }
    }
  };

  // Auto-save: roda enquanto meetingId existir (NÃO depende de isTranscribing)
  // Assim continua salvando mesmo após stopTranscription (antes de finalizar)
  useEffect(() => {
    if (!meetingId) return;

    saveIntervalRef.current = setInterval(() => {
      saveTranscriptions();
    }, 10000);

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [meetingId]);

  // Contador de duração
  useEffect(() => {
    if (isTranscribing && !isPaused) {
      durationIntervalRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    }
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [isTranscribing, isPaused]);

  // Atualizar step quando transcrição iniciar OU quando recuperar sessão com transcrições
  useEffect(() => {
    if (isTranscribing) {
      setStep('transcribing');
    }
  }, [isTranscribing]);

  // Se é sessão recuperada e já tem transcrições salvas, ir direto para transcribing
  // (permite ver transcrições anteriores sem precisar re-autorizar captura)
  useEffect(() => {
    if (isRecoveredSession && savedTranscriptions.length > 0 && step === 'instructions') {
      console.log('[Meeting] ⏩ Sessão recuperada com transcrições — indo direto para transcribing');
      setStep('transcribing');
    }
  }, [isRecoveredSession, savedTranscriptions, step]);



  // Salvar transcrições quando a página for fechada (beforeunload)
  // Usa fetch com keepalive (sendBeacon não suporta headers de auth)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const finalTranscriptions = transcriptionsRef.current.filter(t => t.is_final);
      if (finalTranscriptions.length > 0 && meetingId) {
        console.log(`[Meeting] 🚨 beforeunload - salvando ${finalTranscriptions.length} transcrições`);
        // Salvar no localStorage como último recurso
        try {
          localStorage.setItem(`meeting_transcriptions_${meetingId}`, JSON.stringify(finalTranscriptions));
        } catch {}
        // fetch com keepalive funciona durante unload (diferente de sendBeacon, suporta headers)
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
        fetch(`${supabaseUrl}/rest/v1/meetings?id=eq.${meetingId}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({ transcriptions: finalTranscriptions }),
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [meetingId]);

  // Cleanup ao desmontar - salvar transcrições antes de fechar
  useEffect(() => {
    return () => {
      stopTranscription();

      const finalTranscriptions = transcriptionsRef.current.filter(t => t.is_final);
      if (finalTranscriptions.length > 0 && meetingId) {
        console.log(`[Meeting] 🧹 Unmount - salvando ${finalTranscriptions.length} transcrições`);
        supabase
          .from('meetings')
          .update({ transcriptions: finalTranscriptions })
          .eq('id', meetingId)
          .then(({ error }) => {
            if (error) console.error('[Meeting] ❌ Erro ao salvar no unmount:', error.message);
            else console.log('[Meeting] ✅ Transcrições salvas no unmount');
          });
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // PASSO 1: Abrir o Meet
  const handleOpenMeet = () => {
    if (meetingLink) {
      window.open(ensureHttps(meetingLink), '_blank');
    }
    // Sempre avançar para step 2
    setInstructionStep(2);
    toast({
      title: meetingLink ? "✅ Meet aberto!" : "Pule para transcrição",
      description: meetingLink ? "Volte aqui e clique em 'Iniciar Transcrição'" : "Abra o Meet manualmente e clique em 'Iniciar Transcrição'",
    });
  };

  // PASSO 2: Iniciar transcrição (vai pedir permissões)
  const handleStartTranscription = async () => {
    setIsStartingTranscription(true);
    setStartError(null);
    try {
      await startTranscription();
    } catch (err: any) {
      console.error('❌ Erro ao iniciar transcrição:', err);
      setStartError(err.message || 'Erro ao iniciar transcrição');
      toast({
        title: "Erro ao iniciar transcrição",
        description: err.message || "Verifique permissões de microfone e compartilhamento de tela",
        variant: "destructive",
      });
    } finally {
      setIsStartingTranscription(false);
    }
  };

  // Pausar/Continuar (usa togglePause do hook — para o envio de áudio de verdade)
  const handleTogglePause = useCallback(() => {
    togglePause();
    toast({
      title: isPaused ? "Transcrição retomada" : "Transcrição pausada",
    });
  }, [togglePause, isPaused]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Ref para janela pop-out
  const popoutWindowRef = useRef<Window | null>(null);

  // Refs para evitar stale closures no listener de mensagens do pop-out
  const handleTogglePauseRef = useRef(handleTogglePause);
  handleTogglePauseRef.current = handleTogglePause;
  const handleFinishRef = useRef<((status?: string) => void) | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data.type === 'TOGGLE_PAUSE') {
        handleTogglePauseRef.current();
      } else if (event.data.type === 'END_MEETING') {
        handleFinishRef.current?.(event.data.status === 'no_show' ? 'no_show' : 'completed');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Enviar transcrições para pop-out quando atualizarem
  useEffect(() => {
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
      popoutWindowRef.current.postMessage({
        type: 'TRANSCRIPTION_UPDATE',
        transcriptions,
        duration,
        isConnected,
        isPaused,
        organizationName,
        clientData,
      }, window.location.origin);
    }
  }, [transcriptions, duration, isConnected, isPaused, organizationName, clientData]);

  // Abrir em nova janela pop-out
  const handlePopOut = () => {
    const width = 400;
    const height = 600;
    const left = window.screen.width - width - 20;
    const top = 50;
    
    const clientDataJson = JSON.stringify(clientData || {});
    const popoutHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Transcrição - ${organizationName}</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #f5f5f5;
            display: flex;
            flex-direction: column;
            height: 100vh;
          }
          .header {
            background: #ef4444;
            color: white;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .pulse {
            width: 10px;
            height: 10px;
            background: white;
            border-radius: 50%;
            animation: pulse 1.5s infinite;
          }
          .pulse.paused {
            background: #fbbf24;
            animation: none;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
          }
          .main {
            display: flex;
            flex: 1;
            overflow: hidden;
          }
          .insights {
            width: 45%;
            padding: 12px;
            background: #fafafa;
            border-right: 1px solid #e5e5e5;
            overflow-y: auto;
          }
          .insights h3 {
            font-size: 11px;
            text-transform: uppercase;
            color: #666;
            margin-bottom: 12px;
            font-weight: 600;
          }
          .insight-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
            margin-bottom: 8px;
            color: #333;
          }
          .insight-item svg {
            width: 14px;
            height: 14px;
            color: #666;
          }
          .ai-insight {
            background: #dbeafe;
            padding: 8px;
            border-radius: 6px;
            font-size: 11px;
            margin-top: 12px;
          }
          .ai-insight strong {
            color: #3b82f6;
          }
          .transcription-panel {
            width: 55%;
            display: flex;
            flex-direction: column;
          }
          .status {
            padding: 8px 12px;
            background: #e5e5e5;
            font-size: 11px;
            display: flex;
            gap: 8px;
            align-items: center;
          }
          .badge {
            background: #22c55e;
            color: white;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 10px;
          }
          .transcriptions {
            padding: 8px;
            flex: 1;
            overflow-y: auto;
            background: white;
          }
          .segment {
            background: #f5f5f5;
            padding: 6px 10px;
            margin-bottom: 6px;
            border-radius: 6px;
            font-size: 12px;
          }
          .segment.partial {
            background: #fef3c7;
            font-style: italic;
            color: #666;
          }
          .speaker {
            font-weight: 600;
            font-size: 10px;
            color: #3b82f6;
            margin-bottom: 2px;
          }
          .empty {
            text-align: center;
            color: #999;
            padding: 30px;
            font-size: 12px;
          }
          .footer {
            padding: 10px;
            background: #f0f0f0;
            border-top: 1px solid #e5e5e5;
            display: flex;
            gap: 8px;
          }
          .btn {
            flex: 1;
            padding: 8px 12px;
            border: none;
            border-radius: 6px;
            font-size: 12px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 4px;
          }
          .btn-pause {
            background: #e5e5e5;
            color: #333;
          }
          .btn-pause:hover {
            background: #d5d5d5;
          }
          .btn-end {
            background: #ef4444;
            color: white;
          }
          .btn-end:hover {
            background: #dc2626;
          }
          select {
            padding: 8px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 11px;
            background: white;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="pulse" id="pulseIndicator"></div>
          <span id="orgName">${organizationName}</span>
          <span id="duration">00:00</span>
        </div>
        
        <div class="main">
          <div class="insights">
            <h3>📊 Insights do Cliente</h3>
            <div id="insightsContent">
              <div class="insight-item">Carregando dados...</div>
            </div>
          </div>
          
          <div class="transcription-panel">
            <div class="status">
              <span class="badge" id="connectionBadge">🟢 Conectado</span>
              <span id="segmentCount">0 seg</span>
            </div>
            <div class="transcriptions" id="transcriptions">
              <div class="empty">🎙️ Aguardando fala...</div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <button class="btn btn-pause" id="pauseBtn" onclick="togglePause()">
            ⏸️ Pausar
          </button>
          <select id="statusSelect">
            <option value="em_andamento">Em andamento</option>
            <option value="no_show">No-show</option>
            <option value="finalizado">Finalizado</option>
          </select>
          <button class="btn btn-end" onclick="endMeeting()">
            ⏹️ Encerrar
          </button>
        </div>
        
        <script>
          let isPaused = false;
          const initialClientData = ${clientDataJson};
          
          // Renderizar insights iniciais
          renderInsights(initialClientData);
          
          function renderInsights(data) {
            const container = document.getElementById('insightsContent');
            if (!data || Object.keys(data).length === 0) {
              container.innerHTML = '<div class="insight-item" style="color:#999;font-style:italic;">Dados do cliente serão exibidos aqui</div>';
              return;
            }
            
            let html = '';
            if (data.since) {
              html += '<div class="insight-item">📅 Cliente desde ' + data.since + '</div>';
            }
            if (data.healthScore) {
              html += '<div class="insight-item">📈 Health Score: ' + data.healthScore + '</div>';
            }
            if (data.lastActivity) {
              html += '<div class="insight-item">📝 ' + data.lastActivity + '</div>';
            }
            if (data.insights) {
              html += '<div class="ai-insight"><strong>🤖 IA:</strong> ' + data.insights + '</div>';
            }
            
            container.innerHTML = html || '<div class="insight-item" style="color:#999;">Sem dados disponíveis</div>';
          }
          
          function togglePause() {
            isPaused = !isPaused;
            const btn = document.getElementById('pauseBtn');
            const pulse = document.getElementById('pulseIndicator');
            btn.innerHTML = isPaused ? '▶️ Continuar' : '⏸️ Pausar';
            pulse.classList.toggle('paused', isPaused);
            window.opener?.postMessage({ type: 'TOGGLE_PAUSE' }, window.location.origin);
          }
          
          function endMeeting() {
            const status = document.getElementById('statusSelect').value;
            window.opener?.postMessage({ type: 'END_MEETING', status }, window.location.origin);
            window.close();
          }
          
          window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            if (event.data.type === 'TRANSCRIPTION_UPDATE') {
              const { transcriptions, duration, isConnected, isPaused: pausedState, clientData } = event.data;
              
              // Atualizar duration
              const mins = Math.floor(duration / 60);
              const secs = duration % 60;
              document.getElementById('duration').textContent = 
                mins.toString().padStart(2, '0') + ':' + secs.toString().padStart(2, '0');
              
              // Atualizar connection
              document.getElementById('connectionBadge').textContent = 
                isConnected ? '🟢 Conectado' : '🔴 Desconectado';
              document.getElementById('connectionBadge').style.background = 
                isConnected ? '#22c55e' : '#ef4444';
              
              // Atualizar pause state
              if (pausedState !== undefined && pausedState !== isPaused) {
                isPaused = pausedState;
                document.getElementById('pauseBtn').innerHTML = isPaused ? '▶️ Continuar' : '⏸️ Pausar';
                document.getElementById('pulseIndicator').classList.toggle('paused', isPaused);
              }
              
              // Atualizar insights
              if (clientData) {
                renderInsights(clientData);
              }
              
              // Atualizar segment count
              const finalCount = transcriptions.filter(t => t.is_final).length;
              document.getElementById('segmentCount').textContent = finalCount + ' seg';
              
              // Atualizar transcrições
              const container = document.getElementById('transcriptions');
              if (transcriptions.length === 0) {
                container.innerHTML = '<div class="empty">🎙️ Aguardando fala...</div>';
              } else {
                function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
              container.innerHTML = transcriptions.map(t =>
                  '<div class="segment ' + (t.is_final ? '' : 'partial') + '">' +
                    '<div class="speaker">' + esc(t.speaker) + '</div>' +
                    '<div>' + esc(t.text) + '</div>' +
                  '</div>'
                ).join('');
                container.scrollTop = container.scrollHeight;
              }
            }
          });
        </script>
      </body>
      </html>
    `;
    
    const popout = window.open('', 'TranscriptionPopout', 
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );
    
    if (popout) {
      popout.document.write(popoutHtml);
      popout.document.close();
      popoutWindowRef.current = popout;
      
      // Enviar dados iniciais
      setTimeout(() => {
        popout.postMessage({
          type: 'TRANSCRIPTION_UPDATE',
          transcriptions,
          duration,
          isConnected,
          organizationName,
        }, window.location.origin);
      }, 100);
    }
    
    toast({
      title: "📺 Janela aberta",
      description: "Acompanhe a transcrição na nova janela",
    });
  };

  // Abre o modal de encerramento
  const handleOpenFinishModal = () => {
    stopTranscription();
    setShowFinishModal(true);
  };

  // Função legada para compatibilidade (usada no select de status e pop-out window)
  const handleFinishLegacy = (status: string = 'completed') => {
    setFinishStatus(status === 'no_show' ? 'no_show' : 'completed');
    handleOpenFinishModal();
  };
  handleFinishRef.current = handleFinishLegacy;

  // Helper: Supabase call com timeout (evita hang se token expirou)
  const supabaseWithTimeout = async <T,>(promise: PromiseLike<T>, ms = 10000): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Supabase timeout (${ms}ms)`)), ms)),
    ]);
  };

  // Helper: PATCH direto via fetch — bypassa Supabase client que pode travar após token refresh
  const directPatch = async (table: string, id: string, body: Record<string, any>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Tentar pegar token válido, com timeout de 2s
    let token = supabaseKey;
    try {
      const { data } = await Promise.race([
        supabase.auth.getSession(),
        new Promise<{ data: { session: null } }>((resolve) =>
          setTimeout(() => resolve({ data: { session: null } }), 2000)
        ),
      ]);
      if (data.session?.access_token) token = data.session.access_token;
    } catch {}

    const resp = await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`PATCH ${table} failed (${resp.status}): ${text}`);
    }
    return resp;
  };

  // Processa a finalização da reunião
  // Estratégia: abrir CallEndedModal IMEDIATAMENTE, salvar DB em background
  const handleConfirmFinish = async () => {
    console.log(`[Meeting] 🚀 handleConfirmFinish — meetingId: ${meetingId}, activityId: ${activityId}, taskType: ${taskType}`);

    // 0. FLUSH do Soniox — força últimos tokens a virarem final antes de coletar
    //    (sem isso os últimos segundos da fala ficam como "interim" e são perdidos)
    if (isTranscribing) {
      try {
        console.log('[Meeting] ⏳ Finalizando transcrição (flush dos últimos tokens)...');
        await finalizeTranscription();
      } catch (e) {
        console.warn('[Meeting] ⚠️ finalizeTranscription falhou, prosseguindo:', e);
      }
    }

    // 1. Coletar transcrições (ref → localStorage → banco)
    const finalTranscriptions = transcriptionsRef.current.filter(t => t.is_final);
    let transcriptionsToSave = finalTranscriptions;
    console.log(`[Meeting] 📊 Ref: ${transcriptionsRef.current.length} total, ${finalTranscriptions.length} finais`);

    if (transcriptionsToSave.length === 0) {
      try {
        const backup = localStorage.getItem(localStorageKey);
        if (backup) {
          transcriptionsToSave = JSON.parse(backup);
          console.log(`[Meeting] 🔄 Recuperado ${transcriptionsToSave.length} do localStorage`);
        }
      } catch {}
    }

    if (transcriptionsToSave.length === 0) {
      try {
        const { data: mtg } = await supabaseWithTimeout(
          supabase.from('meetings').select('transcriptions').eq('id', meetingId).single(),
          5000
        );
        if (mtg?.transcriptions && Array.isArray(mtg.transcriptions) && mtg.transcriptions.length > 0) {
          transcriptionsToSave = mtg.transcriptions;
          console.log(`[Meeting] 🔄 Recuperado ${transcriptionsToSave.length} do banco`);
        }
      } catch (e) {
        console.warn(`[Meeting] ⚠️ Fallback do banco falhou:`, e);
      }
    }

    console.log(`[Meeting] 📋 ${transcriptionsToSave.length} transcrições, status: ${finishStatus}`);

    // 2. Fechar modal de encerramento IMEDIATAMENTE
    setShowFinishModal(false);

    // Helper: mover deal + lead para "Call Realizada" em background
    const moveToCallRealizada = (leadId: string) => {
      const CALL_REALIZADA_STAGE_ID = '11111111-0001-0001-0001-000000000006';
      const CALL_AGENDADA_STAGE_ID = '11111111-0001-0001-0001-000000000004';
      // Só move deals que estão em "Call Agendada" (evita mover deals em outros estágios)
      supabase.from('deals').select('id, pipeline_stage_id')
        .eq('lead_id', leadId)
        .not('status', 'in', '("won","lost")')
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()
        .then(({ data: deal }) => {
          if (deal && deal.pipeline_stage_id === CALL_AGENDADA_STAGE_ID) {
            supabase.from('deals').update({
              pipeline_stage_id: CALL_REALIZADA_STAGE_ID,
              stage_changed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }).eq('id', deal.id).then(() => {
              console.log('[Meeting] ✅ Deal movido para Call Realizada');
            });
            supabase.from('leads').update({
              pipeline_stage_id: CALL_REALIZADA_STAGE_ID,
              updated_at: new Date().toISOString(),
            }).eq('id', leadId).then(() => {
              console.log('[Meeting] ✅ Lead movido para Call Realizada');
            });
          } else {
            console.log('[Meeting] ⏭️ Deal não está em Call Agendada — não moveu automaticamente');
          }
        });
    };

    // 3a. Reagendada: marcar task como rescheduled, criar nova task com nova data
    if (finishStatus === 'rescheduled') {
      if (!rescheduleDate) {
        toast({ title: 'Selecione a nova data/hora', variant: 'destructive' });
        return;
      }

      // Salvar meeting como rescheduled
      supabase.from('meetings').update({
        transcriptions: transcriptionsToSave,
        ended_at: new Date().toISOString(),
        status: 'completed',
      }).eq('id', meetingId).then(({ error }) => {
        if (error) console.error('[Meeting] ❌ Save rescheduled falhou:', error.message);
        try { localStorage.removeItem(localStorageKey); } catch {}
      });

      if (activityId) {
        // Buscar task atual para copiar dados
        const { data: currentTask } = await supabase
          .from('company_activities')
          .select('*')
          .eq('id', activityId)
          .single();

        // Marcar task atual como rescheduled
        await supabase.from('company_activities').update({
          status: 'rescheduled',
          completed: true,
          completed_at: new Date().toISOString(),
          notes: `🔄 Reagendada para ${new Date(rescheduleDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}`,
        }).eq('id', activityId);

        // Criar nova task com a nova data
        if (currentTask) {
          const newScheduledAt = rescheduleDate.includes('+') || rescheduleDate.includes('Z')
            ? rescheduleDate
            : `${rescheduleDate}:00-03:00`;

          const { data: newTask } = await supabase.from('company_activities').insert({
            name: currentTask.name,
            task_type: currentTask.task_type,
            team: currentTask.team,
            lead_id: currentTask.lead_id,
            organization_id: currentTask.organization_id,
            responsavel_id: currentTask.responsavel_id,
            meeting_link: currentTask.meeting_link,
            contact_method: currentTask.contact_method,
            priority: currentTask.priority,
            participants: currentTask.participants,
            scheduled_at: newScheduledAt,
            status: 'scheduled',
            completed: false,
            notes: `🔄 Reagendamento de tarefa anterior`,
          }).select('id').single();

          console.log('[Meeting] ✅ Nova task criada:', newTask?.id);

          // Manter pipeline em "Call Agendada" (safety net via autoMovePipelineOnTaskChange)
          if (currentTask.lead_id) {
            try {
              const { autoMovePipelineOnTaskChange } = await import('@/hooks/useTasks');
              await autoMovePipelineOnTaskChange({
                id: newTask?.id || '',
                lead_id: currentTask.lead_id,
                task_type: currentTask.task_type,
                status: 'pending',
                scheduled_at: newScheduledAt,
              } as any);
            } catch (e) {
              console.warn('[Meeting] ⚠️ Safety net pipeline falhou:', e);
            }
          }
        }
      }

      toast({ title: '🔄 Reunião reagendada', description: `Nova data: ${new Date(rescheduleDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}` });
      await onFinish?.(transcriptionsToSave);
      endMeeting('completed');
      return;
    }

    // 3. No-show: processar e sair (sem análise IA)
    if (finishStatus === 'no_show') {
      // Background: salvar no banco
      supabase.from('meetings').update({
        transcriptions: transcriptionsToSave,
        ended_at: new Date().toISOString(),
        status: 'no_show',
      }).eq('id', meetingId).then(({ error }) => {
        if (error) console.error('[Meeting] ❌ Save no_show falhou:', error.message);
        else console.log('[Meeting] ✅ Meeting no_show salvo');
        try { localStorage.removeItem(localStorageKey); } catch {}
      });

      if (activityId) {
        supabase.from('company_activities').update({
          status: 'no_show', completed: true,
          completed_at: new Date().toISOString(),
          notes: `❌ No-show em ${new Date().toLocaleDateString('pt-BR')}${noShowReason ? ` — Motivo: ${noShowReason}` : ''}`,
        }).eq('id', activityId).then(async ({ error }) => {
          if (error) { console.error('[Meeting] ❌ Update activity falhou:', error); return; }

          // Buscar lead_id e confirmed_by_client da activity
          const { data: activity } = await supabase
            .from('company_activities').select('lead_id, confirmed_by_client').eq('id', activityId!).single();
          if (!activity?.lead_id) return;

          const NO_SHOW_STAGE_ID = '11111111-0001-0001-0001-000000000005';
          const now = new Date().toISOString();

          // Atualizar LEAD (pipeline_stage_id + sales_stage + etapa_funil)
          await supabase.from('leads').update({
            pipeline_stage_id: NO_SHOW_STAGE_ID,
            sales_stage: 'no_show',
            etapa_funil: 'no_show',
            updated_at: now,
          }).eq('id', activity.lead_id);

          // Atualizar DEAL mais recente ativo
          const { data: deal } = await supabase.from('deals')
            .select('id')
            .eq('lead_id', activity.lead_id)
            .in('status', ['negotiation', 'proposal_sent'])
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle();

          if (deal) {
            await supabase.from('deals').update({
              pipeline_stage_id: NO_SHOW_STAGE_ID,
              stage_changed_at: now,
              updated_at: now,
            }).eq('id', deal.id);
          }

          // Auto-enroll na cadência de no-show
          const AGENT_ID = '2d3690f8-3b76-4894-b7e6-8b04e548cc97';
          const cadenceStage = activity.confirmed_by_client
            ? 'No-show_confirmou'
            : 'No-show_nao_confirmou';
          const firstDelay = activity.confirmed_by_client ? 30 : 120;
          await supabase.from('ai_agent_cadence_enrollments').upsert({
            lead_id: activity.lead_id,
            agent_id: AGENT_ID,
            stage: cadenceStage,
            current_step: 0,
            status: 'active',
            next_action_at: new Date(Date.now() + firstDelay * 60 * 1000).toISOString(),
            enrolled_at: new Date().toISOString(),
            last_step_at: null,
            completed_at: null,
            metadata: { source: 'auto_noshow_meeting', confirmed_by_client: !!activity.confirmed_by_client },
          }, { onConflict: 'lead_id,agent_id,stage' });

          console.log('[Meeting] ✅ Lead + deal movidos para No-show no pipeline + cadência enrolled');

          // Disparar automação meeting_no_show
          triggerAutomationRules({
            trigger_type: 'meeting_no_show',
            task_id: activityId!,
            lead_id: activity.lead_id,
            task_type: 'meeting',
          });
        });
      }

      toast({ title: '❌ Marcado como No-show', description: 'Tarefa finalizada' });
      await onFinish?.(transcriptionsToSave);
      endMeeting('no_show');
      return;
    }

    // 4. Completed: ABRIR CallEndedModal PRIMEIRO (não bloquear no save)
    if (taskType === 'onboarding') {
      // Onboarding: GlobalTranscriptionPanel trata tudo via onFinish
      console.log(`[Meeting] 📤 Onboarding — delegando para GlobalTranscriptionPanel`);
      // Salvar meeting em background
      supabase.from('meetings').update({
        transcriptions: transcriptionsToSave,
        ended_at: new Date().toISOString(),
        status: 'completed',
      }).eq('id', meetingId).then(({ error }) => {
        if (error) console.error('[Meeting] ❌ Save falhou:', error.message);
        try { localStorage.removeItem(localStorageKey); } catch {}
      });

      // Onboarding: NÃO marcar como completed aqui!
      // O GlobalTranscriptionPanel vai mover para 'monitoring_7d'

      await onFinish?.(transcriptionsToSave);
      return;
    }

    // Sales call / meeting: delegar CallEndedModal para o pai (GlobalTranscriptionPanel)
    // O TranscriptionPanel será desmontado quando endMeeting() for chamado,
    // então o CallEndedModal precisa viver no pai para não ser destruído
    if (transcriptionsToSave.length > 0) {
      console.log(`[Meeting] 🧠 Delegando CallEndedModal para GlobalTranscriptionPanel`);

      const meetingData = {
        callId: meetingId,
        duration: duration,
        direction: 'OUTGOING' as const,
        peerName: organizationName,
        leadId: null as string | null,
        organizationId: organizationId || null,
        activityId: activityId,
        transcriptions: transcriptionsToSave,
      };

      // Resolver leadId ANTES de abrir o modal (timeout curto)
      try {
        let resolvedLeadId: string | null = null;
        if (activityId) {
          const { data } = await supabaseWithTimeout(
            supabase.from('company_activities').select('lead_id').eq('id', activityId).single(),
            3000
          );
          resolvedLeadId = data?.lead_id || null;
        } else {
          const { data } = await supabaseWithTimeout(
            supabase.from('meetings').select('lead_id').eq('id', meetingId).single(),
            3000
          );
          resolvedLeadId = data?.lead_id || null;
        }
        if (resolvedLeadId) {
          console.log(`[Meeting] ✅ leadId resolvido: ${resolvedLeadId}`);
          meetingData.leadId = resolvedLeadId;
          // Auto-move para "Call Realizada" se deal está em "Call Agendada"
          moveToCallRealizada(resolvedLeadId);
        }
      } catch {
        console.warn(`[Meeting] ⚠️ Timeout buscando leadId — análise continua sem`);
      }

      // Salvar meeting + task via fetch direto (bypassa Supabase client travado)
      directPatch('meetings', meetingId, {
        transcriptions: transcriptionsToSave,
        ended_at: new Date().toISOString(),
        status: 'completed',
      }).then(() => {
        console.log('[Meeting] ✅ Meeting salvo via fetch direto');
        try { localStorage.removeItem(localStorageKey); } catch {}
      }).catch(err => console.error('[Meeting] ❌ Save meeting falhou:', err.message));

      if (activityId) {
        directPatch('company_activities', activityId, {
          status: 'completed', completed: true,
          completed_at: new Date().toISOString(),
        }).then(async () => {
          console.log('[Meeting] ✅ Task salva via fetch direto');
          // Safety net: garantir que pipeline moveu (dynamic import evita dependência circular)
          if (meetingData.leadId) {
            try {
              const { autoMovePipelineOnTaskChange } = await import('@/hooks/useTasks');
              await autoMovePipelineOnTaskChange({
                id: activityId,
                lead_id: meetingData.leadId,
                task_type: 'meeting',
                status: 'completed',
                completed: true,
              } as any);
              console.log('[Meeting] ✅ Safety net pipeline check executado');
            } catch (e) {
              console.warn('[Meeting] ⚠️ Safety net pipeline move falhou:', e);
            }

            // Disparar automação meeting_completed
            triggerAutomationRules({
              trigger_type: 'meeting_completed',
              task_id: activityId,
              lead_id: meetingData.leadId,
              task_type: 'meeting',
            });
          }
        }).catch(err => console.error('[Meeting] ❌ Save task falhou:', err.message));
      }

      // Sinalizar ao pai para mostrar CallEndedModal e encerrar meeting
      onMeetingEnded?.(meetingData);

      await onFinish?.(transcriptionsToSave);
      console.log(`[Meeting] 🏁 handleConfirmFinish FIM — CallEndedModal aberto`);
    } else {
      // Sem transcrições — apenas finalizar
      console.log(`[Meeting] ⏭️ Sem transcrições — finalizando direto`);
      supabase.from('meetings').update({
        ended_at: new Date().toISOString(),
        status: 'completed',
      }).eq('id', meetingId);

      if (activityId) {
        supabase.from('company_activities').update({
          status: 'completed', completed: true,
          completed_at: new Date().toISOString(),
        }).eq('id', activityId).then(async () => {
          // Auto-move para "Call Realizada" + safety net
          const { data } = await supabase.from('company_activities').select('lead_id').eq('id', activityId!).single();
          if (data?.lead_id) {
            moveToCallRealizada(data.lead_id);
            try {
              const { autoMovePipelineOnTaskChange } = await import('@/hooks/useTasks');
              await autoMovePipelineOnTaskChange({
                id: activityId, lead_id: data.lead_id,
                task_type: 'meeting', status: 'completed', completed: true,
              } as any);
            } catch (e) {
              console.warn('[Meeting] ⚠️ Safety net falhou:', e);
            }
          }
        });
      }

      await onFinish?.(transcriptionsToSave);
      endMeeting('completed');
    }
  };

  // Função legada para compatibilidade (usada no select de status e pop-out)
  const handleFinish = async (status: string = 'completed') => {
    setFinishStatus(status === 'no_show' ? 'no_show' : 'completed');
    handleOpenFinishModal();
  };
  handleFinishRef.current = handleFinish;

  // ========================================
  // LOADING STATE (enquanto carrega sessão recuperada)
  // ========================================
  if (isLoadingSession) {
    return (
      <Dialog open={true} onOpenChange={() => onClose?.()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Recuperando Reunião...
            </DialogTitle>
            <DialogDescription>Carregando transcrições da sessão anterior.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            <p className="text-muted-foreground">Carregando transcrições salvas...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================
  // MODAL DE INSTRUÇÕES (centralizado)
  // ========================================
  if (step === 'instructions') {
    return (
      <Dialog open={true} onOpenChange={(open) => {
        if (!open) {
          // During instructions step, end the meeting since it hasn't really started
          endMeeting?.('cancelled');
          onClose?.();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5" />
              Iniciar Reunião - {organizationName}
            </DialogTitle>
            <DialogDescription>Siga os passos para iniciar a transcrição da reunião.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Passo 1 - só mostra se tem meetingLink */}
            {meetingLink ? (
              <div className={cn(
                "p-4 rounded-lg border-2 transition-all",
                instructionStep === 1 ? "border-blue-500 bg-blue-50" : "border-muted bg-muted/30"
              )}>
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold",
                    instructionStep === 1 ? "bg-blue-500" : "bg-muted-foreground"
                  )}>
                    1
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">Abra o Google Meet</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Primeiro, vamos abrir a reunião em uma nova aba
                    </p>
                    {instructionStep === 1 && (
                      <div className="mt-3 space-y-2">
                        <Button className="w-full" onClick={handleOpenMeet}>
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir Google Meet
                        </Button>
                        <Button variant="ghost" className="w-full text-xs text-muted-foreground" onClick={() => setInstructionStep(2)}>
                          Já abri o Meet, pular
                        </Button>
                      </div>
                    )}
                    {instructionStep === 2 && (
                      <Badge variant="outline" className="mt-2 text-green-600 border-green-600">
                        ✓ Meet aberto
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border-2 border-muted bg-muted/30">
                <p className="text-sm text-muted-foreground">
                  Abra o Google Meet em outra aba antes de iniciar a transcrição.
                </p>
              </div>
            )}

            {/* Passo 2 */}
            <div className={cn(
              "p-4 rounded-lg border-2 transition-all",
              instructionStep === 2 ? "border-orange-500 bg-orange-50" : "border-muted bg-muted/30"
            )}>
              <div className="flex items-start gap-3">
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-white font-bold",
                  instructionStep === 2 ? "bg-orange-500" : "bg-muted-foreground"
                )}>
                  2
                </div>
                <div className="flex-1">
                  <h4 className="font-medium">Inicie a Transcrição</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Clique abaixo e <strong>compartilhe a aba do Meet</strong>
                  </p>
                  <p className="text-xs text-orange-600 font-medium mt-1">
                    ⚠️ Marque "Compartilhar áudio" ao selecionar!
                  </p>
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700 font-medium">
                    🔴 Clique em "Gravar" no Google Meet antes de começar!
                  </div>
                  {instructionStep === 2 && (
                    <div className="mt-3 space-y-2">
                      <Button
                        className="w-full bg-orange-500 hover:bg-orange-600"
                        onClick={handleStartTranscription}
                        disabled={isStartingTranscription}
                      >
                        {isStartingTranscription ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Conectando...</>
                        ) : (
                          <><Mic className="h-4 w-4 mr-2" />Iniciar Transcrição</>
                        )}
                      </Button>
                      {startError && (
                        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">Erro ao iniciar</p>
                            <p>{startError}</p>
                          </div>
                        </div>
                      )}
                      {error && !startError && (
                        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <p>{error}</p>
                        </div>
                      )}
                      {meetingLink && (
                        <Button
                          variant="outline"
                          className="w-full text-muted-foreground"
                          onClick={() => window.open(ensureHttps(meetingLink), '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 mr-2" />
                          Abrir Meet (opcional)
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ========================================
  // TELINHA FLUTUANTE (minimizada)
  // ========================================
  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="p-3 shadow-lg border-2 border-red-500 bg-background">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="font-mono text-sm">{formatDuration(duration)}</span>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsMinimized(false)}>
              <Maximize2 className="h-4 w-4" />
            </Button>
            <Button variant="destructive" size="sm" onClick={handleOpenFinishModal}>
              <Square className="h-4 w-4 mr-1" />
              Encerrar
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ========================================
  // TELINHA FLUTUANTE (expandida com insights)
  // ========================================
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[500px]">
      <Card className="shadow-xl border-2 border-red-500">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-red-500 text-white rounded-t-lg">
          <div className="flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
            </span>
            <span className="font-medium">{organizationName}</span>
            <span className="font-mono text-sm">{formatDuration(duration)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-red-600" 
              onClick={handlePopOut}
              title="Abrir em nova janela"
            >
              <ExternalLink className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-white hover:bg-red-600" 
              onClick={() => setIsMinimized(true)}
            >
              <Minimize2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Coach Button */}
        {coachButton && (
          <div className="px-3 py-1.5 border-b bg-muted/20 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">🎯 Sales Coach:</span>
            {coachButton}
          </div>
        )}

        <div className="flex">
          {/* Lado esquerdo: Coach (if active) or Insights do cliente */}
          <div className="w-1/2 p-3 border-r bg-muted/30 flex flex-col">
            {coachContent ? (
              <div className="flex-1 overflow-y-auto">{coachContent}</div>
            ) : (<>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
                📊 Insights do Cliente
              </h4>
              {onViewClient360 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-[10px] px-2"
                  onClick={onViewClient360}
                >
                  <Eye className="h-3 w-3 mr-1" />
                  Ver 360
                </Button>
              )}
            </div>
            
            <ScrollArea className="flex-1 max-h-36">
              <div className="space-y-2 pr-2">
                {clientData?.since && (
                  <div className="flex items-center gap-2 text-xs">
                    <Calendar className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span>Cliente desde {clientData.since}</span>
                  </div>
                )}
                
                {clientData?.healthScore !== undefined && (
                  <div className="flex items-center gap-2 text-xs">
                    <TrendingUp className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span>Health Score: <strong className={clientData.healthScore >= 70 ? 'text-green-600' : clientData.healthScore >= 40 ? 'text-yellow-600' : 'text-red-600'}>{clientData.healthScore}</strong></span>
                  </div>
                )}
                
                {clientData?.lastActivity && (
                  <div className="flex items-center gap-2 text-xs">
                    <MessageSquare className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    <span className="line-clamp-2">{clientData.lastActivity}</span>
                  </div>
                )}

                {/* AI Insights Content - Mostra o conteúdo completo da análise */}
                {clientData?.aiInsightsContent && (
                  <div className="mt-2 p-2 bg-gradient-to-r from-blue-50 to-purple-50 rounded border border-blue-100">
                    <p className="font-medium text-[10px] text-blue-600 mb-1">🤖 Análise IA:</p>
                    <p className="text-[11px] text-gray-700 line-clamp-4 whitespace-pre-wrap">
                      {clientData.aiInsightsContent}
                    </p>
                  </div>
                )}

                {clientData?.insights && !clientData?.aiInsightsContent && (
                  <div className="mt-2 p-2 bg-blue-50 rounded text-xs">
                    <span className="font-medium">🤖 IA:</span> {clientData.insights}
                  </div>
                )}

                {!clientData && (
                  <p className="text-xs text-muted-foreground italic">
                    Dados do cliente serão exibidos aqui
                  </p>
                )}
              </div>
            </ScrollArea>
            </>)}
          </div>

          {/* Lado direito: Transcrição */}
          <div className="w-1/2 flex flex-col">
            {/* Health Status Bar */}
            {isTranscribing && (
              <div className="px-2 py-1 border-b bg-muted/30 flex items-center gap-3 text-[10px]">
                <div className="flex items-center gap-1" title={channelHealth.mic === 'active' ? 'Ativo' : channelHealth.mic === 'reconnecting' ? 'Reconectando...' : 'Desconectado'}>
                  <Mic className="h-3 w-3" />
                  <span className={cn(
                    'h-2 w-2 rounded-full',
                    channelHealth.mic === 'active' && 'bg-green-500',
                    channelHealth.mic === 'reconnecting' && 'bg-yellow-500 animate-pulse',
                    channelHealth.mic === 'dead' && 'bg-red-500',
                  )} />
                </div>
                <div className="flex items-center gap-1" title={channelHealth.system === 'active' ? 'Ativo' : channelHealth.system === 'reconnecting' ? 'Reconectando...' : channelHealth.system === 'dead' ? 'Desconectado' : 'Sem áudio de sistema'}>
                  <Volume2 className="h-3 w-3" />
                  <span className={cn(
                    'h-2 w-2 rounded-full',
                    channelHealth.system === 'active' && 'bg-green-500',
                    channelHealth.system === 'reconnecting' && 'bg-yellow-500 animate-pulse',
                    channelHealth.system === 'dead' && 'bg-red-500',
                    channelHealth.system === 'unavailable' && 'bg-gray-300',
                  )} />
                </div>
                <Badge variant="outline" className="text-[10px] ml-auto">
                  {transcriptions.filter(t => t.is_final).length} seg
                </Badge>
              </div>
            )}

            {/* Status (quando não transcrevendo) */}
            {!isTranscribing && (
            <div className="p-2 border-b bg-muted/50 flex items-center gap-2 text-xs">
              <Badge variant={isConnected ? "default" : "secondary"} className="text-[10px]">
                {isConnected ? '🟢 Conectado' : '🔴 Desconectado'}
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {transcriptions.filter(t => t.is_final).length} seg
              </Badge>
            </div>
            )}

            {/* Transcrições - com smart scroll + copy */}
            <div className="relative flex-1">
              {/* Botões flutuantes: copiar + scroll to bottom */}
              <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
                {transcriptions.filter(t => t.is_final).length > 0 && (
                  <button
                    onClick={handleCopyTranscription}
                    className="p-1 rounded bg-background/80 hover:bg-muted border shadow-sm transition-colors"
                    title="Copiar transcrição"
                  >
                    {showCopied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
                  </button>
                )}
              </div>

              {/* Reconnect overlay — só para erros de REDE (não para erros fatais de API) */}
              {isTranscribing && !isPaused && !isFatalError && (channelHealth.mic === 'dead' || channelHealth.system === 'dead') && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => restartTranscription()}
                    className="gap-2"
                  >
                    <RotateCcw className={cn('h-4 w-4', (channelHealth.mic === 'reconnecting' || channelHealth.system === 'reconnecting') && 'animate-spin')} />
                    Reconectar Transcrição
                  </Button>
                </div>
              )}

            <div
                ref={transcriptionContainerRef}
                onScroll={handleTranscriptionScroll}
                className="h-52 overflow-y-auto p-2 space-y-1 bg-background text-xs"
              >
                {/* Stale warning — inline, not blocking (can be just silence) */}
                {isStale && isTranscribing && !isPaused && channelHealth.mic !== 'dead' && channelHealth.system !== 'dead' && (
                  <div className="text-amber-700 p-2 bg-amber-50 rounded text-[10px] border border-amber-200 sticky top-0 z-10 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                      <span>Sem dados há 20s. Se não há silêncio, verifique o compartilhamento de aba.</span>
                    </div>
                    <button
                      onClick={() => restartTranscription()}
                      className="w-full text-center py-1 px-2 bg-amber-600 text-white rounded text-[10px] font-medium hover:bg-amber-700 transition-colors"
                    >
                      <RotateCcw className="h-3 w-3 inline mr-1" />
                      Reconectar Transcrição
                    </button>
                  </div>
                )}

                {error && (
                  <div className={cn(
                    "p-1.5 rounded text-[10px] flex items-start gap-1.5",
                    isFatalError ? "text-amber-700 bg-amber-50 border border-amber-200" : "text-red-500 bg-red-50"
                  )}>
                    {isFatalError ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <span>❌</span>}
                    <span>{isFatalError ? 'Serviço de transcrição indisponível (sem créditos Soniox). A reunião pode continuar sem transcrição.' : error}</span>
                  </div>
                )}

                {transcriptions.length === 0 && !error && (
                  <div className="text-center text-muted-foreground py-4">
                    <Mic className="h-6 w-6 mx-auto mb-1 opacity-50" />
                    <p>Aguardando fala...</p>
                  </div>
                )}

                {transcriptions.map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "p-1.5 rounded",
                      t.is_final ? "bg-muted" : "bg-muted/50 italic text-muted-foreground"
                    )}
                  >
                    <span className="font-medium text-[10px] text-primary">{t.speaker}: </span>
                    <span>{t.text}</span>
                  </div>
                ))}
                <div ref={transcriptionEndRef} />
              </div>

              {/* Botão flutuante para voltar ao final */}
              {userScrolledUp && (
                <button
                  onClick={scrollToBottom}
                  className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1 px-2 py-1 rounded-full bg-primary text-primary-foreground text-[10px] shadow-lg hover:opacity-90 transition-opacity"
                >
                  <ArrowDown className="h-3 w-3" />
                  Novas falas
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Footer com controles */}
        <div className="p-2 border-t bg-muted/30 flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleTogglePause}
            className="flex-1"
          >
            {isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
            {isPaused ? 'Continuar' : 'Pausar'}
          </Button>

          <Button 
            variant="destructive" 
            size="sm"
            onClick={handleOpenFinishModal}
            className="flex-1"
          >
            <Square className="h-3 w-3 mr-1" />
            Encerrar
          </Button>
        </div>
      </Card>

      {/* Modal de Encerramento */}
      <Dialog open={showFinishModal} onOpenChange={setShowFinishModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Square className="h-5 w-5" />
              Encerrar Reunião
            </DialogTitle>
            <DialogDescription>Selecione como a reunião foi finalizada.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Resumo da reunião */}
            <div className="p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Duração:</span>
                <span className="font-mono font-medium">{formatDuration(duration)}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-muted-foreground">Transcrições:</span>
                <span className="font-medium">{transcriptions.filter(t => t.is_final).length} segmentos</span>
              </div>
            </div>

            {/* Seleção de status */}
            <div className="space-y-3">
              <Label className="text-sm font-medium">Como foi a reunião?</Label>
              <RadioGroup value={finishStatus} onValueChange={(v) => setFinishStatus(v as 'completed' | 'no_show' | 'rescheduled')}>
                <div className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                  finishStatus === 'completed' ? "border-green-500 bg-green-50" : "border-muted hover:border-green-200"
                )}>
                  <RadioGroupItem value="completed" id="status-completed" />
                  <Label htmlFor="status-completed" className="flex items-center gap-2 cursor-pointer flex-1">
                    <CheckCircle2 className="h-5 w-5 text-green-600" />
                    <div>
                      <p className="font-medium">Finalizada</p>
                      <p className="text-xs text-muted-foreground">Reunião aconteceu normalmente</p>
                    </div>
                  </Label>
                </div>
                <div className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                  finishStatus === 'no_show' ? "border-red-500 bg-red-50" : "border-muted hover:border-red-200"
                )}>
                  <RadioGroupItem value="no_show" id="status-noshow" />
                  <Label htmlFor="status-noshow" className="flex items-center gap-2 cursor-pointer flex-1">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <div>
                      <p className="font-medium">No-show</p>
                      <p className="text-xs text-muted-foreground">Cliente não compareceu</p>
                    </div>
                  </Label>
                </div>
                <div className={cn(
                  "flex items-center space-x-3 p-3 rounded-lg border-2 cursor-pointer transition-all",
                  finishStatus === 'rescheduled' ? "border-purple-500 bg-purple-50" : "border-muted hover:border-purple-200"
                )}>
                  <RadioGroupItem value="rescheduled" id="status-rescheduled" />
                  <Label htmlFor="status-rescheduled" className="flex items-center gap-2 cursor-pointer flex-1">
                    <RotateCcw className="h-5 w-5 text-purple-600" />
                    <div>
                      <p className="font-medium">Reagendada</p>
                      <p className="text-xs text-muted-foreground">Cliente reagendou com antecedência</p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {/* Motivo do no-show */}
            {finishStatus === 'no_show' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Motivo do no-show</Label>
                <textarea
                  className="w-full min-h-[80px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Ex: Cliente não atendeu, desmarcou em cima da hora, não entrou no link..."
                  value={noShowReason}
                  onChange={(e) => setNoShowReason(e.target.value)}
                />
              </div>
            )}

            {/* Data/hora do reagendamento */}
            {finishStatus === 'rescheduled' && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nova data e hora</Label>
                <input
                  type="datetime-local"
                  className="w-full p-3 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                />
                {!rescheduleDate && (
                  <p className="text-xs text-purple-600">Selecione quando a reunião será reagendada</p>
                )}
              </div>
            )}

            {/* Info sobre análise com IA (só se finalizada e tem transcrições) */}
            {finishStatus === 'completed' && transcriptions.filter(t => t.is_final).length > 0 && (
              <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <Label className="text-sm font-medium flex items-center gap-2 text-blue-800">
                  <Sparkles className="h-4 w-4" />
                  Análise com IA
                </Label>
                <p className="text-xs text-blue-700">
                  A transcrição será analisada automaticamente para gerar resumo, pontos principais e próximos passos.
                </p>
              </div>
            )}

            {/* Aviso se não tem transcrições */}
            {finishStatus === 'completed' && transcriptions.filter(t => t.is_final).length === 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-yellow-800">Sem transcrições</p>
                  <p className="text-xs text-yellow-700">Nenhuma fala foi capturada. A análise com IA não será realizada.</p>
                </div>
              </div>
            )}
          </div>

          {/* Botões */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowFinishModal(false)}
              disabled={isProcessingAI}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmFinish}
              disabled={isProcessingAI || (finishStatus === 'rescheduled' && !rescheduleDate)}
              className={cn(
                "flex-1",
                finishStatus === 'completed' ? "bg-green-600 hover:bg-green-700" :
                finishStatus === 'rescheduled' ? "bg-purple-600 hover:bg-purple-700" :
                "bg-red-600 hover:bg-red-700"
              )}
            >
              {isProcessingAI ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processando...</>
              ) : finishStatus === 'completed' ? (
                <><CheckCircle2 className="h-4 w-4 mr-2" />Finalizar e Analisar</>
              ) : finishStatus === 'rescheduled' ? (
                <><RotateCcw className="h-4 w-4 mr-2" />Reagendar</>
              ) : (
                <><XCircle className="h-4 w-4 mr-2" />Marcar No-show</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* CallEndedModal movido para GlobalTranscriptionPanel para evitar desmontagem prematura */}
    </div>
  );
}
