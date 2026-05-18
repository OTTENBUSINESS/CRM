import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export interface TeamMember {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  team: string | null;
  phone: string | null;
  is_active: boolean;
  auth_user_id: string | null;
  whatsapp_instance_id: string | null;
  focus_mode_enabled: boolean;
  created_at: string;
  updated_at: string;
}

// Buscar membros ativos do time
export const useTeamMembers = () => {
  return useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, created_at, updated_at')
        .eq('is_active', true)
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []) as TeamMember[];
    },
  });
};

// Buscar TODOS os membros (incluindo inativos) para tela de gestão
export const useAllTeamMembers = () => {
  return useQuery({
    queryKey: ['team-members-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, team, phone, is_active, auth_user_id, whatsapp_instance_id, focus_mode_enabled, created_at, updated_at')
        .order('is_active', { ascending: false })
        .order('name', { ascending: true });

      if (error) throw error;

      return (data || []) as TeamMember[];
    },
  });
};

// Helper: call edge function
async function callManageTeamMember(action: string, payload: Record<string, unknown>) {
  const { data: result, error: invokeError } = await supabase.functions.invoke('manage-team-member', {
    body: { action, ...payload },
  });
  if (invokeError) throw invokeError;
  return result;
}

export const useCreateTeamMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; email: string; password: string; role?: string; team?: string; phone?: string }) =>
      callManageTeamMember('create', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team-members-all'] });
    },
  });
};

export const useUpdateTeamMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { member_id: string; name?: string; phone?: string; role?: string; team?: string }) =>
      callManageTeamMember('update', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team-members-all'] });
    },
  });
};

export const useToggleTeamMember = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: { member_id: string; is_active: boolean }) =>
      callManageTeamMember('toggle_active', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['team-members-all'] });
    },
  });
};

export const useResetTeamMemberPassword = () => {
  return useMutation({
    mutationFn: (data: { member_id: string; new_password: string }) =>
      callManageTeamMember('reset_password', data),
  });
};

// Buscar um membro específico por ID
export const useTeamMember = (memberId: string | undefined) => {
  return useQuery({
    queryKey: ['team-member', memberId],
    queryFn: async () => {
      if (!memberId) return null;

      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, created_at, updated_at')
        .eq('id', memberId)
        .single();

      if (error) throw error;
      return data as TeamMember;
    },
    enabled: !!memberId,
  });
};

// Buscar múltiplos membros por IDs
export const useTeamMembersByIds = (memberIds: string[] | undefined) => {
  return useQuery({
    queryKey: ['team-members-by-ids', memberIds],
    queryFn: async () => {
      if (!memberIds || memberIds.length === 0) return [];

      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, email, role, created_at, updated_at')
        .in('id', memberIds);

      if (error) throw error;
      return (data || []) as TeamMember[];
    },
    enabled: !!memberIds && memberIds.length > 0,
  });
};
