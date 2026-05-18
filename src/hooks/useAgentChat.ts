import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';

// Cast para any para evitar erros de tipo com tabelas chat_* que não estão nos types gerados
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

// Types
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    tool_results?: Array<{
      tool: string;
      input: unknown;
      result: unknown;
    }>;
  };
}

export interface ChatSession {
  id: string;
  config_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface UseAgentChatOptions {
  agentSlug: string;
  enableStreaming?: boolean;
  onError?: (error: Error) => void;
}

interface UseAgentChatReturn {
  sessions: ChatSession[];
  activeSessionId: string | null;
  messages: ChatMessage[];
  isLoading: boolean;
  isTyping: boolean;
  isStreaming: boolean;
  streamingText: string;
  configId: string | null;
  loadSessions: () => Promise<void>;
  loadMessages: (sessionId: string) => Promise<void>;
  setActiveSession: (sessionId: string) => Promise<void>;
  createNewSession: () => Promise<void>;
  sendMessage: (content: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

export function useAgentChat({
  agentSlug,
  enableStreaming = false,
  onError,
}: UseAgentChatOptions): UseAgentChatReturn {
  const { toast } = useToast();

  const [configId, setConfigId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');

  const inFlightRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const { data, error } = await db
        .from('chat_configs')
        .select('id')
        .eq('slug', agentSlug)
        .single();

      if (error) throw error;
      setConfigId(data.id);
      return data.id;
    } catch (error) {
      console.error('[useAgentChat] Erro ao carregar config:', error);
      onError?.(error as Error);
      return null;
    }
  }, [agentSlug, onError]);

  const loadSessions = useCallback(async () => {
    if (!configId) return;

    try {
      const { data, error } = await db
        .from('chat_sessions')
        .select('id, config_id, title, created_at, updated_at')
        .eq('config_id', configId)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error('[useAgentChat] Erro ao carregar sessões:', error);
      onError?.(error as Error);
    }
  }, [configId, onError]);

  const loadMessages = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await db
        .from('chat_messages')
        .select('id, role, content, metadata, created_at')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(500);

      if (error) throw error;

      const mapped: ChatMessage[] = (data || []).map((m: any) => ({
        id: m.id,
        role: m.role as 'user' | 'assistant' | 'system',
        content: extractDisplayText(m.content),
        timestamp: m.created_at,
        metadata: m.metadata as ChatMessage['metadata'],
      }));

      setMessages(mapped);
    } catch (error) {
      console.error('[useAgentChat] Erro ao carregar mensagens:', error);
      onError?.(error as Error);
    } finally {
      setIsLoading(false);
    }
  }, [onError]);

  const extractDisplayText = (raw: unknown): string => {
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s || s.toLowerCase() === 'continue') return '';
      return s;
    }

    if (Array.isArray(raw)) {
      const text = raw
        .filter((b: { type?: string; text?: string }) => b.type === 'text' && b.text)
        .map((b: { text: string }) => b.text)
        .join('');
      return text.trim();
    }

    return '';
  };

  const setActiveSession = useCallback(async (sessionId: string) => {
    setActiveSessionId(sessionId);
    await loadMessages(sessionId);
  }, [loadMessages]);

  const createNewSession = useCallback(async () => {
    if (!configId) return;

    try {
      const { data: newSession, error } = await db
        .from('chat_sessions')
        .insert({
          config_id: configId,
          title: 'Nova conversa',
        })
        .select()
        .single();

      if (error) throw error;

      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      setMessages([]);
    } catch (error) {
      console.error('[useAgentChat] Erro ao criar sessão:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar nova conversa',
        variant: 'destructive',
      });
      onError?.(error as Error);
    }
  }, [configId, toast, onError]);

  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const { error } = await db
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;

      setSessions((prev) => prev.filter((s) => s.id !== sessionId));

      if (activeSessionId === sessionId) {
        setActiveSessionId(null);
        setMessages([]);
      }

      toast({
        title: 'Conversa excluída',
        description: 'A conversa foi removida com sucesso',
      });
    } catch (error) {
      console.error('[useAgentChat] Erro ao deletar sessão:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível excluir a conversa',
        variant: 'destructive',
      });
      onError?.(error as Error);
    }
  }, [activeSessionId, toast, onError]);

  const sendMessage = useCallback(async (content: string) => {
    if (!activeSessionId || !content.trim() || inFlightRef.current) return;

    inFlightRef.current = true;
    const userMessage = content.trim();

    const persistAssistant = (text: string) => {
      if (!text.trim()) return;
      db.from('chat_messages')
        .insert({ session_id: activeSessionId, role: 'assistant', content: text })
        .then(({ error }: any) => {
          if (error) console.error('[useAgentChat] Erro ao persistir msg assistant:', error);
        });
    };

    const tempUserMsg: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    // Persist user message to DB
    db.from('chat_messages')
      .insert({ session_id: activeSessionId, role: 'user', content: userMessage })
      .then(({ error }: any) => {
        if (error) console.error('[useAgentChat] Erro ao persistir msg user:', error);
      });

    if (messages.length === 0) {
      await db
        .from('chat_sessions')
        .update({ title: userMessage.slice(0, 60) })
        .eq('id', activeSessionId);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeSessionId ? { ...s, title: userMessage.slice(0, 60) } : s
        )
      );
    }

    setIsTyping(true);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const userToken = authSession?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      if (enableStreaming) {
        setIsStreaming(true);
        setStreamingText('');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-manager?stream=1`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${userToken}`,
            },
            body: JSON.stringify({
              message: userMessage,
              session_id: activeSessionId,
              agent: agentSlug,
            }),
          }
        );

        if (!response.ok) throw new Error('Erro ao conectar com streaming');

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let toolCount = 0;
        let buffer = '';
        let finalized = false;

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const jsonStr = line.slice(6).trim();
                  if (!jsonStr) continue;

                  const data = JSON.parse(jsonStr);

                  if (data.type === 'text' || data.type === 'response.output_text.delta') {
                    const deltaText = data.text || data.delta || '';
                    fullText += deltaText;
                    setStreamingText(fullText);
                  } else if (data.type === 'response.output_text.done') {
                    if (data.text && data.text.length > fullText.length) {
                      fullText = data.text;
                      setStreamingText(fullText);
                    }
                  } else if (data.type === 'tools_end') {
                    toolCount = data.count;
                  } else if (data.type === 'done') {
                    finalized = true;
                    const assistantMsg: ChatMessage = {
                      id: `assistant-${Date.now()}`,
                      role: 'assistant',
                      content: fullText,
                      timestamp: new Date().toISOString(),
                      metadata: toolCount > 0 ? { tool_results: [] } : undefined,
                    };
                    setMessages((prev) => [...prev, assistantMsg]);
                    setStreamingText('');
                    persistAssistant(fullText);
                  } else if (data.type === 'error') {
                    throw new Error(data.error);
                  }
                } catch {
                  // Ignore parse errors for incomplete lines
                }
              }
            }
          }

          if (buffer.startsWith('data: ')) {
            try {
              const data = JSON.parse(buffer.slice(6).trim());
              if (data.type === 'text' || data.type === 'response.output_text.delta') {
                fullText += data.text || data.delta || '';
                setStreamingText(fullText);
              }
            } catch {
              // Ignore
            }
          }

          if (fullText && !finalized) {
            const assistantMsg: ChatMessage = {
              id: `assistant-${Date.now()}`,
              role: 'assistant',
              content: fullText,
              timestamp: new Date().toISOString(),
              metadata: toolCount > 0 ? { tool_results: [] } : undefined,
            };
            setMessages((prev) => [...prev, assistantMsg]);
            setStreamingText('');
            persistAssistant(fullText);
          }
        }

        setIsStreaming(false);
      } else {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat-manager`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              'Authorization': `Bearer ${userToken}`,
            },
            body: JSON.stringify({
              message: userMessage,
              session_id: activeSessionId,
              agent: agentSlug,
            }),
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Erro ao enviar mensagem');
        }

        const data = await response.json();

        const assistantMsg: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: data.response,
          timestamp: new Date().toISOString(),
          metadata: data.tools ? { tool_results: data.tools } : undefined,
        };
        setMessages((prev) => [...prev, assistantMsg]);
        persistAssistant(data.response);
      }
    } catch (error) {
      console.error('[useAgentChat] Erro:', error);
      toast({
        title: 'Erro',
        description: (error as Error).message || 'Não foi possível enviar a mensagem',
        variant: 'destructive',
      });
      onError?.(error as Error);
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMsg.id));
    } finally {
      setIsTyping(false);
      setIsStreaming(false);
      inFlightRef.current = false;
    }
  }, [activeSessionId, agentSlug, messages.length, toast, onError, enableStreaming]);

  const initRef = useRef(false);

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      const { data: configData, error: configError } = await db
        .from('chat_configs')
        .select('id')
        .eq('slug', agentSlug)
        .single();

      if (configError || !configData) return;

      const configIdValue = configData.id;
      setConfigId(configIdValue);

      const { data: sessionsData, error: sessionsError } = await db
        .from('chat_sessions')
        .select('id, config_id, title, created_at, updated_at')
        .eq('config_id', configIdValue)
        .order('updated_at', { ascending: false })
        .limit(50);

      if (!sessionsError && sessionsData) {
        setSessions(sessionsData as ChatSession[]);
      }
    };

    init();
  }, [agentSlug]);

  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return {
    sessions,
    activeSessionId,
    messages,
    isLoading,
    isTyping,
    isStreaming,
    streamingText,
    configId,
    loadSessions,
    loadMessages,
    setActiveSession,
    createNewSession,
    sendMessage,
    deleteSession,
  };
}
