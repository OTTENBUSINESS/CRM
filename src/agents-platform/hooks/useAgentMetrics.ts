/**
 * useAgentMetrics — métricas de uso do agente (tokens, custo, latência).
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AgentMetricsDaily {
  date: string;
  calls: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cached_tokens: number;
  total_cost_brl: number;
  avg_latency_ms: number;
  p95_latency_ms: number | null;
  error_count: number;
}

export function useAgentMetrics(agentId: string | undefined, days = 7) {
  return useQuery({
    queryKey: ['agent-metrics', agentId, days],
    queryFn: async (): Promise<AgentMetricsDaily[]> => {
      if (!agentId) return [];
      const since = new Date(Date.now() - days * 86400_000).toISOString();
      const { data, error } = await supabase
        .from('agents_logs')
        .select('created_at, input_tokens, output_tokens, cached_tokens, cost_brl, latency_ms, status_code, error')
        .eq('agent_id', agentId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);
      if (error || !data) return [];

      // Agrega por dia
      const byDay = new Map<string, AgentMetricsDaily>();
      for (const log of data) {
        const day = (log.created_at as string).slice(0, 10);
        let d = byDay.get(day);
        if (!d) {
          d = {
            date: day, calls: 0, total_input_tokens: 0, total_output_tokens: 0,
            total_cached_tokens: 0, total_cost_brl: 0, avg_latency_ms: 0,
            p95_latency_ms: null, error_count: 0,
          };
          byDay.set(day, d);
        }
        d.calls++;
        d.total_input_tokens += log.input_tokens || 0;
        d.total_output_tokens += log.output_tokens || 0;
        d.total_cached_tokens += log.cached_tokens || 0;
        d.total_cost_brl += Number(log.cost_brl || 0);
        d.avg_latency_ms = d.avg_latency_ms + (log.latency_ms || 0);
        if ((log.status_code && log.status_code >= 400) || log.error) d.error_count++;
      }
      return [...byDay.values()]
        .map((d) => ({ ...d, avg_latency_ms: Math.round(d.avg_latency_ms / d.calls) }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: !!agentId,
    staleTime: 60_000,
  });
}
