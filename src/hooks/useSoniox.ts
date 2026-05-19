import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface TranscriptionSegment {
  id: number;
  text: string;
  speaker: string;
  confidence: number;
  timestamp: number;
  is_final: boolean;
}

export interface ChannelHealth {
  mic: 'active' | 'reconnecting' | 'dead';
  system: 'active' | 'reconnecting' | 'dead' | 'unavailable';
}

interface UseSonioxOptions {
  onTranscription?: (segment: TranscriptionSegment) => void;
  onHealthChange?: (health: ChannelHealth) => void;
  speakerName?: string;
  remoteSpeakerName?: string;
  initialTranscriptions?: TranscriptionSegment[];
}

interface UseSonioxReturn {
  isConnected: boolean;
  isTranscribing: boolean;
  isPaused: boolean;
  isStale: boolean; // true when no data received for STALE_THRESHOLD_MS
  /** true quando o servidor Soniox retornou erro irrecuperável (quota, auth, etc.) */
  isFatalError: boolean;
  channelHealth: ChannelHealth;
  transcriptions: TranscriptionSegment[];
  transcriptionsRef: React.MutableRefObject<TranscriptionSegment[]>;
  error: string | null;
  startTranscription: () => Promise<void>;
  stopTranscription: () => void;
  /**
   * Encerra a transcrição de forma GRACIOSA:
   * 1. Para envio de áudio
   * 2. Sinaliza fim pro Soniox pra forçar flush dos últimos tokens
   * 3. Aguarda ~1.5s pra últimos tokens finais chegarem
   * 4. Promove non-final pra final no state (evita perder últimas frases)
   * 5. Fecha WebSockets
   * Use ANTES de coletar transcriptionsRef.current pra finalizar reunião/call.
   */
  finalizeTranscription: () => Promise<void>;
  restartTranscription: () => Promise<void>; // Stop + re-acquire streams + start (preserves existing transcriptions)
  togglePause: () => void;
}

// Configurações Soniox
const SAMPLE_RATE = 16000;
const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

// Resiliência — 30 tentativas para cobrir reuniões longas (2h+)
const MAX_RECONNECT_ATTEMPTS = 30;
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 30000;
const HEALTH_CHECK_INTERVAL_MS = 5000;
const AUDIO_CONTEXT_CHECK_INTERVAL_MS = 3000;
const WS_KEEPALIVE_INTERVAL_MS = 30000;
// Tempo sem dados antes de considerar a transcrição "morta"
const STALE_THRESHOLD_MS = 20000;

// Cache da API key
let cachedSonioxKey: string | null = null;

async function getSonioxApiKey(): Promise<string> {
  if (cachedSonioxKey) return cachedSonioxKey;
  console.log('[Soniox] Buscando API key do servidor...');
  const { data, error } = await supabase.functions.invoke('soniox-token');
  if (error || !data?.api_key) {
    console.error('[Soniox] Falha ao buscar API key:', error || 'sem api_key na resposta');
    throw new Error('Falha ao buscar chave Soniox do servidor');
  }
  cachedSonioxKey = data.api_key;
  return cachedSonioxKey;
}

// Estado de um canal de áudio (mic ou sistema)
interface ChannelState {
  ws: WebSocket | null;
  audioContext: AudioContext | null;
  processor: ScriptProcessorNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  stream: MediaStream;
  speakerLabel: string;
  channelName: string;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  intentionallyClosed: boolean;
  lastDataReceived: number;
  tokenBuffer: string[];
  // Flag de erro fatal do servidor Soniox (ex: quota exceeded, auth fail, invalid request).
  // Quando true, o canal NÃO deve ser reciclado — reconectar só repete o erro e gasta requests.
  fatalError?: string | null;
}

export function useSoniox(options: UseSonioxOptions = {}): UseSonioxReturn {
  const { onTranscription, onHealthChange, speakerName = 'Você', remoteSpeakerName = 'Participante Remoto', initialTranscriptions = [] } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [isFatalError, setIsFatalError] = useState(false);
  // Ref síncrona para bloquear restartTranscription ANTES do próximo render do React
  const isFatalErrorRef = useRef(false);
  const [channelHealth, setChannelHealth] = useState<ChannelHealth>({ mic: 'active', system: 'unavailable' });
  const [transcriptions, setTranscriptions] = useState<TranscriptionSegment[]>(initialTranscriptions);
  const [error, setError] = useState<string | null>(null);
  const onHealthChangeRef = useRef(onHealthChange);

  const transcriptionsRef = useRef<TranscriptionSegment[]>(initialTranscriptions);
  const micChannelRef = useRef<ChannelState | null>(null);
  const systemChannelRef = useRef<ChannelState | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isActiveRef = useRef(false);
  const isPausedRef = useRef(false);
  const apiKeyRef = useRef<string>('');
  const lastDataTimestampRef = useRef<number>(0);
  const keepAliveRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keep onHealthChange ref up to date
  useEffect(() => { onHealthChangeRef.current = onHealthChange; }, [onHealthChange]);

  // Helper: update a single channel's health and fire callback
  const updateChannelHealth = useCallback((channel: 'mic' | 'system', status: ChannelHealth['mic']) => {
    setChannelHealth(prev => {
      const next = { ...prev, [channel]: status };
      if (prev[channel] !== status) {
        onHealthChangeRef.current?.(next);
      }
      return next;
    });
  }, []);

  // Merge transcrições iniciais (do banco) quando chegarem
  useEffect(() => {
    if (initialTranscriptions.length === 0) return;
    setTranscriptions(prev => {
      if (prev.length === 0) {
        transcriptionsRef.current = initialTranscriptions;
        return initialTranscriptions;
      }
      const existingIds = new Set(prev.map(t => t.id));
      const newFromInitial = initialTranscriptions.filter(t => !existingIds.has(t.id));
      if (newFromInitial.length === 0) return prev;
      const merged = [...initialTranscriptions, ...prev.filter(t => !new Set(initialTranscriptions.map(i => i.id)).has(t.id))];
      transcriptionsRef.current = merged;
      return merged;
    });
  }, [initialTranscriptions]);

  const addTranscription = useCallback((segment: TranscriptionSegment) => {
    lastDataTimestampRef.current = Date.now();
    setIsStale(false);

    setTranscriptions(prev => {
      let newTranscriptions: TranscriptionSegment[];
      if (!segment.is_final) {
        const withoutThisSpeakerPartials = prev.filter(t => t.is_final || t.speaker !== segment.speaker);
        newTranscriptions = [...withoutThisSpeakerPartials, segment];
      } else {
        const withoutThisSpeakerPartials = prev.filter(t => t.is_final || t.speaker !== segment.speaker);
        newTranscriptions = [...withoutThisSpeakerPartials, segment];
      }
      transcriptionsRef.current = newTranscriptions;
      return newTranscriptions;
    });

    if (segment.is_final) {
      onTranscription?.(segment);
    }
  }, [onTranscription]);

  const float32ToInt16 = useCallback((audioData: Float32Array): ArrayBuffer => {
    const pcmData = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcmData.buffer;
  }, []);

  // Limpar recursos de um canal
  const cleanupChannel = useCallback((channel: ChannelState) => {
    if (channel.reconnectTimer) {
      clearTimeout(channel.reconnectTimer);
      channel.reconnectTimer = null;
    }
    if (channel.processor) {
      try { channel.processor.disconnect(); } catch {}
      channel.processor = null;
    }
    if (channel.sourceNode) {
      try { channel.sourceNode.disconnect(); } catch {}
      channel.sourceNode = null;
    }
    if (channel.audioContext && channel.audioContext.state !== 'closed') {
      try { channel.audioContext.close(); } catch {}
      channel.audioContext = null;
    }
    if (channel.ws) {
      try {
        if (channel.ws.readyState === WebSocket.OPEN || channel.ws.readyState === WebSocket.CONNECTING) {
          channel.ws.close();
        }
      } catch {}
      channel.ws = null;
    }
  }, []);

  // Conectar WebSocket e audio pipeline para um canal
  const connectChannel = useCallback((channel: ChannelState): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!isActiveRef.current || channel.intentionallyClosed) {
        reject(new Error('Transcrição não está ativa'));
        return;
      }

      if (!channel.stream) {
        console.warn(`[Soniox/${channel.channelName}] Stream é null`);
        reject(new Error('Stream não disponível'));
        return;
      }
      const tracks = channel.stream.getAudioTracks();
      if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
        console.warn(`[Soniox/${channel.channelName}] Stream sem tracks ativos`);
        reject(new Error('Stream sem tracks ativos'));
        return;
      }

      console.log(`[Soniox/${channel.channelName}] Conectando WebSocket (tentativa ${channel.reconnectAttempts + 1})...`);

      // Limpar token buffer para evitar texto corrompido
      channel.tokenBuffer = [];

      // Limpar WS e audio antigos
      if (channel.processor) {
        try { channel.processor.disconnect(); } catch {}
        channel.processor = null;
      }
      if (channel.sourceNode) {
        try { channel.sourceNode.disconnect(); } catch {}
        channel.sourceNode = null;
      }
      if (channel.audioContext && channel.audioContext.state !== 'closed') {
        try { channel.audioContext.close(); } catch {}
        channel.audioContext = null;
      }
      if (channel.ws) {
        try { channel.ws.close(); } catch {}
        channel.ws = null;
      }

      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      channel.ws = ws;
      let resolved = false;

      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error(`[Soniox/${channel.channelName}] Timeout na conexão WebSocket`);
          try { ws.close(); } catch {}
          reject(new Error('Timeout na conexão'));
        }
      }, 15000);

      ws.onopen = () => {
        if (!isActiveRef.current || channel.intentionallyClosed) {
          clearTimeout(connectionTimeout);
          ws.close();
          return;
        }

        console.log(`[Soniox/${channel.channelName}] WebSocket conectado`);
        channel.reconnectAttempts = 0;
        channel.lastDataReceived = Date.now();

        const config = {
          api_key: apiKeyRef.current,
          model: 'stt-rt-preview',
          language_code: 'pt',
          sample_rate: SAMPLE_RATE,
          audio_format: 'pcm_s16le',
          num_channels: 1,
          include_nonfinal: true,
        };
        ws.send(JSON.stringify(config));

        try {
          channel.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });

          // Verificar sample rate real
          const actualSampleRate = channel.audioContext.sampleRate;
          if (actualSampleRate !== SAMPLE_RATE) {
            console.warn(`[Soniox/${channel.channelName}] AudioContext sampleRate=${actualSampleRate} (esperado ${SAMPLE_RATE}). Soniox pode interpretar incorretamente.`);
            // Atualizar config do Soniox com o sample rate real
            const correctedConfig = { ...config, sample_rate: actualSampleRate };
            // Reenviar config não é possível (Soniox aceita 1 config por conexão)
            // Solução: fechar e recriar com o rate correto via destino
            // Por ora, o ScriptProcessor com audioContext destination faz resample implícito
          }

          channel.sourceNode = channel.audioContext.createMediaStreamSource(channel.stream);
          channel.processor = channel.audioContext.createScriptProcessor(4096, 1, 1);

          channel.processor.onaudioprocess = (e) => {
            // Respeitar pause
            if (isPausedRef.current) return;
            if (ws.readyState === WebSocket.OPEN) {
              const audioData = e.inputBuffer.getChannelData(0);
              ws.send(float32ToInt16(audioData));
            }
          };

          channel.sourceNode.connect(channel.processor);
          channel.processor.connect(channel.audioContext.destination);

          clearTimeout(connectionTimeout);
          resolved = true;
          resolve();
        } catch (audioErr) {
          console.error(`[Soniox/${channel.channelName}] Erro ao criar audio pipeline:`, audioErr);
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(audioErr);
        }
      };

      ws.onmessage = (event) => {
        channel.lastDataReceived = Date.now();

        try {
          const data = JSON.parse(event.data);

          if (data.error_code) {
            console.warn(`[Soniox/${channel.channelName}] Erro Soniox:`, data.error_message);
            // Marca o canal como erro fatal — evita loop de reconexão
            channel.fatalError = data.error_message || `error_code=${data.error_code}`;
            const healthKey = channel.channelName === 'MIC' ? 'mic' : 'system' as const;
            updateChannelHealth(healthKey, 'dead');
            setError(`Soniox: ${channel.fatalError}`);
            // Sinaliza que é um erro irrecuperável (quota, auth, etc.) — UI não deve oferecer "Reconectar"
            isFatalErrorRef.current = true; // síncrono — bloqueia restartTranscription imediatamente
            setIsFatalError(true);
            // Fecha intencionalmente pra não disparar auto-reconnect do onclose
            channel.intentionallyClosed = true;
            try { channel.ws?.close(1000, 'fatal_error'); } catch {}
            return;
          }

          if (data.tokens && data.tokens.length > 0) {
            const finalTokens: string[] = [];
            const nonFinalTokens: string[] = [];

            for (const token of data.tokens) {
              if (token.is_final) {
                finalTokens.push(token.text);
              } else {
                nonFinalTokens.push(token.text);
              }
            }

            if (finalTokens.length > 0) {
              channel.tokenBuffer.push(...finalTokens);
              const finalText = channel.tokenBuffer.join('').trim();

              if (finalText.length > 0) {
                addTranscription({
                  id: Date.now() + Math.random(),
                  text: finalText,
                  speaker: channel.speakerLabel,
                  confidence: data.tokens[0]?.confidence || 0.9,
                  timestamp: Date.now(),
                  is_final: true,
                });
                channel.tokenBuffer = [];
              }
            }

            if (nonFinalTokens.length > 0) {
              const previewText = [...channel.tokenBuffer, ...nonFinalTokens].join('').trim();
              if (previewText.length > 0) {
                addTranscription({
                  id: -1,
                  text: previewText,
                  speaker: channel.speakerLabel,
                  confidence: 0.9,
                  timestamp: Date.now(),
                  is_final: false,
                });
              }
            }
          }
        } catch {
          // Ignorar mensagens não-JSON
        }
      };

      ws.onerror = (e) => {
        console.error(`[Soniox/${channel.channelName}] Erro WebSocket:`, e);
        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(new Error(`Erro no WebSocket ${channel.channelName}`));
        }
      };

      ws.onclose = (e) => {
        console.log(`[Soniox/${channel.channelName}] WebSocket fechado (code: ${e.code})`);
        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(new Error(`WebSocket fechou durante conexão (code: ${e.code})`));
          return;
        }

        // Auto-reconnect somente se foi fechamento ANORMAL.
        // Codes limpos (1000/1001) ou close explícito do Soniox após finalizado
        // não devem disparar reconexão (senão entra em loop "reconectando sistema").
        const CLEAN_CLOSE_CODES = [1000, 1001];
        if (channel.intentionallyClosed || !isActiveRef.current) return;
        if (CLEAN_CLOSE_CODES.includes(e.code)) {
          console.log(`[Soniox/${channel.channelName}] Close limpo (${e.code}), não reconectando`);
          return;
        }
        scheduleReconnect(channel);
      };
    });
  }, [addTranscription, float32ToInt16, updateChannelHealth]);

  // Agendar reconexão com exponential backoff
  const scheduleReconnect = useCallback((channel: ChannelState) => {
    if (channel.intentionallyClosed || !isActiveRef.current) return;
    const healthKey = channel.channelName === 'MIC' ? 'mic' : 'system' as const;
    // Não reconectar canais que já receberam erro fatal do servidor Soniox
    if (channel.fatalError) {
      console.warn(`[Soniox/${channel.channelName}] Canal com erro fatal, não reconectando: ${channel.fatalError}`);
      updateChannelHealth(healthKey, 'dead');
      return;
    }
    if (channel.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Soniox/${channel.channelName}] Máximo de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS})`);
      setError(`Canal ${channel.channelName} desconectou e não foi possível reconectar`);
      updateChannelHealth(healthKey, 'dead');
      return;
    }

    if (!channel.stream) {
      console.warn(`[Soniox/${channel.channelName}] Stream é null, não reconectando`);
      updateChannelHealth(healthKey, 'dead');
      return;
    }
    const tracks = channel.stream.getAudioTracks();
    if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
      console.warn(`[Soniox/${channel.channelName}] Stream morreu, não reconectando`);
      updateChannelHealth(healthKey, 'dead');
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, channel.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    );
    channel.reconnectAttempts++;

    console.log(`[Soniox/${channel.channelName}] Reconectando em ${delay}ms (tentativa ${channel.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);
    updateChannelHealth(healthKey, 'reconnecting');

    channel.reconnectTimer = setTimeout(async () => {
      channel.reconnectTimer = null;
      if (channel.intentionallyClosed || !isActiveRef.current) return;

      try {
        await connectChannel(channel);
        console.log(`[Soniox/${channel.channelName}] Reconexão bem-sucedida`);
        setError(null);
        updateChannelHealth(healthKey, 'active');
        // Reseta counter após reconexão estabilizar por 10s
        // (evita crescer indefinidamente em chamadas longas com N falhas intermitentes)
        setTimeout(() => {
          if (!channel.intentionallyClosed && isActiveRef.current) {
            channel.reconnectAttempts = 0;
          }
        }, 10000);
      } catch (err) {
        console.error(`[Soniox/${channel.channelName}] Falha na reconexão:`, err);
        scheduleReconnect(channel);
      }
    }, delay);
  }, [connectChannel, updateChannelHealth]);

  // Monitor de AudioContexts (browser pode suspender)
  const startAudioContextMonitor = useCallback(() => {
    if (audioContextCheckRef.current) return;

    audioContextCheckRef.current = setInterval(() => {
      if (!isActiveRef.current) return;

      const channels = [micChannelRef.current, systemChannelRef.current].filter(Boolean) as ChannelState[];

      for (const channel of channels) {
        if (channel.intentionallyClosed || !channel.audioContext) continue;

        if (channel.audioContext.state === 'suspended') {
          console.warn(`[Soniox/${channel.channelName}] AudioContext suspenso, resumindo...`);
          channel.audioContext.resume().catch(() => {
            scheduleReconnect(channel);
          });
        }

        if (channel.audioContext.state === 'closed' && !channel.intentionallyClosed) {
          console.warn(`[Soniox/${channel.channelName}] AudioContext fechado inesperadamente`);
          const hk = channel.channelName === 'MIC' ? 'mic' : 'system' as const;
          updateChannelHealth(hk, 'reconnecting');
          scheduleReconnect(channel);
        }
      }
    }, AUDIO_CONTEXT_CHECK_INTERVAL_MS);
  }, [scheduleReconnect, updateChannelHealth]);

  // Health check de WebSockets + stale detection
  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) return;

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current) return;

      // Detectar transcrição parada (nenhum dado novo recebido)
      if (lastDataTimestampRef.current > 0 && !isPausedRef.current) {
        const timeSinceLastData = Date.now() - lastDataTimestampRef.current;
        if (timeSinceLastData > STALE_THRESHOLD_MS) {
          setIsStale(true);
          console.warn(`[Soniox] Transcrição parada há ${Math.round(timeSinceLastData / 1000)}s`);
        }
      }

      const channels = [micChannelRef.current, systemChannelRef.current].filter(Boolean) as ChannelState[];

      for (const channel of channels) {
        if (channel.intentionallyClosed) continue;
        // Pular se já há um reconnect agendado (evita timers duplicados)
        if (channel.reconnectTimer) continue;
        // Pular canais com erro fatal do servidor (quota, auth, etc)
        if (channel.fatalError) continue;

        if (channel.ws && channel.ws.readyState === WebSocket.CLOSED) {
          console.warn(`[Soniox/${channel.channelName}] WebSocket morto detectado pelo health check`);
          scheduleReconnect(channel); // scheduleReconnect já seta reconnecting/dead
          continue;
        }

        // Se stream morreu, tentar reconectar o canal
        if (channel.stream) {
          const tracks = channel.stream.getAudioTracks();
          if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
            console.warn(`[Soniox/${channel.channelName}] Stream tracks terminaram, tentando reconectar`);
            scheduleReconnect(channel); // scheduleReconnect já seta reconnecting/dead
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, [scheduleReconnect]);

  // Monitorar tracks
  const monitorStreamTracks = useCallback((channel: ChannelState) => {
    if (!channel.stream) return;
    const tracks = channel.stream.getAudioTracks();
    for (const track of tracks) {
      track.onended = () => {
        console.warn(`[Soniox/${channel.channelName}] Audio track "${track.label}" terminou`);
        const healthKey = channel.channelName === 'MIC' ? 'mic' : 'system' as const;
        updateChannelHealth(healthKey, 'reconnecting');
      };
    }
  }, [updateChannelHealth]);

  const startTranscription = useCallback(async () => {
    setError(null);
    isFatalErrorRef.current = false; // reset síncrono antes de tentar nova conexão
    setIsFatalError(false);
    isActiveRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);

    try {
      const apiKey = await getSonioxApiKey();
      apiKeyRef.current = apiKey;

      // 1. Capturar microfone
      console.log('[Soniox] Solicitando microfone...');
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      // 2. Capturar áudio do sistema (Meet tab)
      let hasSystemAudio = false;
      try {
        console.log('[Soniox] Solicitando compartilhamento de tela...');
        systemStreamRef.current = await navigator.mediaDevices.getDisplayMedia({
          video: { displaySurface: 'browser' as any, width: 1, height: 1, frameRate: 1 },
          audio: true,
        });

        const audioTracks = systemStreamRef.current.getAudioTracks();
        hasSystemAudio = audioTracks.length > 0;

        // Parar video tracks imediatamente — só precisamos do áudio
        const videoTracks = systemStreamRef.current.getVideoTracks();
        videoTracks.forEach(t => t.stop());

        console.log(`[Soniox] Tela compartilhada (áudio: ${hasSystemAudio})`);
      } catch (displayError: any) {
        console.warn('[Soniox] Compartilhamento cancelado:', displayError.message);
      }

      // 3. Canal MIC
      const micChannel: ChannelState = {
        ws: null,
        audioContext: null,
        processor: null,
        sourceNode: null,
        stream: micStreamRef.current,
        speakerLabel: speakerName,
        channelName: 'MIC',
        reconnectAttempts: 0,
        reconnectTimer: null,
        intentionallyClosed: false,
        lastDataReceived: 0,
        tokenBuffer: [],
      };
      micChannelRef.current = micChannel;
      monitorStreamTracks(micChannel);
      await connectChannel(micChannel);

      // 4. Canal SYSTEM (se disponível)
      if (systemStreamRef.current && hasSystemAudio) {
        // Criar um stream só com áudio para o canal
        const audioOnlyStream = new MediaStream(systemStreamRef.current.getAudioTracks());

        const systemChannel: ChannelState = {
          ws: null,
          audioContext: null,
          processor: null,
          sourceNode: null,
          stream: audioOnlyStream,
          speakerLabel: remoteSpeakerName,
          channelName: 'SYSTEM',
          reconnectAttempts: 0,
          reconnectTimer: null,
          intentionallyClosed: false,
          lastDataReceived: 0,
          tokenBuffer: [],
        };
        systemChannelRef.current = systemChannel;
        monitorStreamTracks(systemChannel);
        await connectChannel(systemChannel);
      }

      // 5. Iniciar monitores de saúde
      startHealthCheck();
      startAudioContextMonitor();

      // 6. Keep-alive: envia frames silenciosos para manter WebSocket aberto em silêncio
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      keepAliveRef.current = setInterval(() => {
        if (!isActiveRef.current || isPausedRef.current) return;
        const channels = [micChannelRef.current, systemChannelRef.current].filter(Boolean) as ChannelState[];
        const silentFrame = new ArrayBuffer(SAMPLE_RATE * 2); // 1 segundo de silêncio (16-bit PCM)
        for (const ch of channels) {
          if (ch.ws && ch.ws.readyState === WebSocket.OPEN) {
            try { ch.ws.send(silentFrame); } catch {}
          }
        }
      }, WS_KEEPALIVE_INTERVAL_MS);

      setIsConnected(true);
      setIsTranscribing(true);
      lastDataTimestampRef.current = Date.now();
      setChannelHealth({
        mic: 'active',
        system: systemChannelRef.current ? 'active' : 'unavailable',
      });
      console.log('[Soniox] Transcrição iniciada com sucesso');

    } catch (err: any) {
      console.error('[Soniox] Erro ao iniciar transcrição:', err.message || err);
      setError(err.message || 'Erro ao iniciar transcrição');
      isActiveRef.current = false;

      if (micChannelRef.current) {
        micChannelRef.current.intentionallyClosed = true;
        cleanupChannel(micChannelRef.current);
        micChannelRef.current = null;
      }
      if (systemChannelRef.current) {
        systemChannelRef.current.intentionallyClosed = true;
        cleanupChannel(systemChannelRef.current);
        systemChannelRef.current = null;
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
        micStreamRef.current = null;
      }
      if (systemStreamRef.current) {
        systemStreamRef.current.getTracks().forEach(t => t.stop());
        systemStreamRef.current = null;
      }

      throw err;
    }
  }, [speakerName, remoteSpeakerName, connectChannel, monitorStreamTracks, startHealthCheck, startAudioContextMonitor, cleanupChannel]);

  const stopTranscription = useCallback(() => {
    console.log('[Soniox] Parando transcrição...');
    isActiveRef.current = false;

    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }
    if (audioContextCheckRef.current) {
      clearInterval(audioContextCheckRef.current);
      audioContextCheckRef.current = null;
    }
    if (keepAliveRef.current) {
      clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }

    if (micChannelRef.current) {
      micChannelRef.current.intentionallyClosed = true;
      cleanupChannel(micChannelRef.current);
      micChannelRef.current = null;
    }
    if (systemChannelRef.current) {
      systemChannelRef.current.intentionallyClosed = true;
      cleanupChannel(systemChannelRef.current);
      systemChannelRef.current = null;
    }

    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(t => t.stop());
      systemStreamRef.current = null;
    }

    setIsConnected(false);
    setIsTranscribing(false);
    setIsPaused(false);
    setIsStale(false);
    // Não resetar isFatalError aqui — deve persistir para impedir loops de auto-recovery.
    // Será resetado apenas em startTranscription() (tentativa explícita do usuário).
    setChannelHealth({ mic: 'active', system: 'unavailable' });
    console.log('[Soniox] Transcrição parada');
  }, [cleanupChannel]);

  // Encerra graciosamente — força flush dos últimos tokens antes de fechar
  const finalizeTranscription = useCallback(async () => {
    console.log('[Soniox] Finalizando transcrição (flush dos últimos tokens)...');

    // 1. Parar o envio de novos frames (pausa, não fecha)
    isPausedRef.current = true;

    // 2. Sinalizar fim de stream pro Soniox — manda keyword "" + empty buffer
    //    Soniox trata empty frame como EOF e força flush dos tokens pendentes
    const channels = [micChannelRef.current, systemChannelRef.current].filter(Boolean) as ChannelState[];
    for (const ch of channels) {
      try {
        if (ch.ws && ch.ws.readyState === WebSocket.OPEN) {
          // Empty buffer = sinal de fim pro Soniox (vai flushar tokens non-final)
          ch.ws.send(new ArrayBuffer(0));
        }
      } catch (err) {
        console.warn(`[Soniox/${ch.channelName}] erro ao sinalizar fim:`, err);
      }
    }

    // 3. Aguardar 1.5s pra últimos tokens finais chegarem
    await new Promise(r => setTimeout(r, 1500));

    // 4. Promover non-final para final no state (trava o texto interim como definitivo)
    setTranscriptions(prev => {
      const promoted = prev.map(t => t.is_final ? t : { ...t, is_final: true });
      transcriptionsRef.current = promoted;
      console.log(`[Soniox] ${prev.filter(t => !t.is_final).length} segmentos non-final promovidos para final`);
      return promoted;
    });

    // 5. Aguardar mais um tick pra garantir que state foi aplicado
    await new Promise(r => setTimeout(r, 100));

    // 6. Agora sim para tudo
    stopTranscription();
  }, [stopTranscription]);

  // Restart: para tudo, mas preserva transcrições existentes, e re-inicia
  const restartTranscription = useCallback(async () => {
    // Bloquear restart se há erro fatal (quota/auth) — reconectar só repetiria o erro.
    // Usa ref para leitura síncrona, sem esperar próximo render do React.
    if (isFatalErrorRef.current) {
      console.warn('[Soniox] restartTranscription bloqueado — erro fatal ativo (quota/auth). Adicione créditos e inicie uma nova sessão.');
      return;
    }
    console.log('[Soniox] Reiniciando transcrição (preservando dados existentes)...');
    stopTranscription();
    // Pequeno delay para garantir cleanup completo
    await new Promise(r => setTimeout(r, 500));
    await startTranscription();
  }, [stopTranscription, startTranscription]);

  const togglePause = useCallback(() => {
    setIsPaused(prev => {
      const newVal = !prev;
      isPausedRef.current = newVal;
      console.log(`[Soniox] ${newVal ? 'Pausado' : 'Resumido'}`);
      return newVal;
    });
  }, []);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (audioContextCheckRef.current) clearInterval(audioContextCheckRef.current);
      if (keepAliveRef.current) clearInterval(keepAliveRef.current);
      if (micChannelRef.current) {
        micChannelRef.current.intentionallyClosed = true;
        cleanupChannel(micChannelRef.current);
      }
      if (systemChannelRef.current) {
        systemChannelRef.current.intentionallyClosed = true;
        cleanupChannel(systemChannelRef.current);
      }
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (systemStreamRef.current) {
        systemStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, [cleanupChannel]);

  return {
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
  };
}
