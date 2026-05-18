import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export type MemberRole = 'sponsor' | 'champion' | 'executor' | 'viewer';
export type MemberStatus = 'active' | 'invited' | 'inactive' | 'removed';

export interface OrganizationMember {
  id: string;
  organization_id: string;
  contact_id: string;
  user_id: string | null;
  role: MemberRole;
  job_title: string | null;
  is_admin: boolean;
  can_invite: boolean;
  status: MemberStatus;
  invited_by: string | null;
  invited_at: string | null;
  joined_at: string | null;
  whatsapp_in_group: boolean;
  whatsapp_added_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  contact?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    avatar_url?: string;
    instagram?: string;
  };
  // Engagement data (calculated)
  engagement?: {
    last_login: string | null;
    sessions_last_7d: number;
    lessons_watched: number;
    lessons_completed: number;
    time_minutes_last_7d: number;
    engagement_score: number;
  };
}

export interface CreateMemberInput {
  organization_id: string;
  contact_id: string;
  role: MemberRole;
  job_title?: string;
  is_admin?: boolean;
}

export interface UpdateMemberInput {
  id: string;
  role?: MemberRole;
  job_title?: string;
  is_admin?: boolean;
  status?: MemberStatus;
}

// Buscar membros de uma organização
export const useOrganizationMembers = (organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];

      // Buscar membros com dados do contato
      const { data: members, error } = await supabase
        .from('organization_members')
        .select(`
          *,
          contact:leads!organization_members_contact_id_fkey(
            id, name, email, phone, instagram
          )
        `)
        .eq('organization_id', organizationId)
        .neq('status', 'removed')
        .order('role', { ascending: true });

      if (error) {
        console.error('Error fetching members');
        throw error;
      }

      // Buscar dados de engajamento para cada membro
      const memberIds = (members || []).map(m => m.contact_id);
      
      if (memberIds.length === 0) return [];

      // Buscar atividade dos últimos 7 dias
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: activities } = await supabase
        .from('member_daily_activity')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('activity_date', sevenDaysAgo.toISOString().split('T')[0]);

      // Buscar progresso de aulas
      const { data: lessonsProgress } = await supabase
        .from('member_lessons_progress')
        .select('*')
        .in('lead_id', memberIds);

      // Agregar dados de engajamento por membro
      const engagementMap: Record<string, any> = {};
      
      (activities || []).forEach((activity: any) => {
        const key = activity.lead_id || activity.member_email;
        if (!engagementMap[key]) {
          engagementMap[key] = {
            last_login: activity.activity_date,
            sessions_last_7d: 0,
            time_minutes_last_7d: 0,
            lessons_watched: 0,
            lessons_completed: 0,
          };
        }
        engagementMap[key].sessions_last_7d += activity.sessions || 0;
        engagementMap[key].time_minutes_last_7d += activity.time_minutes || 0;
        engagementMap[key].lessons_watched += activity.lessons_watched || 0;
        engagementMap[key].lessons_completed += activity.lessons_completed || 0;
        
        if (activity.activity_date > engagementMap[key].last_login) {
          engagementMap[key].last_login = activity.activity_date;
        }
      });

      // Calcular engagement score (0-100)
      const calculateEngagementScore = (engagement: any) => {
        if (!engagement) return 0;
        
        let score = 0;
        // Sessões (max 30 pontos)
        score += Math.min(engagement.sessions_last_7d * 5, 30);
        // Tempo (max 30 pontos)
        score += Math.min(engagement.time_minutes_last_7d / 10, 30);
        // Aulas assistidas (max 20 pontos)
        score += Math.min(engagement.lessons_watched * 4, 20);
        // Aulas completadas (max 20 pontos)
        score += Math.min(engagement.lessons_completed * 5, 20);
        
        return Math.round(Math.min(score, 100));
      };

      // Combinar dados
      return (members || []).map((member: any) => {
        const engagement = engagementMap[member.contact_id] || {
          last_login: null,
          sessions_last_7d: 0,
          time_minutes_last_7d: 0,
          lessons_watched: 0,
          lessons_completed: 0,
        };
        
        return {
          ...member,
          engagement: {
            ...engagement,
            engagement_score: calculateEngagementScore(engagement),
          },
        } as OrganizationMember;
      });
    },
    enabled: !!organizationId,
  });
};

// Adicionar membro
export const useAddMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateMemberInput & { 
      createInPain?: boolean;
      sendWelcome?: boolean;
      addToWhatsApp?: boolean;
    }) => {
      const { createInPain, sendWelcome = true, addToWhatsApp = true, ...memberInput } = input;
      
      // 1. Inserir membro na tabela organization_members
      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          ...memberInput,
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .select(`
          *,
          contact:leads!organization_members_contact_id_fkey(id, name, email, phone, instagram)
        `)
        .single();

      if (error) throw error;

      // 2. Se createInPain = true, criar usuário na área de membros
      if (createInPain && data.contact?.email) {
        try {
          // Buscar dados da organização
          const { data: org } = await (supabase as any)
            .from('organizations')
            .select('id, name')
            .eq('id', input.organization_id)
            .single();

          const fullName = data.contact.name || '';
          const firstName = fullName.split(' ')[0] || '';

          const webhookPayload = {
            organization_id: org?.id,
            organization_name: org?.name,
            product_id: 'pain',
            plan: 'basic',
            seats_limit: 10,
            members: [{
              email: data.contact.email,
              full_name: fullName,
              first_name: firstName,
              photo: null,
              phone: data.contact.phone || null,
              role: input.role || 'executor',
              job_title: input.job_title || null,
            }],
            add_to_whatsapp: addToWhatsApp,
            send_welcome: sendWelcome,
            skip_user_creation: false,
            notes: `Membro adicionado manualmente via CS`,
          };

          const { data: webhookResult, error: webhookError } = await supabase.functions.invoke('proxy-pain-webhook', {
            body: { action: 'onboarding-webhook', payload: webhookPayload },
          });

          if (webhookError || !webhookResult?.success) {
            console.error('Error creating user in PAIN');
            // Não lança erro, apenas loga - o membro foi criado localmente
          }

          // Se add_to_whatsapp e tem telefone, usar nossa Edge Function local
          // (mais confiável que depender do webhook do PAIN)
          if (addToWhatsApp && data.contact?.phone) {
            try {
              const whatsappResponse = await fetch(
                'https://YOUR_PROJECT_REF.supabase.co/functions/v1/whatsapp-group',
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    phone: data.contact.phone,
                    memberName: data.contact.name,
                    memberId: data.id,
                    action: 'add',
                  }),
                }
              );
              await whatsappResponse.json();
            } catch (whatsappError) {
              console.error('Error adding to WhatsApp group');
            }
          }
        } catch (painError) {
          console.error('Error calling PAIN webhook');
          // Não lança erro, apenas loga - o membro foi criado localmente
        }
      }

      return data as OrganizationMember;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', data.organization_id] });
    },
  });
};

// Atualizar membro
export const useUpdateMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateMemberInput) => {
      const { id, ...updates } = input;
      
      const { data, error } = await supabase
        .from('organization_members')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select(`
          *,
          contact:leads!organization_members_contact_id_fkey(id, name, email, phone)
        `)
        .single();

      if (error) throw error;
      return data as OrganizationMember;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', data.organization_id] });
    },
  });
};

// Remover membro
export const useRemoveMember = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, organizationId }: { memberId: string; organizationId: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('id', memberId);

      if (error) throw error;
      return { memberId, organizationId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', data.organizationId] });
    },
  });
};

// Buscar leads disponíveis para adicionar como membro
export const useAvailableLeads = (organizationId: string | undefined, searchTerm: string) => {
  return useQuery({
    queryKey: ['available-leads', organizationId, searchTerm],
    queryFn: async () => {
      if (!organizationId || searchTerm.length < 2) return [];

      // Buscar membros atuais para excluir
      const { data: currentMembers } = await supabase
        .from('organization_members')
        .select('contact_id')
        .eq('organization_id', organizationId)
        .neq('status', 'removed');

      const excludeIds = (currentMembers || []).map(m => m.contact_id);

      // Buscar leads que correspondem à busca
      let query = supabase
        .from('leads')
        .select('id, name, email, phone, instagram')
        .or(`name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
        .limit(10);

      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!organizationId && searchTerm.length >= 2,
  });
};

// Mover lead para organização (transformar em membro)
export const useMoveLeadToOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      leadId, 
      targetOrganizationId, 
      role,
      sourceOrganizationId,
    }: { 
      leadId: string; 
      targetOrganizationId: string; 
      role: MemberRole;
      sourceOrganizationId?: string;
    }) => {
      // Se o lead era primary_contact de outra org, remover essa referência
      if (sourceOrganizationId) {
        await supabase
          .from('organizations')
          .update({ primary_contact_id: null })
          .eq('id', sourceOrganizationId)
          .eq('primary_contact_id', leadId);
      }

      // Adicionar como membro da nova organização
      const { data, error } = await supabase
        .from('organization_members')
        .insert({
          organization_id: targetOrganizationId,
          contact_id: leadId,
          role,
          status: 'active',
          joined_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
};

// Helper: Obter cor e label do papel
export const getRoleInfo = (role: MemberRole) => {
  const roles = {
    sponsor: { 
      label: 'Sponsor', 
      description: 'Decisor/Pagador',
      color: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
      icon: '👑',
    },
    champion: { 
      label: 'Champion', 
      description: 'Defensor interno',
      color: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      icon: '⭐',
    },
    executor: { 
      label: 'Executor', 
      description: 'Usuário ativo',
      color: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      icon: '🎯',
    },
    viewer: { 
      label: 'Viewer', 
      description: 'Apenas visualiza',
      color: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
      icon: '👁️',
    },
  };
  return roles[role] || roles.executor;
};

// Helper: Obter cor do engagement score
export const getEngagementColor = (score: number) => {
  if (score >= 70) return 'text-cs-healthy';
  if (score >= 40) return 'text-cs-alert';
  return 'text-cs-risk';
};

// Helper: Obter label do status
export const getStatusInfo = (status: MemberStatus) => {
  const statuses = {
    active: { label: 'Ativo', color: 'bg-green-500/10 text-green-500' },
    invited: { label: 'Convidado', color: 'bg-blue-500/10 text-blue-500' },
    inactive: { label: 'Inativo', color: 'bg-gray-500/10 text-gray-500' },
    removed: { label: 'Removido', color: 'bg-red-500/10 text-red-500' },
  };
  return statuses[status] || statuses.active;
};

// Buscar organizações disponíveis para absorver como membro
export const useAvailableOrganizations = (currentOrgId: string | undefined, searchTerm: string) => {
  return useQuery({
    queryKey: ['available-organizations', currentOrgId, searchTerm],
    queryFn: async () => {
      if (!currentOrgId || searchTerm.length < 2) return [];

      const { data, error } = await supabase
        .from('organizations')
        .select(`
          id, 
          name, 
          primary_contact_id,
          primary_contact:leads!organizations_primary_contact_id_fkey(id, name, email, phone)
        `)
        .neq('id', currentOrgId)
        .ilike('name', `%${searchTerm}%`)
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    enabled: !!currentOrgId && searchTerm.length >= 2,
  });
};

// Absorver organização como membro (transforma org em membro de outra)
export const useAbsorbOrganization = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      sourceOrgId, 
      targetOrgId, 
      role,
    }: { 
      sourceOrgId: string; 
      targetOrgId: string; 
      role: MemberRole;
    }) => {
      // 1. Buscar o primary_contact da org de origem
      const { data: sourceOrg, error: sourceError } = await supabase
        .from('organizations')
        .select('primary_contact_id, name')
        .eq('id', sourceOrgId)
        .single();

      if (sourceError) throw sourceError;
      if (!sourceOrg.primary_contact_id) {
        throw new Error('Organização não tem contato principal definido');
      }

      // 2. Adicionar o primary_contact como membro da org de destino
      const { error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: targetOrgId,
          contact_id: sourceOrg.primary_contact_id,
          role,
          status: 'active',
          joined_at: new Date().toISOString(),
        });

      if (memberError) throw memberError;

      // 3. Marcar a org de origem como inativa/absorvida (opcional)
      await supabase
        .from('organizations')
        .update({ 
          status: 'churned',
          churn_reason: `Absorvida pela organização (membro)`,
          churned_at: new Date().toISOString(),
        })
        .eq('id', sourceOrgId);

      return { sourceOrgId, targetOrgId, contactId: sourceOrg.primary_contact_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', data.targetOrgId] });
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
    },
  });
};
