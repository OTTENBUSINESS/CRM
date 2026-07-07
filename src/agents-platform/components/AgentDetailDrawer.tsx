/**
 * AgentDetailDrawer — drawer lateral ao clicar num nó do organograma.
 * Mostra prompt + tools + canais + ações (chat, editar, playground).
 */

import { Link } from 'react-router-dom';
import { X, MessageSquare, Settings, FlaskConical, Bot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgentTools } from '../hooks/useAgentTools';
import { AgentAvatar } from './AgentAvatar';
import { type AgentConfig, effectiveProvider } from '../hooks/useAgentConfig';
import { cn } from '@/lib/utils';

export function AgentDetailDrawer({ agent, onClose }: { agent: AgentConfig; onClose: () => void }) {
  const { tools, loading } = useAgentTools(agent.id);

  const enabledTools = tools.filter((t) => t.usage_mode !== 'disabled');
  const approvalTools = tools.filter((t) => t.usage_mode === 'with_approval');

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 w-[min(480px,100vw)] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border">
          <div className="flex items-start gap-3 min-w-0">
            <AgentAvatar
              name={agent.display_name}
              color={agent.avatar_color}
              emoji={agent.emoji}
              size="lg"
            />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{agent.display_name}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <Badge variant="outline" className={cn(
                  'gap-1 text-xs',
                  agent.is_active ? 'border-emerald-500/30 text-emerald-600' : 'text-muted-foreground',
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', agent.is_active ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                  {agent.is_active ? 'Ativo' : 'Pausado'}
                </Badge>
                <Badge variant="outline" className="text-xs font-mono">v{agent.version}</Badge>
                <Badge variant="outline" className="text-xs uppercase tracking-wider">{agent.tier}</Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2">{agent.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Body — scroll */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Modelo */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Modelo</h3>
            <div className="bg-muted/40 rounded-lg p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span className="font-mono">{effectiveProvider(agent)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono text-xs">{agent.model}</span>
              </div>
              {agent.settings?.temperature !== undefined && (
                <div className="flex justify-between mt-1">
                  <span className="text-muted-foreground">Temperature</span>
                  <span className="font-mono">{agent.settings.temperature}</span>
                </div>
              )}
            </div>
          </section>

          {/* System Prompt (preview) */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">System Prompt</h3>
            <pre className="bg-muted/40 rounded-lg p-3 text-xs whitespace-pre-wrap font-mono max-h-48 overflow-y-auto">
              {agent.system_prompt.slice(0, 800)}
              {agent.system_prompt.length > 800 && '...'}
            </pre>
          </section>

          {/* Tools */}
          <section>
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Tools <span className="text-foreground/60">({enabledTools.length} ativas {approvalTools.length > 0 && `· ${approvalTools.length} c/ aprovação`})</span>
            </h3>
            {loading ? (
              <p className="text-xs text-muted-foreground">Carregando...</p>
            ) : tools.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma tool cadastrada</p>
            ) : (
              <div className="space-y-1.5">
                {tools.map((t) => (
                  <div key={t.id} className="flex items-center justify-between text-sm py-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full shrink-0',
                          t.usage_mode === 'always' && 'bg-emerald-500',
                          t.usage_mode === 'with_approval' && 'bg-amber-500',
                          t.usage_mode === 'disabled' && 'bg-muted-foreground',
                        )}
                      />
                      <span className="truncate">{t.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">{t.action_type}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer — ações */}
        <div className="p-4 border-t border-border bg-card space-y-2">
          <Button asChild className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
            <Link to={`/agentes/${agent.slug}`}>
              <MessageSquare className="h-4 w-4 mr-2" />
              Conversar
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/agentes/${agent.slug}/playground`}>
                <FlaskConical className="h-4 w-4 mr-1.5" />
                Playground
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/agentes/${agent.slug}/config`}>
                <Settings className="h-4 w-4 mr-1.5" />
                Configurar
              </Link>
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
