import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type HealthLevel = "green" | "yellow" | "red";

export interface InstanceHealth {
  instanceId: string;
  instanceName: string;
  level: HealthLevel;
  message: string;
  /** Métricas detalhadas (admin) */
  metrics: {
    msgsLastHour: number;
    newLeadsLastHour: number;
    leadsNoReply: number;
    msgsLastMinute: number;
  };
}

const THRESHOLDS = {
  msgsPerHour:     { yellow: 20, red: 35 },
  leadsNoReply:    { yellow: 15, red: 25 },
  msgsPerMinute:   { yellow: 3,  red: 4  },
};

function calcLevel(metrics: InstanceHealth["metrics"]): { level: HealthLevel; message: string } {
  // Pior caso ganha
  if (
    metrics.msgsLastHour > THRESHOLDS.msgsPerHour.red ||
    metrics.leadsNoReply > THRESHOLDS.leadsNoReply.red ||
    metrics.msgsLastMinute > THRESHOLDS.msgsPerMinute.red
  ) {
    return { level: "red", message: "Pare agora — seu número pode ser bloqueado pelo WhatsApp. Aguarde respostas antes de enviar pra mais leads." };
  }
  if (
    metrics.msgsLastHour > THRESHOLDS.msgsPerHour.yellow ||
    metrics.leadsNoReply > THRESHOLDS.leadsNoReply.yellow ||
    metrics.msgsLastMinute > THRESHOLDS.msgsPerMinute.yellow
  ) {
    return { level: "yellow", message: "Cuidado — muitas mensagens sem resposta. Diminua o ritmo." };
  }
  return { level: "green", message: "Tudo certo — você pode continuar enviando." };
}

async function fetchInstanceHealth(instanceId: string): Promise<InstanceHealth | null> {
  if (!instanceId) return null;

  // Buscar nome e status da instância
  const { data: inst } = await supabase
    .from("whatsapp_instances")
    .select("name, status")
    .eq("id", instanceId)
    .single();

  // Se desconectada, retornar vermelho direto
  if (inst && inst.status !== "connected") {
    return {
      instanceId,
      instanceName: inst.name || instanceId,
      level: "red",
      message: `Instância desconectada — mensagens não estão sendo enviadas nem recebidas.`,
      metrics: { msgsLastHour: 0, newLeadsLastHour: 0, leadsNoReply: 0, msgsLastMinute: 0 },
    };
  }

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneMinuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();

  // 1. Msgs enviadas pra leads na última hora
  const { data: sentLastHour } = await supabase
    .from("whatsapp_messages")
    .select("lead_id")
    .eq("instance_id", instanceId)
    .eq("is_from_me", true)
    .gte("created_at", oneHourAgo);

  const msgsLastHour = sentLastHour?.length || 0;
  const uniqueLeadsSent = new Set((sentLastHour || []).map((m: any) => m.lead_id)).size;

  // 2. Leads que receberam msg mas não responderam na última hora
  const { data: receivedLastHour } = await supabase
    .from("whatsapp_messages")
    .select("lead_id")
    .eq("instance_id", instanceId)
    .eq("is_from_me", false)
    .gte("created_at", oneHourAgo);

  const leadsReplied = new Set((receivedLastHour || []).map((m: any) => m.lead_id));
  const leadsSent = new Set((sentLastHour || []).map((m: any) => m.lead_id));
  const leadsNoReply = [...leadsSent].filter((id) => !leadsReplied.has(id)).length;

  // 3. Msgs no último minuto pra leads diferentes
  const { data: sentLastMinute } = await supabase
    .from("whatsapp_messages")
    .select("lead_id")
    .eq("instance_id", instanceId)
    .eq("is_from_me", true)
    .gte("created_at", oneMinuteAgo);

  const msgsLastMinute = new Set((sentLastMinute || []).map((m: any) => m.lead_id)).size;

  const metrics = {
    msgsLastHour,
    newLeadsLastHour: uniqueLeadsSent,
    leadsNoReply,
    msgsLastMinute,
  };

  const { level, message } = calcLevel(metrics);

  return {
    instanceId,
    instanceName: inst?.name || instanceId,
    level,
    message,
    metrics,
  };
}

/**
 * Hook que monitora a "saúde" de envio de uma instância WhatsApp.
 * Atualiza a cada 30s.
 */
export function useInstanceHealth(instanceId: string | undefined | null) {
  return useQuery({
    queryKey: ["instance-health", instanceId],
    queryFn: () => fetchInstanceHealth(instanceId!),
    enabled: !!instanceId,
    refetchInterval: 30000, // 30s
    staleTime: 15000,
  });
}

/**
 * Hook que monitora todas as instâncias ativas (pra admin).
 */
export function useAllInstancesHealth() {
  return useQuery({
    queryKey: ["all-instances-health"],
    queryFn: async () => {
      const { data: instances } = await supabase
        .from("whatsapp_instances")
        .select("id, name")
        .not("metadata->>disabled", "eq", "true")
        .neq("metadata->>type", "cloud_api"); // Cloud API não precisa monitorar

      if (!instances || instances.length === 0) return [];

      const results = await Promise.all(
        instances.map((inst: any) => fetchInstanceHealth(inst.id))
      );
      return results.filter(Boolean) as InstanceHealth[];
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}
