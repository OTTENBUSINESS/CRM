import { Clock, Tag, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { TrainingCase } from '@/hooks/useSalesTraining';

const categoryLabels: Record<string, string> = {
  sdr_call: 'SDR',
  closer_call: 'Closer',
  meeting: 'Reunião',
  objection_handling: 'Objeção',
  closing: 'Fechamento',
  discovery: 'Discovery',
};

const categoryColors: Record<string, string> = {
  sdr_call: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  closer_call: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  meeting: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  objection_handling: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  closing: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  discovery: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
};

const difficultyLabels: Record<string, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
  beginner: 'Iniciante',
  intermediate: 'Intermediário',
  advanced: 'Avançado',
};

const difficultyColors: Record<string, string> = {
  easy: 'text-emerald-400',
  medium: 'text-yellow-400',
  hard: 'text-red-400',
  beginner: 'text-emerald-400',
  intermediate: 'text-yellow-400',
  advanced: 'text-red-400',
};

function formatDuration(seconds?: number) {
  if (!seconds) return null;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function OutcomeIcon({ outcome }: { outcome: string }) {
  if (outcome === 'won' || outcome === 'positive') {
    return <TrendingUp className="h-4 w-4 text-emerald-400" />;
  }
  if (outcome === 'lost' || outcome === 'negative') {
    return <TrendingDown className="h-4 w-4 text-red-400" />;
  }
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

interface TrainingCaseCardProps {
  trainingCase: TrainingCase;
  onClick: () => void;
}

export function TrainingCaseCard({ trainingCase, onClick }: TrainingCaseCardProps) {
  const score = trainingCase.ai_analysis?.score;

  return (
    <Card
      onClick={onClick}
      className={cn(
        'cursor-pointer border border-border/60 transition-all duration-200',
        'hover:border-primary/40 hover:shadow-md hover:shadow-primary/5',
        'hover:-translate-y-0.5 active:translate-y-0'
      )}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-start justify-between gap-2">
          <Badge
            variant="outline"
            className={cn(
              'text-[11px] font-medium shrink-0',
              categoryColors[trainingCase.category] ?? 'bg-muted text-muted-foreground'
            )}
          >
            {categoryLabels[trainingCase.category] ?? trainingCase.category}
          </Badge>
          <OutcomeIcon outcome={trainingCase.outcome} />
        </div>

        <h3 className="text-[14px] font-semibold leading-snug mt-2 line-clamp-2">
          {trainingCase.title}
        </h3>
      </CardHeader>

      <CardContent className="px-4 pb-4 space-y-3">
        {trainingCase.description && (
          <p className="text-[12px] text-muted-foreground line-clamp-2 leading-relaxed">
            {trainingCase.description}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[11px]">
            {trainingCase.difficulty && (
              <span className={cn('font-medium', difficultyColors[trainingCase.difficulty] ?? 'text-muted-foreground')}>
                {difficultyLabels[trainingCase.difficulty] ?? trainingCase.difficulty}
              </span>
            )}
            {trainingCase.duration_seconds && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(trainingCase.duration_seconds)}
              </span>
            )}
          </div>

          {score !== undefined && (
            <div
              className={cn(
                'text-[13px] font-bold tabular-nums px-2 py-0.5 rounded-md',
                score >= 80 ? 'bg-emerald-500/10 text-emerald-400' :
                score >= 60 ? 'bg-yellow-500/10 text-yellow-400' :
                'bg-red-500/10 text-red-400'
              )}
            >
              {score}pts
            </div>
          )}
        </div>

        {trainingCase.tags && trainingCase.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {trainingCase.tags.slice(0, 3).map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/70 bg-muted/50 px-1.5 py-0.5 rounded"
              >
                <Tag className="h-2.5 w-2.5" />
                {tag}
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
