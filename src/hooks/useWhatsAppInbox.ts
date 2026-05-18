import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface InboxConversation {
  conversation_id: string;
  conversation_type: 'individual' | 'grupo';
  lead_id: string | null;
  group_id: string | null;
  contact_phone: string | null;
  conversation_name: string;
  last_message: string;
  last_message_at: string;
  last_sender_name: string | null;
  is_from_me: boolean;
  unread_count: number;
  organization_id: string | null;
  organization_name: string | null;
  health_status: string | null;
  health_score: number | null;
  instance_id: string | null;
  instance_name: string | null;
  lead_photo_url: string | null;
  lead_product: string | null;
  lead_has_purchased: boolean | null;
  pending_reply: boolean | null;
}

export interface WhatsAppInstance {
  id: string;
  name: string;
  teams: string[];
  status: string;
}

export const useWhatsAppInstances = () => {
  return useQuery({
    queryKey: ['whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, name, teams, status')
        .order('name');

      if (error) throw error;
      return (data || []) as WhatsAppInstance[];
    },
  });
};

export const useCSInboxConversations = (limit: number = 50, instanceId?: string | null) => {
  return useQuery({
    queryKey: ['cs-inbox-conversations', limit, instanceId],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)('get_cs_inbox_conversations', {
        p_limit: limit,
        p_instance_id: instanceId || null
      });

      if (error) {
        console.error('Error fetching inbox conversations');
        throw error;
      }
      
      return (data || []) as InboxConversation[];
    },
    refetchInterval: 15000, // 15s - realtime cuida das atualizações imediatas
  });
};

// Hook para buscar dados de um grupo
export const useWhatsAppGroup = (groupId: string | undefined) => {
  return useQuery({
    queryKey: ['whatsapp-group', groupId],
    queryFn: async () => {
      if (!groupId) return null;
      
      const { data, error } = await supabase
        .from('whatsapp_groups')
        .select('*')
        .eq('id', groupId)
        .single();

      if (error) {
        console.error('Error fetching group');
        return null;
      }
      
      return data;
    },
    enabled: !!groupId,
  });
};

// Hook para buscar lead por ID
export const useLeadById = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['lead-by-id', leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from('leads')
        .select('*, pipeline_stage:sales_pipeline_stages(name, color), instagram_profile:instagram_profiles(biography, follower_count, following_count, full_name, profile_picture_url_hd)')
        .eq('id', leadId)
        .single();

      if (error) {
        console.error('Error fetching lead by id');
        return null;
      }

      return data;
    },
    enabled: !!leadId,
  });
};

// Hook para buscar lead_id pelo telefone
export const useLeadByPhone = (phone: string | undefined) => {
  return useQuery({
    queryKey: ['lead-by-phone', phone],
    queryFn: async () => {
      if (!phone) return null;
      
      const { data, error } = await (supabase.rpc as any)('get_lead_by_phone', {
        p_phone: phone
      });

      if (error) {
        console.error('Error fetching contact by phone');
        return null;
      }
      
      return data?.[0] || null;
    },
    enabled: !!phone,
  });
};

// Hook para buscar mensagens de uma conversa específica (por lead_id ou group_id)
// Carrega as últimas `limit` msgs, com opção de expandir pra todas
export const useConversationMessages = (
  leadId: string | null | undefined,
  groupId: string | null | undefined,
  instanceId: string | null | undefined,
  limit: number = 50
) => {
  return useQuery({
    queryKey: ['conversation-messages', leadId, groupId, instanceId, limit],
    queryFn: async () => {
      if (!leadId && !groupId) {
        return [];
      }

      const { data, error } = await (supabase.rpc as any)('get_conversation_messages', {
        p_lead_id: leadId || null,
        p_group_id: groupId || null,
        p_limit: limit,
        p_instance_id: instanceId || null,
        p_offset: 0
      });

      if (error) {
        console.error('Error fetching conversation messages');
        throw error;
      }

      return data || [];
    },
    enabled: !!(leadId || groupId),
    placeholderData: [], // Evita loading bloqueante ao trocar conversa
    refetchInterval: 10000, // 10s - realtime cuida de msgs novas
    staleTime: 5000,
    retry: 1,
  });
};
