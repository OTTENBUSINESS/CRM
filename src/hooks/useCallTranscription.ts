import { useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface TranscriptionSegment {
  id: number;
  text: string;
  speaker: string;
  speakerType: 'local' | 'remote';
  confidence: number;
  timestamp: number;
  is_final: boolean;
}

interface StartTranscriptionOptions {
  micStream: MediaStream;
  remoteStream?: MediaStream | null;
  speakerName?: string;
  remoteSpeakerName?: string;
  preserveExisting?: boolean; // Don't clear transcriptions on start (for redial/reconnect)
}

interface UseCallTranscriptionOptions {
  onTranscription?: (segment: TranscriptionSegment) => void;
  onError?: (error: string) => void;
}

interface UseCallTranscriptionReturn {
  isTranscribing: boolean;
  transcriptions: TranscriptionSegment[];
  transcriptionsRef: React.MutableRefObject<TranscriptionSegment[]>;
  error: string | null;
  startTranscription: (options: StartTranscriptionOptions) => Promise<void>;
  stopTranscription: () => void;
  /**
   * Encerra graciosamente — força flush dos últimos tokens antes de fechar.
   * Use ANTES de coletar transcrições pra processar a call (evita perder últimas frases).
   */
  finalizeTranscription: () => Promise<void>;
  clearTranscriptions: () => void;
  restoreTranscriptions: (segments: TranscriptionSegment[]) => void;
}

// Configurações Soniox
const SAMPLE_RATE = 16000;
const WS_URL = 'wss://stt-rt.soniox.com/transcribe-websocket';

// Cache da API key (busca do servidor 1x, reutiliza nas próximas)
let cachedSonioxKey: string | null = null;

async function getSonioxApiKey(): Promise<string> {
  if (cachedSonioxKey) return cachedSonioxKey;
  const { data, error } = await supabase.functions.invoke('soniox-token');
  if (error || !data?.api_key) throw new Error('Falha ao buscar chave Soniox do servidor');
  cachedSonioxKey = data.api_key;
  return cachedSonioxKey;
}

// Configurações de resiliência
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_BASE_DELAY_MS = 1000; // 1s, 2s, 4s, 8s... (exponential backoff)
const RECONNECT_MAX_DELAY_MS = 15000;
const HEALTH_CHECK_INTERVAL_MS = 5000; // Verificar saúde a cada 5s
const AUDIO_CONTEXT_CHECK_INTERVAL_MS = 3000; // Verificar AudioContext a cada 3s

// Estado de um canal de áudio (mic ou remote)
interface ChannelState {
  ws: WebSocket | null;
  audioContext: AudioContext | null;
  processor: ScriptProcessorNode | null;
  sourceNode: MediaStreamAudioSourceNode | null;
  stream: MediaStream;
  speakerLabel: string;
  speakerType: 'local' | 'remote';
  channelName: string;
  reconnectAttempts: number;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  intentionallyClosed: boolean;
  lastDataReceived: number; // timestamp da última mensagem recebida
  tokenBuffer: string[];
  // Erro fatal do servidor Soniox (quota, auth etc). Canal NÃO deve ser reciclado.
  fatalError?: string | null;
}

export function useCallTranscription(options: UseCallTranscriptionOptions = {}): UseCallTranscriptionReturn {
  const { onTranscription, onError } = options;

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Refs para transcrições (evita closure stale)
  const transcriptionsRef = useRef<TranscriptionSegment[]>([]);

  // Refs para os canais
  const micChannelRef = useRef<ChannelState | null>(null);
  const remoteChannelRef = useRef<ChannelState | null>(null);

  // Health check interval
  const healthCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Flag global para saber se transcription está ativa (evita reconnect após stop)
  const isActiveRef = useRef(false);
  const apiKeyRef = useRef<string>('');

  // Converter Float32 para Int16 PCM
  const float32ToInt16 = useCallback((audioData: Float32Array): ArrayBuffer => {
    const pcmData = new Int16Array(audioData.length);
    for (let i = 0; i < audioData.length; i++) {
      const s = Math.max(-1, Math.min(1, audioData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcmData.buffer;
  }, []);

  // Adicionar transcrição
  const addTranscription = useCallback((segment: TranscriptionSegment) => {
    setTranscriptions(prev => {
      let newTranscriptions: TranscriptionSegment[];
      if (!segment.is_final) {
        // Parcial: substitui o último parcial do mesmo speaker
        const withoutThisSpeakerPartials = prev.filter(
          t => t.is_final || t.speakerType !== segment.speakerType
        );
        newTranscriptions = [...withoutThisSpeakerPartials, segment];
      } else {
        // Final: remove parciais do mesmo speaker e adiciona o final
        const withoutThisSpeakerPartials = prev.filter(
          t => t.is_final || t.speakerType !== segment.speakerType
        );
        newTranscriptions = [...withoutThisSpeakerPartials, segment];
      }
      transcriptionsRef.current = newTranscriptions;
      return newTranscriptions;
    });

    if (segment.is_final) {
      onTranscription?.(segment);
    }
  }, [onTranscription]);

  // Limpar recursos de um canal (sem reconnect)
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

      // Verificar se o stream ainda tem tracks ativos
      if (!channel.stream) {
        console.warn(`[Transcription] [${channel.channelName}] Stream é null`);
        reject(new Error('Stream não disponível'));
        return;
      }
      const tracks = channel.stream.getAudioTracks();
      if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
        console.warn(`[Transcription] [${channel.channelName}] Stream sem tracks ativos, não reconectando`);
        reject(new Error('Stream sem tracks ativos'));
        return;
      }

      console.log(`[Transcription] [${channel.channelName}] Conectando WebSocket (tentativa ${channel.reconnectAttempts + 1})...`);

      // Limpar token buffer parcial para evitar texto corrompido após reconexão
      channel.tokenBuffer = [];

      // Limpar WS e audio antigos (mas não o stream)
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

      // Timeout para conexão - se não conectar em 10s, rejeitar
      const connectionTimeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          console.error(`[Transcription] [${channel.channelName}] Timeout na conexão WebSocket`);
          try { ws.close(); } catch {}
          reject(new Error('Timeout na conexão'));
        }
      }, 10000);

      ws.onopen = () => {
        if (!isActiveRef.current || channel.intentionallyClosed) {
          clearTimeout(connectionTimeout);
          ws.close();
          return;
        }

        console.log(`[Transcription] [${channel.channelName}] WebSocket conectado!`);
        channel.reconnectAttempts = 0; // Reset no sucesso
        channel.lastDataReceived = Date.now();

        // Enviar configuração
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

        // Criar AudioContext
        try {
          channel.audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
          channel.sourceNode = channel.audioContext.createMediaStreamSource(channel.stream);

          // Criar processador de áudio
          channel.processor = channel.audioContext.createScriptProcessor(4096, 1, 1);

          channel.processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const audioData = e.inputBuffer.getChannelData(0);
              ws.send(float32ToInt16(audioData));
            }
          };

          channel.sourceNode.connect(channel.processor);
          channel.processor.connect(channel.audioContext.destination);

          console.log(`[Transcription] [${channel.channelName}] Audio pipeline conectado`);

          clearTimeout(connectionTimeout);
          resolved = true;
          resolve();
        } catch (audioErr) {
          console.error(`[Transcription] [${channel.channelName}] Erro ao criar audio pipeline:`, audioErr);
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
            console.error(`[Transcription] [${channel.channelName}] Erro Soniox:`, data.error_message);
            // Marca canal com erro fatal — não reciclar
            channel.fatalError = data.error_message || `error_code=${data.error_code}`;
            setError(`Soniox: ${channel.fatalError}`);
            onError?.(channel.fatalError);
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

            // Tokens finais
            if (finalTokens.length > 0) {
              channel.tokenBuffer.push(...finalTokens);
              const finalText = channel.tokenBuffer.join('').trim();

              if (finalText.length > 0) {
                console.log(`[Transcription] [${channel.channelName}] Final:`, finalText);
                addTranscription({
                  id: Date.now() + Math.random(),
                  text: finalText,
                  speaker: channel.speakerLabel,
                  speakerType: channel.speakerType,
                  confidence: data.tokens[0]?.confidence || 0.9,
                  timestamp: Date.now(),
                  is_final: true,
                });
                channel.tokenBuffer = [];
              }
            }

            // Tokens não-finais (preview)
            if (nonFinalTokens.length > 0) {
              const previewText = [...channel.tokenBuffer, ...nonFinalTokens].join('').trim();
              if (previewText.length > 0) {
                addTranscription({
                  id: -1,
                  text: previewText,
                  speaker: channel.speakerLabel,
                  speakerType: channel.speakerType,
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
        console.error(`[Transcription] [${channel.channelName}] Erro WebSocket:`, e);
        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(new Error(`Erro no WebSocket ${channel.channelName}`));
        }
      };

      ws.onclose = (e) => {
        console.log(`[Transcription] [${channel.channelName}] WebSocket fechado (code: ${e.code}, reason: ${e.reason})`);

        if (!resolved) {
          clearTimeout(connectionTimeout);
          resolved = true;
          reject(new Error(`WebSocket fechado durante conexão (code: ${e.code})`));
          return;
        }

        // Auto-reconnect só em fechamento ANORMAL (erro real de rede/servidor).
        // Close limpo (1000/1001) ou intencional NÃO deve reconectar.
        const CLEAN_CLOSE_CODES = [1000, 1001];
        if (channel.intentionallyClosed || !isActiveRef.current) return;
        if (CLEAN_CLOSE_CODES.includes(e.code)) {
          console.log(`[Transcription] [${channel.channelName}] Close limpo (${e.code}), não reconectando`);
          return;
        }
        scheduleReconnect(channel);
      };
    });
  }, [addTranscription, float32ToInt16]);

  // Agendar reconexão com exponential backoff
  const scheduleReconnect = useCallback((channel: ChannelState) => {
    if (channel.intentionallyClosed || !isActiveRef.current) return;
    // Não reconectar canais com erro fatal (quota exceeded, balance exhausted, auth etc)
    if (channel.fatalError) {
      console.warn(`[Transcription] [${channel.channelName}] Canal com erro fatal, não reconectando: ${channel.fatalError}`);
      return;
    }
    if (channel.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.error(`[Transcription] [${channel.channelName}] Máximo de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS})`);
      return;
    }

    // Verificar se stream ainda tem tracks ativos
    if (!channel.stream) {
      console.warn(`[Transcription] [${channel.channelName}] Stream é null, não reconectando`);
      return;
    }
    const tracks = channel.stream.getAudioTracks();
    if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
      console.warn(`[Transcription] [${channel.channelName}] Stream morreu, não reconectando`);
      return;
    }

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * Math.pow(2, channel.reconnectAttempts),
      RECONNECT_MAX_DELAY_MS
    );
    channel.reconnectAttempts++;

    console.log(`[Transcription] [${channel.channelName}] Reconectando em ${delay}ms (tentativa ${channel.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

    channel.reconnectTimer = setTimeout(async () => {
      channel.reconnectTimer = null;
      if (channel.intentionallyClosed || !isActiveRef.current) return;

      try {
        await connectChannel(channel);
        console.log(`[Transcription] [${channel.channelName}] Reconexão bem-sucedida!`);
        // Reseta contador após 10s estável — evita esgotar tentativas em calls longas
        setTimeout(() => {
          if (!channel.intentionallyClosed && isActiveRef.current) {
            channel.reconnectAttempts = 0;
          }
        }, 10000);
      } catch (err) {
        console.error(`[Transcription] [${channel.channelName}] Falha na reconexão:`, err);
        // Tentar novamente
        scheduleReconnect(channel);
      }
    }, delay);
  }, [connectChannel]);

  // Monitorar saúde dos AudioContexts (browser pode suspender)
  const startAudioContextMonitor = useCallback(() => {
    if (audioContextCheckRef.current) return;

    audioContextCheckRef.current = setInterval(() => {
      if (!isActiveRef.current) return;

      const channels = [micChannelRef.current, remoteChannelRef.current].filter(Boolean) as ChannelState[];

      for (const channel of channels) {
        if (channel.intentionallyClosed || !channel.audioContext) continue;

        // Se AudioContext foi suspenso pelo browser, resumir
        if (channel.audioContext.state === 'suspended') {
          console.warn(`[Transcription] [${channel.channelName}] AudioContext suspenso, resumindo...`);
          channel.audioContext.resume().then(() => {
            console.log(`[Transcription] [${channel.channelName}] AudioContext resumido com sucesso`);
          }).catch(err => {
            console.error(`[Transcription] [${channel.channelName}] Falha ao resumir AudioContext:`, err);
            // Forçar reconexão completa
            scheduleReconnect(channel);
          });
        }

        // Se AudioContext foi fechado inesperadamente, reconectar
        if (channel.audioContext.state === 'closed' && !channel.intentionallyClosed) {
          console.warn(`[Transcription] [${channel.channelName}] AudioContext fechado inesperadamente, reconectando...`);
          scheduleReconnect(channel);
        }
      }
    }, AUDIO_CONTEXT_CHECK_INTERVAL_MS);
  }, [scheduleReconnect]);

  // Health check: detectar WebSocket mortos ou sem dados
  const startHealthCheck = useCallback(() => {
    if (healthCheckRef.current) return;

    healthCheckRef.current = setInterval(() => {
      if (!isActiveRef.current) return;

      const channels = [micChannelRef.current, remoteChannelRef.current].filter(Boolean) as ChannelState[];

      for (const channel of channels) {
        if (channel.intentionallyClosed) continue;
        if (channel.reconnectTimer) continue; // já tem reconnect agendado
        if (channel.fatalError) continue; // erro fatal — não reciclar

        // WebSocket morreu sem disparar onclose
        if (channel.ws && channel.ws.readyState === WebSocket.CLOSED) {
          console.warn(`[Transcription] [${channel.channelName}] WebSocket morto detectado pelo health check`);
          scheduleReconnect(channel);
          continue;
        }

        // Verificar se stream ainda tem tracks ativos
        if (channel.stream) {
          const tracks = channel.stream.getAudioTracks();
          if (tracks.length === 0 || tracks.every(t => t.readyState === 'ended')) {
            console.warn(`[Transcription] [${channel.channelName}] Stream tracks terminaram`);
            // Não reconectar, stream morreu de verdade
            continue;
          }
        }
      }
    }, HEALTH_CHECK_INTERVAL_MS);
  }, [scheduleReconnect]);

  // Monitorar tracks do stream (track.onended)
  const monitorStreamTracks = useCallback((channel: ChannelState) => {
    if (!channel.stream) return;
    const tracks = channel.stream.getAudioTracks();
    for (const track of tracks) {
      track.onended = () => {
        console.warn(`[Transcription] [${channel.channelName}] Audio track "${track.label}" terminou`);
        // Track terminou = fonte de áudio morreu, nada a reconectar neste canal
      };
    }
  }, []);

  const startTranscription = useCallback(async (opts: StartTranscriptionOptions) => {
    const {
      micStream,
      remoteStream,
      speakerName = 'Você',
      remoteSpeakerName = 'Cliente',
      preserveExisting = false,
    } = opts;

    console.log('[Transcription] Iniciando transcrição...', preserveExisting ? '(preservando existentes)' : '');
    console.log('[Transcription] Speaker local:', speakerName);
    console.log('[Transcription] Speaker remoto:', remoteSpeakerName);

    setError(null);
    if (!preserveExisting) {
      setTranscriptions([]);
      transcriptionsRef.current = [];
    }
    isActiveRef.current = true;

    try {
      // Buscar API key do servidor (cache após 1a vez)
      const apiKey = await getSonioxApiKey();
      apiKeyRef.current = apiKey;

      // Criar estado do canal do microfone
      const micChannel: ChannelState = {
        ws: null,
        audioContext: null,
        processor: null,
        sourceNode: null,
        stream: micStream,
        speakerLabel: speakerName,
        speakerType: 'local',
        channelName: 'MIC',
        reconnectAttempts: 0,
        reconnectTimer: null,
        intentionallyClosed: false,
        lastDataReceived: 0,
        tokenBuffer: [],
      };
      micChannelRef.current = micChannel;

      // Monitorar tracks
      monitorStreamTracks(micChannel);

      // Conectar canal do microfone
      console.log('[Transcription] Configurando canal do microfone...');
      await connectChannel(micChannel);

      // Configurar canal do áudio remoto (se disponível)
      if (remoteStream) {
        const audioTracks = remoteStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const remoteChannel: ChannelState = {
            ws: null,
            audioContext: null,
            processor: null,
            sourceNode: null,
            stream: remoteStream,
            speakerLabel: remoteSpeakerName,
            speakerType: 'remote',
            channelName: 'REMOTE',
            reconnectAttempts: 0,
            reconnectTimer: null,
            intentionallyClosed: false,
            lastDataReceived: 0,
            tokenBuffer: [],
          };
          remoteChannelRef.current = remoteChannel;

          // Monitorar tracks
          monitorStreamTracks(remoteChannel);

          console.log('[Transcription] Configurando canal do áudio remoto...');
          await connectChannel(remoteChannel);
        } else {
          console.warn('[Transcription] Stream remoto sem tracks de áudio');
        }
      } else {
        console.warn('[Transcription] Sem stream de áudio remoto - apenas microfone será transcrito');
      }

      // Iniciar monitores de saúde
      startHealthCheck();
      startAudioContextMonitor();

      setIsTranscribing(true);
      console.log('[Transcription] Transcrição iniciada com sucesso!');

    } catch (err: any) {
      console.error('[Transcription] Erro ao iniciar:', err);
      const errorMsg = err.message || 'Erro ao iniciar transcrição';
      setError(errorMsg);
      onError?.(errorMsg);
      // Cleanup
      isActiveRef.current = false;
      if (micChannelRef.current) {
        micChannelRef.current.intentionallyClosed = true;
        cleanupChannel(micChannelRef.current);
        micChannelRef.current = null;
      }
      if (remoteChannelRef.current) {
        remoteChannelRef.current.intentionallyClosed = true;
        cleanupChannel(remoteChannelRef.current);
        remoteChannelRef.current = null;
      }
    }
  }, [addTranscription, onError, connectChannel, monitorStreamTracks, startHealthCheck, startAudioContextMonitor, cleanupChannel]);

  const stopTranscription = useCallback(() => {
    console.log('[Transcription] Parando transcrição...');
    isActiveRef.current = false;

    // Parar health checks
    if (healthCheckRef.current) {
      clearInterval(healthCheckRef.current);
      healthCheckRef.current = null;
    }
    if (audioContextCheckRef.current) {
      clearInterval(audioContextCheckRef.current);
      audioContextCheckRef.current = null;
    }

    // Limpar canal do microfone
    if (micChannelRef.current) {
      micChannelRef.current.intentionallyClosed = true;
      cleanupChannel(micChannelRef.current);
      micChannelRef.current = null;
    }

    // Limpar canal remoto
    if (remoteChannelRef.current) {
      remoteChannelRef.current.intentionallyClosed = true;
      cleanupChannel(remoteChannelRef.current);
      remoteChannelRef.current = null;
    }

    setIsTranscribing(false);
    console.log('[Transcription] Transcrição parada');
  }, [cleanupChannel]);

  /**
   * Encerra graciosamente — força flush dos últimos tokens do Soniox antes de fechar.
   * Use ANTES de coletar transcriptionsRef.current pra processar a call (evita perder
   * os últimos segundos da fala que ainda estavam como "interim").
   */
  const finalizeTranscription = useCallback(async () => {
    console.log('[Transcription] Finalizando (flush dos últimos tokens)...');

    // 1. Envia empty buffer pros WebSockets ativos (sinal de EOF pro Soniox)
    const channels = [micChannelRef.current, remoteChannelRef.current].filter(Boolean) as ChannelState[];
    for (const ch of channels) {
      try {
        if (ch.ws && ch.ws.readyState === WebSocket.OPEN) {
          ch.ws.send(new ArrayBuffer(0));
        }
      } catch (err) {
        console.warn(`[Transcription] [${ch.channelName}] erro ao sinalizar fim:`, err);
      }
    }

    // 2. Aguarda 1.5s pra últimos tokens finais chegarem
    await new Promise(r => setTimeout(r, 1500));

    // 3. Promove todos os non-final pra final (trava o texto interim como definitivo)
    setTranscriptions(prev => {
      const promoted = prev.map(t => t.is_final ? t : { ...t, is_final: true });
      transcriptionsRef.current = promoted;
      const promotedCount = prev.filter(t => !t.is_final).length;
      if (promotedCount > 0) {
        console.log(`[Transcription] ${promotedCount} segmentos non-final promovidos para final`);
      }
      return promoted;
    });

    // 4. Aguarda tick pra state aplicar
    await new Promise(r => setTimeout(r, 100));

    // 5. Agora para tudo
    stopTranscription();
  }, [stopTranscription]);

  const clearTranscriptions = useCallback(() => {
    setTranscriptions([]);
    transcriptionsRef.current = [];
  }, []);

  const restoreTranscriptions = useCallback((segments: TranscriptionSegment[]) => {
    setTranscriptions(segments);
    transcriptionsRef.current = segments;
  }, []);

  // Cleanup no unmount
  useEffect(() => {
    return () => {
      isActiveRef.current = false;
      if (healthCheckRef.current) clearInterval(healthCheckRef.current);
      if (audioContextCheckRef.current) clearInterval(audioContextCheckRef.current);
      if (micChannelRef.current) {
        micChannelRef.current.intentionallyClosed = true;
        cleanupChannel(micChannelRef.current);
      }
      if (remoteChannelRef.current) {
        remoteChannelRef.current.intentionallyClosed = true;
        cleanupChannel(remoteChannelRef.current);
      }
    };
  }, [cleanupChannel]);

  return {
    isTranscribing,
    transcriptions,
    transcriptionsRef,
    error,
    startTranscription,
    stopTranscription,
    finalizeTranscription,
    clearTranscriptions,
    restoreTranscriptions,
  };
}
