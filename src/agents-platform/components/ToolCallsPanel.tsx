/**
 * ToolCallsPanel — painel direito do playground com log live de tool calls.
 *
 * Mostra histórico de tools chamadas durante a sessão atual:
 *  - nome, status (running / success / failed), duração
 *  - input (args do LLM) e output (resultado) expansíveis
 *  - cores por status (laranja running, verde success, vermelho failed)
 *
 * Dados vêm do hook useAgent — toolHistory[] populado pelos events SSE
 * tool.start + tool.end.
 */

import { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight, Check, X, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ToolEvent } from '../hooks/useAgent';

interface Props {
  tools: ToolEvent[];
  onClear?: () => void;
}

export function ToolCallsPanel({ tools, onClear }: Props) {
  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Wrench className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-xs font-semibold uppercase tracking-wider">
            Tool Calls
          </h3>
          {tools.length > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {tools.length}
            </span>
          )}
        </div>
        {tools.length > 0 && onClear && (
          <Button
            size="icon" variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            onClick={onClear}
            title="Limpar histórico (local — não apaga do banco)"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {tools.length === 0 ? (
          <EmptyState />
        ) : (
          tools.map((t) => <ToolCallCard key={t.id} tool={t} />)
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 text-center">
      <Wrench className="h-8 w-8 text-muted-foreground/30 mb-2" />
      <p className="text-xs text-muted-foreground">
        Nenhuma tool chamada ainda.
      </p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">
        Quando o agente usar uma ferramenta, aparece aqui em tempo real.
      </p>
    </div>
  );
}

function ToolCallCard({ tool }: { tool: ToolEvent }) {
  const [expanded, setExpanded] = useState(tool.status === 'running');

  const statusColors = {
    running: 'border-primary/40 bg-primary/5',
    success: 'border-emerald-500/40 bg-emerald-500/5',
    failed: 'border-red-500/40 bg-red-500/5',
  } as const;

  const StatusIcon = tool.status === 'running' ? Loader2
    : tool.status === 'success' ? Check
    : X;

  const statusIconClass = tool.status === 'running'
    ? 'text-primary animate-spin'
    : tool.status === 'success' ? 'text-emerald-600'
    : 'text-red-600';

  return (
    <div className={cn('border rounded-lg overflow-hidden', statusColors[tool.status])}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-2.5 py-1.5 flex items-center gap-2 hover:bg-muted/30 transition-colors text-left"
      >
        <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', statusIconClass)} />
        <span className="text-xs font-mono font-medium truncate flex-1">{tool.name}</span>
        {tool.durationMs != null && (
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">
            {tool.durationMs}ms
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-border/40 px-2.5 py-2 space-y-2 bg-background/40">
          {tool.arguments && Object.keys(tool.arguments).length > 0 && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                Input
              </div>
              <pre className="text-[10px] font-mono bg-muted/40 rounded p-1.5 overflow-x-auto max-h-32 text-foreground/80">
                {safeStringify(tool.arguments)}
              </pre>
            </div>
          )}

          {tool.status !== 'running' && (tool.output !== undefined || tool.error) && (
            <div>
              <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                {tool.error ? 'Error' : 'Output'}
              </div>
              <pre className={cn(
                'text-[10px] font-mono rounded p-1.5 overflow-x-auto max-h-40',
                tool.error ? 'bg-red-500/10 text-red-700' : 'bg-muted/40 text-foreground/80',
              )}>
                {tool.error || safeStringify(tool.output)}
              </pre>
            </div>
          )}

          {tool.endedAt && (
            <div className="text-[9px] text-muted-foreground/60 text-right">
              {new Date(tool.endedAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit', minute: '2-digit', second: '2-digit',
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function safeStringify(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}
