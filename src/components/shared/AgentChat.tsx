import { useState, useRef, useEffect, memo, useCallback } from 'react';
import { useAgentChat, ChatMessage, ChatSession } from '@/hooks/useAgentChat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Send,
  Plus,
  MessageSquare,
  Trash2,
  PanelLeftClose,
  PanelLeft,
  Bot,
  User,
  Loader2,
  Mic,
  MicOff,
} from 'lucide-react';

interface AgentChatProps {
  agentSlug: string;
  title?: string;
  description?: string;
  initialMessage?: string;
  icon?: React.ReactNode;
  showSidebar?: boolean;
  showToolResults?: boolean;
  enableStreaming?: boolean;
  className?: string;
}

export function AgentChat({
  agentSlug,
  title = 'Assistente',
  description = 'IA especializada',
  initialMessage,
  icon,
  showSidebar = true,
  showToolResults = false,
  enableStreaming = false,
  className,
}: AgentChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [sidebarVisible, setSidebarVisible] = useState(showSidebar);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSelectDoneRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  const {
    sessions,
    activeSessionId,
    messages,
    isTyping,
    isStreaming,
    streamingText,
    setActiveSession,
    createNewSession,
    sendMessage,
    deleteSession,
  } = useAgentChat({
    agentSlug,
    enableStreaming,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping, streamingText]);

  useEffect(() => {
    if (activeSessionId) {
      inputRef.current?.focus();
    }
  }, [activeSessionId]);

  useEffect(() => {
    if (autoSelectDoneRef.current) return;
    if (!activeSessionId && sessions.length > 0) {
      autoSelectDoneRef.current = true;
      setActiveSession(sessions[0].id);
    }
  }, [activeSessionId, sessions, setActiveSession]);

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isTyping) return;
    const message = inputValue;
    setInputValue('');
    await sendMessage(message);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleNewChat = async () => {
    await createNewSession();
  };

  const handleSessionClick = async (session: ChatSession) => {
    await setActiveSession(session.id);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await deleteSession(sessionId);
  };

  const startListening = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Seu navegador não suporta reconhecimento de voz. Use Chrome ou Edge.');
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript) setInputValue(prev => prev + finalTranscript);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  };

  const toggleListening = () => {
    if (isListening) stopListening();
    else startListening();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === today.toDateString()) {
      return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Ontem';
    }
    return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

  const formatTime = useCallback((dateString: string) => {
    return new Date(dateString).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }, []);

  return (
    <div className={cn('flex h-full bg-background rounded-lg border', className)}>
      {sidebarVisible && (
        <div className="w-72 border-r flex flex-col bg-muted/30">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">Conversas</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleNewChat}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <ScrollArea className="flex-1">
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <div
                  key={session.id}
                  className={cn(
                    'p-3 cursor-pointer transition-colors border-b hover:bg-muted/50 group',
                    activeSessionId === session.id && 'bg-muted'
                  )}
                  onClick={() => handleSessionClick(session)}
                >
                  <div className="flex items-start gap-2">
                    <MessageSquare className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{session.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(session.updated_at)}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteSession(e, session.id)}
                    >
                      <Trash2 className="h-3 w-3 text-muted-foreground" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 text-center text-muted-foreground text-sm">
                <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p>Nenhuma conversa</p>
                <Button variant="outline" size="sm" className="mt-2" onClick={handleNewChat}>
                  <Plus className="h-3 w-3 mr-1" />
                  Nova conversa
                </Button>
              </div>
            )}
          </ScrollArea>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="p-3 border-b flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSidebarVisible(!sidebarVisible)}>
            {sidebarVisible ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </Button>
          <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-primary-foreground">
                {icon || <Bot className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-sm">{title}</p>
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-xs text-muted-foreground">{description}</span>
              </div>
            </div>
          </div>
        </div>

        {activeSessionId ? (
          <>
            <ScrollArea className="flex-1 overflow-auto">
              <div className="space-y-4 max-w-3xl mx-auto p-4">
                {messages.length === 0 && initialMessage && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {icon || <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-5 py-4 max-w-[85%]">
                      <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{initialMessage}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <MessageBubble
                    key={message.id}
                    message={message}
                    icon={icon}
                    showToolResults={showToolResults}
                    formatTime={formatTime}
                  />
                ))}

                {isStreaming && streamingText && (
                  <div className="flex gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {icon || <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-4 py-3 max-w-[85%]">
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                )}

                {isTyping && (!isStreaming || (isStreaming && !streamingText)) && (
                  <div className="flex gap-3 animate-in fade-in duration-300">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {icon || <Bot className="h-4 w-4" />}
                      </AvatarFallback>
                    </Avatar>
                    <div className="bg-muted rounded-lg px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="h-2 w-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        <span className="text-xs text-muted-foreground ml-2">
                          {isStreaming ? 'Conectando...' : 'Processando...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t bg-background">
              <div className="flex gap-2 max-w-3xl mx-auto items-end">
                <Button
                  onClick={toggleListening}
                  disabled={isTyping}
                  variant={isListening ? "destructive" : "outline"}
                  size="icon"
                  className={`h-[52px] w-[52px] shrink-0 transition-all ${isListening ? 'animate-pulse' : ''}`}
                  title={isListening ? "Parar gravação" : "Falar por voz"}
                >
                  {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>

                <Textarea
                  ref={inputRef}
                  placeholder={isListening ? "Ouvindo..." : isTyping ? "Aguarde a resposta..." : "Digite ou fale sua mensagem..."}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
                  }}
                  onKeyDown={handleKeyPress}
                  disabled={isTyping}
                  className={`flex-1 min-h-[52px] max-h-[200px] resize-none py-3 px-4 text-sm transition-opacity ${isTyping ? 'opacity-50' : ''} ${isListening ? 'border-red-500 ring-2 ring-red-500/20' : ''}`}
                  rows={1}
                />
                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim() || isTyping}
                  size="icon"
                  className="h-[52px] w-[52px] shrink-0"
                >
                  {isTyping ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
                </Button>
              </div>
              {isListening && (
                <p className="text-xs text-red-500 text-center mt-2 animate-pulse">
                  Gravando... Clique no microfone para parar
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground p-8">
            <div className="bg-muted/50 rounded-full p-4 mb-4">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
            <h3 className="text-lg font-semibold mb-1">Carregando...</h3>
            <p className="text-sm text-center mb-4 max-w-md">Preparando o chat</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface MessageBubbleProps {
  message: ChatMessage;
  icon?: React.ReactNode;
  showToolResults?: boolean;
  formatTime: (date: string) => string;
}

const MessageBubble = memo(function MessageBubble({ message, icon, showToolResults, formatTime }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8 shrink-0">
        <AvatarFallback className={cn(isUser ? 'bg-secondary' : 'bg-primary text-primary-foreground')}>
          {isUser ? <User className="h-4 w-4" /> : icon || <Bot className="h-4 w-4" />}
        </AvatarFallback>
      </Avatar>

      <div className={cn('rounded-lg px-4 py-3 max-w-[85%]', isUser ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children, ...props }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" {...props}>{children}</a>
                ),
                p: ({ children }) => <p className="text-sm leading-relaxed my-3">{children}</p>,
                ul: ({ children }) => <ul className="list-disc pl-5 space-y-2 my-3">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 space-y-2 my-3">{children}</ol>,
                li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
                h1: ({ children }) => <h1 className="text-lg font-bold border-b pb-2 mb-4 mt-6">{children}</h1>,
                h2: ({ children }) => <h2 className="text-base font-semibold mt-6 mb-3">{children}</h2>,
                h3: ({ children }) => <h3 className="text-sm font-semibold mt-4 mb-2">{children}</h3>,
                blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/50 pl-4 italic text-muted-foreground my-4">{children}</blockquote>,
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">{children}</code>
                  ) : (
                    <code className="block bg-muted p-3 rounded text-xs font-mono overflow-x-auto my-3">{children}</code>
                  );
                },
                table: ({ children }) => (
                  <div className="overflow-x-auto my-4 rounded border">
                    <table className="min-w-full text-sm">{children}</table>
                  </div>
                ),
                th: ({ children }) => <th className="bg-muted px-3 py-2 text-left font-semibold border-b">{children}</th>,
                td: ({ children }) => <td className="px-3 py-2 border-b">{children}</td>,
                hr: () => <hr className="my-6 border-border" />,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {showToolResults && message.metadata?.tool_results && message.metadata.tool_results.length > 0 && (
          <div className="mt-2 pt-2 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-1">
              {message.metadata.tool_results.length} ferramenta(s) usada(s)
            </p>
            <div className="flex flex-wrap gap-1">
              {message.metadata.tool_results.map((tool, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">{tool.tool}</Badge>
              ))}
            </div>
          </div>
        )}

        <p className={cn('text-[10px] mt-1', isUser ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {formatTime(message.timestamp)}
        </p>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  return prevProps.message.id === nextProps.message.id && prevProps.message.content === nextProps.message.content;
});

export default AgentChat;
