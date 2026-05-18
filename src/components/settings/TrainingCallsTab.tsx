import { useState } from 'react';
import { Star, Phone, PhoneIncoming, PhoneOutgoing, Clock, User, Calendar, Play, Search, Filter, NotebookPen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTrainingCalls, CallHistoryRecord } from '@/hooks/useWavoip';
import { CallDetailModal } from '@/components/calls/CallDetailModal';
import { CallRating } from '@/components/calls/CallRating';
import { cn } from '@/lib/utils';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}min${secs > 0 ? ` ${secs}s` : ''}`;
}

export function TrainingCallsTab() {
  const { data: calls = [], isLoading } = useTrainingCalls();
  const [selectedCall, setSelectedCall] = useState<CallHistoryRecord | null>(null);
  const [search, setSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<string>('all');
  const [repFilter, setRepFilter] = useState<string>('all');

  // Get unique reps
  const reps = Array.from(new Set(calls.map(c => c.team_member?.name).filter(Boolean))) as string[];

  // Filter
  const filtered = calls.filter(call => {
    if (ratingFilter !== 'all' && call.rating !== Number(ratingFilter)) return false;
    if (repFilter !== 'all' && call.team_member?.name !== repFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      const matchName = call.peer_name?.toLowerCase().includes(s);
      const matchLead = call.lead?.name?.toLowerCase().includes(s);
      const matchRep = call.team_member?.name?.toLowerCase().includes(s);
      const matchSummary = call.ai_summary?.toLowerCase().includes(s);
      const matchNotes = call.training_notes?.toLowerCase().includes(s);
      if (!matchName && !matchLead && !matchRep && !matchSummary && !matchNotes) return false;
    }
    return true;
  });

  // Group by rating
  const grouped = new Map<number, typeof filtered>();
  filtered.forEach(call => {
    const r = call.rating || 0;
    if (!grouped.has(r)) grouped.set(r, []);
    grouped.get(r)!.push(call);
  });
  const sortedRatings = Array.from(grouped.keys()).sort((a, b) => b - a);

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Carregando chamadas avaliadas...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Treinamento</h3>
          <p className="text-sm text-muted-foreground">Chamadas avaliadas ou com notas de estudo para referencia do time</p>
        </div>
        <Badge variant="outline" className="text-sm">
          {calls.length} chamada{calls.length !== 1 ? 's' : ''} avaliada{calls.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, lead, vendedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={ratingFilter} onValueChange={setRatingFilter}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Estrelas" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="5">5 estrelas</SelectItem>
            <SelectItem value="4">4 estrelas</SelectItem>
            <SelectItem value="3">3 estrelas</SelectItem>
            <SelectItem value="2">2 estrelas</SelectItem>
            <SelectItem value="1">1 estrela</SelectItem>
          </SelectContent>
        </Select>
        {reps.length > 1 && (
          <Select value={repFilter} onValueChange={setRepFilter}>
            <SelectTrigger className="w-[160px] h-9">
              <SelectValue placeholder="Vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {reps.map(rep => (
                <SelectItem key={rep} value={rep}>{rep}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Star className="h-10 w-10 mx-auto mb-3 text-zinc-300" />
          <p className="font-medium">Nenhuma chamada avaliada</p>
          <p className="text-sm mt-1">Avalie chamadas com estrelas no modal pos-chamada ou no historico para que aparecam aqui</p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedRatings.map(rating => (
            <div key={rating}>
              <div className="flex items-center gap-2 mb-2">
                {rating > 0 ? (
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} className={cn('h-4 w-4', s <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-300')} />
                    ))}
                  </div>
                ) : (
                  <span className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                    <NotebookPen className="h-4 w-4 text-amber-500" />
                    Sem avaliação (só notas)
                  </span>
                )}
                <span className="text-sm text-muted-foreground">({grouped.get(rating)!.length})</span>
              </div>
              <div className="grid gap-2">
                {grouped.get(rating)!.map(call => (
                  <Card
                    key={call.id}
                    className="p-3 hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedCall(call)}
                  >
                    <div className="flex items-center gap-3">
                      {/* Direction icon */}
                      <div className={cn(
                        'p-1.5 rounded-full shrink-0',
                        call.direction === 'INCOMING' ? 'bg-blue-100' : 'bg-emerald-100'
                      )}>
                        {call.direction === 'INCOMING'
                          ? <PhoneIncoming className="h-3.5 w-3.5 text-blue-600" />
                          : <PhoneOutgoing className="h-3.5 w-3.5 text-emerald-600" />
                        }
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {call.lead?.name || call.peer_name || call.peer_phone}
                          </span>
                          {call.ai_sentiment && (
                            <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0',
                              call.ai_sentiment === 'positive' ? 'border-green-300 text-green-700 bg-green-50' :
                              call.ai_sentiment === 'negative' ? 'border-red-300 text-red-700 bg-red-50' :
                              'border-zinc-300 text-zinc-600'
                            )}>
                              {call.ai_sentiment === 'positive' ? 'Positivo' : call.ai_sentiment === 'negative' ? 'Negativo' : 'Neutro'}
                            </Badge>
                          )}
                        </div>
                        {call.ai_summary && (
                          <p className="text-xs text-muted-foreground truncate mt-0.5">{call.ai_summary}</p>
                        )}
                        {call.training_notes && (
                          <div className="flex items-center gap-1 mt-0.5">
                            <NotebookPen className="h-3 w-3 text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700 dark:text-amber-400 truncate">{call.training_notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Meta */}
                      <div className="shrink-0 text-right space-y-0.5">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          <span>{call.team_member?.name || '-'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>{formatDuration(call.duration_seconds || 0)}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          {format(new Date(call.started_at), "dd/MM/yy HH:mm")}
                        </div>
                      </div>

                      {/* Rating (inline) */}
                      <div className="shrink-0" onClick={e => e.stopPropagation()}>
                        <CallRating callId={call.id} currentRating={call.rating || undefined} size="sm" showLabel={false} />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedCall && (
        <CallDetailModal
          call={selectedCall}
          open={!!selectedCall}
          onOpenChange={(open) => { if (!open) setSelectedCall(null); }}
        />
      )}
    </div>
  );
}
