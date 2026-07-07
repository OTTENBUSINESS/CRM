/**
 * useAgentSessions — lista sessões com agregados (msgs/cost) + mensagens completas.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface AgentSession {
  id: string;
  title: string | null;
  channel: string;
  status: string;
  created_at: string;
  user_id: string | null;
  provider_state: Record<string, any> | null;
  // agregados
  msg_count: number;
  last_msg_at: string | null;
  total_cost_brl: number;
  total_tokens: number;
}

export function useAgentSessions(agentId: string | undefined, filters?: { channel?: string; limit?: number }) {
  return useQuery({
    queryKey: ['agent-sessions', agentId, filters],
    queryFn: async (): Promise<AgentSession[]> => {
      if (!agentId) return [];

      let q = supabase
        .from('agents_sessions')
        .select('id, title, channel, status, created_at, user_id, provider_state')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false })
        .limit(filters?.limit ?? 100);

      if (filters?.channel && filters.channel !== 'all') q = q.eq('channel', filters.channel);

      const { data: sessions } = await q;
      if (!sessions?.length) return [];

      // Pega agregados de mensagens em batch
      const sessionIds = sessions.map((s) => s.id);
      const { data: msgs } = await supabase
        .from('agents_messages')
        .select('session_id, created_at, token_count, cost_brl')
        .in('session_id', sessionIds);

      const aggBySession = new Map<string, { count: number; lastAt: string | null; cost: number; tokens: number }>();
      for (const m of msgs || []) {
        const a = aggBySession.get(m.session_id) || { count: 0, lastAt: null, cost: 0, tokens: 0 };
        a.count++;
        a.cost += Number(m.cost_brl || 0);
        a.tokens += Number(m.token_count || 0);
        if (!a.lastAt || m.created_at > a.lastAt) a.lastAt = m.created_at;
        aggBySession.set(m.session_id, a);
      }

      return sessions.map((s) => {
        const a = aggBySession.get(s.id);
        return {
          ...(s as any),
          msg_count: a?.count || 0,
          last_msg_at: a?.lastAt || null,
          total_cost_brl: a?.cost || 0,
          total_tokens: a?.tokens || 0,
        };
      });
    },
    enabled: !!agentId,
    staleTime: 30_000,
  });
}

export interface SessionMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  content: string;
  tool_calls: any[] | null;
  tool_call_id: string | null;
  token_count: number | null;
  cost_brl: number | null;
  created_at: string;
  status: string;
}

export function useSessionMessages(sessionId: string | undefined) {
  return useQuery({
    queryKey: ['session-messages', sessionId],
    queryFn: async (): Promise<SessionMessage[]> => {
      if (!sessionId) return [];
      const { data } = await supabase
        .from('agents_messages')
        .select('id, role, content, tool_calls, tool_call_id, token_count, cost_brl, created_at, status')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      return (data as SessionMessage[]) || [];
    },
    enabled: !!sessionId,
    staleTime: 10_000,
  });
}
