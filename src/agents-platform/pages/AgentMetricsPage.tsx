/**
 * AgentMetricsPage — dashboard de uso do agente.
 * Rota: /agentes/:slug/metricas
 */

import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, TrendingUp, Coins, Zap, AlertCircle } from 'lucide-react';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useAgentMetrics } from '../hooks/useAgentMetrics';
import { AgentAvatar } from '../components/AgentAvatar';

export default function AgentMetricsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { config, loading: cfgLoading } = useAgentConfig(slug!);
  const { data: metrics = [], isLoading } = useAgentMetrics(config?.id, 30);

  if (cfgLoading || !config) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const totals = metrics.reduce(
    (acc, m) => ({
      calls: acc.calls + m.calls,
      input: acc.input + m.total_input_tokens,
      output: acc.output + m.total_output_tokens,
      cached: acc.cached + m.total_cached_tokens,
      cost: acc.cost + m.total_cost_brl,
      errors: acc.errors + m.error_count,
    }),
    { calls: 0, input: 0, output: 0, cached: 0, cost: 0, errors: 0 },
  );

  const avgLat = metrics.length
    ? Math.round(metrics.reduce((a, m) => a + m.avg_latency_ms, 0) / metrics.length)
    : 0;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link to={`/agentes/${slug}/config`} className="text-muted-foreground hover:text-foreground">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <AgentAvatar name={config.display_name} color={config.avatar_color} emoji={config.emoji} size="md" />
          <div>
            <h1 className="text-lg font-semibold">{config.display_name} — Métricas</h1>
            <p className="text-xs text-muted-foreground">Últimos 30 dias · {totals.calls} chamadas</p>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KPICard
            label="Chamadas (30d)"
            value={totals.calls.toLocaleString('pt-BR')}
            icon={TrendingUp}
            color="emerald"
          />
          <KPICard
            label="Custo total"
            value={`R$ ${totals.cost.toFixed(2)}`}
            icon={Coins}
            color="amber"
          />
          <KPICard
            label="Latência média"
            value={`${avgLat}ms`}
            icon={Zap}
            color="blue"
          />
          <KPICard
            label="Erros"
            value={totals.errors.toString()}
            icon={AlertCircle}
            color={totals.errors > 0 ? 'red' : 'gray'}
          />
        </div>

        {/* Tokens */}
        <div className="grid sm:grid-cols-3 gap-3 mb-6">
          <MiniStat label="Input tokens" value={totals.input.toLocaleString('pt-BR')} />
          <MiniStat label="Output tokens" value={totals.output.toLocaleString('pt-BR')} />
          <MiniStat
            label="Cached (economizado)"
            value={totals.cached.toLocaleString('pt-BR')}
            highlight={totals.cached > 0 ? 'emerald' : undefined}
          />
        </div>

        {/* Daily breakdown */}
        <div className="border border-border rounded-xl bg-card overflow-hidden">
          <div className="px-4 py-3 border-b border-border bg-muted/30">
            <h2 className="text-sm font-medium">Por dia (últimos {metrics.length})</h2>
          </div>
          {isLoading ? (
            <div className="p-8 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : metrics.length === 0 ? (
            <p className="p-8 text-center text-sm text-muted-foreground">Sem dados ainda</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Data</th>
                    <th className="text-right px-4 py-2 font-medium">Chamadas</th>
                    <th className="text-right px-4 py-2 font-medium">Tokens in/out</th>
                    <th className="text-right px-4 py-2 font-medium">Cached</th>
                    <th className="text-right px-4 py-2 font-medium">Custo</th>
                    <th className="text-right px-4 py-2 font-medium">Latência</th>
                    <th className="text-right px-4 py-2 font-medium">Erros</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.slice().reverse().map((m) => (
                    <tr key={m.date} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="px-4 py-2 text-xs font-mono">{m.date.slice(5)}</td>
                      <td className="text-right px-4 py-2">{m.calls}</td>
                      <td className="text-right px-4 py-2 text-xs">
                        {m.total_input_tokens.toLocaleString('pt-BR')} / {m.total_output_tokens.toLocaleString('pt-BR')}
                      </td>
                      <td className="text-right px-4 py-2 text-xs text-emerald-600">
                        {m.total_cached_tokens.toLocaleString('pt-BR')}
                      </td>
                      <td className="text-right px-4 py-2 font-mono">R$ {m.total_cost_brl.toFixed(2)}</td>
                      <td className="text-right px-4 py-2 text-xs">{m.avg_latency_ms}ms</td>
                      <td className="text-right px-4 py-2">
                        {m.error_count > 0 ? (
                          <span className="text-red-600 font-medium">{m.error_count}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    amber: 'text-amber-600 bg-amber-500/10 border-amber-500/20',
    blue: 'text-blue-600 bg-blue-500/10 border-blue-500/20',
    red: 'text-red-600 bg-red-500/10 border-red-500/20',
    gray: 'text-muted-foreground bg-muted border-border',
  };
  return (
    <div className="p-4 border border-border rounded-xl bg-card">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <div className={`h-7 w-7 rounded-lg flex items-center justify-center border ${colorMap[color]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}

function MiniStat({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="px-4 py-3 border border-border rounded-lg bg-card">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={`text-sm font-mono mt-0.5 ${highlight === 'emerald' ? 'text-emerald-600' : ''}`}>
        {value}
      </p>
    </div>
  );
}
