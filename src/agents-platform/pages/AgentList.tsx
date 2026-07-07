/**
 * AgentList — lista de agentes (cards grid) + toggle pra organograma.
 * Rota: /agentes
 */

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Bot, MessageSquare, Settings, FlaskConical, List, Network, Plus, KeyRound, Package } from 'lucide-react';
import { useAgentsList, effectiveProvider } from '../hooks/useAgentConfig';
import { AgentAvatar } from '../components/AgentAvatar';
import { NewAgentDialog } from '../components/NewAgentDialog';
import { V2RouterToggle } from '../components/V2RouterToggle';
import { cn } from '@/lib/utils';

export default function AgentList() {
  const { data: allAgents = [], isLoading } = useAgentsList();
  const [newOpen, setNewOpen] = useState(false);

  // Lista só agentes REAIS — templates (moldes) ficam escondidos, só aparecem no "+ Novo agente".
  const agents = allAgents.filter((a) => !(a as { is_template?: boolean }).is_template);

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 border border-primary/20">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Agentes IA</h1>
              <p className="text-sm text-muted-foreground">{agents.length} {agents.length === 1 ? 'agente' : 'agentes'}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Toggle view */}
            <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
              <Button variant="ghost" size="sm" className="h-7 px-3 bg-background shadow-sm">
                <span className="gap-1.5 text-xs flex items-center font-medium">
                  <List className="h-3.5 w-3.5 text-primary" /> Lista
                </span>
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-7 px-3 hover:bg-background">
                <Link to="/agentes/organograma" className="gap-1.5 text-xs">
                  <Network className="h-3.5 w-3.5" /> Organograma
                </Link>
              </Button>
            </div>

            <Button asChild variant="outline" size="sm">
              <Link to="/agentes/habilidades" className="gap-1.5">
                <Package className="h-3.5 w-3.5" />
                Habilidades
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to="/agentes/credenciais" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                Conexões
              </Link>
            </Button>
            <Button
              size="sm" onClick={() => setNewOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Novo agente
            </Button>
          </div>
        </div>

        {/* Toggle do Roteador V2 (WhatsApp) — afeta produção */}
        <V2RouterToggle />

        {/* Lista */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Bot className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nenhum agente cadastrado.</p>
          </div>
        ) : (
          <>
          {newOpen && <NewAgentDialog onClose={() => setNewOpen(false)} />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {agents.map((a) => (
              <div
                key={a.id}
                className="group rounded-2xl border border-border bg-card p-5 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-3 mb-3">
                  <AgentAvatar
                    name={a.display_name}
                    color={a.avatar_color}
                    emoji={a.emoji}
                    size="lg"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h3 className="font-semibold text-foreground truncate">{a.display_name}</h3>
                      <Badge variant="outline" className={cn(
                        'text-[10px] h-4 gap-1 px-1.5',
                        a.is_active ? 'border-emerald-500/30 text-emerald-600' : 'text-muted-foreground',
                      )}>
                        <span className={cn('h-1 w-1 rounded-full', a.is_active ? 'bg-emerald-500' : 'bg-muted-foreground')} />
                        {a.is_active ? 'Ativo' : 'Pausado'}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground font-mono">v{a.version}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.description}</p>
                    <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground/70">
                      <span className="px-1.5 py-0.5 rounded bg-muted">{effectiveProvider(a)}</span>
                      <span className="font-mono truncate">{a.model}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 mt-3 pt-3 border-t border-border/40">
                  <Button asChild size="sm" className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90 h-8">
                    <Link to={`/agentes/${a.slug}`}>
                      <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
                      Conversar
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Playground">
                    <Link to={`/agentes/${a.slug}/playground`}>
                      <FlaskConical className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="icon" className="h-8 w-8" title="Configurar">
                    <Link to={`/agentes/${a.slug}/config`}>
                      <Settings className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
          </>
        )}
        {newOpen && agents.length === 0 && <NewAgentDialog onClose={() => setNewOpen(false)} />}
      </div>
    </AppLayout>
  );
}
