import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export interface TaskBotConfig {
  id: string;
  name: string;
  instance_id: string | null;
  bot_mention_id: string;
  enabled_group_ids: string[];
  ai_prompt: string;
  context_messages_count: number;
  auto_assign_to_sender: boolean;
  default_task_type: string;
  notify_on_creation: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TaskBotLog {
  id: string;
  config_id: string;
  group_id: string;
  trigger_message_id: string;
  trigger_content: string;
  sender_name: string;
  sender_phone: string;
  context_messages: any;
  ai_response: any;
  action_taken: "task_created" | "question_asked" | "error" | "ignored";
  task_id: string | null;
  response_message: string;
  error: string | null;
  created_at: string;
  group?: { name: string };
}

export interface WhatsAppGroup {
  id: string;
  name: string;
  group_jid: string;
  instance_id: string;
}

// Buscar configuração do bot (só deve existir uma)
export const useTaskBotConfig = () => {
  return useQuery({
    queryKey: ["task-bot-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_task_bot_config")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== "PGRST116") throw error;
      return data as TaskBotConfig | null;
    },
  });
};

// Criar ou atualizar configuração
export const useSaveTaskBotConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (config: Partial<TaskBotConfig> & { bot_mention_id: string }) => {
      // Verificar se já existe uma configuração
      const { data: existing } = await supabase
        .from("whatsapp_task_bot_config")
        .select("id")
        .limit(1)
        .single();

      if (existing) {
        // Atualizar
        const { data, error } = await supabase
          .from("whatsapp_task_bot_config")
          .update({
            ...config,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Criar
        const { data, error } = await supabase
          .from("whatsapp_task_bot_config")
          .insert(config)
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-bot-config"] });
    },
  });
};

// Buscar grupos disponíveis
export const useWhatsAppGroups = (instanceId?: string | null) => {
  return useQuery({
    queryKey: ["whatsapp-groups", instanceId],
    queryFn: async () => {
      let query = supabase
        .from("whatsapp_groups")
        .select("id, name, group_jid, instance_id")
        .eq("is_active", true)
        .order("name");

      if (instanceId) {
        query = query.eq("instance_id", instanceId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as WhatsAppGroup[];
    },
  });
};

// Sincronizar grupos da UAZAPI
export const useSyncWhatsAppGroups = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (instanceId: string) => {
      const { data, error } = await supabase.functions.invoke("sync-whatsapp-groups", {
        body: { instance_id: instanceId },
      });

      if (error) throw error;
      return data as { success: boolean; total: number; created: number; updated: number; errors: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["whatsapp-groups"] });
    },
  });
};

// Buscar logs do bot
export const useTaskBotLogs = (limit = 50) => {
  return useQuery({
    queryKey: ["task-bot-logs", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_task_bot_logs")
        .select(`
          *,
          group:whatsapp_groups(name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as TaskBotLog[];
    },
  });
};

// Toggle ativo/inativo
export const useToggleTaskBot = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("whatsapp_task_bot_config")
        .update({ is_active, updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["task-bot-config"] });
    },
  });
};

// Testar o bot manualmente
export const useTestTaskBot = () => {
  return useMutation({
    mutationFn: async ({
      message,
      groupId
    }: {
      message: string;
      groupId: string;
    }) => {
      const { data, error } = await supabase.functions.invoke("whatsapp-task-assistant", {
        body: {
          test: true,
          message,
          groupId,
        },
      });

      if (error) throw error;
      return data;
    },
  });
};
