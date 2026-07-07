/**
 * AgentPlaygroundPage — testar agente antes de publicar.
 * Rota: /agentes/:slug/playground
 */

import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronLeft, Sparkles, Settings, MessageSquare } from 'lucide-react';
import { AgentChat } from '../components/AgentChat';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useAgent } from '../hooks/useAgent';
import { AgentAvatar } from '../components/AgentAvatar';

export default function AgentPlaygroundPage() {
  const { slug } = useParams<{ slug: string }>();
  const { config, loading } = useAgentConfig(slug!);

  // Hook compartilhado com AgentChat
  const agent = useAgent(slug || '', 'chat_web');

  if (loading || !config) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-64px)] flex flex-col">
        {/* Header */}
        <div className="px-6 py-3 border-b border-border bg-card flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/agentes" className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <AgentAvatar name={config.display_name} color={config.avatar_color} emoji={config.emoji} size="md" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold truncate">{config.display_name}</h1>
                <Badge variant="outline" className="text-[10px] gap-1 bg-amber-500/10 text-amber-700 border-amber-500/30">
                  <Sparkles className="h-2.5 w-2.5" />
                  Playground
                </Badge>
                <Badge variant="outline" className="text-[10px] font-mono">v{config.version}</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground">Teste antes de publicar</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to={`/agentes/${slug}`}>
                <MessageSquare className="h-4 w-4 mr-1.5" />
                Chat real
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/agentes/${slug}/config`}>
                <Settings className="h-4 w-4 mr-1.5" />
                Configurar
              </Link>
            </Button>
          </div>
        </div>

        {/* Chat (tools aparecem inline nas mensagens) */}
        <div className="flex-1 min-h-0 p-4">
          <AgentChat
            slug={slug!}
            channel="chat_web"
            agentOverride={agent}
          />
        </div>
      </div>
    </AppLayout>
  );
}
