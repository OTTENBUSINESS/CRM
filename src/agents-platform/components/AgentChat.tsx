/**
 * AgentChat — UI da PLATAFORMA NOVA (igual ChatGPT/Claude).
 *
 * Backend: useAgent → agent-runner → multi-provider (Anthropic/OpenAI/etc).
 * Layout: sidebar fixa + chat. Mobile: overlay com backdrop.
 *
 * Doc: cs/AGENTS-PLATFORM.md
 */

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAgent, type AgentMessage } from '../hooks/useAgent';
import {
  Loader2, Send, Plus, MessageSquare, Trash2, X,
  Mic, MicOff, Pencil, Check, Menu, ChevronDown, ChevronUp,
  Paperclip, Image as ImageIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { cn } from '@/lib/utils';
import { CarouselViewer, parseCarouselBlock } from '@/components/marketing/CarouselViewer';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface AgentChatProps {
  slug: string;
  channel?: string;
  compact?: boolean;
  fullscreen?: boolean;
  name?: string;
  subtitle?: string;
  suggestions?: string[];
  onClose?: () => void;
  className?: string;
  /** Opcional: passar agent externo (compartilha state com pai — ex: ToolCallsPanel) */
  agentOverride?: ReturnType<typeof useAgent>;
}

export function AgentChat({
  slug,
  channel = 'chat_web',
  fullscreen = false,
  name: nameProp,
  subtitle: subtitleProp,
  suggestions,
  onClose,
  className,
  agentOverride,
}: AgentChatProps) {
  // Se pai passou agent externo, reusa (ex: Playground compartilha com ToolCallsPanel).
  // Senão cria interno com slug+channel.
  const internal = useAgent(slug, channel);
  const agent = agentOverride ?? internal;
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showSidebar, setShowSidebar] = useState(() => {
    if (typeof window !== 'undefined') return window.innerWidth >= 768;
    return true;
  });

  const recognitionRef = useRef<any>(null);
  const [isRecording, setIsRecording] = useState(false);
  const speechBaseRef = useRef<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingAttachments, setPendingAttachments] = useState<Array<{ url: string; type: 'image'; name: string }>>([]);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  useEffect(() => { inputRef.current?.focus(); }, []);

  // FIX scroll: shadcn ScrollArea (Radix) tem viewport interno — scroll precisa
  // ser feito nele, não no children ref.
  useEffect(() => {
    if (!scrollRef.current) return;
    const viewport = scrollRef.current.closest('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    const target = viewport || scrollRef.current;
    // requestAnimationFrame garante que DOM tá pintado antes de medir scrollHeight
    requestAnimationFrame(() => {
      target.scrollTop = target.scrollHeight;
    });
  }, [agent.messages, agent.streaming, agent.pendingTool]);

  if (!agent.config) {
    return (
      <div className="flex items-center justify-center h-full w-full text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Carregando agente...
      </div>
    );
  }

  const displayName = nameProp || agent.config.display_name;
  const displaySubtitle = subtitleProp || agent.config.description || 'Agente IA';
  const emoji = agent.config.emoji || '🤖';
  // Mostrar detalhes técnicos das tools (modo debug). Default false = resumido.
  const showToolDetails = !!(agent.config.settings as { show_tool_details?: boolean } | null)?.show_tool_details;

  const handleSend = (text?: string) => {
    const t = (text ?? input).trim();
    if ((!t && pendingAttachments.length === 0) || agent.streaming) return;
    setInput('');
    const atts = pendingAttachments;
    setPendingAttachments([]);
    agent.send(t, atts);
  };

  const handleFiles = async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/')).slice(0, 4); // max 4 imagens
    if (!arr.length) return;
    if (arr.some((f) => f.size > 10 * 1024 * 1024)) {
      toast({ title: 'Imagem maior que 10MB', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const uploaded: Array<{ url: string; type: 'image'; name: string }> = [];
      for (const file of arr) {
        const ext = file.name.split('.').pop() || 'png';
        const path = `${agent.config?.id || 'anon'}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error } = await supabase.storage.from('agent-uploads').upload(path, file, {
          contentType: file.type,
          upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from('agent-uploads').getPublicUrl(path);
        uploaded.push({ url: data.publicUrl, type: 'image', name: file.name });
      }
      setPendingAttachments((prev) => [...prev, ...uploaded].slice(0, 4));
    } catch (e: any) {
      toast({ title: 'Erro no upload', description: e.message, variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onPickSession = (sessionId: string) => {
    agent.loadSession(sessionId);
    if (typeof window !== 'undefined' && window.innerWidth < 768) setShowSidebar(false);
  };

  const onNew = () => {
    agent.newConversation();
    if (typeof window !== 'undefined' && window.innerWidth < 768) setShowSidebar(false);
  };

  const toggleRecording = () => {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert('Seu navegador não suporta gravação de voz (use Chrome/Edge)');
      return;
    }
    const recognition = new SR();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    speechBaseRef.current = input;
    recognition.onresult = (event: any) => {
      let transcript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript;
      }
      setInput((speechBaseRef.current ? speechBaseRef.current + ' ' : '') + transcript);
    };
    recognition.onerror = () => setIsRecording(false);
    recognition.onend = () => setIsRecording(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
  };

  return (
    <div
      className={cn(
        'relative flex h-full w-full overflow-hidden bg-background',
        !fullscreen && 'rounded-2xl border border-border',
        className
      )}
    >
      {showSidebar && (
        <div
          className="md:hidden absolute inset-0 bg-black/40 z-10"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {showSidebar && (
        <aside className="absolute md:static inset-y-0 left-0 z-20 w-[260px] bg-card border-r border-border flex flex-col shrink-0">
          <div className="px-3 py-3 border-b border-border flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Conversas
            </span>
            <Button
              variant="ghost" size="icon" className="h-7 w-7 md:hidden"
              onClick={() => setShowSidebar(false)} title="Fechar"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="p-2">
            <Button
              onClick={onNew}
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 border-primary/30 text-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/50"
              disabled={agent.streaming}
            >
              <Plus className="h-4 w-4" />
              Nova conversa
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-2 pb-3 space-y-0.5">
              {agent.sessions.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/60 text-center py-8 px-3">
                  Nenhuma conversa ainda. Manda a primeira mensagem.
                </div>
              ) : (
                agent.sessions.map((s) => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    active={agent.activeSessionId === s.id}
                    onClick={() => onPickSession(s.id)}
                    onDelete={() => {
                      if (confirm('Apagar essa conversa?')) agent.deleteSession(s.id);
                    }}
                    onRename={(newTitle) => agent.renameSession(s.id, newTitle)}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </aside>
      )}

      <div className="flex-1 flex flex-col min-w-0 bg-background">
        <header className="flex items-center justify-between border-b border-border px-3 py-2.5 shrink-0 bg-card">
          <div className="flex items-center gap-2 min-w-0">
            {!showSidebar && (
              <Button
                variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                onClick={() => setShowSidebar(true)} title="Mostrar conversas"
              >
                <Menu className="h-4 w-4" />
              </Button>
            )}
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-700 shadow-md text-lg shrink-0">
              {emoji}
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold tracking-tight text-foreground truncate">
                {displayName}
              </h1>
              <p className="text-[10px] text-muted-foreground truncate">{displaySubtitle}</p>
            </div>
          </div>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose} title="Fechar">
              <X className="h-4 w-4" />
            </Button>
          )}
        </header>

        <ScrollArea className="flex-1 min-h-0">
          {/* Alinhado à esquerda com max-w pra texto não esticar (estilo Notion/Linear) */}
          <div ref={scrollRef} className="max-w-3xl px-4 sm:px-6 py-6 space-y-6">
            {agent.loadingThread ? (
              <div className="h-40 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : agent.messages.length === 0 ? (
              <EmptyState emoji={emoji} displayName={displayName} suggestions={suggestions} onPick={handleSend} />
            ) : (
              agent.messages.map((m, idx) => {
                const isLast = idx === agent.messages.length - 1;
                const isEmptyAssistantStreaming =
                  isLast && agent.streaming && m.role === 'assistant' && !m.content;
                // FIX bolha cinza vazia: NÃO renderiza Bubble quando assistant tá vazio +
                // streaming (a bolha "pensando..." abaixo já cobre esse estado).
                if (isEmptyAssistantStreaming) return null;
                return (
                  <Bubble
                    key={m.id}
                    message={m}
                    isStreaming={agent.streaming && isLast}
                    showToolDetails={showToolDetails}
                  />
                );
              })
            )}
            {agent.streaming &&
              agent.messages[agent.messages.length - 1]?.role === 'assistant' &&
              !agent.messages[agent.messages.length - 1].content && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-2.5 flex items-center gap-2 text-muted-foreground text-[13px]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {displayName} pensando…
                  </div>
                </div>
              )}
            {agent.pendingTool && (
              <div className="flex justify-start">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl rounded-bl-sm px-4 py-2 flex items-center gap-2 text-amber-700 dark:text-amber-400 text-[12px] font-medium">
                  ⚙️ chamando <code className="font-mono">{agent.pendingTool}</code>...
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {agent.error && (
          <div className="border-t border-red-500/30 bg-red-500/10 px-4 py-2 text-[12px] text-red-700 dark:text-red-300">
            {agent.error}
          </div>
        )}

        <div className="border-t border-border p-3 bg-card shrink-0">
          {/* Preview de imagens anexadas (antes do form) */}
          {pendingAttachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {pendingAttachments.map((a, idx) => (
                <div key={idx} className="relative group">
                  <img
                    src={a.url} alt={a.name}
                    className="h-16 w-16 rounded-lg object-cover border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setPendingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-foreground text-background flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Remover"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {uploading && (
                <div className="h-16 w-16 rounded-lg border border-dashed border-border flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          )}

          {/* Input file hidden */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) handleFiles(e.target.files);
              e.target.value = '';
            }}
          />

          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files);
              if (files.length) {
                e.preventDefault();
                handleFiles(files);
              }
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
            }}
            className="relative flex items-end rounded-2xl border-2 bg-background transition-colors focus-within:border-primary/50 focus-within:shadow-sm"
          >
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder={`Manda mensagem pro ${displayName}…`}
              disabled={!agent.userId}
              rows={1}
              className={cn(
                'resize-none border-0 bg-transparent',
                'min-h-[24px] max-h-[180px] py-3 px-4 pr-36',
                'text-sm leading-relaxed',
                'focus-visible:ring-0 focus-visible:ring-offset-0',
                'placeholder:text-muted-foreground/60'
              )}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1.5">
              {agent.streaming && (
                <Button
                  type="button" size="icon" variant="ghost"
                  onClick={agent.stop}
                  className="h-8 w-8 rounded-lg bg-muted hover:bg-muted/80"
                  title="Parar geração"
                >
                  <span className="block h-3 w-3 rounded-sm bg-foreground" />
                </Button>
              )}
              <Button
                type="button" size="icon" variant="ghost"
                onClick={() => fileInputRef.current?.click()}
                disabled={agent.streaming || uploading || pendingAttachments.length >= 4}
                className="h-8 w-8 rounded-lg bg-muted hover:bg-muted/80 text-muted-foreground"
                title="Anexar imagem"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                type="button" size="icon" variant="ghost"
                onClick={toggleRecording}
                disabled={agent.streaming && !isRecording}
                className={cn(
                  'h-8 w-8 rounded-lg shrink-0 transition-all',
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse'
                    : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                )}
                title={isRecording ? 'Parar gravação' : 'Gravar áudio'}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button
                type="submit" size="icon"
                disabled={(!input.trim() && pendingAttachments.length === 0) || agent.streaming || !agent.userId}
                className={cn(
                  'h-8 w-8 rounded-lg shrink-0 transition-all',
                  input.trim() && !agent.streaming
                    ? 'bg-primary hover:opacity-90 text-white'
                    : 'bg-muted text-muted-foreground hover:bg-muted'
                )}
                title="Enviar"
              >
                {agent.streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </form>
          <p className="text-[10px] text-muted-foreground/60 text-center mt-1.5 px-2">
            {isRecording
              ? '🔴 gravando — fala que vai aparecendo no input'
              : agent.streaming
                ? `${displayName} processando…`
                : (
                  <>
                    <span className="hidden md:inline">Enter envia · Shift+Enter quebra linha</span>
                    <span className="md:hidden">Toca no botão pra enviar</span>
                  </>
                )
            }
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────── Sub-componentes ───────────

function SessionRow({
  session, active, onClick, onDelete, onRename,
}: {
  session: { id: string; title: string | null; created_at: string };
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title || '');

  let label = session.title?.slice(0, 50) || '';
  if (!session.title) {
    try {
      label = formatDistanceToNow(new Date(session.created_at), { addSuffix: true, locale: ptBR });
    } catch { label = session.id.slice(0, 20); }
  }

  if (renaming) {
    return (
      <div className="flex items-center gap-1 px-2 py-1.5">
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && renameValue.trim()) {
              onRename(renameValue.trim());
              setRenaming(false);
            } else if (e.key === 'Escape') setRenaming(false);
          }}
          className="flex-1 bg-background border border-border rounded-md px-2 py-1 text-[12px] focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={() => { if (renameValue.trim()) { onRename(renameValue.trim()); setRenaming(false); } }}
          className="text-emerald-600 hover:text-emerald-700"
        >
          <Check className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group rounded-lg px-2.5 py-2 text-[13px] cursor-pointer transition-colors flex items-start gap-2',
        active ? 'bg-primary/10 text-foreground'
               : 'hover:bg-muted/60 text-muted-foreground hover:text-foreground'
      )}
      onClick={onClick}
    >
      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
      <div className="flex-1 min-w-0">
        <div className="truncate leading-tight">{label}</div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => { e.stopPropagation(); setRenaming(true); }}
          className="text-muted-foreground hover:text-foreground"
          title="Renomear"
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="text-muted-foreground hover:text-red-500"
          title="Apagar"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function EmptyState({
  emoji, displayName, suggestions, onPick,
}: {
  emoji: string;
  displayName: string;
  suggestions?: string[];
  onPick: (text: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center px-4">
      <div className="text-5xl mb-3">{emoji}</div>
      <h2 className="text-base font-semibold text-foreground mb-1">{displayName}</h2>
      <p className="text-[13px] text-muted-foreground mb-6">Manda algo pra começar.</p>
      {suggestions && suggestions.length > 0 && (
        <div className="grid gap-2 w-full max-w-md">
          {suggestions.slice(0, 4).map((s, i) => (
            <button
              key={i}
              onClick={() => onPick(s)}
              className="text-left text-[13px] px-3 py-2 rounded-lg border border-border bg-card hover:bg-muted/60 hover:border-primary/40 transition-colors text-muted-foreground hover:text-foreground"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Quebra o conteúdo em segmentos de texto e blocos ```carousel — o carrossel é
 *  renderizado FORA do markdown (não dentro de <pre>/<code>, que quebrava o layout). */
function splitCarouselSegments(content: string): Array<{ type: 'text' | 'carousel'; value: string }> {
  const segments: Array<{ type: 'text' | 'carousel'; value: string }> = [];
  const re = /```carousel\s*\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: content.slice(last, m.index) });
    segments.push({ type: 'carousel', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) segments.push({ type: 'text', value: content.slice(last) });
  return segments.length ? segments : [{ type: 'text', value: content }];
}

/** Componentes de markdown reusados nas mensagens do assistente. */
const MD_COMPONENTS = {
  code: ({ className, children, ...props }: any) => {
    const isBlock = !!className && /language-/.test(className);
    if (isBlock) {
      return <code className="font-mono text-[13px] text-foreground bg-transparent p-0">{children}</code>;
    }
    return <code className={className} {...props}>{children}</code>;
  },
  // <pre> legível: fundo claro do tema + alto contraste (carrossel é tratado fora daqui)
  pre: ({ children }: any) => (
    <pre className="bg-muted text-foreground border border-border rounded-lg p-3 my-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
      {children}
    </pre>
  ),
  a: ({ children, href }: any) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary dark:text-primary hover:underline">
      {children}
    </a>
  ),
} as const;

function Bubble({ message, isStreaming, showToolDetails = false }: { message: AgentMessage; isStreaming: boolean; showToolDetails?: boolean }) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  // Tool live (inline durante streaming) — card violeta centralizado tipo WhatsApp
  if (isTool && message.toolName) {
    return <InlineToolCard message={message} showDetails={showToolDetails} />;
  }

  // Tool result do histórico (sem toolName — vem do banco) — bolha discreta amarela
  if (isTool) {
    return (
      <div className="flex justify-start">
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg px-3 py-1.5 text-[11px] text-amber-700 dark:text-amber-400 font-mono max-w-[80%] truncate">
          ⚙️ {message.content.slice(0, 200)}{message.content.length > 200 ? '…' : ''}
        </div>
      </div>
    );
  }

  // FIX UI (estilo ChatGPT/Claude.ai):
  // - User: bubble laranja, max-w 70%
  // - Assistant: SEM bubble, texto puro respirando, max-w-2xl pra leitura confortável
  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'overflow-hidden break-words',
          isUser
            // User: bubble compacta à direita
            ? 'rounded-2xl rounded-br-sm bg-primary text-white shadow-sm px-4 py-2.5 text-sm leading-relaxed max-w-[70%]'
            // Assistant: texto puro, sem bg, sem border — espaço pra respirar
            : 'text-foreground py-1 max-w-2xl w-full'
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div
            className={cn(
              // Tipografia mais aberta (estilo ChatGPT/Claude)
              'prose prose-sm dark:prose-invert max-w-none break-words text-[14.5px] leading-[1.7]',
              // Parágrafos com mais respiro
              'prose-p:my-3 prose-p:leading-[1.7]',
              // Headings com mais peso e separação
              'prose-headings:font-semibold prose-headings:tracking-tight',
              'prose-h1:text-lg prose-h1:mt-6 prose-h1:mb-3',
              'prose-h2:text-base prose-h2:mt-5 prose-h2:mb-2.5',
              'prose-h3:text-[15px] prose-h3:mt-4 prose-h3:mb-2',
              // Listas com mais respiro
              'prose-ul:my-3 prose-ol:my-3 prose-li:my-1 prose-li:leading-[1.6]',
              // Blockquote estilizado
              'prose-blockquote:my-3 prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-muted-foreground',
              // Divisores com mais ar
              'prose-hr:my-5 prose-hr:border-border/40',
              // Strong em destaque sutil
              'prose-strong:text-foreground prose-strong:font-semibold',
              // Links laranjas (não underline default)
              'prose-a:text-primary dark:prose-a:text-primary prose-a:no-underline hover:prose-a:underline',
              // Code inline com bg sutil
              'prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[12px] prose-code:before:content-none prose-code:after:content-none prose-code:font-medium',
              // Tabelas legíveis
              'prose-table:my-4 prose-thead:border-b prose-thead:border-border prose-th:text-left prose-th:font-semibold prose-th:py-2 prose-td:py-2 prose-td:px-3',
            )}
          >
            {splitCarouselSegments(message.content).map((seg, i) => {
              if (seg.type === 'carousel') {
                const data = parseCarouselBlock(seg.value.trim());
                return data ? <CarouselViewer key={i} data={data} /> : null;
              }
              if (!seg.value.trim()) return null;
              return (
                <ReactMarkdown key={i} remarkPlugins={[remarkGfm, remarkBreaks]} components={MD_COMPONENTS}>
                  {seg.value}
                </ReactMarkdown>
              );
            })}
            {isStreaming && (
              <span className="inline-block w-1 h-3.5 ml-0.5 bg-current animate-pulse align-middle" />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// InlineToolCard — aparece NO chat no momento exato que tool é chamada.
// Visual inspirado no `ai_tool_call` do WhatsApp inbox (card violeta centralizado).
// Estados: running (laranja + spinner) → success (verde) | failed (vermelho).
// ────────────────────────────────────────────────────────────────────────
/** Nome técnico da tool → rótulo humano pro modo resumido. */
function friendlyToolName(name: string): string {
  const map: Record<string, string> = {
    meta_api: 'Meta Ads',
    execute_sql: 'banco de dados',
    list_tables: 'estrutura do banco',
    describe_table: 'estrutura do banco',
    current_time_br: 'data e hora',
    salvar_nota: 'memória', ler_nota: 'memória', listar_notas: 'memória', buscar_nota: 'memória',
    borapostar_gerar_carrossel: 'BoraPostar', borapostar_status: 'BoraPostar',
    borapostar_publicar: 'BoraPostar', borapostar_re_render: 'BoraPostar',
    buffer_publicar: 'Buffer', gemini_gerar_imagem: 'gerador de imagem',
    scrape_youtube_transcript: 'YouTube', scrape_instagram_reel_transcript: 'Instagram',
    uazapi_whatsapp_text: 'WhatsApp', notify_human: 'aviso ao time', agendar_lembrete: 'lembrete',
    qualify_lead: 'qualificação', change_stage: 'pipeline', schedule_meeting: 'agenda',
    my_deals: 'seus deals', hot_leads: 'leads quentes', pipeline_summary: 'pipeline',
  };
  return map[name] || name.replace(/_/g, ' ');
}

function InlineToolCard({ message, showDetails = false }: { message: AgentMessage; showDetails?: boolean }) {
  // Default: resumido (não expande, sem JSON). Debug ON: expande com input/output.
  const [expanded, setExpanded] = useState(showDetails);
  const status = message.toolStatus || 'running';
  const isRunning = status === 'running';
  const isOk = status === 'success';
  const isErr = status === 'failed';

  const tone = isRunning
    ? 'bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/50'
    : isOk
    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40'
    : 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40';

  const txt = isRunning
    ? 'text-violet-700 dark:text-violet-300'
    : isOk
    ? 'text-emerald-700 dark:text-emerald-300'
    : 'text-red-700 dark:text-red-300';

  const StatusIcon = isRunning ? Loader2 : isOk ? Check : X;
  const iconCls = isRunning
    ? 'text-violet-500 animate-spin'
    : isOk
    ? 'text-emerald-500'
    : 'text-red-500';

  const verb = isRunning ? 'chamando' : isOk ? 'executou' : 'falhou em';

  // ─── MODO RESUMIDO (default) — uma linha limpa, sem JSON, sem expandir ───
  if (!showDetails) {
    const resumoTxt = isRunning
      ? `consultando ${friendlyToolName(message.toolName!)}…`
      : isOk
      ? `consultou ${friendlyToolName(message.toolName!)}`
      : `falha ao consultar ${friendlyToolName(message.toolName!)}`;
    return (
      <div className="flex justify-center my-1 px-1">
        <div className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px]', tone, txt)}>
          <StatusIcon className={cn('h-3 w-3 shrink-0', iconCls)} />
          <span className="font-medium">{resumoTxt}</span>
        </div>
      </div>
    );
  }

  // ─── MODO DEBUG (toggle ligado) — card completo com input/output ───
  return (
    <div className="flex justify-center my-1 px-1">
      <div className={cn('w-full max-w-full rounded-lg border text-xs overflow-hidden', tone)}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02] transition-colors text-left"
        >
          <StatusIcon className={cn('h-3.5 w-3.5 shrink-0', iconCls)} />
          <span className={cn('font-medium', txt)}>
            🔧 {verb} <code className="font-mono">{message.toolName}</code>
          </span>
          {message.toolDurationMs != null && (
            <span className={cn('text-[10px] text-muted-foreground font-mono', !message.toolDurationMs && 'ml-auto')}>
              {message.toolDurationMs}ms
            </span>
          )}
          <span className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground">
            {expanded ? 'recolher' : 'detalhes'}
            {expanded
              ? <ChevronUp className="h-3 w-3" />
              : <ChevronDown className="h-3 w-3" />}
          </span>
        </button>

        {expanded && (
          <div className="border-t border-black/5 dark:border-white/5 px-3 py-2 space-y-2 bg-background/40">
            {message.toolArguments && Object.keys(message.toolArguments).length > 0 && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">Input</div>
                <pre className="text-[10px] font-mono bg-muted/40 rounded p-1.5 overflow-x-auto max-h-32">
                  {JSON.stringify(message.toolArguments, null, 2)}
                </pre>
              </div>
            )}
            {!isRunning && (message.content || message.toolError) && (
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                  {isErr ? 'Error' : 'Output'}
                </div>
                <pre className={cn(
                  'text-[10px] font-mono rounded p-1.5 overflow-x-auto max-h-40',
                  isErr ? 'bg-red-500/10 text-red-700' : 'bg-muted/40',
                )}>
                  {message.toolError || message.content}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
