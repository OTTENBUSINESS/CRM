import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const db = supabase as any;

export type Conversation = {
  id: string;
  channel_type: string;
  channel_name: string;
  team: string;
  is_active: boolean;
  last_message: string;
  last_message_at: string;
  last_client_message_at: string;
  last_agent_message_at: string;
  created_at: string;
  updated_at: string;
  lead_id: string;
  lead?: any;
  whatsapp_group?: any;
  active_tickets?: any[];
  recent_messages?: any[];
  tickets?: any[];
  messages?: any[];
};

interface UseConversationsOptions {
  team?: string;
  filter?: string;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const queryClient = useQueryClient();

  // Setup Supabase Realtime subscriptions (MELHOR PRÁTICA)
  useEffect(() => {
    const channel = db
      .channel('support-conversations-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_conversations',
          filter: options.team ? `team=eq.${options.team}` : undefined,
        },
        () => {
          console.log('[Realtime] Support conversation changed, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversations', options.team, options.filter] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        () => {
          console.log('[Realtime] Ticket changed, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversations', options.team, options.filter] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_messages',
        },
        () => {
          console.log('[Realtime] Message changed, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversations', options.team, options.filter] });
        }
      )
      .subscribe((status: any) => {
        console.log('[Realtime] Subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Unsubscribing from support conversations channel');
      db.removeChannel(channel);
    };
  }, [options.team, options.filter, queryClient]);

  return useQuery({
    queryKey: ['support-conversations', options.team, options.filter],
    queryFn: async () => {
      let query = db
        .from('support_conversations')
        .select(`
          *,
          lead:leads(*),
          whatsapp_group:whatsapp_groups(*),
          tickets:tickets(
            id,
            subject,
            category,
            status,
            created_at,
            updated_at
          ),
          recent_messages:conversation_messages(
            id,
            sender_name,
            sender_type,
            content,
            created_at
          )
        `)
        .eq('is_active', true)
        .order('last_message_at', { ascending: false });

      if (options.team) {
        query = query.eq('team', options.team as any);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching support conversations:', error);
        throw error;
      }

      console.log('Support conversations fetched:', data?.length || 0);

      // Process conversations to sort recent_messages
      const conversations = (data || []).map((conv: any) => {
        if (conv.recent_messages && conv.recent_messages.length > 0) {
          // Sort messages by created_at descending (most recent first)
          conv.recent_messages.sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        }
        return conv;
      });

      return conversations;
    },
    // Sem polling - Realtime cuida das atualizações
    refetchOnWindowFocus: true, // Apenas refetch ao focar janela (fallback)
  });
}

export function useConversation(conversationId: string) {
  const queryClient = useQueryClient();

  // Setup Realtime subscriptions para conversa específica
  useEffect(() => {
    if (!conversationId) return;

    const channel = db
      .channel(`support-conversation-${conversationId}-realtime`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'support_conversations',
          filter: `id=eq.${conversationId}`,
        },
        () => {
          console.log('[Realtime] Support conversation updated, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversation', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          console.log('[Realtime] Ticket updated for conversation, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversation', conversationId] });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversation_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        () => {
          console.log('[Realtime] Message updated for conversation, refetching...');
          queryClient.invalidateQueries({ queryKey: ['support-conversation', conversationId] });
        }
      )
      .subscribe((status: any) => {
        console.log('[Realtime] Support conversation subscription status:', status);
      });

    return () => {
      console.log('[Realtime] Unsubscribing from support conversation channel');
      db.removeChannel(channel);
    };
  }, [conversationId, queryClient]);

  return useQuery({
    queryKey: ['support-conversation', conversationId],
    queryFn: async () => {
      const { data, error } = await db
        .from('support_conversations')
        .select(`
          *,
          lead:leads(*),
          whatsapp_group:whatsapp_groups(*),
          tickets:tickets!conversation_id(
            *
          ),
          messages:conversation_messages(
            *
          )
        `)
        .eq('id', conversationId)
        .single();

      if (error) {
        console.error('Error fetching support conversation:', error);
        throw error;
      }

      // Ordenar tickets por data de criação (mais recente primeiro)
      if (data.tickets) {
        data.tickets.sort((a: any, b: any) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      }

      // Ordenar mensagens por data de criação (mais antiga primeiro)
      if (data.messages) {
        data.messages.sort((a: any, b: any) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
      }

      return data;
    },
    enabled: !!conversationId,
    // Sem polling - Realtime cuida das atualizações
    refetchOnWindowFocus: true, // Apenas refetch ao focar janela (fallback)
  });
}
