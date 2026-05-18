import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface UseCallRecordingReturn {
  isRecording: boolean;
  recordingDuration: number;
  startRecording: (micStream: MediaStream, remoteStream?: MediaStream | null) => void;
  stopRecording: () => Promise<Blob | null>;
  uploadRecording: (callHistoryId: string) => Promise<string | null>;
}

export function useCallRecording(): UseCallRecordingReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const durationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recordingBlobRef = useRef<Blob | null>(null);

  const startRecording = useCallback((micStream: MediaStream, remoteStream?: MediaStream | null) => {
    try {
      // Criar AudioContext para mixar os 2 streams
      const audioContext = new AudioContext({ sampleRate: 48000 });
      audioContextRef.current = audioContext;

      const destination = audioContext.createMediaStreamDestination();
      destinationRef.current = destination;

      // Conectar mic ao mix
      const micSource = audioContext.createMediaStreamSource(micStream);
      // Reduzir volume do mic levemente para balancear
      const micGain = audioContext.createGain();
      micGain.gain.value = 0.8;
      micSource.connect(micGain);
      micGain.connect(destination);

      // Conectar áudio remoto ao mix (se disponível)
      if (remoteStream) {
        const audioTracks = remoteStream.getAudioTracks();
        if (audioTracks.length > 0) {
          const remoteSource = audioContext.createMediaStreamSource(remoteStream);
          const remoteGain = audioContext.createGain();
          remoteGain.gain.value = 1.0;
          remoteSource.connect(remoteGain);
          remoteGain.connect(destination);
        }
      }

      // Iniciar MediaRecorder com o stream mixado
      chunksRef.current = [];
      recordingBlobRef.current = null;

      // Tentar webm/opus primeiro, fallback para o que o browser suportar
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = 'audio/ogg;codecs=opus';
          if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = ''; // Let browser choose
          }
        }
      }

      const recorderOptions: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 128000, // 128kbps - boa qualidade, ~1MB/min
      };

      const recorder = new MediaRecorder(destination.stream, recorderOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        recordingBlobRef.current = blob;
      };

      // Gravar em chunks de 1s para não perder dados
      recorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

      // Timer de duração
      const startTime = Date.now();
      durationIntervalRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);

    } catch (err) {
      console.error('[useCallRecording] Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      // Parar timer
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }

      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        setIsRecording(false);
        resolve(recordingBlobRef.current);
        return;
      }

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        recordingBlobRef.current = blob;

        // Cleanup
        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close();
        }
        audioContextRef.current = null;
        destinationRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);

        resolve(blob);
      };

      recorder.stop();
    });
  }, []);

  const uploadRecording = useCallback(async (callHistoryId: string): Promise<string | null> => {
    const blob = recordingBlobRef.current;
    if (!blob || blob.size === 0) {
      return null;
    }

    try {
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const fileName = `${callHistoryId}.${ext}`;
      const filePath = `recordings/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('call-recordings')
        .upload(filePath, blob, {
          contentType: blob.type,
          upsert: true,
        });

      if (uploadError) {
        console.error('[useCallRecording] Upload failed:', {
          message: uploadError.message,
          name: uploadError.name,
          path: filePath,
          size: blob.size,
          type: blob.type,
        });
        // Bucket pode não existir — tentar criar via client (best-effort).
        // Normalmente isso precisa ser feito via migration/SQL, mas aqui logamos
        // pra facilitar diagnostico.
        return null;
      }

      // Obter URL assinada (bucket privado)
      const { data: urlData } = await supabase.storage
        .from('call-recordings')
        .createSignedUrl(filePath, 31536000); // 1 year

      const publicUrl = urlData?.signedUrl || '';

      // Salvar URL no call_history
      await supabase
        .from('call_history')
        .update({
          record_url: publicUrl,
          record_status: 'completed',
        })
        .eq('id', callHistoryId);

      // Limpar blob da memória
      recordingBlobRef.current = null;
      chunksRef.current = [];

      return publicUrl;

    } catch (err) {
      console.error('[useCallRecording] Upload exception:', err);
      return null;
    }
  }, []);

  return {
    isRecording,
    recordingDuration,
    startRecording,
    stopRecording,
    uploadRecording,
  };
}
