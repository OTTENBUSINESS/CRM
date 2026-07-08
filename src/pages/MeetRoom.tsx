import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import {
  LiveKitRoom,
  VideoConference,
  PreJoin,
  useLocalParticipant,
  useTracks,
  type LocalUserChoices,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import { supabase } from '@/lib/supabase';
import { useCallTranscription } from '@/hooks/useCallTranscription';

interface ConnectionData {
  token: string;
  url: string;
}

/**
 * Página PÚBLICA da sala de videochamada (/meet/:roomId).
 *
 * IMPORTANTE: convidados (role=guest) NÃO têm sessão Supabase — toda operação
 * de banco aqui é best-effort (try/catch não-fatal). Só o token LiveKit é
 * obrigatório pra entrar na sala.
 */
export default function MeetRoom() {
  const { roomId } = useParams<{ roomId: string }>();
  const [searchParams] = useSearchParams();

  const role = (searchParams.get('role') || 'guest') as 'host' | 'guest' | 'observer';
  const defaultName = searchParams.get('name') || '';
  const leadId = searchParams.get('lead_id') || undefined;
  const orgId = searchParams.get('org_id') || undefined;
  const returnUrl = searchParams.get('return') || '/';

  const isHost = role === 'host';
  const isObserver = role === 'observer';

  const [preJoinChoices, setPreJoinChoices] = useState<LocalUserChoices | null>(null);
  const [connectionData, setConnectionData] = useState<ConnectionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ended, setEnded] = useState(false);
  const [meetingDbId, setMeetingDbId] = useState<string | null>(null);

  // Observer pula o PreJoin automaticamente (hook ANTES de qualquer return condicional)
  useEffect(() => {
    if (isObserver && !preJoinChoices && roomId) {
      (async () => {
        try {
          const { token, url } = await getLiveKitToken({
            roomName: roomId,
            participantName: defaultName || 'Observador',
            role: 'observer',
            metadata: { lead_id: leadId, org_id: orgId },
          });
          setPreJoinChoices({
            username: defaultName || 'Observador',
            videoEnabled: false,
            audioEnabled: false,
            videoDeviceId: '',
            audioDeviceId: '',
          });
          setConnectionData({ token, url });
        } catch (err: any) {
          setError(err?.message || 'Erro ao conectar como observador');
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isObserver, roomId, preJoinChoices]);

  const handlePreJoin = async (choices: LocalUserChoices) => {
    if (!roomId) return;
    setPreJoinChoices(choices);
    setLoading(true);
    setError(null);

    // ---- Operações de banco: best-effort (guest sem login falha por RLS e tudo bem) ----
    try {
      const { data: existing } = await supabase
        .from('meetings')
        .select('id')
        .eq('livekit_room_name', roomId)
        .maybeSingle();

      if (existing) {
        setMeetingDbId(existing.id);
      } else {
        // Busca activity vinculada (caso a reunião foi criada via tarefa no CRM)
        let act: { id: string; lead_id: string | null; organization_id: string | null } | null = null;
        try {
          const { data } = await supabase
            .from('company_activities')
            .select('id, lead_id, organization_id')
            .like('meeting_link', `%${roomId}%`)
            .maybeSingle();
          act = data as any;
        } catch {
          // sem permissão / sem resultado — segue
        }

        const { data: newMeet } = await supabase
          .from('meetings')
          .insert({
            title: `Reunião ${roomId}`,
            type: 'online',
            lead_id: leadId || act?.lead_id || null,
            organization_id: orgId || act?.organization_id || null,
            activity_id: act?.id || null,
            meeting_type: 'sales',
            team: 'sales',
            status: 'active',
            livekit_room_name: roomId,
            recording_status: 'pending',
            meeting_link: window.location.origin + '/meet/' + roomId,
            transcriptions: [],
          })
          .select('id')
          .single();

        if (newMeet) setMeetingDbId(newMeet.id);

        // Marca a tarefa como "em andamento"
        if (act?.id) {
          await supabase
            .from('company_activities')
            .update({ status: 'in_progress' })
            .eq('id', act.id);
        }
      }
    } catch (dbErr) {
      // NÃO-FATAL: guest sem sessão não passa no RLS. A linha de meetings
      // normalmente já foi criada pelo host/CRM. Segue direto pro token.
      console.warn('[MeetRoom] Operação de banco falhou (não-fatal):', dbErr);
    }

    // ---- Token LiveKit: obrigatório ----
    try {
      const { token, url } = await getLiveKitToken({
        roomName: roomId,
        participantName: choices.username || defaultName || 'Participante',
        role,
        metadata: { lead_id: leadId, org_id: orgId },
      });

      setConnectionData({ token, url });
      setLoading(false);
    } catch (err: any) {
      setError(err?.message || 'Erro ao conectar');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!isHost) {
      // Guest/observer só sai
      setConnectionData(null);
      setEnded(true);
      return;
    }

    // Host encerra a sala pra todos (kicka guests + finaliza gravação)
    if (roomId) {
      supabase.functions.invoke('livekit-end-room', { body: { room_name: roomId } }).catch(() => {});
    }

    setConnectionData(null);
    setEnded(true);
  };

  // ========== Renders (depois de TODOS os hooks) ==========

  if (error) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl mb-4">Erro</h1>
          <p className="text-zinc-400">{error}</p>
          <a href={returnUrl} className="mt-4 inline-block text-emerald-400 hover:text-emerald-300">Voltar</a>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <h1 className="text-2xl mb-4">Reunião encerrada</h1>
          <p className="text-zinc-400 mb-6">Obrigado pela participação</p>
          <a href={returnUrl} className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-lg inline-block">
            Voltar
          </a>
        </div>
      </div>
    );
  }

  if (!preJoinChoices) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-800 rounded-xl p-6">
          <h1 className="text-white text-2xl mb-4 text-center">Entrando na reunião</h1>
          <PreJoin
            defaults={{ username: defaultName, videoEnabled: true, audioEnabled: true }}
            onSubmit={handlePreJoin}
            data-lk-theme="default"
            userLabel="Seu nome"
            joinLabel="Entrar na sala"
            micLabel="Microfone"
            camLabel="Câmera"
          />
        </div>
      </div>
    );
  }

  if (!connectionData || loading) {
    return (
      <div className="min-h-screen bg-zinc-900 text-white flex items-center justify-center">
        <p className="animate-pulse">Conectando...</p>
      </div>
    );
  }

  return (
    <LiveKitRoom
      token={connectionData.token}
      serverUrl={connectionData.url}
      video={!!preJoinChoices?.videoEnabled && !isObserver}
      audio={!!preJoinChoices?.audioEnabled && !isObserver}
      connect={true}
      onDisconnected={handleDisconnect}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <VideoConference />
      {isHost && (
        <RoomTranscriptionPanel
          meetingId={meetingDbId}
          hostName={preJoinChoices.username || defaultName || 'Você'}
        />
      )}
    </LiveKitRoom>
  );
}

/**
 * Painel discreto de transcrição em tempo real (Soniox) — só pro host.
 * Renderizado DENTRO do <LiveKitRoom> pra ter acesso ao contexto da sala.
 * Streams passados via ref pra evitar closure stale (gotcha 4).
 */
function RoomTranscriptionPanel({ meetingId, hostName }: { meetingId: string | null; hostName: string }) {
  const [open, setOpen] = useState(false);
  const { localParticipant } = useLocalParticipant();
  const micTracks = useTracks([Track.Source.Microphone]);

  const {
    isTranscribing,
    transcriptions,
    transcriptionsRef,
    error: transcriptionError,
    startTranscription,
    finalizeTranscription,
  } = useCallTranscription();

  // Refs pros streams (chegam DEPOIS do primeiro render — gotcha 4)
  const micStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  // Coleta streams de áudio: mic local + primeiro participante remoto
  useEffect(() => {
    for (const ref of micTracks) {
      const mediaTrack = ref.publication?.track?.mediaStreamTrack;
      if (!mediaTrack) continue;
      if (ref.participant?.isLocal) {
        micStreamRef.current = new MediaStream([mediaTrack]);
      } else if (!remoteStreamRef.current || remoteStreamRef.current.getAudioTracks()[0]?.readyState === 'ended') {
        remoteStreamRef.current = new MediaStream([mediaTrack]);
      }
    }
    // Fallback: pega direto da publicação do participante local
    if (!micStreamRef.current) {
      const pub = localParticipant?.getTrackPublication(Track.Source.Microphone);
      const mediaTrack = pub?.track?.mediaStreamTrack;
      if (mediaTrack) micStreamRef.current = new MediaStream([mediaTrack]);
    }
  }, [micTracks, localParticipant]);

  // Auto-save em meetings.transcriptions a cada 10s (best-effort)
  useEffect(() => {
    if (!isTranscribing || !meetingId) return;
    const timer = setInterval(() => {
      const finals = transcriptionsRef.current.filter((t) => t.is_final);
      if (finals.length === 0) return;
      supabase
        .from('meetings')
        .update({ transcriptions: finals })
        .eq('id', meetingId)
        .then(({ error }) => {
          if (error) console.warn('[MeetRoom] Falha ao salvar transcrições (não-fatal):', error.message);
        });
    }, 10000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTranscribing, meetingId]);

  // Auto-scroll pro fim da lista
  useEffect(() => {
    if (open) listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcriptions, open]);

  const handleStart = async () => {
    const micStream = micStreamRef.current;
    if (!micStream || micStream.getAudioTracks().length === 0) {
      console.warn('[MeetRoom] Microfone ainda não disponível pra transcrição');
      return;
    }
    await startTranscription({
      micStream,
      remoteStream: remoteStreamRef.current,
      speakerName: hostName,
      remoteSpeakerName: 'Convidado',
      preserveExisting: true,
    });
  };

  const handleStop = async () => {
    await finalizeTranscription();
    // Salva o snapshot final
    if (meetingId) {
      const finals = transcriptionsRef.current.filter((t) => t.is_final);
      if (finals.length > 0) {
        try {
          await supabase.from('meetings').update({ transcriptions: finals }).eq('id', meetingId);
        } catch {
          // best-effort
        }
      }
    }
  };

  return (
    <div className="fixed top-3 right-3 z-50 flex flex-col items-end gap-2" style={{ maxWidth: 340 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full bg-zinc-800/90 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700 transition-colors shadow-lg"
      >
        <span
          className={
            isTranscribing
              ? 'h-2 w-2 rounded-full bg-red-500 animate-pulse'
              : 'h-2 w-2 rounded-full bg-zinc-500'
          }
        />
        Transcrição
        <span className="text-zinc-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="w-80 rounded-xl bg-zinc-900/95 border border-zinc-700 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
            <span className="text-xs font-medium text-zinc-300">
              {isTranscribing ? 'Transcrevendo em tempo real' : 'Transcrição pausada'}
            </span>
            {isTranscribing ? (
              <button
                type="button"
                onClick={handleStop}
                className="text-[11px] px-2 py-0.5 rounded bg-red-600/80 hover:bg-red-600 text-white"
              >
                Parar
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                className="text-[11px] px-2 py-0.5 rounded bg-emerald-600/80 hover:bg-emerald-600 text-white"
              >
                Iniciar
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-1.5">
            {transcriptionError && (
              <p className="text-[11px] text-red-400">{transcriptionError}</p>
            )}
            {transcriptions.length === 0 && !transcriptionError && (
              <p className="text-[11px] text-zinc-500">
                {isTranscribing ? 'Aguardando fala...' : 'Clique em Iniciar pra transcrever a reunião.'}
              </p>
            )}
            {transcriptions.map((t) => (
              <p key={`${t.id}-${t.timestamp}`} className={t.is_final ? 'text-xs text-zinc-200' : 'text-xs text-zinc-500 italic'}>
                <span className={t.speakerType === 'local' ? 'font-semibold text-emerald-400' : 'font-semibold text-sky-400'}>
                  {t.speaker}:
                </span>{' '}
                {t.text}
              </p>
            ))}
            <div ref={listEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}

async function getLiveKitToken(params: {
  roomName: string;
  participantName: string;
  role: 'host' | 'guest' | 'observer';
  metadata?: Record<string, unknown>;
}): Promise<ConnectionData> {
  const { data, error } = await supabase.functions.invoke('livekit-token', {
    body: params,
  });
  if (error || !data?.token) throw new Error(error?.message || 'Falha ao gerar token da sala');
  return data as ConnectionData;
}
