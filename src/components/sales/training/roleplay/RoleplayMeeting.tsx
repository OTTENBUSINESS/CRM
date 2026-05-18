import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Mic,
  MicOff,
  PhoneOff,
  MessageSquare,
  Clock,
  User,
  Volume2,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoleplayPersona, TranscriptionEntry } from '@/hooks/useRoleplaySession';

interface RoleplayMeetingProps {
  persona: RoleplayPersona;
  duration: number;
  transcription: TranscriptionEntry[];
  isMuted: boolean;
  isAiSpeaking: boolean;
  onToggleMute: () => void;
  onEnd: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function RoleplayMeeting({
  persona,
  duration,
  transcription,
  isMuted,
  isAiSpeaking,
  onToggleMute,
  onEnd,
}: RoleplayMeetingProps) {
  const [showTranscription, setShowTranscription] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const transcriptionEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcription
  useEffect(() => {
    if (transcriptionEndRef.current && showTranscription) {
      transcriptionEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcription, showTranscription]);

  const handleEnd = () => {
    if (!showEndConfirm) {
      setShowEndConfirm(true);
      setTimeout(() => setShowEndConfirm(false), 3000);
      return;
    }
    onEnd();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1a1a1a] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 bg-[#111]">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs font-medium text-red-400">ROLEPLAY</span>
          </div>
          <span className="text-sm text-white/60">|</span>
          <span className="text-sm text-white/80">{persona.name} — {persona.role}, {persona.company}</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 font-mono text-white/90">
            <Clock className="h-4 w-4 text-white/50" />
            {formatDuration(duration)}
          </div>
        </div>
      </div>

      {/* Main area - participant grid */}
      <div className="flex-1 flex items-center justify-center relative p-8">
        {/* AI Client - Main tile */}
        <div className="relative max-w-2xl w-full aspect-video bg-[#2a2a2a] rounded-2xl overflow-hidden flex items-center justify-center">
          {/* Background gradient */}
          <div className={cn(
            'absolute inset-0 transition-opacity duration-700',
            isAiSpeaking ? 'opacity-100' : 'opacity-0'
          )}>
            <div className="absolute inset-0 bg-gradient-to-br from-amber-500/10 via-transparent to-amber-500/5" />
          </div>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-4 z-10">
            {/* Speaking ring animation */}
            <div className="relative">
              {/* Outer pulse ring */}
              {isAiSpeaking && (
                <>
                  <div className="absolute inset-0 -m-3 rounded-full bg-amber-500/20 animate-ping" style={{ animationDuration: '1.5s' }} />
                  <div className="absolute inset-0 -m-2 rounded-full bg-amber-500/10 animate-pulse" />
                </>
              )}
              <div className={cn(
                'w-28 h-28 rounded-full flex items-center justify-center text-3xl font-bold transition-all duration-300',
                isAiSpeaking
                  ? 'bg-amber-500/30 text-amber-300 ring-4 ring-amber-500/60'
                  : 'bg-white/10 text-white/70 ring-2 ring-white/20'
              )}>
                {persona.avatar}
              </div>
            </div>

            <div className="text-center">
              <p className="text-xl font-semibold text-white">{persona.name}</p>
              <p className="text-sm text-white/50">{persona.role} — {persona.company}</p>
            </div>

            {/* Speaking indicator */}
            {isAiSpeaking && (
              <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/20 rounded-full">
                <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-xs text-amber-300">Falando...</span>
                <div className="flex gap-0.5 items-end h-3">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="w-0.5 bg-amber-400 rounded-full animate-pulse"
                      style={{
                        height: `${40 + Math.random() * 60}%`,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: '0.4s',
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Name badge bottom-left */}
          <div className="absolute bottom-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/50 rounded-lg backdrop-blur-sm">
            <User className="h-3.5 w-3.5 text-white/60" />
            <span className="text-sm text-white/80">{persona.name}</span>
          </div>
        </div>

        {/* User thumbnail - bottom right */}
        <div className="absolute bottom-12 right-12 w-48 h-36 bg-[#333] rounded-xl overflow-hidden border border-white/10 flex items-center justify-center">
          <div className="flex flex-col items-center gap-2">
            <div className={cn(
              'w-14 h-14 rounded-full flex items-center justify-center',
              isMuted ? 'bg-red-500/20' : 'bg-blue-500/20'
            )}>
              {isMuted ? (
                <MicOff className="h-6 w-6 text-red-400" />
              ) : (
                <Mic className="h-6 w-6 text-blue-400" />
              )}
            </div>
            <span className="text-xs text-white/60">Você</span>
          </div>
          {/* Muted badge */}
          {isMuted && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1 px-2 py-0.5 bg-red-500/80 rounded text-[10px] text-white font-medium">
              <MicOff className="h-2.5 w-2.5" />
              Mudo
            </div>
          )}
        </div>

        {/* Live caption bar (last AI message) */}
        {transcription.length > 0 && !showTranscription && (
          <div className="absolute bottom-12 left-1/2 -translate-x-1/2 max-w-xl">
            <div className="px-4 py-2 bg-black/70 rounded-lg backdrop-blur-sm">
              <p className="text-sm text-white/90 text-center">
                {transcription[transcription.length - 1]?.text.slice(-120)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Transcription sidebar */}
      {showTranscription && (
        <div className="fixed right-0 top-[52px] bottom-[72px] w-96 bg-[#222] border-l border-white/10 flex flex-col z-50">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <span className="text-sm font-medium text-white/80">Transcrição</span>
            <span className="text-xs text-white/40">{transcription.filter(t => t.isFinal).length} mensagens</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcription.filter(t => t.isFinal || t.speaker === 'cliente').map((entry) => (
              <div key={entry.id} className={cn(
                'flex gap-2',
                entry.speaker === 'vendedor' ? 'justify-end' : 'justify-start'
              )}>
                <div className={cn(
                  'max-w-[80%] px-3 py-2 rounded-xl text-sm',
                  entry.speaker === 'vendedor'
                    ? 'bg-blue-500/20 text-blue-100'
                    : 'bg-amber-500/20 text-amber-100',
                  !entry.isFinal && 'opacity-60 italic'
                )}>
                  <p className="text-[10px] font-medium mb-0.5 opacity-60">
                    {entry.speaker === 'vendedor' ? 'Você' : persona.name}
                  </p>
                  {entry.text}
                </div>
              </div>
            ))}
            <div ref={transcriptionEndRef} />
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-4 py-4 bg-[#111]">
        {/* Mute */}
        <Button
          variant="ghost"
          size="lg"
          className={cn(
            'rounded-full h-14 w-14',
            isMuted
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
              : 'bg-white/10 hover:bg-white/15 text-white'
          )}
          onClick={onToggleMute}
        >
          {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </Button>

        {/* End call */}
        <Button
          variant="ghost"
          size="lg"
          className={cn(
            'rounded-full h-14 px-6',
            showEndConfirm
              ? 'bg-red-600 hover:bg-red-700 text-white'
              : 'bg-red-500/80 hover:bg-red-600 text-white'
          )}
          onClick={handleEnd}
        >
          <PhoneOff className="h-6 w-6 mr-2" />
          {showEndConfirm ? 'Confirmar' : 'Encerrar'}
        </Button>

        {/* Transcription toggle */}
        <Button
          variant="ghost"
          size="lg"
          className={cn(
            'rounded-full h-14 w-14',
            showTranscription
              ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-400'
              : 'bg-white/10 hover:bg-white/15 text-white'
          )}
          onClick={() => setShowTranscription(!showTranscription)}
        >
          <MessageSquare className="h-6 w-6" />
        </Button>
      </div>
    </div>
  );
}
