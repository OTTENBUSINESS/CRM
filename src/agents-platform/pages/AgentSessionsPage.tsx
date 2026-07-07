/**
 * AgentSessionsPage — auditoria de conversas do agente.
 * Rota: /agentes/:slug/sessoes
 */

import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, ChevronLeft, MessageSquare, Send, MessageCircle, Layers,
  Sidebar, Instagram, Mail, Clock, Globe, ChevronRight, X, User, Bot, Wrench,
} from 'lucide-react';
import { useAgentConfig } from '../hooks/useAgentConfig';
import { useAgentSessions, useSessionMessages, type AgentSession } from '../hooks/useAgentSessions';
import { AgentAvatar } from '../components/AgentAvatar';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const CHANNEL_ICONS: Record<string, any> = {
  chat_web: Globe,
  floating: MessageCircle,
  whatsapp: Send,
  sidebar: Sidebar,
  inbox: Layers,
  telegram: Send,
  instagram: Instagram,
  email: Mail,
  cron: Clock,
  playground: MessageSquare,
};

const CHANNEL_LABELS: Record<string, string> = {
  chat_web: 'Chat web',
  floating: 'Flutuante',
  whatsapp: 'WhatsApp',
  sidebar: 'Sidebar',
  inbox: 'Inbox',
  telegram: 'Telegram',
  instagram: 'Instagram',
  email: 'Email',
  cron: 'Cron',
  playground: 'Playground',
};

export default function AgentSessionsPage() {
  const { slug } = useParams<{ slug: string }>();
  const { config, loading: cfgLoading } = useAgentConfig(slug!);
  const [channelFilter, setChannelFilter] = useState<string>('all');
  const [selectedSession, setSelectedSession] = useState<AgentSession | null>(null);

  const { data: sessions = [], isLoading } = useAgentSessions(config?.id, { channel: channelFilter });

  if (cfgLoading || !config) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  // Channels disponíveis (presentes nas sessões)
  const availableChannels = [...new Set(sessions.map((s) => s.channel))];

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to={`/agentes/${slug}/config`} className="text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-5 w-5" />
            </Link>
            <AgentAvatar name={config.display_name} color={config.avatar_color} emoji={config.emoji} size="md" />
            <div>
              <h1 className="text-lg font-semibold">{config.display_name} — Sessões</h1>
              <p className="text-xs text-muted-foreground">
                {sessions.length} sessões · auditar conversas
              </p>
            </div>
          </div>

          {/* Filter por canal */}
          {availableChannels.length > 0 && (
            <div className="flex items-center gap-1 p-0.5 bg-muted rounded-lg">
              <button
                onClick={() => setChannelFilter('all')}
                className={cn(
                  'h-7 px-3 text-xs rounded-md transition-colors',
                  channelFilter === 'all' ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Todos
              </button>
              {availableChannels.map((c) => {
                const Icon = CHANNEL_ICONS[c] || Globe;
                return (
                  <button
                    key={c}
                    onClick={() => setChannelFilter(c)}
                    className={cn(
                      'h-7 px-3 text-xs rounded-md transition-colors flex items-center gap-1.5',
                      channelFilter === c ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {CHANNEL_LABELS[c] || c}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Lista de sessões */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground border border-dashed border-border rounded-xl">
            <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma sessão ainda</p>
          </div>
        ) : (
          <div className="border border-border rounded-xl bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">Sessão</th>
                  <th className="text-left px-4 py-2.5 font-medium w-32">Canal</th>
                  <th className="text-right px-4 py-2.5 font-medium w-24">Msgs</th>
                  <th className="text-right px-4 py-2.5 font-medium w-28">Tokens</th>
                  <th className="text-right px-4 py-2.5 font-medium w-24">Custo</th>
                  <th className="text-left px-4 py-2.5 font-medium w-36">Última atividade</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const Icon = CHANNEL_ICONS[s.channel] || Globe;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedSession(s)}
                      className="border-b border-border/40 hover:bg-muted/20 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground truncate max-w-md">
                          {s.title || `Sessão ${s.id.slice(0, 8)}`}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">
                          {format(new Date(s.created_at), 'dd/MM HH:mm')}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <Icon className="h-3 w-3" />
                          {CHANNEL_LABELS[s.channel] || s.channel}
                        </Badge>
                      </td>
                      <td className="text-right px-4 py-3 tabular-nums">{s.msg_count}</td>
                      <td className="text-right px-4 py-3 text-xs tabular-nums text-muted-foreground">
                        {s.total_tokens.toLocaleString('pt-BR')}
                      </td>
                      <td className="text-right px-4 py-3 text-xs tabular-nums font-mono">
                        R$ {s.total_cost_brl.toFixed(4)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {s.last_msg_at
                          ? formatDistanceToNow(new Date(s.last_msg_at), { addSuffix: true, locale: ptBR })
                          : '—'}
                      </td>
                      <td className="px-2 py-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selectedSession && (
          <SessionDrawer session={selectedSession} onClose={() => setSelectedSession(null)} />
        )}
      </div>
    </AppLayout>
  );
}

// ─────────── Drawer com mensagens da sessão ───────────
function SessionDrawer({ session, onClose }: { session: AgentSession; onClose: () => void }) {
  const { data: messages = [], isLoading } = useSessionMessages(session.id);

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <aside className="fixed right-0 top-0 bottom-0 w-[min(720px,100vw)] bg-background border-l border-border z-50 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-border bg-card">
          <div className="min-w-0">
            <h2 className="text-base font-semibold truncate">{session.title || 'Sessão sem título'}</h2>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">{CHANNEL_LABELS[session.channel] || session.channel}</Badge>
              <span>·</span>
              <span>{messages.length} mensagens</span>
              <span>·</span>
              <span>R$ {session.total_cost_brl.toFixed(4)}</span>
              <span>·</span>
              <span>{format(new Date(session.created_at), "dd/MM/yyyy 'às' HH:mm")}</span>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
          ) : messages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">Sem mensagens</p>
          ) : (
            messages.map((m) => <MessageRow key={m.id} message={m} />)
          )}
        </div>
      </aside>
    </>
  );
}

function MessageRow({ message }: { message: any }) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';
  const isTool = message.role === 'tool';

  const RoleIcon = isUser ? User : isAssistant ? Bot : Wrench;
  const roleColor = isUser ? 'text-blue-500 bg-blue-500/10'
    : isAssistant ? 'text-primary bg-primary/10'
    : 'text-amber-600 bg-amber-500/10';

  let parsedTool: any = null;
  if (isTool) {
    try { parsedTool = JSON.parse(message.content); } catch { /* */ }
  }

  return (
    <div className="flex gap-3 group">
      <div className={cn('h-7 w-7 rounded-lg flex items-center justify-center shrink-0', roleColor)}>
        <RoleIcon className="h-3.5 w-3.5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold capitalize">{message.role}</span>
          <span className="text-[10px] text-muted-foreground font-mono">
            {format(new Date(message.created_at), 'HH:mm:ss')}
          </span>
          {message.token_count && (
            <span className="text-[10px] text-muted-foreground">· {message.token_count} tokens</span>
          )}
          {message.cost_brl && Number(message.cost_brl) !== 0 && (
            <span className="text-[10px] text-muted-foreground">· R$ {Number(message.cost_brl).toFixed(4)}</span>
          )}
        </div>

        {/* Conteúdo */}
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        ) : isAssistant ? (
          <div className="text-sm prose prose-sm dark:prose-invert max-w-none break-words">
            {message.content ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            ) : message.tool_calls?.length ? (
              <span className="italic text-muted-foreground text-xs">(só tool calls, sem texto)</span>
            ) : null}
            {message.tool_calls?.length > 0 && (
              <div className="mt-2 space-y-1">
                {message.tool_calls.map((tc: any, i: number) => (
                  <details key={i} className="rounded-md border border-amber-500/20 bg-amber-500/5 text-xs">
                    <summary className="cursor-pointer p-2 font-mono font-medium text-amber-700 dark:text-amber-400">
                      ⚙️ {tc.name}({Object.keys(tc.arguments || {}).join(', ')})
                    </summary>
                    <pre className="p-2 border-t border-amber-500/20 text-[10px] overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(tc.arguments, null, 2)}
                    </pre>
                  </details>
                ))}
              </div>
            )}
          </div>
        ) : isTool ? (
          <details className="text-xs">
            <summary className="cursor-pointer font-mono text-amber-700 dark:text-amber-400">
              tool_result {message.tool_call_id ? `(${message.tool_call_id.slice(0, 12)}…)` : ''}
            </summary>
            <pre className="mt-1 p-2 bg-muted/40 rounded-md text-[10px] overflow-x-auto whitespace-pre-wrap max-h-60 overflow-y-auto">
              {parsedTool ? JSON.stringify(parsedTool, null, 2) : message.content}
            </pre>
          </details>
        ) : (
          <p className="text-xs text-muted-foreground italic">{message.content}</p>
        )}
      </div>
    </div>
  );
}
