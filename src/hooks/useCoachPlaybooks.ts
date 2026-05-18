import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type {
  CoachPlaybook,
  CoachSession,
  CreatePlaybookInput,
  UpdatePlaybookInput,
  PlaybookType,
  StartCoachSessionInput,
} from '@/types/coach.types';

// =====================================================
// PLAYBOOKS
// =====================================================

// Fetch all active playbooks
export const useCoachPlaybooks = (type?: PlaybookType) => {
  return useQuery({
    queryKey: ['coach-playbooks', type],
    queryFn: async () => {
      let query = supabase
        .from('coach_playbooks')
        .select('*')
        .eq('is_active', true)
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (type) {
        query = query.eq('type', type);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as CoachPlaybook[];
    },
  });
};

// Fetch all playbooks (including inactive) for admin
export const useAllCoachPlaybooks = () => {
  return useQuery({
    queryKey: ['coach-playbooks-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_playbooks')
        .select('*')
        .order('type', { ascending: true })
        .order('is_default', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;
      return (data || []) as CoachPlaybook[];
    },
  });
};

// Fetch single playbook
export const useCoachPlaybook = (playbookId: string | undefined) => {
  return useQuery({
    queryKey: ['coach-playbook', playbookId],
    queryFn: async () => {
      if (!playbookId) return null;

      const { data, error } = await supabase
        .from('coach_playbooks')
        .select('*')
        .eq('id', playbookId)
        .single();

      if (error) throw error;
      return data as CoachPlaybook;
    },
    enabled: !!playbookId,
  });
};

// Get default playbook for type
export const useDefaultPlaybook = (type: PlaybookType) => {
  return useQuery({
    queryKey: ['coach-playbook-default', type],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_playbooks')
        .select('*')
        .eq('type', type)
        .eq('is_default', true)
        .eq('is_active', true)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as CoachPlaybook | null;
    },
  });
};

// Create playbook
export const useCreateCoachPlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePlaybookInput) => {
      // If setting as default, unset other defaults of same type
      if (input.is_default) {
        await supabase
          .from('coach_playbooks')
          .update({ is_default: false })
          .eq('type', input.type);
      }

      const { data, error } = await supabase
        .from('coach_playbooks')
        .insert({
          ...input,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CoachPlaybook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks-all'] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbook-default'] });
    },
  });
};

// Update playbook
export const useUpdateCoachPlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdatePlaybookInput) => {
      const { id, ...updates } = input;

      // If setting as default, unset other defaults of same type
      if (updates.is_default && updates.type) {
        await supabase
          .from('coach_playbooks')
          .update({ is_default: false })
          .eq('type', updates.type);
      }

      const { data, error } = await supabase
        .from('coach_playbooks')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as CoachPlaybook;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks-all'] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbook', data.id] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbook-default'] });
    },
  });
};

// Delete playbook (soft delete)
export const useDeleteCoachPlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playbookId: string) => {
      await deleteWithUndo({
        table: 'coach_playbooks',
        id: playbookId,
        label: 'Playbook',
        queryClient,
        queryKeys: [['coach-playbooks'], ['coach-playbooks-all']],
        softDelete: true,
      });
    },
  });
};

// Duplicate playbook
export const useDuplicateCoachPlaybook = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (playbookId: string) => {
      // Fetch original
      const { data: original, error: fetchError } = await supabase
        .from('coach_playbooks')
        .select('*')
        .eq('id', playbookId)
        .single();

      if (fetchError) throw fetchError;

      // Create copy
      const { data, error } = await supabase
        .from('coach_playbooks')
        .insert({
          name: `${original.name} (Cópia)`,
          type: original.type,
          description: original.description,
          context: original.context,
          phases: original.phases,
          is_default: false,
          is_active: true,
          organization_id: original.organization_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data as CoachPlaybook;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks'] });
      queryClient.invalidateQueries({ queryKey: ['coach-playbooks-all'] });
    },
  });
};

// =====================================================
// COACH SESSIONS
// =====================================================

// Start a new coach session
export const useStartCoachSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: StartCoachSessionInput) => {
      const { data: user } = await supabase.auth.getUser();

      // Get team_member_id from current user
      const { data: teamMember } = await supabase
        .from('team_members')
        .select('id')
        .eq('user_id', user.user?.id)
        .single();

      const { data, error } = await supabase
        .from('coach_sessions')
        .insert({
          playbook_id: input.playbookId || null,
          lead_id: input.leadId || null,
          call_id: input.callId || null,
          team_member_id: teamMember?.id || null,
          current_phase_index: 0,
          checklist_state: {},
          events: [],
          started_at: new Date().toISOString(),
        })
        .select(`
          *,
          playbook:coach_playbooks(*)
        `)
        .single();

      if (error) throw error;
      return data as CoachSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-sessions'] });
    },
  });
};

// Update coach session (phase change, checklist, etc.)
export const useUpdateCoachSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      sessionId,
      updates,
    }: {
      sessionId: string;
      updates: Partial<{
        current_phase_index: number;
        checklist_state: Record<string, string>;
        events: CoachSession['events'];
        phases_completed: number;
        alerts_triggered: number;
        suggestions_shown: number;
        briefing: string;
      }>;
    }) => {
      const { data, error } = await supabase
        .from('coach_sessions')
        .update(updates)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as CoachSession;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['coach-session', data.id] });
    },
  });
};

// End coach session
export const useEndCoachSession = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase
        .from('coach_sessions')
        .update({
          ended_at: new Date().toISOString(),
        })
        .eq('id', sessionId)
        .select()
        .single();

      if (error) throw error;
      return data as CoachSession;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coach-sessions'] });
    },
  });
};

// Get coach session
export const useCoachSession = (sessionId: string | undefined) => {
  return useQuery({
    queryKey: ['coach-session', sessionId],
    queryFn: async () => {
      if (!sessionId) return null;

      const { data, error } = await supabase
        .from('coach_sessions')
        .select(`
          *,
          playbook:coach_playbooks(*),
          lead:leads(id, name, company)
        `)
        .eq('id', sessionId)
        .single();

      if (error) throw error;
      return data as CoachSession;
    },
    enabled: !!sessionId,
  });
};

// Get recent sessions for stats
export const useRecentCoachSessions = (limit = 10) => {
  return useQuery({
    queryKey: ['coach-sessions-recent', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('coach_sessions')
        .select(`
          *,
          playbook:coach_playbooks(id, name, type),
          lead:leads(id, name)
        `)
        .order('started_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data || []) as CoachSession[];
    },
  });
};
