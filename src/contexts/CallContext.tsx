import { createContext, useContext, useEffect, useState, useCallback, ReactNode, useRef } from 'react';
import { Wavoip, Device, CallOffer, CallOutgoing, CallActive } from '@wavoip/wavoip-api';
import { useAuth } from './AuthContext';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useCallTranscription, TranscriptionSegment } from '@/hooks/useCallTranscription';
import { useCallRecording } from '@/hooks/useCallRecording';
import { setCallMode } from '@/lib/call-mode';
import { wavoipRemoteCapture } from '@/lib/wavoip-init';

// =====================================================
// TYPES
// =====================================================

export interface WavoipDevice {
  id: string;
  team_member_id: string;
  token: string;
  name: string;
  phone_number: string | null;
  status: 'connected' | 'disconnected' | 'connecting' | 'error' | 'hibernating' | 'open' | 'close';
  is_active: boolean;
}

export interface ActiveCall {
  id: string;
  wavoip_call_id: string;
  direction: 'INCOMING' | 'OUTGOING';
  status: string;
  peerPhone: string;
  peerName?: string;
  profilePicture?: string | null;
  startedAt: Date;
  duration: number;
  isMuted: boolean;
  isPeerMuted: boolean;
  leadId?: string;
}

export interface CallEndedResult {
  callId: string;
  duration: number;
  direction: 'INCOMING' | 'OUTGOING';
  peerPhone: string;
  peerName?: string;
  leadId?: string;
  aiProcessing: boolean;
  summary?: string;
  sentiment?: string;
  keyPoints?: string[];
  suggestedTasks?: Array<{
    titulo: string;
    descricao: string;
    prioridade: string;
  }>;
  transcriptions?: TranscriptionSegment[];
}

// Extended CallActive type with our patched methods
interface CallActiveExtended extends CallActive {
  _transport?: any;
  getRemoteAudioStream?: () => MediaStream | null;
}

export interface WhatsAppDraft {
  leadId: string;
  message: string;
  leadName: string;
}

interface CallContextType {
  // Estado
  device: WavoipDevice | null;
  deviceLoading: boolean;
  isConnected: boolean;
  activeCall: ActiveCall | null;
  callEndedResult: CallEndedResult | null;
  incomingOffer: CallOffer | null;

  // Transcrição
  transcriptions: TranscriptionSegment[];
  isTranscribing: boolean;
  transcriptionError: string | null;

  // Gravação
  isRecording: boolean;

  // WhatsApp draft (mensagem pré-preenchida para revisar antes de enviar)
  whatsappDraft: WhatsAppDraft | null;
  clearWhatsAppDraft: () => void;

  // Ações
  connectWavoip: () => void;
  disconnectWavoip: () => void;
  initiateCall: (phoneNumber: string, leadId?: string) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => Promise<void>;

  // Modais
  showIncomingModal: boolean;
  showActiveCallModal: boolean;
  showCallEndedModal: boolean;
  setShowIncomingModal: (show: boolean) => void;
  setShowActiveCallModal: (show: boolean) => void;
  setShowCallEndedModal: (show: boolean) => void;

  // Configuração
  refreshDevice: () => Promise<void>;
  restartDevice: () => Promise<void>;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

// =====================================================
// PROVIDER
// =====================================================

export function CallProvider({ children }: { children: ReactNode }) {
  const { teamMember } = useAuth();
  const { toast } = useToast();

  const [device, setDevice] = useState<WavoipDevice | null>(null);
  const [deviceLoading, setDeviceLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [callEndedResult, setCallEndedResult] = useState<CallEndedResult | null>(null);
  const [incomingOffer, setIncomingOffer] = useState<CallOffer | null>(null);

  const [showIncomingModal, setShowIncomingModal] = useState(false);
  const [showActiveCallModal, setShowActiveCallModal] = useState(false);
  const [showCallEndedModal, setShowCallEndedModal] = useState(false);
  const [whatsappDraft, setWhatsappDraft] = useState<WhatsAppDraft | null>(null);

  const clearWhatsAppDraft = useCallback(() => setWhatsappDraft(null), []);

  const wavoipRef = useRef<Wavoip | null>(null);
  const wavoipDeviceRef = useRef<Device | null>(null);
  const isConnectedRef = useRef(false);
  const activeCallRef = useRef<CallActiveExtended | CallOutgoing | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const callHistoryIdRef = useRef<string | null>(null);
  const outgoingInProgressRef = useRef(false);
  const callAcceptedRef = useRef(false);
  const callStartTimeRef = useRef<Date | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const peerNameRef = useRef<string | undefined>(undefined);
  const autoSaveIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedSegmentCountRef = useRef(0);
  const preserveTranscriptionsRef = useRef(false);

  // Sincronizar peerNameRef com activeCall
  useEffect(() => {
    peerNameRef.current = activeCall?.peerName;
  }, [activeCall?.peerName]);

  // Hook de transcrição
  const {
    isTranscribing,
    transcriptions,
    transcriptionsRef,
    error: transcriptionError,
    startTranscription,
    stopTranscription,
    finalizeTranscription,
    clearTranscriptions,
    restoreTranscriptions,
  } = useCallTranscription({
    onTranscription: () => {},
    onError: (error) => {
      console.error('[CallProvider] Erro na transcrição:', error);
    },
  });

  // Hook de gravação de áudio
  const {
    isRecording,
    startRecording,
    stopRecording,
    uploadRecording,
  } = useCallRecording();

  // Função para iniciar transcrição quando chamada fica ativa
  // Helper: tentar obter remote audio stream com retries (playback_node pode não estar pronto)
  const getRemoteStreamWithRetry = useCallback(async (_call: CallActiveExtended, maxAttempts = 15, delayMs = 400): Promise<MediaStream | null> => {
    // Os streams remotos sao capturados via proxies em wavoip-init.ts:
    //   - OUTGOING: Proxy(AudioWorkletNode) detecta processor "audio-data-worklet-stream"
    //     e conecta num MediaStreamDestination (classe `z` do SDK).
    //   - INCOMING: Proxy(RTCPeerConnection) escuta 'track' e captura event.streams[0]
    //     (classe `_` do SDK).
    // Aqui so fazemos polling no singleton ate o stream estar pronto.
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Resumir AudioContext do OUTGOING se suspenso (comum no primeiro load).
      const ctx = wavoipRemoteCapture.outgoingAudioContext;
      if (ctx && ctx.state === 'suspended') {
        try { await ctx.resume(); } catch (_) {}
      }

      const stream = wavoipRemoteCapture.outgoingStream || wavoipRemoteCapture.incomingStream;
      if (stream && stream.getAudioTracks().length > 0) {
        console.log(`[CallProvider] ✅ Remote audio stream pronto (tentativa ${attempt}/${maxAttempts}, ${wavoipRemoteCapture.outgoingStream ? 'OUTGOING' : 'INCOMING'})`);
        return stream;
      }

      if (attempt % 5 === 0) {
        console.log(`[CallProvider] tentativa ${attempt}/${maxAttempts} — outgoing=${!!wavoipRemoteCapture.outgoingStream}, incoming=${!!wavoipRemoteCapture.incomingStream}`);
      }

      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.error('[CallProvider] ❌ Remote audio nao capturado — proxies do wavoip-init nao dispararam');
    toast({ title: 'Áudio do cliente não capturado', description: 'Transcrição será apenas do seu microfone' });
    return null;
  }, []);

  const startCallTranscription = useCallback(async (call: CallActiveExtended, peerName?: string) => {
    let micStream: MediaStream | null = null;
    let remoteStream: MediaStream | null = null;

    try {
      // Obter stream do microfone
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      micStreamRef.current = micStream;

      // Obter stream de áudio remoto com retry (playback_node pode demorar a inicializar)
      remoteStream = await getRemoteStreamWithRetry(call);
    } catch (error) {
      console.error('[CallProvider] Erro ao obter streams de áudio:', error);
    }

    // Iniciar gravação SEMPRE que tiver microfone (independente da transcrição)
    if (micStream) {
      try {
        startRecording(micStream, remoteStream);
      } catch (error) {
        console.error('[CallProvider] Erro ao iniciar gravação:', error);
      }
    }

    // Iniciar transcrição separadamente (pode falhar sem afetar gravação)
    if (micStream) {
      try {
        await startTranscription({
          micStream,
          remoteStream,
          speakerName: 'Você',
          remoteSpeakerName: peerName || 'Cliente',
          preserveExisting: preserveTranscriptionsRef.current,
        });
        preserveTranscriptionsRef.current = false; // Reset flag after use
      } catch (error) {
        console.error('[CallProvider] Erro ao iniciar transcrição:', error);
      }
    }
  }, [startTranscription, startRecording, getRemoteStreamWithRetry]);

  // Auto-save transcrições a cada 10s durante chamada ativa
  const startAutoSave = useCallback(() => {
    if (autoSaveIntervalRef.current) return;
    lastSavedSegmentCountRef.current = transcriptionsRef.current.filter(t => t.is_final).length;

    autoSaveIntervalRef.current = setInterval(async () => {
      if (!callHistoryIdRef.current) return;

      const finalSegments = transcriptionsRef.current.filter(t => t.is_final);
      if (finalSegments.length === lastSavedSegmentCountRef.current) return; // No new segments

      lastSavedSegmentCountRef.current = finalSegments.length;

      // Save to DB
      await supabase
        .from('call_history')
        .update({ transcriptions: finalSegments })
        .eq('id', callHistoryIdRef.current);

      // Backup to localStorage as safety net
      try {
        localStorage.setItem(
          `call_transcription_backup_${callHistoryIdRef.current}`,
          JSON.stringify(finalSegments)
        );
      } catch {}

      console.log(`[CallProvider] Auto-save: ${finalSegments.length} segments saved`);
    }, 10000);
  }, [transcriptionsRef]);

  const stopAutoSave = useCallback(() => {
    if (autoSaveIntervalRef.current) {
      clearInterval(autoSaveIntervalRef.current);
      autoSaveIntervalRef.current = null;
    }
    // Clean up localStorage backup after successful save
    if (callHistoryIdRef.current) {
      try {
        localStorage.removeItem(`call_transcription_backup_${callHistoryIdRef.current}`);
      } catch {}
    }
  }, []);

  // Função para parar transcrição e salvar
  const stopCallTranscription = useCallback(async () => {
    // Parar auto-save
    stopAutoSave();

    // FLUSH do Soniox — força últimos tokens interim a virarem final antes de coletar.
    // (sem isso, os últimos segundos da fala são perdidos)
    try {
      await finalizeTranscription();
    } catch (e) {
      console.warn('[CallProvider] finalizeTranscription falhou, fallback pro stop simples:', e);
      stopTranscription();
    }

    // Parar gravação de áudio e fazer upload (AWAITED - não pode ser fire-and-forget)
    const recordingBlob = await stopRecording();
    if (recordingBlob && recordingBlob.size > 0 && callHistoryIdRef.current) {
      try {
        await uploadRecording(callHistoryIdRef.current);
      } catch (error) {
        console.error('[CallProvider] Erro ao fazer upload da gravação:', error);
      }
    }

    // Parar stream do microfone
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(track => track.stop());
      micStreamRef.current = null;
    }

    // Resetar singleton de captura de audio remoto pra proxima chamada
    wavoipRemoteCapture.reset();

    // Salvar transcrições no banco
    if (callHistoryIdRef.current && transcriptionsRef.current.length > 0) {
      const finalTranscriptions = transcriptionsRef.current.filter(t => t.is_final);

      if (finalTranscriptions.length > 0) {
        await supabase
          .from('call_history')
          .update({ transcriptions: finalTranscriptions })
          .eq('id', callHistoryIdRef.current);
      }
    }
  }, [finalizeTranscription, stopTranscription, stopRecording, uploadRecording, transcriptionsRef, stopAutoSave]);

  // Buscar device do usuário no banco
  const fetchDevice = useCallback(async () => {
    if (!teamMember?.id) {
      setDevice(null);
      setDeviceLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('wavoip_devices')
        .select('*')
        .eq('team_member_id', teamMember.id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('[CallProvider] Erro ao buscar device:', error.code, error.message);
      }

      setDevice(data);
    } catch (e) {
      console.error('[CallProvider] Erro:', e);
    } finally {
      setDeviceLoading(false);
    }
  }, [teamMember?.id]);

  // Buscar device quando team member mudar
  useEffect(() => {
    fetchDevice();
  }, [fetchDevice]);

  // Conectar WaVoIP sob demanda (não mais auto-connect)
  const connectWavoip = useCallback(() => {
    if (!device?.token) {
      toast({ title: 'Sem dispositivo WaVoIP configurado', variant: 'destructive' });
      return;
    }

    // Já conectado
    if (wavoipRef.current && wavoipDeviceRef.current) {
      return;
    }

    // Criar instância do WaVoIP
    const wavoip = new Wavoip({
      tokens: [device.token],
    });

    wavoipRef.current = wavoip;

    // Pegar o dispositivo
    const wavoipDevice = wavoip.devices[0];
    wavoipDeviceRef.current = wavoipDevice;

    if (wavoipDevice) {
      // Escutar mudanças de status
      wavoipDevice.onStatus((status) => {
        const connectedStatuses = ['open'];
        const connected = connectedStatuses.includes(status || '');
        setIsConnected(connected);
        isConnectedRef.current = connected;

        // Atualizar status no banco - TODOS os devices com mesmo token (compartilhados)
        const mappedStatus = status === 'open' ? 'connected' : status || 'disconnected';
        supabase
          .from('wavoip_devices')
          .update({ status: mappedStatus })
          .eq('token', device.token) // Atualiza todos que compartilham o token
          .then(() => {});

        setDevice((prev) => prev ? { ...prev, status: mappedStatus as any } : null);
      });

      // Escutar QRCode (se precisar vincular número)
      wavoipDevice.onQRCode(() => {
        // QRCode received - handled by UI
      });

      // Escutar contato (informações do número conectado)
      wavoipDevice.onContact((type, contact) => {
        if (contact?.phone) {
          // Atualizar TODOS os devices com mesmo token (compartilhados)
          supabase
            .from('wavoip_devices')
            .update({ phone_number: contact.phone })
            .eq('token', device.token)
            .then(() => {});

          setDevice((prev) => prev ? { ...prev, phone_number: contact.phone } : null);
        }
      });
    }

    // Escutar ofertas de chamadas (incoming only)
    wavoip.onOffer(async (offer) => {
      // Ignorar se há uma chamada outgoing em progresso (WaVoIP dispara onOffer para outgoing também)
      if (outgoingInProgressRef.current) {
        console.log('[CallProvider] onOffer ignorado — chamada outgoing em progresso');
        return;
      }
      // Criar registro no banco
      const { data: callHistory } = await supabase
        .from('call_history')
        .insert({
          wavoip_device_id: device.id,
          wavoip_call_id: offer.id,
          team_member_id: teamMember?.id,
          call_type: offer.type,
          direction: 'INCOMING',
          status: 'RINGING',
          peer_phone: offer.peer.phone,
          peer_name: offer.peer.displayName,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (callHistory) {
        callHistoryIdRef.current = callHistory.id;
      }

      // Buscar lead pelo telefone
      const { data: leadId } = await supabase.rpc('find_lead_by_phone', { p_phone: offer.peer.phone });

      // Filtrar: só mostrar chamada se o lead pertence ao usuário atual (ou não tem dono)
      if (leadId && teamMember?.id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('sales_rep_id')
          .eq('id', leadId)
          .single();

        if (lead?.sales_rep_id && lead.sales_rep_id !== teamMember.id) {
          console.log('[CallProvider] onOffer ignorado — lead pertence a outro vendedor:', lead.sales_rep_id);
          return;
        }
      }

      setIncomingOffer(offer);
      setActiveCall({
        id: callHistory?.id || offer.id,
        wavoip_call_id: offer.id,
        direction: 'INCOMING',
        status: offer.status,
        peerPhone: offer.peer.phone,
        peerName: offer.peer.displayName || undefined,
        profilePicture: offer.peer.profilePicture,
        startedAt: new Date(),
        duration: 0,
        isMuted: offer.muted,
        isPeerMuted: offer.peer.muted,
        leadId: leadId || undefined,
      });
      setShowIncomingModal(true);
      playRingtone();

      // Escutar eventos da oferta
      offer.onStatus((status) => {
        setActiveCall((prev) => prev ? { ...prev, status } : null);

        supabase
          .from('call_history')
          .update({ status })
          .eq('id', callHistoryIdRef.current)
          .then(() => {});
      });

      offer.onAcceptedElsewhere(() => {
        stopRingtone();
        setShowIncomingModal(false);
        setIncomingOffer(null);
        toast({ title: 'Chamada atendida em outro dispositivo' });
      });

      offer.onRejectedElsewhere(() => {
        stopRingtone();
        setShowIncomingModal(false);
        setIncomingOffer(null);
      });

      offer.onUnanswered(() => {
        stopRingtone();
        setShowIncomingModal(false);
        setIncomingOffer(null);
        setActiveCall(null);

        supabase
          .from('call_history')
          .update({ status: 'NOT_ANSWERED', ended_at: new Date().toISOString() })
          .eq('id', callHistoryIdRef.current)
          .then(() => {});
      });

      offer.onEnd(() => {
        stopRingtone();
        // Only clear incoming modal state — if call was already accepted,
        // setupActiveCall's call.onEnd() handles the CallEndedModal
        setShowIncomingModal(false);
        // Don't clear incomingOffer if already null (was accepted via answerCall)
        setIncomingOffer((prev) => {
          if (prev) {
            // Offer ended before being accepted (caller hung up during ring)
            setActiveCall(null);
          }
          return null;
        });
      });
    });

    console.log('[CallProvider] WaVoIP conectado sob demanda');
  }, [device?.token, device?.id, teamMember?.id, toast]);

  // Desconectar WaVoIP manualmente
  const disconnectWavoip = useCallback(() => {
    if (wavoipRef.current && device?.token) {
      wavoipRef.current.removeDevices([device.token]);
      wavoipRef.current = null;
      wavoipDeviceRef.current = null;
    }
    setIsConnected(false);
    isConnectedRef.current = false;
    console.log('[CallProvider] WaVoIP desconectado');
  }, [device?.token]);

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (wavoipRef.current && device?.token) {
        wavoipRef.current.removeDevices([device.token]);
      }
    };
  }, [device?.token]);

  // Call Mode - silencia notificações durante chamada ativa
  useEffect(() => {
    const isActive = !!activeCall && ['ACTIVE', 'RINGING', 'CALLING'].includes(activeCall.status);
    setCallMode(isActive);
    return () => setCallMode(false);
  }, [activeCall?.status]);

  // Contador de duração
  useEffect(() => {
    if (activeCall && ['ACTIVE', 'RINGING', 'CALLING'].includes(activeCall.status)) {
      durationIntervalRef.current = setInterval(() => {
        setActiveCall((prev) =>
          prev ? { ...prev, duration: prev.duration + 1 } : null
        );
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
  }, [activeCall?.status]);

  // Função para configurar uma chamada ativa
  const setupActiveCall = useCallback((call: CallActiveExtended, peerName?: string) => {
    // Guard: se a chamada já foi encerrada/limpa, não configurar
    if (!outgoingInProgressRef.current && !activeCallRef.current) {
      console.warn('[CallProvider] setupActiveCall ignorado — chamada já foi encerrada (race condition)');
      return;
    }

    activeCallRef.current = call;
    callStartTimeRef.current = new Date(); // Marcar início da chamada

    // Iniciar transcrição automaticamente com o nome do peer
    // preserveTranscriptionsRef is set in initiateCall when redial is detected
    startCallTranscription(call, peerName);

    // Iniciar auto-save de transcrições
    startAutoSave();

    call.onStatus((status) => {
      setActiveCall((prev) => prev ? { ...prev, status } : null);

      supabase
        .from('call_history')
        .update({ status })
        .eq('id', callHistoryIdRef.current)
        .then(() => {});
    });

    call.onPeerMute(() => {
      setActiveCall((prev) => prev ? { ...prev, isPeerMuted: true } : null);
    });

    call.onPeerUnmute(() => {
      setActiveCall((prev) => prev ? { ...prev, isPeerMuted: false } : null);
    });

    call.onError((err) => {
      console.error('[CallProvider] ========== ERRO NA CHAMADA ==========');
      console.error('[CallProvider] Erro:', err);
      console.error('[CallProvider] Peer:', peerName);
      console.error('[CallProvider] =====================================');
      toast({
        title: 'Erro na chamada',
        description: typeof err === 'string' ? err : JSON.stringify(err),
        variant: 'destructive',
        duration: 15000,
      });
    });

    call.onEnd(async () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }

      // Calcular duração real usando o timestamp de início (evita closure stale)
      const durationSeconds = callStartTimeRef.current
        ? Math.floor((Date.now() - callStartTimeRef.current.getTime()) / 1000)
        : 0;

      let callData: any = null;

      try {
        // Parar transcrição e salvar
        await stopCallTranscription();
      } catch (err) {
        console.error('[CallContext] stopCallTranscription failed:', err);
      }

      try {
        // Atualizar banco
        await supabase
          .from('call_history')
          .update({
            status: 'ENDED',
            ended_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
          })
          .eq('id', callHistoryIdRef.current);

        // Buscar dados atualizados da chamada
        const { data } = await supabase
          .from('call_history')
          .select('*')
          .eq('id', callHistoryIdRef.current)
          .single();
        callData = data;
      } catch (err) {
        console.error('[CallContext] call_history update/fetch failed:', err);
      }

      // ALWAYS set state — even if DB operations failed, the modal must open
      const result: CallEndedResult = {
        callId: callHistoryIdRef.current || '',
        duration: durationSeconds,
        direction: callData?.direction || 'OUTGOING',
        peerPhone: callData?.peer_phone || '',
        peerName: callData?.peer_name,
        leadId: callData?.lead_id,
        aiProcessing: callData?.record_status === 'READY',
        summary: callData?.ai_summary,
        sentiment: callData?.ai_sentiment,
        keyPoints: callData?.ai_key_points,
        suggestedTasks: callData?.ai_suggested_tasks,
        transcriptions: transcriptionsRef.current.filter(t => t.is_final),
      };

      setCallEndedResult(result);
      setShowActiveCallModal(false);
      setShowCallEndedModal(true);
      setActiveCall(null);
      activeCallRef.current = null;
      outgoingInProgressRef.current = false;
      callAcceptedRef.current = false;
      callStartTimeRef.current = null;
    });

    // Estatísticas da chamada
    call.onStats(() => {
      // Stats received - no action needed
    });
  }, [toast, startCallTranscription, stopCallTranscription, transcriptionsRef, startAutoSave]);

  // Ações
  const initiateCall = useCallback(async (phoneNumber: string, leadId?: string) => {
    // Auto-conectar WaVoIP se não estiver conectado
    if (!wavoipRef.current) {
      connectWavoip();
    }
    // Aguardar device ficar connected (status open) — até 8s
    if (!isConnectedRef.current) {
      let waited = 0;
      while (!isConnectedRef.current && waited < 8000) {
        await new Promise(r => setTimeout(r, 200));
        waited += 200;
      }
    }

    if (!wavoipRef.current || !isConnectedRef.current) {
      toast({
        title: 'WaVoIP desconectado',
        description: 'O dispositivo WaVoIP não está conectado. Vá em Configurações → WaVoIP e reconecte.',
        variant: 'destructive',
        duration: 10000,
      });
      return;
    }

    // Verificar se já tem chamada ativa
    if (activeCallRef.current) {
      toast({
        title: 'Chamada em andamento',
        description: 'Encerre a chamada atual antes de iniciar outra.',
        variant: 'destructive',
      });
      return;
    }

    // Solicitar permissão do microfone antes de ligar (parar stream imediatamente — é só permission check)
    try {
      const permStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permStream.getTracks().forEach(t => t.stop());
    } catch (micError) {
      console.error('[CallProvider] Erro ao acessar microfone');
      toast({
        title: 'Permissão necessária',
        description: 'Permita o acesso ao microfone para fazer chamadas.',
        variant: 'destructive',
      });
      return;
    }

    // Normalizar número - detectar se já tem código internacional
    const trimmedPhone = phoneNumber.trim();
    let normalizedPhone = trimmedPhone.replace(/\D/g, '');

    // Se o número original tinha '+', já é internacional - não adicionar 55
    // Se não tinha '+' e é curto (10-11 dígitos = BR sem código país), adicionar 55
    const isInternational = trimmedPhone.startsWith('+') || normalizedPhone.length > 12;
    if (!isInternational && !normalizedPhone.startsWith('55')) {
      normalizedPhone = `55${normalizedPhone}`;
    }

    // Buscar dados do lead (nome + UTM para mensagem personalizada)
    const { data: lead } = leadId
      ? await supabase.from('leads').select('name, utm_source, utm_campaign, utm_content').eq('id', leadId).single()
      : { data: null };

    // Limpar registros fantasma (CALLING/RINGING > 2 min sem progresso)
    const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabase
      .from('call_history')
      .update({ status: 'FAILED', ended_at: new Date().toISOString() })
      .eq('team_member_id', teamMember?.id)
      .in('status', ['CALLING', 'RINGING'])
      .lt('started_at', twoMinAgo);

    // Detecção de sessão: buscar chamada recente ao mesmo número (últimos 15 min)
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const { data: recentCall } = await supabase
      .from('call_history')
      .select('id, transcriptions, call_session_id')
      .eq('peer_phone', normalizedPhone)
      .eq('team_member_id', teamMember?.id)
      .in('status', ['ENDED', 'ACTIVE'])
      .gte('started_at', fifteenMinAgo)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Gerar ou reutilizar session_id
    const sessionId = recentCall?.call_session_id || (recentCall ? crypto.randomUUID() : crypto.randomUUID());
    const isRedial = !!recentCall;

    // Se é rediscagem, restaurar transcrições da chamada anterior
    if (isRedial && recentCall?.transcriptions && Array.isArray(recentCall.transcriptions) && recentCall.transcriptions.length > 0) {
      console.log(`[CallProvider] Rediscagem detectada! Restaurando ${recentCall.transcriptions.length} segmentos da chamada anterior`);

      // Restaurar transcrições anteriores + adicionar separador
      const previousTranscriptions = recentCall.transcriptions as TranscriptionSegment[];
      const separator: TranscriptionSegment = {
        id: Date.now(),
        text: '--- Reconexão ---',
        speaker: 'Sistema',
        speakerType: 'local',
        confidence: 1,
        timestamp: Date.now(),
        is_final: true,
      };

      const restored = [...previousTranscriptions, separator];
      restoreTranscriptions(restored);
      preserveTranscriptionsRef.current = true;

      // Update session_id on previous call if it didn't have one
      if (!recentCall.call_session_id) {
        await supabase
          .from('call_history')
          .update({ call_session_id: sessionId })
          .eq('id', recentCall.id);
      }
    } else {
      // Fluxo normal: limpar transcrições
      clearTranscriptions();
      preserveTranscriptionsRef.current = false;
    }

    // Criar registro no banco
    const { data: callHistory } = await supabase
      .from('call_history')
      .insert({
        wavoip_device_id: device?.id,
        team_member_id: teamMember?.id,
        lead_id: leadId || null,
        call_type: 'whatsapp',
        direction: 'OUTGOING',
        status: 'CALLING',
        peer_phone: normalizedPhone,
        peer_name: lead?.name,
        started_at: new Date().toISOString(),
        call_session_id: sessionId,
      })
      .select()
      .single();

    if (callHistory) {
      callHistoryIdRef.current = callHistory.id;
    }

    // Marcar que há outgoing em progresso (impede onOffer de mostrar modal de incoming)
    outgoingInProgressRef.current = true;
    callAcceptedRef.current = false;

    // Marcar que há outgoing em progresso (impede onOffer de mostrar modal de incoming)
    outgoingInProgressRef.current = true;

    // Mostrar modal de chamada
    setActiveCall({
      id: callHistory?.id || `temp-${Date.now()}`,
      wavoip_call_id: '',
      direction: 'OUTGOING',
      status: 'CALLING',
      peerPhone: normalizedPhone,
      peerName: lead?.name || undefined,
      startedAt: new Date(),
      duration: 0,
      isMuted: false,
      isPeerMuted: false,
      leadId,
    });
    setShowActiveCallModal(true);

    // Tocar tom de discagem ANTES do startCall (que pode demorar)
    playDialingTone();

    try {
      // Iniciar chamada via WaVoIP com timeout de 30s
      const startCallPromise = wavoipRef.current.startCall({
        to: normalizedPhone,
        fromTokens: device?.token ? [device.token] : undefined,
      });

      const timeoutPromise = new Promise<{ call: null; err: { message: string } }>((resolve) => {
        setTimeout(() => {
          resolve({ call: null, err: { message: 'Tempo limite excedido. Verifique se o dispositivo WaVoIP está conectado e tente novamente.' } });
        }, 30000); // 30 segundos de timeout
      });

      const { call, err } = await Promise.race([startCallPromise, timeoutPromise]);

      if (err) {
        // Extrair detalhes do erro
        let errorMsg = err.message || 'Não foi possível iniciar a chamada';
        if ((err as any).devices && (err as any).devices.length > 0) {
          const reasons = (err as any).devices.map((d: any) => d.reason).join(', ');
          errorMsg = reasons || errorMsg;
        }

        // Mapear erros genéricos do WaVoIP para mensagens úteis
        if (errorMsg.toLowerCase().includes('procure o suporte') || errorMsg.toLowerCase().includes('problem')) {
          errorMsg = 'Dispositivo WaVoIP desconectado ou sem sessão ativa. Vá em Configurações → WaVoIP e reconecte o dispositivo.';
        }

        console.error('[CallProvider] Erro startCall:', JSON.stringify(err));

        toast({
          title: 'Erro ao ligar',
          description: errorMsg,
          variant: 'destructive',
          duration: 10000,
        });

        stopDialingTone();
        setShowActiveCallModal(false);
        setActiveCall(null);
        activeCallRef.current = null;
        outgoingInProgressRef.current = false;
        callAcceptedRef.current = false;

        await supabase
          .from('call_history')
          .update({ status: 'FAILED', ended_at: new Date().toISOString() })
          .eq('id', callHistoryIdRef.current);

        // FAILED = erro técnico de conexão, NÃO disparar automação
        // Automação só roda em NOT_ANSWERED, REJECTED (chamada que realmente tocou)
        console.log('[CallProvider] Chamada FAILED (erro técnico) - automação NÃO disparada');

        return;
      }

      if (call) {
        // Guard: se user clicou "encerrar" durante o startCall, cancela imediatamente
        if (!outgoingInProgressRef.current) {
          console.log('[CallProvider] Call retornou mas user já encerrou — desligando');
          stopDialingTone();
          try { await (call as any).end?.(); } catch {}
          if (callHistoryIdRef.current) {
            await supabase
              .from('call_history')
              .update({ status: 'ENDED', ended_at: new Date().toISOString() })
              .eq('id', callHistoryIdRef.current);
          }
          return;
        }

        activeCallRef.current = call;

        // Atualizar com ID real da chamada
        setActiveCall((prev) => prev ? { ...prev, wavoip_call_id: call.id } : null);

        await supabase
          .from('call_history')
          .update({ wavoip_call_id: call.id })
          .eq('id', callHistoryIdRef.current);

        // Escutar eventos da chamada outgoing
        call.onStatus((status) => {
          console.log(`[CallProvider] call.onStatus: ${status}`);
          setActiveCall((prev) => prev ? { ...prev, status } : null);

          supabase
            .from('call_history')
            .update({ status })
            .eq('id', callHistoryIdRef.current)
            .then(() => {});
        });

        call.onPeerAccept((activeCall) => {
          // Guard: se o usuário já desligou antes do peer atender, ignorar
          if (!outgoingInProgressRef.current) {
            console.log('[CallProvider] onPeerAccept ignorado — chamada já foi encerrada pelo usuário');
            try { (activeCall as any).end?.(); } catch (_) { /* best effort cleanup */ }
            return;
          }
          callAcceptedRef.current = true;
          stopDialingTone();
          playConnectedBeep();
          setupActiveCall(activeCall as CallActiveExtended, peerNameRef.current);
        });

        // Fallback: detectar áudio remoto caso onPeerAccept não dispare
        // Verifica energia no stream de áudio remoto a cada 1s por até 60s
        const audioDetectionInterval = setInterval(() => {
          // Parar se a call já foi aceita ou encerrada
          if (callAcceptedRef.current || !outgoingInProgressRef.current) {
            clearInterval(audioDetectionInterval);
            return;
          }
          try {
            let stream: MediaStream | null = null;
            if (typeof (call as any).getRemoteAudioStream === 'function') {
              stream = (call as any).getRemoteAudioStream();
            } else if ((call as any)._transport?.out?.getAudioStream) {
              stream = (call as any)._transport.out.getAudioStream();
            }
            if (!stream) return;

            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            const data = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
            audioCtx.close();

            if (avg > 5) {
              console.log(`[CallProvider] 🎙️ Áudio remoto detectado (avg=${avg.toFixed(1)}) — onPeerAccept não disparou, ativando fallback`);
              clearInterval(audioDetectionInterval);
              callAcceptedRef.current = true;
              stopDialingTone();
              playConnectedBeep();
              setupActiveCall(call as unknown as CallActiveExtended, peerNameRef.current);
            }
          } catch (_) { /* silently ignore analysis errors */ }
        }, 1000);

        // Limpar após 60s se não detectou nada
        setTimeout(() => clearInterval(audioDetectionInterval), 60000);

        call.onPeerReject(async () => {
          const elapsed = callHistory?.started_at
            ? Math.floor((Date.now() - new Date(callHistory.started_at).getTime()) / 1000)
            : '?';
          console.log(`[CallProvider] call.onPeerReject disparado (${elapsed}s após início)`);
          stopDialingTone();
          playRejectedBeep();
          setShowActiveCallModal(false);
          setActiveCall(null);
          outgoingInProgressRef.current = false;

          const now = new Date();
          const callStartTime = callHistory?.started_at ? new Date(callHistory.started_at) : now;
          const elapsedSeconds = Math.floor((now.getTime() - callStartTime.getTime()) / 1000);

          // Rejeição em < 3s provavelmente é silenciamento automático, não rejeição manual
          const probablySilenced = elapsedSeconds < 3;

          await supabase
            .from('call_history')
            .update({
              status: probablySilenced ? 'SILENCED' : 'REJECTED',
              ended_at: now.toISOString(),
            })
            .eq('id', callHistoryIdRef.current);

          if (probablySilenced) {
            console.log(`[CallProvider] Rejeição instantânea (${elapsedSeconds}s) - provavelmente silenciamento`);
            toast({
              title: 'Chamada possivelmente bloqueada',
              description: 'O celular pode estar com "silenciar desconhecidos" ativo. Tente enviar um WhatsApp antes de ligar novamente.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Chamada rejeitada',
            });
          }
        });

        call.onUnanswered(async () => {
          const elapsed = callHistory?.started_at
            ? Math.floor((Date.now() - new Date(callHistory.started_at).getTime()) / 1000)
            : '?';
          console.log(`[CallProvider] call.onUnanswered disparado (${elapsed}s após início)`);
          stopDialingTone();
          setShowActiveCallModal(false);
          setActiveCall(null);

          const now = new Date();
          const callStartTime = callHistory?.started_at ? new Date(callHistory.started_at) : now;
          const elapsedSeconds = Math.floor((now.getTime() - callStartTime.getTime()) / 1000);

          // Chamada que caiu em < 5s provavelmente foi silenciada/bloqueada pelo celular
          const probablySilenced = elapsedSeconds < 5;

          await supabase
            .from('call_history')
            .update({
              status: probablySilenced ? 'SILENCED' : 'NOT_ANSWERED',
              ended_at: now.toISOString(),
            })
            .eq('id', callHistoryIdRef.current);

          if (probablySilenced) {
            console.log(`[CallProvider] Chamada provavelmente silenciada (${elapsedSeconds}s)`);
            toast({
              title: 'Chamada possivelmente bloqueada',
              description: 'O celular pode estar com "silenciar desconhecidos" ativo. Tente enviar um WhatsApp antes de ligar novamente.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: 'Chamada não atendida',
            });
          }
        });

        call.onEnd(async () => {
          stopDialingTone();

          // Guard: se setupActiveCall já assumiu (peer aceitou), ignorar este onEnd
          // O setupActiveCall registra seu próprio onEnd no objeto activeCall
          if (callAcceptedRef.current) {
            console.log('[CallProvider] call.onEnd (outgoing) ignorado — peer já aceitou, setupActiveCall gerencia');
            return;
          }

          console.log('[CallProvider] call.onEnd (outgoing) — chamada encerrada antes de aceitar');
          setShowActiveCallModal(false);
          setActiveCall(null);
          activeCallRef.current = null;
          outgoingInProgressRef.current = false;

          // Atualizar DB — este onEnd é o fallback para chamadas que terminam
          // ANTES do onPeerAccept (ex: rejeitada, sem resposta, erro WaVoIP).
          if (callHistoryIdRef.current) {
            await supabase
              .from('call_history')
              .update({
                status: 'ENDED',
                ended_at: new Date().toISOString(),
              })
              .eq('id', callHistoryIdRef.current)
              .in('status', ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING', 'CONNECTING']);
          }
        });
      }
    } catch (error: any) {
      console.error('[CallProvider] Erro:', error);
      toast({
        title: 'Erro',
        description: error.message || 'Erro ao iniciar chamada',
        variant: 'destructive',
      });
      setShowActiveCallModal(false);
      setActiveCall(null);
    }
  }, [isConnected, device?.id, device?.token, teamMember?.id, toast, setupActiveCall, clearTranscriptions, restoreTranscriptions]);

  const answerCall = useCallback(async () => {
    if (!incomingOffer) {
      return;
    }

    stopRingtone();
    setShowIncomingModal(false);

    const { call, err } = await incomingOffer.accept();

    if (err) {
      console.error('[CallProvider] Erro ao atender:', err);
      toast({
        title: 'Erro ao atender',
        description: err,
        variant: 'destructive',
      });
      setActiveCall(null);
      return;
    }

    if (call) {
      setShowActiveCallModal(true);
      setActiveCall((prev) => prev ? { ...prev, status: 'ACTIVE' } : null);
      setupActiveCall(call as CallActiveExtended, peerNameRef.current);

      await supabase
        .from('call_history')
        .update({ status: 'ACTIVE' })
        .eq('id', callHistoryIdRef.current);
    }

    setIncomingOffer(null);
  }, [incomingOffer, toast, setupActiveCall]);

  const rejectCall = useCallback(async () => {
    if (!incomingOffer) return;

    stopRingtone();
    stopDialingTone();
    setShowIncomingModal(false);

    const { err } = await incomingOffer.reject();

    if (err) {
      console.error('[CallProvider] Erro ao rejeitar:', err);
    }

    await supabase
      .from('call_history')
      .update({ status: 'REJECTED', ended_at: new Date().toISOString() })
      .eq('id', callHistoryIdRef.current);

    setIncomingOffer(null);
    setActiveCall(null);
  }, [incomingOffer]);

  const endCall = useCallback(async () => {
    console.log('[CallProvider] 🛑 endCall() chamado', {
      hasActiveCallRef: !!activeCallRef.current,
      outgoingInProgress: outgoingInProgressRef.current,
      callHistoryId: callHistoryIdRef.current,
    });
    stopDialingTone();
    stopRingtone();

    outgoingInProgressRef.current = false;
    setShowActiveCallModal(false);

    const call = activeCallRef.current;
    activeCallRef.current = null;

    if (!call) {
      console.log('[CallProvider] endCall: sem activeCallRef, só limpando estado');
      setActiveCall(null);
      if (callHistoryIdRef.current) {
        await supabase
          .from('call_history')
          .update({ status: 'ENDED', ended_at: new Date().toISOString() })
          .eq('id', callHistoryIdRef.current)
          .in('status', ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING', 'CONNECTING']);
      }
      return;
    }

    try {
      console.log('[CallProvider] endCall: chamando call.end()', { callKeys: Object.keys(call || {}) });
      const result = await (call as any).end?.();
      console.log('[CallProvider] endCall: call.end() retornou', result);
      if (result?.err) {
        console.error('[CallProvider] Erro ao encerrar:', result.err);
      }
    } catch (e) {
      console.error('[CallProvider] Exceção ao encerrar:', e);
    }

    // Garante que DB reflete ENDED mesmo se call.end() falhou
    if (callHistoryIdRef.current) {
      await supabase
        .from('call_history')
        .update({ status: 'ENDED', ended_at: new Date().toISOString() })
        .eq('id', callHistoryIdRef.current)
        .in('status', ['CALLING', 'RINGING', 'OUTGOING_RING', 'OUTGOING_CALLING', 'CONNECTING', 'ACTIVE']);
    }

    setActiveCall(null);
  }, []);

  const toggleMute = useCallback(async () => {
    const call = activeCallRef.current as CallActive;

    if (!call) return;

    if (activeCall?.isMuted) {
      const { err } = await call.unmute();
      if (!err) {
        setActiveCall((prev) => prev ? { ...prev, isMuted: false } : null);
      }
    } else {
      const { err } = await call.mute();
      if (!err) {
        setActiveCall((prev) => prev ? { ...prev, isMuted: true } : null);
      }
    }
  }, [activeCall?.isMuted]);

  const refreshDevice = useCallback(async () => {
    setDeviceLoading(true);
    await fetchDevice();
  }, [fetchDevice]);

  const restartDevice = useCallback(async () => {
    if (!wavoipDeviceRef.current) {
      toast({
        title: 'Erro',
        description: 'Dispositivo não conectado',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Reiniciando...',
      description: 'Reiniciando o dispositivo WaVoIP',
    });

    try {
      await wavoipDeviceRef.current.restart();

      // Limpar estado local
      setActiveCall(null);
      setIncomingOffer(null);
      setShowActiveCallModal(false);
      setShowIncomingModal(false);
      activeCallRef.current = null;
      outgoingInProgressRef.current = false;

      toast({
        title: 'Dispositivo reiniciando',
        description: 'Aguarde alguns segundos para ficar disponível novamente.',
      });
    } catch (error: any) {
      console.error('[CallProvider] Erro ao reiniciar:', error);
      toast({
        title: 'Erro ao reiniciar',
        description: error.message || 'Não foi possível reiniciar o dispositivo',
        variant: 'destructive',
      });
    }
  }, [toast]);

  return (
    <CallContext.Provider
      value={{
        device,
        deviceLoading,
        isConnected,
        activeCall,
        callEndedResult,
        incomingOffer,
        transcriptions,
        isTranscribing,
        transcriptionError,
        isRecording,
        whatsappDraft,
        clearWhatsAppDraft,
        connectWavoip,
        disconnectWavoip,
        initiateCall,
        answerCall,
        rejectCall,
        endCall,
        toggleMute,
        showIncomingModal,
        showActiveCallModal,
        showCallEndedModal,
        setShowIncomingModal,
        setShowActiveCallModal,
        setShowCallEndedModal,
        refreshDevice,
        restartDevice,
      }}
    >
      {children}
    </CallContext.Provider>
  );
}

export function useCall() {
  const context = useContext(CallContext);
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
}

// =====================================================
// HELPERS
// =====================================================

let ringtoneAudio: HTMLAudioElement | null = null;

function playRingtone() {
  try {
    if (!ringtoneAudio) {
      ringtoneAudio = new Audio('/sounds/ringtone.mp3');
      ringtoneAudio.loop = true;
    }
    ringtoneAudio.play().catch(() => {});
  } catch (e) {
    console.error('Erro ao tocar ringtone:', e);
  }
}

function stopRingtone() {
  if (ringtoneAudio) {
    ringtoneAudio.pause();
    ringtoneAudio.currentTime = 0;
  }
}

// =====================================================
// SONS DO DISCADOR (Web Audio API)
// =====================================================

let dialingInterval: ReturnType<typeof setInterval> | null = null;
let dialingCtx: AudioContext | null = null;

function playDialingTone() {
  stopDialingTone();
  const playBeep = () => {
    try {
      const ctx = new AudioContext();
      dialingCtx = ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 425; // Tom padrão BR
      gain.gain.value = 0.12;
      osc.start();
      osc.stop(ctx.currentTime + 1); // 1s de tom
      setTimeout(() => {
        if (ctx.state !== 'closed') ctx.close().catch(() => {});
      }, 1500);
    } catch {}
  };
  playBeep();
  dialingInterval = setInterval(playBeep, 3000);
}

function stopDialingTone() {
  if (dialingInterval) {
    clearInterval(dialingInterval);
    dialingInterval = null;
  }
  if (dialingCtx) {
    const ctx = dialingCtx;
    dialingCtx = null;
    if (ctx.state !== 'closed') {
      ctx.close().catch(() => {});
    }
  }
}

function playConnectedBeep() {
  try {
    const ctx = new AudioContext();
    // Primeiro beep
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.frequency.value = 880;
    gain1.gain.value = 0.18;
    osc1.start();
    osc1.stop(ctx.currentTime + 0.15);
    // Segundo beep (mais agudo)
    setTimeout(() => {
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 1100;
      gain2.gain.value = 0.18;
      osc2.start();
      osc2.stop(ctx.currentTime + 0.15);
      setTimeout(() => { try { ctx.close(); } catch {} }, 500);
    }, 200);
  } catch {}
}

function playRejectedBeep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 480;
    osc.frequency.linearRampToValueAtTime(320, ctx.currentTime + 0.4);
    gain.gain.value = 0.18;
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
    setTimeout(() => { try { ctx.close(); } catch {} }, 800);
  } catch {}
}

// Formatar duração
export function formatCallDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
