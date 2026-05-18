import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface WhatsAppChannel {
  channel_type: 'grupo' | 'individual';
  channel_name: string;
  group_id: string | null;
  total_messages: number;
  last_message_at: string | null;
  first_message_at: string | null;
  messages_last_7_days: number;
  messages_last_30_days: number;
}

export interface TicketsSummary {
  total: number;
  open: number;
  resolved: number;
  last_ticket_at: string | null;
}

export interface CommunicationSummary {
  whatsapp_channels: WhatsAppChannel[];
  tickets: TicketsSummary;
  total_whatsapp_messages: number;
  last_whatsapp_at: string | null;
}

export interface WhatsAppReaction {
  emoji: string;
  sender: string;
  sender_name?: string;
  timestamp?: string;
}

export interface WhatsAppMessage {
  message_id: string;
  channel_type: 'grupo' | 'individual';
  channel_name: string;
  content: string;
  message_type: string;
  media_url?: string;
  sent_at: string;
  is_from_me: boolean;
  sender_name?: string;
  sender_phone?: string;
  instance_team?: string; // 'cs', 'suporte', 'comercial', etc
  instance_name?: string; // nome da instância (ex: 'IAP - COMERCIAL')
  reactions?: WhatsAppReaction[];
  is_edited?: boolean;
  is_deleted?: boolean;
  edited_at?: string;
  metadata?: {
    sent_by?: 'ai_agent';
    agent_id?: string;
    agent_name?: string;
    [key: string]: any;
  };
}

export interface SupportTicket {
  ticket_id: string;
  subject: string;
  status: string;
  channel: string;
  channel_name: string;
  team: string;
  created_at: string;
  resolved_at: string | null;
  last_message: string;
  last_message_at: string | null;
}

/**
 * Hook para buscar resumo de comunicação do cliente
 */
export const useClientCommunicationSummary = (contactId: string | undefined, phone: string | undefined) => {
  return useQuery({
    queryKey: ['client-communication-summary', contactId, phone],
    queryFn: async () => {
      if (!contactId && !phone) return null;
      
      // Buscar mensagens via RPC (que funciona)
      const { data: messagesData, error: msgError } = await (supabase.rpc as any)('get_client_whatsapp_messages', {
        p_phone: phone || '',
        p_limit: 1000,
        p_group_id: null
      });
      
      if (msgError) {
        console.error('Error fetching messages:', msgError);
      }
      
      // Agrupar por canal
      const channelMap = new Map<string, WhatsAppChannel>();
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      (messagesData || []).forEach((msg: any) => {
        const channelKey = msg.channel_name || 'WhatsApp Individual';
        const channelType = msg.channel_type || 'individual';
        const sentAt = new Date(msg.sent_at);
        
        if (!channelMap.has(channelKey)) {
          channelMap.set(channelKey, {
            channel_type: channelType as 'grupo' | 'individual',
            channel_name: channelKey,
            group_id: null,
            total_messages: 0,
            last_message_at: null,
            first_message_at: null,
            messages_last_7_days: 0,
            messages_last_30_days: 0,
          });
        }
        
        const channel = channelMap.get(channelKey)!;
        channel.total_messages++;
        
        if (!channel.last_message_at || sentAt > new Date(channel.last_message_at)) {
          channel.last_message_at = msg.sent_at;
        }
        if (!channel.first_message_at || sentAt < new Date(channel.first_message_at)) {
          channel.first_message_at = msg.sent_at;
        }
        if (sentAt > sevenDaysAgo) {
          channel.messages_last_7_days++;
        }
        if (sentAt > thirtyDaysAgo) {
          channel.messages_last_30_days++;
        }
      });
      
      const whatsappChannels = Array.from(channelMap.values())
        .sort((a, b) => new Date(b.last_message_at || 0).getTime() - new Date(a.last_message_at || 0).getTime());
      
      // Buscar tickets via RPC
      const { data: ticketsData } = await (supabase.rpc as any)('get_client_support_tickets', {
        p_contact_id: contactId || null,
        p_phone: phone || ''
      });
      
      const tickets = ticketsData || [];
      const ticketsSummary: TicketsSummary = {
        total: tickets.length,
        open: tickets.filter((t: any) => ['novo', 'em_atendimento', 'aguardando_cliente'].includes(t.status)).length,
        resolved: tickets.filter((t: any) => t.status === 'resolvido').length,
        last_ticket_at: tickets.length > 0 ? tickets[0].created_at : null,
      };
      
      const totalMessages = whatsappChannels.reduce((sum, ch) => sum + ch.total_messages, 0);
      const lastWhatsappAt = whatsappChannels.length > 0 ? whatsappChannels[0].last_message_at : null;
      
      const result: CommunicationSummary = {
        whatsapp_channels: whatsappChannels,
        tickets: ticketsSummary,
        total_whatsapp_messages: totalMessages,
        last_whatsapp_at: lastWhatsappAt,
      };
      
      return result;
    },
    enabled: !!(contactId || phone),
    staleTime: 0,
    gcTime: 0,
  });
};

/**
 * Hook para buscar mensagens de WhatsApp do cliente
 */
export const useClientWhatsAppMessages = (
  phone: string | undefined, 
  limit: number = 20,
  groupId?: string
) => {
  return useQuery({
    queryKey: ['client-whatsapp-messages', phone, limit, groupId],
    queryFn: async () => {
      if (!phone) return [];
      
      const { data, error } = await (supabase.rpc as any)('get_client_whatsapp_messages', {
        p_phone: phone,
        p_limit: limit,
        p_group_id: groupId || null
      });

      if (error) {
        console.error('Error fetching whatsapp messages:', error);
        throw error;
      }
      
      return (data || []) as WhatsAppMessage[];
    },
    enabled: !!phone,
  });
};

/**
 * Hook para buscar tickets de suporte do cliente
 */
export const useClientSupportTickets = (contactId: string | undefined, phone: string | undefined) => {
  return useQuery({
    queryKey: ['client-support-tickets', contactId, phone],
    queryFn: async () => {
      if (!contactId && !phone) return [];
      
      const { data, error } = await (supabase.rpc as any)('get_client_support_tickets', {
        p_contact_id: contactId || null,
        p_phone: phone || ''
      });

      if (error) {
        console.error('Error fetching support tickets:', error);
        throw error;
      }
      
      return (data || []) as SupportTicket[];
    },
    enabled: !!(contactId || phone),
  });
};
