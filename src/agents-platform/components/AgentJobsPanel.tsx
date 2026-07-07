/**
 * AgentJobsPanel — mostra jobs assíncronos do agente (durable execution).
 *
 * Estados: processing (laranja spinner) → done (verde) | failed/timeout (vermelho).
 * Atualiza em realtime (poll 5s). Aparece na aba Geral do agente.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Clock, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface AgentJob {
  id: string;
  tool_name: string;
  status: 'processing' | 'done' | 'failed' | 'timeout';
  external_id: string | null;
  error: string | null;
  attempts: number;
  created_at: string;
  completed_at: string | null;
}

export function AgentJobsPanel({ agentId }: { agentId: string }) {
  const { data: jobs = [] } = useQuery({
    queryKey: ['agent-jobs', agentId],
    queryFn: async (): Promise<AgentJob[]> => {
      const { data } = await supabase
        .from('agent_jobs')
        .select('id, tool_name, status, external_id, error, attempts, created_at, completed_at')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data as AgentJob[]) || [];
    },
    enabled: !!agentId,
    refetchInterval: 5000,  // realtime-ish
    staleTime: 3000,
  });

  if (jobs.length === 0) return null;

  const processing = jobs.filter((j) => j.status === 'processing');

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Tarefas assíncronas</h3>
        {processing.length > 0 && (
          <Badge variant="outline" className="h-5 text-[10px] border-primary/40 text-primary gap-1">
            <Loader2 className="h-2.5 w-2.5 animate-spin" /> {processing.length} processando
          </Badge>
        )}
      </div>

      <div className="space-y-1.5">
        {jobs.map((j) => {
          const Icon = j.status === 'processing' ? Loader2
            : j.status === 'done' ? CheckCircle2
            : j.status === 'timeout' ? Clock
            : XCircle;
          const color = j.status === 'processing' ? 'text-primary'
            : j.status === 'done' ? 'text-emerald-500'
            : 'text-red-500';
          const elapsed = j.completed_at
            ? Math.round((new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()) / 1000)
            : Math.round((Date.now() - new Date(j.created_at).getTime()) / 1000);

          return (
            <div key={j.id} className="flex items-center gap-2 p-2 rounded-lg border border-border/50 bg-background text-xs">
              <Icon className={cn('h-3.5 w-3.5 shrink-0', color, j.status === 'processing' && 'animate-spin')} />
              <span className="font-mono font-medium">{j.tool_name}</span>
              <span className="text-muted-foreground">
                {j.status === 'processing' ? `processando ${elapsed}s...`
                  : j.status === 'done' ? `concluído em ${elapsed}s`
                  : j.status === 'timeout' ? 'timeout'
                  : `falhou: ${(j.error || '').slice(0, 40)}`}
              </span>
              {j.attempts > 0 && j.status === 'processing' && (
                <span className="text-[10px] text-muted-foreground/60 ml-auto">{j.attempts} checagens</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
