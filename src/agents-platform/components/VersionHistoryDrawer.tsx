/**
 * VersionHistoryDrawer — histórico de versões + rollback.
 */

import { X, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgentVersions, type AgentVersion } from '../hooks/useAgentVersions';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

export function VersionHistoryDrawer({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const { versions, loading, rollbackTo } = useAgentVersions(agentId);

  const onRollback = (v: AgentVersion) => {
    if (!confirm(`Reverter pra v${v.version_number}? Vai criar nova versão com esse conteúdo.`)) return;
    rollbackTo(v.id);
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[min(520px,100vw)] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        <div className="p-5 border-b border-border flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold">Histórico de versões</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Reverter pra qualquer versão. Histórico mantém audit completo.
            </p>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          ) : versions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">Nenhuma versão ainda.</div>
          ) : (
            versions.map((v) => (
              <div
                key={v.id}
                className={cn(
                  'p-4 border rounded-xl bg-card',
                  v.is_published ? 'border-primary/30 bg-primary/5' : 'border-border',
                )}
              >
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-semibold">v{v.version_number}</span>
                    {v.is_published && (
                      <Badge variant="outline" className="h-5 text-[10px] border-primary/30 text-primary">
                        ● Publicada
                      </Badge>
                    )}
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(v.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </div>
                {v.change_summary && (
                  <p className="text-xs text-muted-foreground mb-3">{v.change_summary}</p>
                )}
                <details className="text-[11px] text-muted-foreground/80">
                  <summary className="cursor-pointer hover:text-foreground">Ver prompt</summary>
                  <pre className="mt-2 p-2 bg-muted/40 rounded text-[10px] font-mono whitespace-pre-wrap max-h-40 overflow-y-auto">
                    {v.system_prompt.slice(0, 1000)}
                    {v.system_prompt.length > 1000 && '...'}
                  </pre>
                </details>
                {!v.is_published && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3 h-7 text-xs"
                    onClick={() => onRollback(v)}
                  >
                    <RotateCcw className="h-3 w-3 mr-1.5" />
                    Reverter pra essa versão
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </aside>
    </>
  );
}
