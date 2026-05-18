import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcw,
  Trophy,
  Target,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { saveRoleplaySession } from '@/hooks/useRoleplaySession';
import { useQueryClient } from '@tanstack/react-query';
import type { RoleplayPersona, TranscriptionEntry } from '@/hooks/useRoleplaySession';

interface RoleplayResultsProps {
  persona: RoleplayPersona;
  scenario: string;
  voice: string;
  duration: number;
  transcription: TranscriptionEntry[];
  onReset: () => void;
}

interface Evaluation {
  nota_geral: number;
  veredicto: 'sim' | 'nao' | 'talvez';
  veredicto_motivo: string;
  fases: {
    nome: string;
    nota: number;
    feedback: string;
  }[];
  pontos_fortes: string[];
  pontos_fracos: string[];
  frases_melhorar: {
    original: string;
    sugestao: string;
    motivo: string;
  }[];
  objecoes: {
    objecao: string;
    tratou: boolean;
    qualidade: string;
  }[];
  dica_final: string;
}

const scenarioLabels: Record<string, string> = {
  discovery: 'Discovery',
  proposal: 'Proposta',
  closing: 'Fechamento',
  objection: 'Objeções',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s}s`;
}

function ScoreCircle({ score, size = 'lg' }: { score: number; size?: 'sm' | 'lg' }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-amber-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'bg-green-500/10' : score >= 60 ? 'bg-amber-500/10' : 'bg-red-500/10';
  const ringColor = score >= 80 ? 'ring-green-500/30' : score >= 60 ? 'ring-amber-500/30' : 'ring-red-500/30';

  if (size === 'sm') {
    return (
      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center ring-2', bgColor, ringColor)}>
        <span className={cn('text-sm font-bold', color)}>{score}</span>
      </div>
    );
  }

  return (
    <div className={cn('w-28 h-28 rounded-full flex items-center justify-center ring-4', bgColor, ringColor)}>
      <div className="text-center">
        <span className={cn('text-4xl font-bold', color)}>{score}</span>
        <p className="text-xs text-muted-foreground">/100</p>
      </div>
    </div>
  );
}

export function RoleplayResults({
  persona,
  scenario,
  voice,
  duration,
  transcription,
  onReset,
}: RoleplayResultsProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);
  const [showPhrases, setShowPhrases] = useState(false);
  const [saved, setSaved] = useState(false);

  // Evaluate on mount
  useEffect(() => {
    evaluateCall();
  }, []);

  async function evaluateCall() {
    setIsLoading(true);
    setError(null);

    try {
      // Build transcript text
      const transcriptText = transcription
        .filter(t => t.isFinal)
        .map(t => `[${t.speaker === 'vendedor' ? 'Vendedor' : persona.name}]: ${t.text}`)
        .join('\n');

      if (!transcriptText.trim()) {
        setError('Transcrição vazia — não há o que avaliar.');
        setIsLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('roleplay-evaluate', {
        body: {
          transcript: transcriptText,
          persona: {
            name: persona.name,
            role: persona.role,
            company: persona.company,
          },
          scenario,
          duration,
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.error) throw new Error(data.error);

      setEvaluation(data);

      // Auto-save to DB
      if (user?.id && data?.nota_geral != null) {
        try {
          await saveRoleplaySession({
            persona,
            scenario,
            voice,
            duration,
            transcription,
            evaluation: data,
            score: data.nota_geral,
            verdict: data.veredicto,
            userId: user.id,
          });
          setSaved(true);
          queryClient.invalidateQueries({ queryKey: ['roleplay-history'] });
          console.log('[Roleplay] Session saved to DB');
        } catch (saveErr) {
          console.error('[Roleplay] Failed to save session:', saveErr);
        }
      }
    } catch (err: any) {
      console.error('[Roleplay] Evaluation error:', err);
      setError(err.message || 'Erro ao avaliar a call');
    } finally {
      setIsLoading(false);
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-amber-500 mx-auto" />
        <h3 className="text-xl font-semibold">Analisando sua performance...</h3>
        <p className="text-muted-foreground">
          A IA está avaliando cada fase da sua call com {persona.name}
        </p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-20 space-y-4">
        <AlertTriangle className="h-10 w-10 text-red-400 mx-auto" />
        <h3 className="text-xl font-semibold">Erro na avaliação</h3>
        <p className="text-muted-foreground">{error}</p>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={evaluateCall}>Tentar novamente</Button>
          <Button onClick={onReset}>Novo roleplay</Button>
        </div>
      </div>
    );
  }

  if (!evaluation) return null;

  const VerdictIcon = evaluation.veredicto === 'sim' ? CheckCircle2 : evaluation.veredicto === 'nao' ? XCircle : Minus;
  const verdictColor = evaluation.veredicto === 'sim' ? 'text-green-400' : evaluation.veredicto === 'nao' ? 'text-red-400' : 'text-amber-400';
  const verdictBg = evaluation.veredicto === 'sim' ? 'bg-green-500/10 border-green-500/30' : evaluation.veredicto === 'nao' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30';
  const verdictLabel = evaluation.veredicto === 'sim' ? 'Cliente compraria!' : evaluation.veredicto === 'nao' ? 'Cliente não compraria' : 'Cliente ficou em dúvida';

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-10">
      {/* Header */}
      <div className="text-center space-y-4">
        <ScoreCircle score={evaluation.nota_geral} />
        <div>
          <h2 className="text-2xl font-bold">Resultado do Roleplay</h2>
          <p className="text-muted-foreground">
            {persona.name} ({persona.role}) — {scenarioLabels[scenario] || scenario} — {formatDuration(duration)}
          </p>
        </div>
      </div>

      {/* Verdict */}
      <div className={cn('p-4 rounded-xl border text-center', verdictBg)}>
        <div className="flex items-center justify-center gap-2 mb-1">
          <VerdictIcon className={cn('h-5 w-5', verdictColor)} />
          <span className={cn('font-semibold text-lg', verdictColor)}>{verdictLabel}</span>
        </div>
        <p className="text-sm text-muted-foreground">{evaluation.veredicto_motivo}</p>
      </div>

      {/* Phases */}
      <div className="space-y-2">
        <h3 className="font-semibold flex items-center gap-2">
          <Target className="h-4 w-4 text-amber-500" />
          Avaliação por Fase
        </h3>
        <div className="grid gap-2">
          {evaluation.fases.map((fase, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-card border border-border/50">
              <ScoreCircle score={fase.nota} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{fase.nome}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{fase.feedback}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Strengths & Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-green-400">
            <TrendingUp className="h-4 w-4" />
            Pontos Fortes
          </h3>
          <div className="space-y-1.5">
            {evaluation.pontos_fortes.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2 text-red-400">
            <TrendingDown className="h-4 w-4" />
            Pontos Fracos
          </h3>
          <div className="space-y-1.5">
            {evaluation.pontos_fracos.map((p, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span>{p}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Objections */}
      {evaluation.objecoes?.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Objeções
          </h3>
          <div className="space-y-1.5">
            {evaluation.objecoes.map((obj, i) => (
              <div key={i} className="flex items-start gap-2 p-2.5 rounded-lg bg-card border border-border/50 text-sm">
                {obj.tratou ? (
                  <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-medium">"{obj.objecao}"</p>
                  <p className="text-muted-foreground text-xs mt-0.5">{obj.qualidade}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Phrases to improve */}
      {evaluation.frases_melhorar?.length > 0 && (
        <div className="space-y-2">
          <button
            onClick={() => setShowPhrases(!showPhrases)}
            className="font-semibold flex items-center gap-2 hover:text-amber-400 transition-colors"
          >
            <MessageSquare className="h-4 w-4 text-amber-500" />
            Frases que podem melhorar ({evaluation.frases_melhorar.length})
            {showPhrases ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
          {showPhrases && (
            <div className="space-y-2">
              {evaluation.frases_melhorar.map((f, i) => (
                <div key={i} className="p-3 rounded-lg bg-card border border-border/50 text-sm space-y-1.5">
                  <div className="flex items-start gap-2">
                    <span className="text-red-400 font-medium shrink-0">Disse:</span>
                    <span className="text-muted-foreground italic">"{f.original}"</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-green-400 font-medium shrink-0">Melhor:</span>
                    <span>"{f.sugestao}"</span>
                  </div>
                  <p className="text-xs text-muted-foreground pl-1">{f.motivo}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Final tip */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
        <p className="text-sm flex items-start gap-2">
          <Trophy className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <span><strong>Dica:</strong> {evaluation.dica_final}</span>
        </p>
      </div>

      {/* Transcript toggle */}
      <div>
        <button
          onClick={() => setShowTranscript(!showTranscript)}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {showTranscript ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {showTranscript ? 'Ocultar transcrição' : 'Ver transcrição completa'}
        </button>
        {showTranscript && (
          <div className="mt-2 max-h-96 overflow-y-auto p-4 rounded-lg bg-card border border-border/50 space-y-2">
            {transcription.filter(t => t.isFinal).map((entry) => (
              <div key={entry.id} className="text-sm">
                <span className={cn(
                  'font-medium',
                  entry.speaker === 'vendedor' ? 'text-blue-400' : 'text-amber-400'
                )}>
                  {entry.speaker === 'vendedor' ? 'Você' : persona.name}:
                </span>{' '}
                <span className="text-muted-foreground">{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3 pt-4">
        <Button variant="outline" size="lg" onClick={onReset}>
          <RotateCcw className="h-4 w-4 mr-2" />
          Novo Roleplay
        </Button>
      </div>
    </div>
  );
}
