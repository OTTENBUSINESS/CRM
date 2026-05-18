import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Clock,
  Trophy,
  CheckCircle2,
  XCircle,
  Minus,
  ChevronDown,
  ChevronUp,
  Loader2,
  History,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRoleplayHistory, type RoleplaySession } from '@/hooks/useRoleplaySession';

const scenarioLabels: Record<string, string> = {
  discovery: 'Discovery',
  proposal: 'Proposta',
  closing: 'Fechamento',
  objection: 'Objeções',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }) +
    ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  const color = score >= 80 ? 'bg-green-500/10 text-green-400 border-green-500/30'
    : score >= 60 ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
    : 'bg-red-500/10 text-red-400 border-red-500/30';
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-full text-sm font-bold border', color)}>
      {score}
    </span>
  );
}

function VerdictBadge({ verdict }: { verdict: string | null }) {
  if (!verdict) return null;
  const config = {
    sim: { icon: CheckCircle2, label: 'Compraria', color: 'text-green-400' },
    nao: { icon: XCircle, label: 'Não compraria', color: 'text-red-400' },
    talvez: { icon: Minus, label: 'Talvez', color: 'text-amber-400' },
  }[verdict] || { icon: Minus, label: verdict, color: 'text-muted-foreground' };
  const Icon = config.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs', config.color)}>
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  );
}

export function RoleplayHistory() {
  const { data: sessions, isLoading } = useRoleplayHistory();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="text-center py-10">
        <History className="h-10 w-10 text-muted-foreground/30 mx-auto" />
        <p className="text-sm text-muted-foreground mt-2">Nenhum roleplay realizado ainda</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 mt-6">
      <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
        <History className="h-4 w-4" />
        Historico ({sessions.length})
      </h3>
      <div className="space-y-1.5">
        {sessions.map((session) => {
          const isExpanded = expandedId === session.id;
          return (
            <div key={session.id} className="rounded-lg border border-border/50 bg-card overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : session.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/30 transition-colors"
              >
                <ScoreBadge score={session.score} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {session.persona_name}
                    <span className="text-muted-foreground font-normal">
                      {' '}— {session.persona_role}, {session.persona_company}
                    </span>
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span>{scenarioLabels[session.scenario] || session.scenario}</span>
                    <span>·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      {formatDuration(session.duration_seconds)}
                    </span>
                    <span>·</span>
                    <span>{formatDate(session.created_at)}</span>
                  </div>
                </div>
                <VerdictBadge verdict={session.verdict} />
                {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </button>

              {isExpanded && session.evaluation && (
                <div className="px-4 pb-4 border-t border-border/50 pt-3 space-y-3">
                  {/* Veredicto */}
                  <p className="text-sm text-muted-foreground">{session.evaluation.veredicto_motivo}</p>

                  {/* Fases */}
                  {session.evaluation.fases && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {session.evaluation.fases.map((fase: any, i: number) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <ScoreBadge score={fase.nota} />
                          <span className="text-muted-foreground truncate">{fase.nome}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Pontos fortes e fracos */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {session.evaluation.pontos_fortes?.length > 0 && (
                      <div>
                        <p className="font-medium text-green-400 mb-1">Pontos fortes</p>
                        {session.evaluation.pontos_fortes.map((p: string, i: number) => (
                          <p key={i} className="text-muted-foreground">+ {p}</p>
                        ))}
                      </div>
                    )}
                    {session.evaluation.pontos_fracos?.length > 0 && (
                      <div>
                        <p className="font-medium text-red-400 mb-1">Pontos fracos</p>
                        {session.evaluation.pontos_fracos.map((p: string, i: number) => (
                          <p key={i} className="text-muted-foreground">- {p}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dica */}
                  {session.evaluation.dica_final && (
                    <div className="flex items-start gap-1.5 text-xs bg-amber-500/5 p-2 rounded">
                      <Trophy className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-muted-foreground">{session.evaluation.dica_final}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
