import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CheckCircle2, XCircle, Clock, BarChart2, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrainingCase } from '@/hooks/useSalesTraining';

const categoryLabels: Record<string, string> = {
  sdr_call: 'SDR Call',
  closer_call: 'Closer Call',
  meeting: 'Reunião',
  objection_handling: 'Objeção',
  closing: 'Fechamento',
  discovery: 'Discovery',
};

const difficultyLabels: Record<string, string> = {
  easy: 'Fácil',
  medium: 'Médio',
  hard: 'Difícil',
};

function formatDuration(seconds?: number) {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}min ${s}s`;
}

interface TrainingCaseDetailProps {
  trainingCase: TrainingCase | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TrainingCaseDetail({
  trainingCase,
  open,
  onOpenChange,
}: TrainingCaseDetailProps) {
  if (!trainingCase) return null;

  const analysis = trainingCase.ai_analysis;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant="outline" className="text-[11px]">
              {categoryLabels[trainingCase.category] ?? trainingCase.category}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                'text-[11px]',
                trainingCase.difficulty === 'hard'
                  ? 'border-red-500/30 text-red-400'
                  : trainingCase.difficulty === 'easy'
                  ? 'border-emerald-500/30 text-emerald-400'
                  : 'border-yellow-500/30 text-yellow-400'
              )}
            >
              {difficultyLabels[trainingCase.difficulty] ?? trainingCase.difficulty}
            </Badge>
            {trainingCase.duration_seconds && (
              <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(trainingCase.duration_seconds)}
              </span>
            )}
          </div>
          <DialogTitle className="text-lg leading-snug">{trainingCase.title}</DialogTitle>
          {trainingCase.description && (
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {trainingCase.description}
            </p>
          )}
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-auto">
          <div className="px-6 pb-6 space-y-5">

            {/* Analise de IA */}
            {analysis && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Análise de IA</h3>
                    <div
                      className={cn(
                        'ml-auto text-lg font-bold tabular-nums px-3 py-1 rounded-lg',
                        analysis.score >= 80
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : analysis.score >= 60
                          ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-red-500/10 text-red-400'
                      )}
                    >
                      {analysis.score}pts
                    </div>
                  </div>

                  {analysis.result && (
                    <p className="text-sm text-muted-foreground leading-relaxed bg-muted/40 rounded-lg p-3">
                      {analysis.result}
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {analysis.strong_points?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-1.5">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Pontos Fortes
                        </h4>
                        <ul className="space-y-1.5">
                          {analysis.strong_points.map((point, i) => (
                            <li
                              key={i}
                              className="text-sm text-muted-foreground flex items-start gap-2"
                            >
                              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {analysis.improvement?.length > 0 && (
                      <div className="space-y-2">
                        <h4 className="text-xs font-semibold text-orange-400 uppercase tracking-wide flex items-center gap-1.5">
                          <XCircle className="h-3.5 w-3.5" />
                          A Melhorar
                        </h4>
                        <ul className="space-y-1.5">
                          {analysis.improvement.map((point, i) => (
                            <li
                              key={i}
                              className="text-sm text-muted-foreground flex items-start gap-2"
                            >
                              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-orange-400 shrink-0" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Transcricao */}
            {trainingCase.transcript && (
              <>
                <Separator />
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold">Transcrição</h3>
                  <div className="bg-muted/30 rounded-lg p-4 text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap font-mono text-[12px]">
                    {trainingCase.transcript}
                  </div>
                </div>
              </>
            )}

            {/* Tags */}
            {trainingCase.tags && trainingCase.tags.length > 0 && (
              <>
                <Separator />
                <div className="flex flex-wrap gap-1.5 items-center">
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {trainingCase.tags.map(tag => (
                    <Badge key={tag} variant="secondary" className="text-[11px]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </>
            )}

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
