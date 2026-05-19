import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { deleteWithUndo } from "@/lib/undoable-delete";

// =====================================================
// TYPES
// =====================================================

export interface WavoipDevice {
  id: string;
  team_member_id: string;
  token: string;
  name: string;
  phone_number: string | null;
  status: string;
  webhook_configured: boolean;
  is_active: boolean;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  speaker: string;
  speakerType: 'local' | 'remote';
  confidence?: number;
  timestamp?: number;
  is_final?: boolean;
}

export interface CallHistoryRecord {
  id: string;
  wavoip_device_id: string | null;
  wavoip_call_id: string;
  wavoip_session_id: string | null;
  team_member_id: string | null;
  lead_id: string | null;
  call_type: 'whatsapp' | 'voip';
  direction: 'INCOMING' | 'OUTGOING';
  status: string;
  caller_phone: string | null;
  receiver_phone: string | null;
  peer_phone: string;
  peer_name: string | null;
  peer_profile_picture: string | null;
  duration_seconds: number;
  record_status: string | null;
  record_url: string | null;
  transcription: string | null;
  transcriptions: TranscriptionSegment[];
  ai_summary: string | null;
  ai_sentiment: 'positive' | 'neutral' | 'negative' | null;
  ai_key_points: string[];
  ai_suggested_tasks: Array<{
    titulo: string;
    descricao: string;
    prioridade: string;
    categoria: string;
  }>;
  ai_processed_at: string | null;
  ai_processing_error: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
  metadata?: Record<string, any>;
  rating: number | null;
  training_notes: string | null;
  // Relations
  lead?: {
    id: string;
    name: string;
    phone: string;
  };
  team_member?: {
    id: string;
    name: string;
  };
}

// =====================================================
// HOOKS
// =====================================================

// Buscar device do usuário
export const useWavoipDevice = (teamMemberId?: string) => {
  return useQuery({
    queryKey: ["wavoip-device", teamMemberId],
    queryFn: async () => {
      if (!teamMemberId) return null;

      const { data, error } = await supabase
        .from("wavoip_devices")
        .select("*")
        .eq("team_member_id", teamMemberId)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return data as WavoipDevice | null;
    },
    enabled: !!teamMemberId,
  });
};

// Listar todos os devices (admin)
export const useWavoipDevices = () => {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("wavoip-devices-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wavoip_devices" },
        () => {
          queryClient.invalidateQueries({ queryKey: ["wavoip-devices"] });
          queryClient.invalidateQueries({ queryKey: ["wavoip-device"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return useQuery({
    queryKey: ["wavoip-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wavoip_devices")
        .select(`
          *,
          team_member:team_members(id, name, email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

// Criar device
export const useCreateWavoipDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      teamMemberId,
      token,
      name,
    }: {
      teamMemberId: string;
      token: string;
      name?: string;
    }) => {
      const { data, error } = await supabase
        .from("wavoip_devices")
        .insert({
          team_member_id: teamMemberId,
          token,
          name: name || "Dispositivo WaVoIP",
          status: "disconnected",
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wavoip-devices"] });
      queryClient.invalidateQueries({ queryKey: ["wavoip-device"] });
    },
  });
};

// Atualizar device
export const useUpdateWavoipDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      deviceId,
      ...updates
    }: {
      deviceId: string;
      token?: string;
      name?: string;
      is_active?: boolean;
    }) => {
      const { data, error } = await supabase
        .from("wavoip_devices")
        .update(updates)
        .eq("id", deviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["wavoip-devices"] });
      queryClient.invalidateQueries({ queryKey: ["wavoip-device"] });
    },
  });
};

// Deletar device
export const useDeleteWavoipDevice = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deviceId: string) => {
      await deleteWithUndo({
        table: 'wavoip_devices',
        id: deviceId,
        label: 'Dispositivo',
        queryClient,
        queryKeys: [['wavoip-devices'], ['wavoip-device']],
      });
    },
  });
};

// Histórico de chamadas
// leadId pode ser string ou string[] (cluster de leads vinculados)
export const useCallHistory = (filters?: {
  teamMemberId?: string;
  leadId?: string;
  leadIds?: string[];
  limit?: number;
}) => {
  return useQuery({
    queryKey: ["call-history", filters],
    queryFn: async () => {
      let query = supabase
        .from("call_history")
        .select(`
          *,
          lead:leads(id, name, phone),
          team_member:team_members(id, name)
        `)
        .order("started_at", { ascending: false });

      if (filters?.teamMemberId) {
        query = query.eq("team_member_id", filters.teamMemberId);
      }

      if (filters?.leadIds && filters.leadIds.length > 1) {
        query = query.in("lead_id", filters.leadIds);
      } else if (filters?.leadId) {
        query = query.eq("lead_id", filters.leadId);
      }

      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CallHistoryRecord[];
    },
    refetchInterval: 30000, // Atualiza a cada 30s
  });
};

// Buscar chamada específica
export const useCallRecord = (callId?: string) => {
  return useQuery({
    queryKey: ["call-record", callId],
    queryFn: async () => {
      if (!callId) return null;

      const { data, error } = await supabase
        .from("call_history")
        .select(`
          *,
          lead:leads(id, name, phone, email, sales_score),
          team_member:team_members(id, name)
        `)
        .eq("id", callId)
        .single();

      if (error) throw error;
      return data as CallHistoryRecord;
    },
    enabled: !!callId,
  });
};

// Estatísticas de chamadas
export const useCallStats = (teamMemberId?: string, period: 'today' | 'week' | 'month' = 'today') => {
  return useQuery({
    queryKey: ["call-stats", teamMemberId, period],
    queryFn: async () => {
      let startDate: Date;
      const now = new Date();

      switch (period) {
        case 'today':
          startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
      }

      let query = supabase
        .from("call_history")
        .select("id, direction, duration_seconds, status, ai_sentiment")
        .gte("started_at", startDate.toISOString());

      if (teamMemberId) {
        query = query.eq("team_member_id", teamMemberId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const calls = data || [];
      const completed = calls.filter(c => c.status === 'ENDED');
      const incoming = calls.filter(c => c.direction === 'INCOMING');
      const outgoing = calls.filter(c => c.direction === 'OUTGOING');

      const totalDuration = completed.reduce((acc, c) => acc + (c.duration_seconds || 0), 0);
      const avgDuration = completed.length > 0 ? totalDuration / completed.length : 0;

      const sentiments = completed.filter(c => c.ai_sentiment);
      const positiveCount = sentiments.filter(c => c.ai_sentiment === 'positive').length;
      const negativeCount = sentiments.filter(c => c.ai_sentiment === 'negative').length;

      return {
        total: calls.length,
        completed: completed.length,
        incoming: incoming.length,
        outgoing: outgoing.length,
        totalDuration,
        avgDuration: Math.round(avgDuration),
        positiveRate: sentiments.length > 0 ? (positiveCount / sentiments.length) * 100 : 0,
        negativeRate: sentiments.length > 0 ? (negativeCount / sentiments.length) * 100 : 0,
      };
    },
    refetchInterval: 60000,
  });
};

// Reprocessar análise de chamada
export const useReprocessCallAnalysis = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (callId: string) => {
      const { data, error } = await supabase.functions.invoke('process-call-recording', {
        body: { call_id: callId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (_, callId) => {
      queryClient.invalidateQueries({ queryKey: ["call-record", callId] });
      queryClient.invalidateQueries({ queryKey: ["call-history"] });
    },
  });
};

// =====================================================
// HELPERS
// =====================================================

export function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "0:00";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function getCallStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    'NONE': 'Nenhum',
    'INCOMING_RING': 'Recebendo',
    'OUTGOING_RING': 'Chamando',
    'OUTGOING_CALLING': 'Chamando',
    'CONNECTING': 'Conectando',
    'CONNECTION_LOST': 'Conexão perdida',
    'ACTIVE': 'Em chamada',
    'HANDLED_REMOTELY': 'Atendida em outro dispositivo',
    'ENDED': 'Encerrada',
    'REJECTED': 'Rejeitada',
    'REMOTE_CALL_IN_PROGRESS': 'Chamada em outro dispositivo',
    'FAILED': 'Falhou',
    'NOT_ANSWERED': 'Não atendida',
  };
  return labels[status] || status;
}

export function getSentimentColor(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return 'text-green-600 bg-green-50';
    case 'negative':
      return 'text-red-600 bg-red-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

export function getSentimentLabel(sentiment: string | null): string {
  switch (sentiment) {
    case 'positive':
      return 'Positivo';
    case 'negative':
      return 'Negativo';
    case 'neutral':
      return 'Neutro';
    default:
      return '-';
  }
}

// =====================================================
// RATING / TRAINING HOOKS
// =====================================================

export function useRateCall() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ callId, rating, training_notes }: { callId: string; rating: number | null; training_notes?: string }) => {
      const updates: any = { rating, updated_at: new Date().toISOString() };
      if (training_notes !== undefined) updates.training_notes = training_notes;
      const { error } = await supabase
        .from('call_history')
        .update(updates)
        .eq('id', callId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record'] });
      queryClient.invalidateQueries({ queryKey: ['training-calls'] });
    },
  });
}

export function useTrainingCalls() {
  return useQuery({
    queryKey: ['training-calls'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('call_history')
        .select('*, lead:leads!call_history_lead_id_fkey(id, name, phone), team_member:team_members!call_history_team_member_id_fkey(id, name)')
        .or('rating.not.is.null,training_notes.not.is.null')
        .order('rating', { ascending: false, nullsFirst: false })
        .order('started_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []) as CallHistoryRecord[];
    },
  });
}
