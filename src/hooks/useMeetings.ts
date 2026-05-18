import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';

export interface MeetingParticipant {
  name: string;
  role?: string;
  email?: string;
}

export interface TranscriptionSegment {
  id: number;
  text: string;
  speaker: string;
  confidence: number;
  timestamp: number;
  is_final: boolean;
}

export interface SuggestedTask {
  titulo: string;
  descricao: string;
  responsavel_sugerido: string | null;
  prioridade: 'high' | 'medium' | 'low';
  prazo_sugerido: string;
  tipo_sugerido: string;
  selected?: boolean; // Para UI de seleção
}

export interface MeetingAIAnalysis {
  resumo_executivo: string;
  duracao_estimada?: string;
  participantes_identificados?: string[];
  decisoes?: Array<{
    decisao: string;
    contexto?: string;
  }>;
  tarefas_sugeridas?: SuggestedTask[];
  proximos_passos?: string[];
  pontos_importantes?: string[];
  riscos_identificados?: string[];
  sentimento_geral?: 'positivo' | 'neutro' | 'negativo' | 'misto';
  energia_reuniao?: 'produtiva' | 'moderada' | 'improdutiva';
}

export interface Meeting {
  id: string;
  title: string;
  type: 'online' | 'presencial';
  meeting_type: 'team' | 'onboarding' | 'support' | 'checkin' | 'sales' | 'internal';
  team: 'sales' | 'cs' | 'marketing' | 'internal';
  organization_id: string | null;
  lead_id: string | null;
  activity_id: string | null;
  meeting_link: string | null;
  status: 'active' | 'completed' | 'no_show' | 'cancelled' | 'processed';
  started_at: string | null;
  ended_at: string | null;
  participants: MeetingParticipant[] | null;
  transcriptions: TranscriptionSegment[] | null;
  summary: string | null;
  key_points: string[] | null;
  ai_analysis: MeetingAIAnalysis | null;
  processed_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  organization?: { id: string; name: string } | null;
  lead?: { id: string; name: string } | null;
}

export interface CreateMeetingInput {
  title: string;
  type?: 'online' | 'presencial';
  meeting_type?: Meeting['meeting_type'];
  team?: Meeting['team'];
  organization_id?: string;
  lead_id?: string;
  activity_id?: string;
  meeting_link?: string;
  participants?: MeetingParticipant[];
  created_by?: string;
}

// Buscar todas as reuniões
export const useMeetings = (filters?: {
  meeting_type?: string;
  team?: string;
  status?: string;
  created_by?: string;
}) => {
  return useQuery({
    queryKey: ['meetings', filters],
    queryFn: async () => {
      let query = supabase
        .from('meetings')
        .select(`
          *,
          organization:organizations(id, name),
          lead:leads(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.meeting_type) {
        query = query.eq('meeting_type', filters.meeting_type);
      }
      if (filters?.team) {
        query = query.eq('team', filters.team);
      }
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.created_by) {
        query = query.eq('created_by', filters.created_by);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Meeting[];
    },
  });
};

// Buscar reuniões do time (internas)
export const useTeamMeetings = () => {
  return useQuery({
    queryKey: ['team-meetings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          organization:organizations(id, name),
          lead:leads(id, name)
        `)
        .in('meeting_type', ['team', 'onboarding'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as Meeting[];
    },
  });
};

// Buscar uma reunião específica
export const useMeeting = (meetingId: string | undefined) => {
  return useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: async () => {
      if (!meetingId) return null;

      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          organization:organizations(id, name),
          lead:leads(id, name)
        `)
        .eq('id', meetingId)
        .single();

      if (error) throw error;
      return data as Meeting;
    },
    enabled: !!meetingId,
  });
};

// Criar reunião
export const useCreateMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMeetingInput) => {
      // Build insert object following Onboarding.tsx pattern
      // Note: DB constraint only allows: 'active', 'completed', 'no_show', 'cancelled', 'processed'
      const insertData: Record<string, any> = {
        title: input.title,
        type: input.type || 'online',
        meeting_type: input.meeting_type || 'team',
        team: input.team || 'internal',
        status: 'active',
        transcriptions: [],
        participants: input.participants || [],
      };

      // Only add optional fields if they have values
      if (input.organization_id) insertData.organization_id = input.organization_id;
      if (input.lead_id) insertData.lead_id = input.lead_id;
      if (input.activity_id) insertData.activity_id = input.activity_id;
      if (input.meeting_link) insertData.meeting_link = input.meeting_link;
      if (input.created_by) insertData.created_by = input.created_by;

      console.log('📝 Creating meeting:', insertData);

      const { data, error } = await supabase
        .from('meetings')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('❌ Error creating meeting:', error);
        throw error;
      }

      console.log('✅ Meeting created:', data);
      return data as Meeting;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['team-meetings'] });
    },
  });
};

// Iniciar reunião
export const useStartMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: string) => {
      const { data, error } = await supabase
        .from('meetings')
        .update({
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .eq('id', meetingId)
        .select()
        .single();

      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['team-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', data.id] });
    },
  });
};

// Encerrar reunião
export const useEndMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      status = 'completed',
      transcriptions,
    }: {
      meetingId: string;
      status?: 'completed' | 'no_show' | 'cancelled';
      transcriptions?: TranscriptionSegment[];
    }) => {
      const updateData: any = {
        status,
        ended_at: new Date().toISOString(),
      };

      if (transcriptions) {
        updateData.transcriptions = transcriptions;
      }

      const { data, error } = await supabase
        .from('meetings')
        .update(updateData)
        .eq('id', meetingId)
        .select()
        .single();

      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['team-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', data.id] });
    },
  });
};

// Processar transcrição com IA
export const useProcessMeetingTranscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      transcription,
      meetingTitle,
      participants,
    }: {
      meetingId: string;
      transcription: string;
      meetingTitle?: string;
      participants?: string[];
    }) => {
      const { data, error } = await supabase.functions.invoke('process-team-meeting', {
        body: {
          meeting_id: meetingId,
          transcription,
          meeting_title: meetingTitle,
          participants,
        },
      });

      if (error) throw error;
      return data as { success: boolean; meeting_summary: MeetingAIAnalysis };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['team-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', variables.meetingId] });
    },
  });
};

// Salvar transcrições (durante a reunião)
export const useSaveTranscriptions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      transcriptions,
    }: {
      meetingId: string;
      transcriptions: TranscriptionSegment[];
    }) => {
      const { data, error } = await supabase
        .from('meetings')
        .update({ transcriptions })
        .eq('id', meetingId)
        .select()
        .single();

      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meeting', data.id] });
    },
  });
};

// Atualizar reunião
export const useUpdateMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...updates
    }: Partial<Meeting> & { id: string }) => {
      const { data, error } = await supabase
        .from('meetings')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Meeting;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
      queryClient.invalidateQueries({ queryKey: ['team-meetings'] });
      queryClient.invalidateQueries({ queryKey: ['meeting', data.id] });
    },
  });
};

// Deletar reunião
export const useDeleteMeeting = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (meetingId: string) => {
      await deleteWithUndo({
        table: 'meetings',
        id: meetingId,
        label: 'Reunião',
        queryClient,
        queryKeys: [['meetings'], ['team-meetings']],
      });
    },
  });
};

// Buscar meetings de uma organização
export const useOrganizationMeetings = (organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['meetings', { organizationId }],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('meetings')
        .select(`
          *,
          organization:organizations(id, name),
          lead:leads(id, name)
        `)
        .eq('organization_id', organizationId!)
        .in('status', ['completed', 'processed'])
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Meeting[];
    },
    enabled: !!organizationId,
    refetchInterval: 2 * 60 * 1000, // 2 min — capta reuniões processadas em background
  });
};

// Criar tarefas a partir das sugestões da IA
export const useCreateTasksFromSuggestions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      meetingId,
      tasks,
      teamMemberId,
    }: {
      meetingId: string;
      tasks: SuggestedTask[];
      teamMemberId?: string;
    }) => {
      const tasksToCreate = tasks.map((task) => ({
        name: task.titulo,
        description: task.descricao,
        task_type: task.tipo_sugerido || 'follow_up',
        team: 'internal' as const,
        priority: task.prioridade,
        status: 'not_started' as const,
        source_type: 'meeting',
        source_id: meetingId,
        // Se tiver prazo sugerido como data, pode-se converter
        // due_datetime: task.prazo_sugerido ? parseDate(task.prazo_sugerido) : null,
      }));

      const { data, error } = await supabase
        .from('company_activities')
        .insert(tasksToCreate)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });
    },
  });
};
