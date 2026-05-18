import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { deleteWithUndo } from "@/lib/undoable-delete";

// ==================== TYPES ====================

export interface InstagramAccount {
  id: string;
  facebook_page_id: string | null;
  instagram_business_id: string | null;
  instagram_username: string;
  access_token: string;
  token_expires_at: string | null;
  name: string;
  status: "connected" | "disconnected" | "expired" | "error";
  teams: string[];
  webhook_verify_token: string | null;
  profile_picture_url: string | null;
  followers_count: number | null;
  biography: string | null;
  created_at: string;
  updated_at: string;
}

export interface SocialSellerStage {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
  icon: string;
  position: number;
  is_active: boolean;
  is_final: boolean;
  is_converted: boolean;
}

export interface SocialSellerRule {
  id: string;
  name: string;
  description: string | null;
  trigger_type: "message_count" | "interaction_type" | "keyword_detected" | "time_based" | "manual";
  trigger_config: {
    min_messages?: number;
    types?: string[];
    min_count?: number;
    keywords?: string[];
    match_type?: "any" | "all";
  };
  from_stage_id: string | null;
  to_stage_id: string;
  create_alert: boolean;
  alert_message: string | null;
  notify_whatsapp: boolean;
  notification_template: string | null;
  is_active: boolean;
  priority: number;
  from_stage?: SocialSellerStage;
  to_stage?: SocialSellerStage;
}

export interface InstagramConversation {
  id: string;
  account_id: string;
  lead_id: string | null;
  thread_id: string;
  participant_instagram_id: string;
  participant_username: string | null;
  participant_name: string | null;
  participant_profile_pic: string | null;
  status: "open" | "handled" | "archived" | "spam";
  assigned_to: string | null;
  social_seller_stage_id: string | null;
  social_seller_stage?: SocialSellerStage;
  stage_changed_at: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_client_message_at: string | null;
  last_agent_message_at: string | null;
  unread_count: number;
  total_messages: number;
  metadata?: Record<string, any> | null;
  is_ignored: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  lead?: {
    id: string;
    name: string;
    phone: string | null;
    instagram: string | null;
  };
  account?: InstagramAccount;
}

export interface InstagramMessage {
  id: string;
  conversation_id: string;
  instagram_message_id: string | null;
  content: string | null;
  message_type: "text" | "image" | "video" | "audio" | "story_reply" | "story_mention" | "reel_share" | "post_share" | "post_comment" | "comment_reply" | "link" | "sticker";
  media_url: string | null;
  is_from_me: boolean;
  sender_instagram_id: string | null;
  sender_username: string | null;
  reference_type: "story" | "post" | "reel" | null;
  reference_id: string | null;
  reference_url: string | null;
  reference_preview_url: string | null;
  status: "sending" | "sent" | "delivered" | "read" | "failed";
  sent_at: string;
  read_at: string | null;
  created_at: string;
  metadata?: {
    post_id?: string;
    comment_id?: string;
    parent_id?: string;
    permalink?: string;
    post_caption?: string;
    [key: string]: unknown;
  } | null;
}

export interface InstagramComment {
  id: string;
  account_id: string;
  lead_id: string | null;
  comment_id: string;
  post_id: string;
  post_url: string | null;
  post_thumbnail_url: string | null;
  parent_comment_id: string | null;
  author_instagram_id: string;
  author_username: string | null;
  author_name: string | null;
  author_profile_pic: string | null;
  content: string;
  status: "new" | "replied" | "liked" | "hidden" | "ignored" | "converted_to_dm";
  replied_at: string | null;
  replied_by: string | null;
  reply_content: string | null;
  commented_at: string;
  created_at: string;
}

export interface SocialSellerAlert {
  id: string;
  conversation_id: string;
  lead_id: string | null;
  rule_id: string | null;
  alert_type: "stage_change" | "keyword_detected" | "high_engagement" | "manual";
  title: string;
  message: string | null;
  trigger_message: string | null;
  detected_keywords: string[] | null;
  from_stage: string | null;
  to_stage: string | null;
  status: "pending" | "viewed" | "actioned" | "dismissed";
  viewed_at: string | null;
  actioned_at: string | null;
  created_at: string;
  // Joined
  conversation?: InstagramConversation;
}

export interface InstagramEngagement {
  id: string;
  lead_id: string;
  account_id: string;
  total_dms: number;
  total_comments: number;
  total_story_replies: number;
  total_story_mentions: number;
  total_post_shares: number;
  last_dm_at: string | null;
  last_comment_at: string | null;
  last_story_reply_at: string | null;
  last_interaction_at: string | null;
  dms_last_7_days: number;
  dms_last_30_days: number;
  interactions_last_7_days: number;
  interactions_last_30_days: number;
  engagement_score: number;
  first_interaction_at: string | null;
  updated_at: string;
}

export interface FunnelStats {
  stage_slug: string;
  stage_name: string;
  stage_color: string;
  stage_position: number;
  conversation_count: number;
  unread_count: number;
}

// ==================== ACCOUNTS ====================

export const useInstagramAccounts = () => {
  return useQuery({
    queryKey: ["instagram-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("instagram_business_accounts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as InstagramAccount[];
    },
  });
};

export const useInstagramAccount = (accountId: string | undefined) => {
  return useQuery({
    queryKey: ["instagram-account", accountId],
    queryFn: async () => {
      if (!accountId) return null;
      const { data, error } = await supabase
        .from("instagram_business_accounts")
        .select("*")
        .eq("id", accountId)
        .single();

      if (error) throw error;
      return data as InstagramAccount;
    },
    enabled: !!accountId,
  });
};

export const useCreateInstagramAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name: string;
      instagram_username: string;
      access_token: string;
      instagram_business_id?: string;
      facebook_page_id?: string;
    }) => {
      const { data, error } = await supabase
        .from("instagram_business_accounts")
        .insert({
          ...input,
          status: "connected",
          webhook_verify_token: `instagram_webhook_verify_token_cs`,
        })
        .select()
        .single();

      if (error) throw error;
      return data as InstagramAccount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
    },
  });
};

export const useUpdateInstagramAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InstagramAccount> & { id: string }) => {
      const { data, error } = await supabase
        .from("instagram_business_accounts")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as InstagramAccount;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["instagram-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-account", data.id] });
    },
  });
};

export const useDeleteInstagramAccount = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (accountId: string) => {
      await deleteWithUndo({
        table: 'instagram_business_accounts',
        id: accountId,
        label: 'Conta Instagram',
        queryClient,
        queryKeys: [['instagram-accounts']],
      });
    },
  });
};

// ==================== SOCIAL SELLER STAGES ====================

export const useSocialSellerStages = () => {
  return useQuery({
    queryKey: ["social-seller-stages"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_seller_stages")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });

      if (error) throw error;
      return (data || []) as SocialSellerStage[];
    },
  });
};

export const useUpdateSocialSellerStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SocialSellerStage> & { id: string }) => {
      const { data, error } = await supabase
        .from("social_seller_stages")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as SocialSellerStage;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-seller-stages"] });
    },
  });
};

// ==================== SOCIAL SELLER RULES ====================

export const useSocialSellerRules = () => {
  return useQuery({
    queryKey: ["social-seller-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_seller_rules")
        .select(`
          *,
          from_stage:social_seller_stages!social_seller_rules_from_stage_id_fkey(id, name, slug, color),
          to_stage:social_seller_stages!social_seller_rules_to_stage_id_fkey(id, name, slug, color)
        `)
        .order("priority", { ascending: false });

      if (error) throw error;
      return (data || []) as SocialSellerRule[];
    },
  });
};

export const useCreateSocialSellerRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: Omit<SocialSellerRule, "id" | "from_stage" | "to_stage">) => {
      const { data, error } = await supabase
        .from("social_seller_rules")
        .insert(input)
        .select()
        .single();

      if (error) throw error;
      return data as SocialSellerRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-seller-rules"] });
    },
  });
};

export const useUpdateSocialSellerRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SocialSellerRule> & { id: string }) => {
      const { data, error } = await supabase
        .from("social_seller_rules")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as SocialSellerRule;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-seller-rules"] });
    },
  });
};

export const useDeleteSocialSellerRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ruleId: string) => {
      await deleteWithUndo({
        table: 'social_seller_rules',
        id: ruleId,
        label: 'Regra',
        queryClient,
        queryKeys: [['social-seller-rules']],
      });
    },
  });
};

// ==================== CONVERSATIONS ====================

export interface ConversationFilters {
  accountId?: string;
  stageSlug?: string;
  status?: string;
  assignedTo?: string;
  search?: string;
  includeIgnored?: boolean;
}

export const useInstagramConversations = (filters?: ConversationFilters) => {
  // Resolve stage slug to ID for proper filtering
  const { data: stages = [] } = useSocialSellerStages();
  const stageIdFromSlug = filters?.stageSlug
    ? stages.find((s) => s.slug === filters.stageSlug)?.id
    : undefined;

  return useQuery({
    queryKey: ["instagram-conversations", filters, stageIdFromSlug],
    // Wait for stages to load when filtering by slug
    enabled: !filters?.stageSlug || !!stageIdFromSlug,
    queryFn: async () => {
      let query = supabase
        .from("instagram_conversations")
        .select(`
          *,
          social_seller_stage:social_seller_stages(id, name, slug, color, position),
          lead:leads(id, name, phone, instagram),
          account:instagram_business_accounts(id, name, instagram_username)
        `)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }
      if (stageIdFromSlug) {
        query = query.eq("social_seller_stage_id", stageIdFromSlug);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      } else {
        query = query.eq("status", "open");
      }
      if (filters?.assignedTo) {
        query = query.eq("assigned_to", filters.assignedTo);
      }
      if (filters?.search) {
        // Buscar por nome/username E também por conteúdo de mensagem
        // Primeiro, buscar conversation_ids que têm mensagens com o termo
        const { data: msgMatches } = await supabase
          .from('instagram_messages')
          .select('conversation_id')
          .ilike('content', `%${filters.search}%`)
          .limit(50);

        const matchedConvIds = [...new Set((msgMatches || []).map(m => m.conversation_id))];

        if (matchedConvIds.length > 0) {
          // Buscar por nome/username OU por conversas que têm a mensagem
          query = query.or(`participant_username.ilike.%${filters.search}%,participant_name.ilike.%${filters.search}%,id.in.(${matchedConvIds.join(',')})`);
        } else {
          query = query.or(`participant_username.ilike.%${filters.search}%,participant_name.ilike.%${filters.search}%`);
        }
      }
      if (!filters?.includeIgnored) {
        query = query.eq("is_ignored", false);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return (data || []) as InstagramConversation[];
    },
  });
};

export const useInstagramConversation = (conversationId: string | undefined) => {
  return useQuery({
    queryKey: ["instagram-conversation", conversationId],
    queryFn: async () => {
      if (!conversationId) return null;

      const { data, error } = await supabase
        .from("instagram_conversations")
        .select(`
          *,
          social_seller_stage:social_seller_stages(id, name, slug, color, position),
          lead:leads(id, name, phone, email, instagram, sales_score, sales_stage),
          account:instagram_business_accounts(id, name, instagram_username, profile_picture_url)
        `)
        .eq("id", conversationId)
        .single();

      if (error) throw error;
      return data as InstagramConversation;
    },
    enabled: !!conversationId,
  });
};

export const useUpdateConversationStage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, stageId }: { conversationId: string; stageId: string }) => {
      const { data, error } = await supabase
        .from("instagram_conversations")
        .update({
          social_seller_stage_id: stageId,
          stage_changed_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .select()
        .single();

      if (error) throw error;
      return data as InstagramConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-funnel-stats"] });
    },
  });
};

export const useMarkConversationHandled = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase
        .from("instagram_conversations")
        .update({
          status: "handled",
          unread_count: 0,
        })
        .eq("id", conversationId)
        .select()
        .single();

      if (error) throw error;
      return data as InstagramConversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-funnel-stats"] });
    },
  });
};

export const useToggleIgnoreConversation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ conversationId, isIgnored }: { conversationId: string; isIgnored: boolean }) => {
      const { error } = await supabase
        .from("instagram_conversations")
        .update({ is_ignored: isIgnored })
        .eq("id", conversationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-funnel-stats"] });
    },
  });
};

export const useLinkConversationToLead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ conversationId, leadId }: { conversationId: string; leadId: string }) => {
      // Atualizar conversa
      const { data: conversation, error: convError } = await supabase
        .from("instagram_conversations")
        .update({ lead_id: leadId })
        .eq("id", conversationId)
        .select("participant_instagram_id, participant_username")
        .single();

      if (convError) throw convError;

      // Atualizar lead com instagram_id
      if (conversation?.participant_instagram_id) {
        await supabase
          .from("leads")
          .update({
            instagram_id: conversation.participant_instagram_id,
            instagram: conversation.participant_username ? `@${conversation.participant_username}` : null,
            instagram_verified_at: new Date().toISOString(),
          })
          .eq("id", leadId);
      }

      return conversation;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
    },
  });
};

// ==================== LEAD CONVERSATION LOOKUP ====================

export const useLeadInstagramConversation = (
  leadId: string | undefined,
  instagramId: string | undefined
) => {
  return useQuery({
    queryKey: ["instagram-conversation-for-lead", leadId, instagramId],
    queryFn: async () => {
      // Strategy 1: search by lead_id (covers ~92% of linked convos)
      if (leadId) {
        const { data } = await supabase
          .from("instagram_conversations")
          .select(
            "*, social_seller_stage:social_seller_stages(id, name, slug, color, position)"
          )
          .eq("lead_id", leadId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        if (data) return data as InstagramConversation;
      }
      // Strategy 2: fallback by participant_instagram_id
      if (instagramId) {
        const { data } = await supabase
          .from("instagram_conversations")
          .select(
            "*, social_seller_stage:social_seller_stages(id, name, slug, color, position)"
          )
          .eq("participant_instagram_id", instagramId)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1)
          .maybeSingle();
        return (data as InstagramConversation) || null;
      }
      return null;
    },
    enabled: !!(leadId || instagramId),
  });
};

// ==================== MESSAGES ====================

export const useInstagramMessages = (conversationId: string | undefined, limit = 50, offset = 0) => {
  return useQuery({
    queryKey: ["instagram-messages", conversationId, limit, offset],
    queryFn: async () => {
      if (!conversationId) return [];

      // Buscar as mensagens mais recentes (DESC) e depois inverter para exibir ASC
      const { data, error } = await supabase
        .from("instagram_messages")
        .select("*, metadata")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      // Inverter para ordem cronológica (mais antiga primeiro)
      return ((data || []) as InstagramMessage[]).reverse();
    },
    enabled: !!conversationId,
  });
};

export const useSendInstagramDM = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      conversationId,
      message,
      messageType = "text",
      mediaUrl,
    }: {
      conversationId: string;
      message: string;
      messageType?: "text" | "image" | "video";
      mediaUrl?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("instagram-send-dm", {
        body: {
          conversation_id: conversationId,
          message,
          message_type: messageType,
          media_url: mediaUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["instagram-messages", variables.conversationId] });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversation", variables.conversationId] });
    },
  });
};

// Send DM to a username (no existing conversation needed)
export const useSendInstagramDMToUsername = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      instagramUsername,
      leadId,
      message,
      messageType = "text",
      mediaUrl,
    }: {
      instagramUsername: string;
      leadId?: string;
      message: string;
      messageType?: "text" | "image" | "video";
      mediaUrl?: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("instagram-send-dm", {
        body: {
          instagram_username: instagramUsername,
          lead_id: leadId,
          message,
          message_type: messageType,
          media_url: mediaUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data as { success: boolean; conversation_id: string; message_id: string; created_conversation: boolean };
    },
    onSuccess: (data, variables) => {
      if (data?.conversation_id) {
        queryClient.invalidateQueries({ queryKey: ["instagram-messages", data.conversation_id] });
        queryClient.invalidateQueries({ queryKey: ["instagram-conversation", data.conversation_id] });
      }
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      if (variables.leadId) {
        queryClient.invalidateQueries({ queryKey: ["instagram-conversation-for-lead", variables.leadId] });
      }
    },
  });
};

// ==================== SYNC MESSAGES ====================

export const useSyncInstagramMessages = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "sync-instagram-messages",
        { body: { conversation_id: conversationId } }
      );
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; synced: number };
    },
    onSuccess: (data, conversationId) => {
      if (data?.synced > 0) {
        queryClient.invalidateQueries({ queryKey: ["instagram-messages", conversationId] });
        queryClient.invalidateQueries({ queryKey: ["instagram-conversation", conversationId] });
        queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      }
    },
  });
};

// ==================== COMMENTS ====================

export const useInstagramComments = (filters?: { accountId?: string; status?: string; postId?: string }) => {
  return useQuery({
    queryKey: ["instagram-comments", filters],
    queryFn: async () => {
      let query = supabase
        .from("instagram_comments")
        .select(`
          *,
          lead:leads(id, name, instagram)
        `)
        .order("commented_at", { ascending: false });

      if (filters?.accountId) {
        query = query.eq("account_id", filters.accountId);
      }
      if (filters?.status) {
        query = query.eq("status", filters.status);
      }
      if (filters?.postId) {
        query = query.eq("post_id", filters.postId);
      }

      const { data, error } = await query.limit(100);

      if (error) throw error;
      return (data || []) as InstagramComment[];
    },
  });
};

export const useUpdateCommentStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, status, replyContent }: { commentId: string; status: string; replyContent?: string }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "replied" && replyContent) {
        updates.reply_content = replyContent;
        updates.replied_at = new Date().toISOString();
      }

      const { data, error } = await supabase
        .from("instagram_comments")
        .update(updates)
        .eq("id", commentId)
        .select()
        .single();

      if (error) throw error;
      return data as InstagramComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instagram-comments"] });
    },
  });
};

// ==================== ALERTS ====================

export const useSocialSellerAlerts = (status: "pending" | "viewed" | "actioned" | "dismissed" = "pending") => {
  return useQuery({
    queryKey: ["social-seller-alerts", status],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_seller_alerts")
        .select(`
          *,
          conversation:instagram_conversations(
            id, participant_username, participant_name, participant_profile_pic,
            lead:leads(id, name)
          )
        `)
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as SocialSellerAlert[];
    },
  });
};

export const useUpdateAlertStatus = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, status, actionNotes }: { alertId: string; status: string; actionNotes?: string }) => {
      const updates: Record<string, unknown> = { status };

      if (status === "viewed") {
        updates.viewed_at = new Date().toISOString();
      } else if (status === "actioned" || status === "dismissed") {
        updates.actioned_at = new Date().toISOString();
        if (actionNotes) updates.action_notes = actionNotes;
      }

      const { data, error } = await supabase
        .from("social_seller_alerts")
        .update(updates)
        .eq("id", alertId)
        .select()
        .single();

      if (error) throw error;
      return data as SocialSellerAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social-seller-alerts"] });
    },
  });
};

// ==================== ENGAGEMENT ====================

export const useLeadInstagramEngagement = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ["instagram-engagement", leadId],
    queryFn: async () => {
      if (!leadId) return null;

      const { data, error } = await supabase
        .from("instagram_engagement")
        .select("*")
        .eq("lead_id", leadId)
        .maybeSingle();

      if (error) throw error;
      return data as InstagramEngagement | null;
    },
    enabled: !!leadId,
  });
};

// ==================== FUNNEL STATS ====================

export const useSocialSellerFunnelStats = (accountId?: string) => {
  return useQuery({
    queryKey: ["instagram-funnel-stats", accountId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_social_seller_funnel_stats", {
        p_account_id: accountId || null,
      });

      if (error) throw error;
      return (data || []) as FunnelStats[];
    },
  });
};

// ==================== UNIFIED INBOX HELPER ====================

export const useInstagramInbox = (filters?: ConversationFilters & { limit?: number }) => {
  return useQuery({
    queryKey: ["instagram-inbox", filters],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_instagram_inbox", {
        p_account_id: filters?.accountId || null,
        p_stage_slug: filters?.stageSlug || null,
        p_status: filters?.status || "open",
        p_assigned_to: filters?.assignedTo || null,
        p_search: filters?.search || null,
        p_limit: filters?.limit || 50,
        p_offset: 0,
      });

      if (error) throw error;
      return data || [];
    },
  });
};
