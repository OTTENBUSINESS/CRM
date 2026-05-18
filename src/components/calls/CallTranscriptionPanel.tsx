import { useRef, useEffect, useState, useCallback } from 'react';
import { Mic, User, Loader2, Copy, Check, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TranscriptionSegment } from '@/hooks/useCallTranscription';

interface CallTranscriptionPanelProps {
  transcriptions: TranscriptionSegment[];
  isTranscribing: boolean;
  error?: string | null;
  maxHeight?: string;
  showTimestamps?: boolean;
}

function formatTimestamp(timestamp: number, startTime?: number): string {
  const ms = startTime ? timestamp - startTime : timestamp;
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function CallTranscriptionPanel({
  transcriptions,
  isTranscribing,
  error,
  maxHeight = '300px',
  showTimestamps = true,
}: CallTranscriptionPanelProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef<number | null>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const [copied, setCopied] = useState(false);

  // Definir tempo inicial na primeira transcrição
  useEffect(() => {
    if (transcriptions.length > 0 && startTimeRef.current === null) {
      startTimeRef.current = transcriptions[0].timestamp;
    }
  }, [transcriptions]);

  // Detectar se usuário scrollou para cima (quer ler histórico)
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const threshold = 60;
    const isAtBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
    setIsUserScrolling(!isAtBottom);
  }, []);

  // Auto-scroll APENAS se usuário está no fim (não interrompeu)
  useEffect(() => {
    if (!isUserScrolling && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptions, isUserScrolling]);

  // Scroll to bottom manual
  const scrollToBottom = useCallback(() => {
    setIsUserScrolling(false);
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Copiar transcrição
  const handleCopy = useCallback(() => {
    const finalTranscriptions = transcriptions.filter(t => t.is_final);
    const text = finalTranscriptions
      .map(t => `[${t.speaker}] ${t.text}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [transcriptions]);

  // Filtrar apenas transcrições finais para exibição, mais a última parcial de cada speaker
  const displayTranscriptions = transcriptions.filter(t => t.is_final);
  const latestLocalPartial = transcriptions.find(t => !t.is_final && t.speakerType === 'local');
  const latestRemotePartial = transcriptions.find(t => !t.is_final && t.speakerType === 'remote');

  // Combinar finais com parciais atuais
  const allToShow = [
    ...displayTranscriptions,
    ...(latestLocalPartial ? [latestLocalPartial] : []),
    ...(latestRemotePartial ? [latestRemotePartial] : []),
  ].sort((a, b) => a.timestamp - b.timestamp);

  if (error) {
    return (
      <div className="text-sm text-destructive p-3 bg-destructive/10 rounded-md">
        Erro na transcrição: {error}
      </div>
    );
  }

  if (!isTranscribing && transcriptions.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-3 text-center">
        A transcrição iniciará quando a chamada for conectada
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Header com botão de copiar */}
      {allToShow.length > 0 && (
        <div className="flex items-center justify-end gap-1 mb-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleCopy}
          >
            {copied ? (
              <><Check className="h-3 w-3 mr-1 text-green-500" />Copiado</>
            ) : (
              <><Copy className="h-3 w-3 mr-1" />Copiar</>
            )}
          </Button>
        </div>
      )}

      <div
        ref={scrollContainerRef}
        style={{ maxHeight }}
        className="overflow-y-auto pr-2 scroll-smooth"
        onScroll={handleScroll}
      >
        <div className="space-y-3 pb-2">
          {allToShow.length === 0 && isTranscribing && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Aguardando fala...</span>
            </div>
          )}

          {allToShow.map((segment, index) => (
            <div
              key={segment.is_final ? segment.id : `partial-${segment.speakerType}-${index}`}
              className={cn(
                'flex gap-2',
                !segment.is_final && 'opacity-60'
              )}
            >
              {/* Ícone do speaker */}
              <div
                className={cn(
                  'flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5',
                  segment.speakerType === 'local'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-blue-500/10 text-blue-500'
                )}
              >
                {segment.speakerType === 'local' ? (
                  <Mic className="h-3.5 w-3.5" />
                ) : (
                  <User className="h-3.5 w-3.5" />
                )}
              </div>

              {/* Conteúdo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      segment.speakerType === 'local'
                        ? 'text-primary'
                        : 'text-blue-500'
                    )}
                  >
                    {segment.speaker}
                  </span>
                  {showTimestamps && startTimeRef.current && (
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(segment.timestamp, startTimeRef.current)}
                    </span>
                  )}
                </div>
                <p
                  className={cn(
                    'text-sm leading-relaxed',
                    !segment.is_final && 'italic'
                  )}
                >
                  {segment.text}
                  {!segment.is_final && (
                    <span className="inline-flex items-center ml-1">
                      <span className="animate-pulse">...</span>
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}

          {/* Elemento invisível para scroll automático */}
          <div ref={endRef} />
        </div>
      </div>

      {/* Botão flutuante "Voltar ao fim" quando usuário scrollou para cima */}
      {isUserScrolling && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-2 right-2 bg-primary text-primary-foreground rounded-full p-1.5 shadow-lg hover:bg-primary/90 transition-colors z-10"
          title="Ir para o fim"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}

      {/* Indicador de transcrição ativa com gradiente */}
      {isTranscribing && !isUserScrolling && (
        <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      )}
    </div>
  );
}
