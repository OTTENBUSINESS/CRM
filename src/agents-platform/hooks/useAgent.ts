/**
 * useAgent — hook da PLATAFORMA NOVA de agentes.
 *
 * Backend: edge function `agent-runner` (orquestrador genérico).
 * Tabelas: agents_registry + agents_sessions + agents_messages + agents_logs.
 *
 * Diferenças vs versão antiga (src/hooks/useAgent.ts):
 *  - URL: /functions/v1/agent-runner (não agent-proxy)
 *  - Payload: { agent_slug, channel, session_id, message, user_id }
 *  - Parser SSE: text.delta | tool.start | tool.end | done
 *  - Tabelas: agents_* (não chat_*)
 *  - Suporta tool_calls visíveis no chat
 *
 * Doc: cs/AGENTS-PLATFORM.md
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const EDGE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agent-runner`;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export interface AgentConfig {
  id: string;
  slug: string;
  display_name: string;
  description: string | null;
  emoji: string | null;
  provider: string;
  model: string;
  endpoint_url: string | null;
  settings?: Record<string, any> | null;
}

export interface AgentSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
  tool_call_id?: string;
  /** Live tool call (inline no chat — só playground/streaming) */
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolStatus?: 'running' | 'success' | 'failed';
  toolDurationMs?: number;
  toolError?: string;
  toolStartedAt?: number;
}

export interface ToolEvent {
  id: string;                           // gerado client-side
  name: string;
  arguments?: Record<string, unknown>;  // input da tool
  output?: unknown;                     // resultado (preenchido no tool.end)
  error?: string;
  status: 'running' | 'success' | 'failed';
  startedAt: number;                    // Date.now()
  endedAt?: number;
  durationMs?: number;
}

function newId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Mensagens vindas do BANCO (agents_messages) não têm toolName/toolStatus —
 * esses campos só são populados via SSE durante streaming live.
 *
 * Pra histórico renderizar com card bonito (igual streaming), reconstruímos
 * toolName + toolArguments cruzando `tool_call_id` (na msg role='tool')
 * com `tool_calls` da msg role='assistant' anterior.
 */
function hydrateLoadedMessages(rows: any[]): AgentMessage[] {
  const result: AgentMessage[] = [];
  for (const m of rows) {
    if (!['user', 'assistant', 'tool'].includes(m.role)) continue;

    const msg: AgentMessage = {
      id: m.id,
      role: m.role,
      content: m.content || '',
      tool_calls: m.tool_calls || undefined,
      tool_call_id: m.tool_call_id || undefined,
    };

    // Hydrate tool message com nome/args/status pra renderizar InlineToolCard
    if (m.role === 'tool' && m.tool_call_id) {
      // Acha assistant anterior que disparou esta tool
      for (let j = result.length - 1; j >= 0; j--) {
        const prev = result[j];
        if (prev.role === 'assistant' && Array.isArray(prev.tool_calls)) {
          const tc = prev.tool_calls.find((t: any) => t.id === m.tool_call_id);
          if (tc) {
            msg.toolName = tc.name;
            msg.toolArguments = tc.arguments;
            // Detecta error pelo content JSON
            let isErr = false;
            try {
              const parsed = JSON.parse(m.content || '{}');
              if (parsed && typeof parsed === 'object' && 'error' in parsed) isErr = true;
            } catch {/* não é JSON — assume sucesso */}
            msg.toolStatus = isErr ? 'failed' : 'success';
            if (isErr) {
              try {
                const parsed = JSON.parse(m.content || '{}');
                msg.toolError = String(parsed.error || m.content);
              } catch {/* */}
            }
            break;
          }
        }
      }
    }

    result.push(msg);
  }
  return result;
}

export function useAgent(slug: string, channel: string = 'chat_web') {
  const { teamMember, loading: authLoading } = useAuth();
  const userId = teamMember?.id;
  const qc = useQueryClient();

  // 1. Config do agente (cache infinity — nova tabela agents_registry)
  const { data: config = null } = useQuery({
    queryKey: ['agents-platform-config', slug],
    queryFn: async (): Promise<AgentConfig | null> => {
      // Removido filtro is_active=true — templates (is_active=false) também precisam abrir
      // no playground/chat pra que aluno possa testar antes de clonar.
      const { data } = await supabase
        .from('agents_registry')
        .select('id, slug, display_name, description, emoji, provider, model, endpoint_url, settings')
        .eq('slug', slug)
        .single();
      return (data as AgentConfig) || null;
    },
    staleTime: Infinity,
    enabled: !!slug,
  });

  // 2. Sessions (nova tabela agents_sessions, filtra por agent_id + user_id)
  const { data: sessions = [] } = useQuery({
    queryKey: ['agents-platform-sessions', slug, userId],
    queryFn: async (): Promise<AgentSession[]> => {
      if (!config?.id || !userId) return [];
      const { data } = await supabase
        .from('agents_sessions')
        .select('id, title, created_at, updated_at')
        .eq('agent_id', config.id)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(50);
      return (data as AgentSession[]) || [];
    },
    enabled: !!config?.id && !!userId && !authLoading,
    staleTime: 30_000,
  });

  // 3. Estado mutável
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [pendingTool, setPendingTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Histórico de tools chamadas (live, durante streaming) */
  const [toolHistory, setToolHistory] = useState<ToolEvent[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  // Ref espelhando `streaming` — usado dentro do callback do Realtime (evita closure stale)
  const streamingRef = useRef(false);
  useEffect(() => { streamingRef.current = streaming; }, [streaming]);

  // Realtime: mensagens PROATIVAS (lembrete agendado, resume de job async) chegam
  // sozinhas na conversa. Durante um exchange ativo, o SSE cuida (ignora aqui).
  useEffect(() => {
    if (!activeSessionId) return;
    // Nome único por instância — evita "cannot add postgres_changes after subscribe()"
    // (o efeito pode rodar 2x no StrictMode; nome fixo reusaria um canal já inscrito).
    const chan = supabase
      .channel(`agent-msgs-${activeSessionId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'agents_messages', filter: `session_id=eq.${activeSessionId}` },
        (payload) => {
          if (streamingRef.current) return; // exchange ativo → SSE já mostra
          const m: any = payload.new;
          if (!m || m.role !== 'assistant' || !m.content) return;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            // dedupe: ignora se for repetição da última (ex: msg recém-streamada)
            if (last && last.role === 'assistant' && last.content === m.content) return prev;
            return [...prev, { role: 'assistant', content: m.content, tool_calls: m.tool_calls || undefined }];
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(chan); };
  }, [activeSessionId]);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setPendingTool(null);
  }, []);

  const refreshSessions = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['agents-platform-sessions', slug, userId] });
  }, [qc, slug, userId]);

  // FIX UX: ao montar, se tem sessions e não tem activeSessionId, carrega a última
  // (sessions já vêm ordenadas por updated_at desc, então [0] é a mais recente)
  useEffect(() => {
    if (!activeSessionId && sessions.length > 0 && !loadingThread) {
      const last = sessions[0];
      if (last?.id) {
        // chama inline pra evitar dependência circular do useCallback
        setLoadingThread(true);
        setActiveSessionId(last.id);
        setMessages([]);
        setError(null);
        supabase
          .from('agents_messages')
          .select('id, role, content, tool_calls, tool_call_id')
          .eq('session_id', last.id)
          .order('created_at', { ascending: true })
          .limit(200)
          .then(({ data }) => {
            setMessages(hydrateLoadedMessages((data || []) as any[]));
            setLoadingThread(false);
          });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  const loadSession = useCallback(async (sessionId: string) => {
    setLoadingThread(true);
    setActiveSessionId(sessionId);
    setMessages([]);
    setToolHistory([]);
    setError(null);
    try {
      const { data } = await supabase
        .from('agents_messages')
        .select('id, role, content, tool_calls, tool_call_id')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(200);
      setMessages(hydrateLoadedMessages((data || []) as any[]));
    } catch (e: any) {
      setError(e?.message || 'Erro carregando mensagens');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  const newConversation = useCallback(() => {
    setActiveSessionId(null);
    setMessages([]);
    setToolHistory([]);
    setError(null);
    setPendingTool(null);
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    // CASCADE em agents_sessions já apaga agents_messages
    await supabase.from('agents_sessions').delete().eq('id', sessionId);
    if (activeSessionId === sessionId) newConversation();
    refreshSessions();
  }, [activeSessionId, newConversation, refreshSessions]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    await supabase
      .from('agents_sessions')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', sessionId);
    refreshSessions();
  }, [refreshSessions]);

  const send = useCallback(async (text: string, attachments?: Array<{ url: string; type: 'image'; name?: string }>) => {
    const trimmed = text.trim();
    // Permite mandar só anexo (sem texto)
    if ((!trimmed && !(attachments && attachments.length)) || streaming || !userId || !config) return;
    setError(null);
    setPendingTool(null);

    // Mostra imagem(ns) inline na bolha do user via markdown
    const attachmentMd = (attachments || [])
      .filter((a) => a.type === 'image')
      .map((a) => `![${a.name || 'imagem'}](${a.url})`)
      .join('\n');
    const displayContent = [attachmentMd, trimmed].filter(Boolean).join('\n\n');

    const userMsg: AgentMessage = { id: newId(), role: 'user', content: displayContent };
    const assistantId = newId();
    setMessages((prev) => [...prev, userMsg, { id: assistantId, role: 'assistant', content: '' }]);
    setStreaming(true);

    let acc = '';
    const render = () => {
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: acc } : m))
      );
    };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: SUPA_KEY },
        body: JSON.stringify({
          agent_slug: config.slug,
          channel,
          session_id: activeSessionId,
          message: trimmed,
          attachments: attachments || [],
          user_id: userId,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '');
        throw new Error(`Agente respondeu ${res.status}: ${errText.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const t = line.trim();
          if (!t.startsWith('data:')) continue;
          const payload = t.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          let evt: any;
          try { evt = JSON.parse(payload); } catch { continue; }

          // ───── Eventos do agent-runner ─────
          if (evt.type === 'session.info' && evt.session_id && !activeSessionId) {
            setActiveSessionId(evt.session_id);
          }
          else if (evt.type === 'text.delta' && typeof evt.delta === 'string') {
            acc += evt.delta;
            setPendingTool(null);
            render();
          }
          else if (evt.type === 'tool.start' && evt.tool) {
            setPendingTool(evt.tool);
            const startedAt = Date.now();
            const toolId = `tool_${startedAt}_${Math.random().toString(36).slice(2, 6)}`;

            // Painel direito (histórico estruturado)
            setToolHistory((prev) => [...prev, {
              id: toolId,
              name: evt.tool,
              arguments: evt.arguments || undefined,
              status: 'running',
              startedAt,
            }]);

            // INLINE no chat — insere msg sintética ANTES do bubble do assistant
            // (igual WhatsApp legado: card violeta centralizado no momento exato)
            setMessages((prev) => {
              // Encontra o bubble do assistant (último) — insere a tool card ANTES dele
              const assistantIdx = prev.findLastIndex?.((m) => m.id === assistantId);
              const toolMsg: AgentMessage = {
                id: toolId,
                role: 'tool',
                content: '',
                toolName: evt.tool,
                toolArguments: evt.arguments || undefined,
                toolStatus: 'running',
                toolStartedAt: startedAt,
              };
              if (assistantIdx === undefined || assistantIdx < 0) {
                return [...prev, toolMsg];
              }
              const before = prev.slice(0, assistantIdx);
              const after = prev.slice(assistantIdx);
              return [...before, toolMsg, ...after];
            });
          }
          else if (evt.type === 'tool.end') {
            setPendingTool(null);
            const endedAt = Date.now();

            // Painel direito
            setToolHistory((prev) => {
              const idx = prev.findLastIndex?.(
                (e) => e.name === evt.tool && e.status === 'running',
              );
              if (idx === undefined || idx < 0) return prev;
              const updated = [...prev];
              updated[idx] = {
                ...updated[idx],
                status: evt.error ? 'failed' : 'success',
                output: evt.output,
                error: evt.error,
                endedAt,
                durationMs: endedAt - updated[idx].startedAt,
              };
              return updated;
            });

            // Inline no chat — atualiza msg sintética com resultado
            setMessages((prev) => {
              const idx = prev.findLastIndex?.(
                (m) => m.role === 'tool' && m.toolName === evt.tool && m.toolStatus === 'running',
              );
              if (idx === undefined || idx < 0) return prev;
              const updated = [...prev];
              const orig = updated[idx];
              const startTs = orig.toolStartedAt ?? endedAt;
              updated[idx] = {
                ...orig,
                toolStatus: evt.error ? 'failed' : 'success',
                toolError: evt.error,
                toolDurationMs: endedAt - startTs,
                content: evt.error
                  ? evt.error
                  : (evt.output === undefined || evt.output === null
                      ? ''
                      : JSON.stringify(evt.output, null, 2)),
              };
              return updated;
            });
          }
          else if (evt.type === 'done') {
            setPendingTool(null);
          }
          else if (evt.type === 'error' && evt.message) {
            setError(evt.message);
          }
        }
      }

      if (!acc) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: '_(Agente respondeu vazio — manda de novo)_' }
              : m
          )
        );
      }

      refreshSessions();
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: (m.content || '') + '\n\n_⏹ interrompido_' }
              : m
          )
        );
      } else {
        setError(err?.message || 'Erro');
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, content: m.content || `_❌ erro: ${err?.message || 'falhou'}_` }
              : m
          )
        );
      }
    } finally {
      setStreaming(false);
      setPendingTool(null);
      abortRef.current = null;
    }
  }, [streaming, userId, config, activeSessionId, channel, refreshSessions]);

  return {
    config,
    sessions,
    activeSessionId,
    messages,
    streaming,
    loadingThread,
    pendingTool,
    toolHistory,
    error,
    userId,
    authLoading,
    send,
    stop,
    loadSession,
    newConversation,
    deleteSession,
    renameSession,
    refreshSessions,
  };
}
