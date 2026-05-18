import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

// Tipos do Onboarding
export interface OnboardingDossier {
  cliente?: {
    nome?: string;
    email?: string;
    telefone?: string;
    empresa?: string;
    cargo?: string;
    segmento?: string;
    website?: string;
    instagram?: string;
    funcionarios?: string;
    faturamento?: string;
    como_conheceu?: string;
  };
  contexto?: {
    tempo_mercado?: string;
    tamanho_equipe?: string;
    faturamento?: string;
    ferramentas_atuais?: string[];
    principais_dores?: string[];
    descricao_negocio?: string;
    motivacao?: string;
    gargalo_principal?: string;
    meta_30_dias?: string;
    meta_90_dias?: string;
  };
  processo?: {
    fontes_leads?: string[];
    canais_venda?: string[];
  };
  ferramentas?: {
    crm?: string;
    whatsapp_tipo?: string;
    erp?: string;
    suporte?: string;
  };
  execucao?: {
    executor?: string;
    familiaridade_ia?: string;
  };
  objetivos?: Array<{
    titulo: string;
    descricao?: string;
    prioridade?: number;
    prazo_sugerido?: string;
  }>;
  trilhas_recomendadas?: Array<{
    id: string;
    nome: string;
    motivo?: string;
  }>;
  membros_mencionados?: Array<{
    nome: string;
    cargo?: string;
    papel?: string;
  }>;
  recursos_sugeridos?: Array<{
    type: 'tool' | 'coupon';
    title: string;
    description?: string;
    link?: string;
    coupon_code?: string;
    icon?: string;
    color?: string;
  }>;
  notas_cs?: string;
  sentimento?: 'positivo' | 'neutro' | 'negativo';
  nivel_engajamento?: 'alto' | 'medio' | 'baixo';
  risco_churn?: 'alto' | 'medio' | 'baixo';
}

export interface OnboardingMember {
  name: string;
  email: string;
  phone?: string;
  role?: string;
  job_title?: string;
}

export interface OnboardingJourneyConfig {
  objetivos?: Array<{
    titulo: string;
    descricao?: string;
    prioridade?: number;
  }>;
  trilhas?: string[];
  recursos?: Array<{
    tipo: string;
    nome: string;
    codigo?: string;
  }>;
}

export type OnboardingStatus = 
  | 'draft' 
  | 'pending_review' 
  | 'pending_client' 
  | 'client_completed' 
  | 'approved' 
  | 'rejected';

export interface Onboarding {
  id: string;
  organization_id: string | null;
  meeting_id: string | null;
  activity_id: string | null;
  product_id: string;
  status: OnboardingStatus;
  transcription_source: 'meeting' | 'manual' | 'zoom' | 'vtt' | null;
  transcription_raw: string | null;
  dossier: OnboardingDossier;
  form_token: string | null;
  form_url: string | null;
  form_sent_at: string | null;
  form_opened_at: string | null;
  form_completed_at: string | null;
  confirmed_data: Record<string, any>;
  additional_members: OnboardingMember[];
  plan: string;
  seats_limit: number;
  add_to_whatsapp: boolean;
  send_welcome: boolean;
  journey_config: OnboardingJourneyConfig;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  webhook_response: Record<string, any> | null;
  external_org_id: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  // Joins
  organization?: { id: string; name: string; slug: string };
  meeting?: { id: string; title: string; transcriptions: any[] };
  activity?: { id: string; name: string; status: string };
  creator?: { id: string; name: string };
  approver?: { id: string; name: string };
}

// Hook: Listar todos os onboardings
export const useOnboardings = (filters?: { status?: OnboardingStatus; product_id?: string }) => {
  return useQuery({
    queryKey: ['onboardings', filters],
    queryFn: async () => {
      let query = supabase
        .from('onboardings')
        .select(`
          *,
          organization:organizations(id, name, slug),
          meeting:meetings(id, title, transcriptions),
          activity:company_activities(id, name, status),
          creator:team_members!onboardings_created_by_fkey(id, name),
          approver:team_members!onboardings_approved_by_fkey(id, name)
        `)
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.product_id) {
        query = query.eq('product_id', filters.product_id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Onboarding[];
    },
  });
};

// Hook: Buscar onboarding por ID
export const useOnboarding = (id: string | undefined) => {
  return useQuery({
    queryKey: ['onboarding', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select(`
          *,
          organization:organizations(id, name, slug, primary_contact_id),
          meeting:meetings(id, title, transcriptions, summary, key_points),
          activity:company_activities(id, name, status, scheduled_at),
          creator:team_members!onboardings_created_by_fkey(id, name),
          approver:team_members!onboardings_approved_by_fkey(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Onboarding;
    },
    enabled: !!id,
  });
};

// Hook: Buscar onboardings por organização
export const useOrganizationOnboardings = (organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['organization-onboardings', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select(`
          *,
          meeting:meetings(id, title, started_at, ended_at),
          activity:company_activities(id, name, status)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as Onboarding[];
    },
    enabled: !!organizationId,
  });
};

// Hook: Buscar onboarding mais recente por organização (para aba de Objetivos)
export const useOnboardingByOrganization = (organizationId: string | undefined) => {
  return useQuery({
    queryKey: ['onboarding-by-org', organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('onboardings')
        .select(`
          *,
          organization:organizations(id, name, slug),
          meeting:meetings(id, title, transcriptions)
        `)
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
      return data as Onboarding | null;
    },
    enabled: !!organizationId,
  });
};

// Hook: Buscar onboarding por form_token (para página pública — usa RPC segura)
export const useOnboardingByToken = (token: string | undefined) => {
  return useQuery({
    queryKey: ['onboarding-token', token],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_onboarding_by_token', { p_token: token! });

      if (error) throw error;
      if (!data) throw new Error('Onboarding not found');
      return data as Onboarding;
    },
    enabled: !!token,
  });
};

// Hook: Criar onboarding (ou atualizar se já existir para mesma org/produto)
export const useCreateOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      organization_id: string;
      product_id?: string;
      meeting_id?: string;
      activity_id?: string;
      transcription_source?: 'meeting' | 'manual' | 'zoom' | 'vtt';
      transcription_raw?: string;
      created_by?: string;
    }) => {
      const productId = data.product_id || 'pain';
      
      console.log('🔧 useCreateOnboarding - Dados recebidos:', {
        organization_id: data.organization_id,
        transcription_raw_length: data.transcription_raw?.length,
        transcription_raw_preview: data.transcription_raw?.substring(0, 100),
      });
      
      // Verificar se já existe um onboarding draft/pending para essa org/produto
      const { data: existing } = await (supabase as any)
        .from('onboardings')
        .select('*')
        .eq('organization_id', data.organization_id)
        .eq('product_id', productId)
        .in('status', ['draft', 'pending_review', 'pending_client'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (existing) {
        console.log('🔄 Atualizando onboarding existente:', existing.id, 'status atual:', existing.status);
        // Atualizar o existente com nova transcrição
        // NÃO alterar o status - manter o status atual para não resetar para draft
        const { data: updated, error } = await (supabase as any)
          .from('onboardings')
          .update({
            meeting_id: data.meeting_id,
            activity_id: data.activity_id,
            transcription_source: data.transcription_source,
            transcription_raw: data.transcription_raw,
            // status: NÃO alterar - manter o status atual
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        console.log('✅ Onboarding atualizado, transcription_raw length:', updated?.transcription_raw?.length);
        return updated as Onboarding;
      }

      console.log('🆕 Criando novo onboarding');
      // Criar novo
      const { data: created, error } = await (supabase as any)
        .from('onboardings')
        .insert({
          ...data,
          status: 'draft',
          product_id: productId,
        })
        .select()
        .single();

      if (error) throw error;
      console.log('✅ Onboarding criado, transcription_raw length:', created?.transcription_raw?.length);
      return created as Onboarding;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.organization_id] });
    },
  });
};

// Hook: Atualizar onboarding
export const useUpdateOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string } & Partial<Onboarding>) => {
      const { data: updated, error } = await supabase
        .from('onboardings')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return updated as Onboarding;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.organization_id] });
    },
  });
};

// Hook: Salvar dossiê
export const useSaveDossier = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, dossier }: { id: string; dossier: OnboardingDossier }) => {
      const { data, error } = await supabase
        .from('onboardings')
        .update({ 
          dossier,
          status: 'pending_review',
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Onboarding;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.organization_id] });
    },
  });
};

// Hook: Gerar e enviar link do formulário
export const useSendFormLink = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      // Gerar token único
      const token = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
      const appUrl = import.meta.env.VITE_APP_URL || window.location.origin;
      const formUrl = `${appUrl}/onboarding/${token}`;

      const { data, error } = await supabase
        .from('onboardings')
        .update({ 
          form_token: token,
          form_url: formUrl,
          form_sent_at: new Date().toISOString(),
          status: 'pending_client',
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Onboarding;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.organization_id] });
    },
  });
};

// Hook: Cliente completa formulário (usado na página pública)
export const useCompleteOnboardingForm = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      token, 
      confirmed_data, 
      additional_members 
    }: { 
      token: string; 
      confirmed_data: Record<string, any>;
      additional_members?: OnboardingMember[];
    }) => {
      const { data, error } = await supabase.rpc('complete_onboarding_by_token', {
        p_token: token,
        p_confirmed_data: confirmed_data,
        p_additional_members: additional_members || [],
      });

      if (error) throw error;
      return { ...data, form_token: token } as any;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-token', variables.token] });
    },
  });
};

// Webhook da Área de Membros via proxy (secret fica no server)
const PROXY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proxy-pain-webhook`;

// Hook: Aprovar onboarding e criar acesso na área de membros
export const useApproveOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      approved_by,
      plan,
      seats_limit,
      add_to_whatsapp,
      send_welcome,
      skip_user_creation,
      journey_config,
    }: { 
      id: string;
      approved_by: string;
      plan?: string;
      seats_limit?: number;
      add_to_whatsapp?: boolean;
      send_welcome?: boolean;
      skip_user_creation?: boolean;
      journey_config?: OnboardingJourneyConfig;
    }) => {
      // 1. Buscar dados completos do onboarding com lead
      const { data: onboarding, error: fetchError } = await (supabase as any)
        .from('onboardings')
        .select(`
          *,
          organization:organizations(*, primary_contact:leads!organizations_primary_contact_id_fkey(id, name, email, phone, instagram))
        `)
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // 2. Preparar dados para o webhook
      const confirmedData = onboarding.confirmed_data || {};
      const dossier = onboarding.dossier || {};
      const additionalMembers = onboarding.additional_members || [];
      const primaryContact = onboarding.organization?.primary_contact;

      // 2.1 Buscar foto do Instagram
      let photoUrl: string | null = null;
      
      if (primaryContact?.instagram) {
        // Buscar foto do perfil do Instagram
        const instagramUsername = primaryContact.instagram.replace('@', '').trim();
        const { data: instagramProfile } = await (supabase as any)
          .from('instagram_profiles')
          .select('stored_profile_picture_url, profile_picture_url_hd')
          .eq('username', instagramUsername)
          .single();
        
        if (instagramProfile) {
          photoUrl = instagramProfile.stored_profile_picture_url || instagramProfile.profile_picture_url_hd || null;
        }
      }

      // Extrair primeiro nome do nome completo
      const fullName = confirmedData.contact_name || primaryContact?.name || '';
      const firstName = fullName.split(' ')[0] || '';

      // Membro principal (contato do onboarding)
      const mainMember = {
        email: confirmedData.contact_email || primaryContact?.email,
        full_name: fullName,
        first_name: firstName,
        photo: photoUrl,
        phone: confirmedData.contact_whatsapp || primaryContact?.phone,
        role: 'executor' as const,
        job_title: confirmedData.job_title || null,
      };

      // Membros adicionais
      const members = [
        mainMember,
        ...additionalMembers.map((m: OnboardingMember) => ({
          email: m.email,
          full_name: m.name,
          first_name: m.name?.split(' ')[0] || '',
          photo: null,
          phone: m.phone || null,
          role: m.role || 'executor',
          job_title: m.job_title || null,
        })),
      ].filter(m => m.email && m.full_name);

      // Preparar jornada personalizada baseada no dossiê
      // Usar objetivos do dossiê se não houver journey_config
      const dossierObjetivos = dossier.objetivos || [];
      const dossierTrilhas = dossier.trilhas_recomendadas || [];
      const dossierResources = dossier.recursos_sugeridos || [];
      
      // Extrair IDs das trilhas do dossiê
      const trackIds = dossierTrilhas.map(t => t.id).filter(Boolean);
      
      // Montar jornada com dados do dossiê ou journey_config
      const hasJourneyData = journey_config?.objectives?.length || dossierObjetivos.length > 0 || trackIds.length > 0 || dossierResources.length > 0;
      
      const journey = hasJourneyData ? {
        title: journey_config?.title || 'Primeiros 30 dias',
        description: journey_config?.description || `Jornada personalizada para ${confirmedData.company_name || onboarding.organization?.name}`,
        objectives: (journey_config?.objectives || dossierObjetivos).map(obj => ({
          title: obj.titulo || obj.title,
          description: obj.descricao || obj.description,
        })),
        tracks: journey_config?.tracks?.length ? journey_config.tracks : trackIds,
        resources: journey_config?.resources?.length ? journey_config.resources : dossierResources,
      } : undefined;

      // 3. Chamar webhook da área de membros
      console.log('🚀 Chamando webhook PAIN para criar acesso...');
      const webhookPayload = {
        organization_id: onboarding.organization?.id, // ID da organização existente (não criar nova)
        organization_name: confirmedData.company_name || onboarding.organization?.name,
        product_id: onboarding.product_id || 'pain',
        plan: plan || 'basic',
        seats_limit: seats_limit || 5,
        members,
        add_to_whatsapp: add_to_whatsapp ?? true,
        send_welcome: send_welcome ?? true,
        skip_user_creation: skip_user_creation ?? false, // Se true, não cria usuário (já tem acesso)
        notes: `Onboarding CS - ID: ${id}`,
        ...(journey && { journey }),
      };

      console.log('📦 Payload do webhook:', JSON.stringify(webhookPayload, null, 2));

      const { data: { session } } = await supabase.auth.getSession();
      const webhookResponse = await fetch(PROXY_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ action: 'onboarding-webhook', payload: webhookPayload }),
      });

      const webhookResult = await webhookResponse.json();
      console.log('📬 Resposta do webhook:', webhookResult);

      if (!webhookResponse.ok || !webhookResult.success) {
        throw new Error(webhookResult.error || 'Erro ao criar acesso na área de membros');
      }

      // 3.5. Sync objetivos do dossier → cs_objectives
      if (dossier?.objetivos?.length > 0 && onboarding.organization_id) {
        // Buscar product_id do org_product principal
        const { data: orgProducts } = await (supabase as any)
          .from('organization_products')
          .select('product_id')
          .eq('organization_id', onboarding.organization_id)
          .eq('cs_status', 'active')
          .limit(1);

        const productId = orgProducts?.[0]?.product_id || 'pain';

        // Verificar se já existem objetivos de onboarding para evitar duplicatas
        const { data: existingObjs } = await (supabase as any)
          .from('cs_objectives')
          .select('id')
          .eq('organization_id', onboarding.organization_id)
          .contains('metadata', { source: 'onboarding' })
          .limit(1);

        if (!existingObjs || existingObjs.length === 0) {
          const objectivesToInsert = dossier.objetivos.map((obj: any) => {
            // Calcular deadline a partir de prazo_sugerido (ex: "30 dias", "90 dias")
            let deadline = null;
            if (obj.prazo_sugerido) {
              const daysMatch = obj.prazo_sugerido.match(/(\d+)/);
              if (daysMatch) {
                const days = parseInt(daysMatch[1]);
                const d = new Date();
                d.setDate(d.getDate() + days);
                deadline = d.toISOString().split('T')[0];
              }
            }

            return {
              organization_id: onboarding.organization_id,
              product_id: productId,
              description: obj.descricao
                ? `${obj.titulo} — ${obj.descricao}`
                : obj.titulo,
              deadline,
              days_target: obj.prazo_sugerido ? parseInt(obj.prazo_sugerido.match(/(\d+)/)?.[1] || '90') : 90,
              status: 'pending' as const,
              metadata: {
                source: 'onboarding',
                priority: obj.prioridade === 1 ? 'high' : obj.prioridade === 2 ? 'medium' : 'low',
              },
            };
          });

          const { error: objError } = await (supabase as any)
            .from('cs_objectives')
            .insert(objectivesToInsert);

          if (objError) {
            console.warn('⚠️ Erro ao sincronizar objetivos do dossier (não-bloqueante):', objError);
          } else {
            console.log(`✅ ${objectivesToInsert.length} objetivos do dossier sincronizados para cs_objectives`);
          }
        } else {
          console.log('📋 Objetivos de onboarding já existem em cs_objectives, pulando sync');
        }
      }

      // 4. Atualizar o lead com os dados confirmados do formulário
      if (onboarding.organization?.primary_contact_id && confirmedData) {
        const leadUpdateData: Record<string, any> = {};
        
        if (confirmedData.contact_email) leadUpdateData.email = confirmedData.contact_email;
        if (confirmedData.contact_name) leadUpdateData.name = confirmedData.contact_name;
        if (confirmedData.contact_whatsapp) leadUpdateData.phone = confirmedData.contact_whatsapp;
        if (confirmedData.instagram) leadUpdateData.instagram = confirmedData.instagram;
        
        if (Object.keys(leadUpdateData).length > 0) {
          console.log('📝 Atualizando lead com dados do formulário:', leadUpdateData);
          await (supabase as any)
            .from('leads')
            .update(leadUpdateData)
            .eq('id', onboarding.organization.primary_contact_id);
        }
      }

      // 5. Atualizar status do onboarding no banco
      const { data, error } = await (supabase as any)
        .from('onboardings')
        .update({ 
          status: 'approved',
          approved_at: new Date().toISOString(),
          approved_by,
          plan: plan || 'basic',
          seats_limit: seats_limit || 5,
          add_to_whatsapp: add_to_whatsapp ?? true,
          send_welcome: send_welcome ?? true,
          journey_config: journey_config || {},
          webhook_response: webhookResult, // Salvar resposta do webhook
        })
        .eq('id', id)
        .select(`
          *,
          organization:organizations(*)
        `)
        .single();

      if (error) {
        console.error('❌ Erro ao atualizar status do onboarding:', error);
        throw error;
      }
      
      console.log('✅ Onboarding aprovado com sucesso:', { id, status: data.status, approved_at: data.approved_at });

      // 6. Atualizar organization_products.journey_stage para 'monitoring_7d' (monitoramento 7 dias)
      if (data.organization_id) {
        await (supabase as any)
          .from('organization_products')
          .update({
            journey_stage: 'monitoring_7d',
            onboarding_status: 'completed',
            onboarding_completed_at: new Date().toISOString(),
          })
          .eq('organization_id', data.organization_id)
          .eq('journey_stage', 'pending_onboard');

        console.log('📦 organization_products.journey_stage atualizado para monitoring_7d');
      }

      // 7. Atualizar task de onboarding para status correto
      // Buscar a task de onboarding desta organização
      const { data: tasks } = await (supabase as any)
        .from('company_activities')
        .select('id, status')
        .eq('organization_id', data.organization_id)
        .eq('task_type', 'onboarding')
        .neq('status', 'completed')
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(1);

      if (tasks && tasks.length > 0) {
        const usersCreated = webhookResult?.summary?.users_created > 0 || webhookResult?.summary?.users_found > 0;

        await (supabase as any)
          .from('company_activities')
          .update({
            status: 'monitoring_7d',
            completed: false,
            notes: usersCreated
              ? `✅ Onboarding aprovado em ${new Date().toLocaleDateString('pt-BR')}. ${webhookResult?.summary?.users_created || 0} usuário(s) criado(s).`
              : `Onboarding aprovado em ${new Date().toLocaleDateString('pt-BR')}. Aguardando configuração.`,
            metadata: {
              ...(tasks[0] as any).metadata,
              monitoring_started_at: new Date().toISOString(),
            },
          })
          .eq('id', tasks[0].id);
        
        console.log(`📋 Task de onboarding atualizada para ${newStatus}:`, tasks[0].id);
      }

      // 8. Criar cadência de checkpoints (8 tasks de acompanhamento 90 dias)
      if (data.organization_id) {
        const approvalDate = new Date();
        const checkpointCadence = [
          { day: 3, name: 'Check-in pós-onboarding', priority: 'high' },
          { day: 7, name: 'Review primeira semana', priority: 'high' },
          { day: 14, name: 'Acompanhamento de adoção', priority: 'medium' },
          { day: 30, name: 'Review 30 dias', priority: 'high' },
          { day: 45, name: 'Check de engajamento', priority: 'medium' },
          { day: 60, name: 'Review 60 dias', priority: 'high' },
          { day: 75, name: 'Prep QBR + NPS', priority: 'medium' },
          { day: 90, name: 'QBR 90 dias', priority: 'urgent' },
        ];

        const cadenceTasks = checkpointCadence.map((cp) => {
          const scheduledDate = new Date(approvalDate);
          scheduledDate.setDate(scheduledDate.getDate() + cp.day);
          return {
            name: cp.name,
            description: `Checkpoint dia ${cp.day} — acompanhamento pós-onboarding`,
            priority: cp.priority,
            task_type: 'cs_checkpoint',
            team: 'cs',
            organization_id: data.organization_id,
            product_id: data.product_id || 'pain',
            status: 'not_started',
            scheduled_at: scheduledDate.toISOString(),
            is_critical: cp.day === 90,
            metadata: {
              checkpoint_day: cp.day,
              cadence_source: 'onboarding_approval',
              onboarding_id: id,
            },
          };
        });

        const { error: cadenceError } = await (supabase as any)
          .from('company_activities')
          .insert(cadenceTasks);

        if (cadenceError) {
          console.error('⚠️ Erro ao criar cadência de checkpoints:', cadenceError);
        } else {
          console.log(`📅 ${cadenceTasks.length} checkpoints de cadência criados para org ${data.organization_id}`);
        }
      }

      return {
        onboarding: data as Onboarding,
        webhookResult
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.onboarding.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.onboarding.organization_id] });
      queryClient.invalidateQueries({ queryKey: ['onboarding-tasks'] }); // Atualizar Kanban de onboarding
      queryClient.invalidateQueries({ queryKey: ['tasks'] }); // Atualizar lista geral de tarefas
    },
  });
};

// Hook: Rejeitar onboarding
export const useRejectOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      rejected_by,
      rejection_reason,
    }: { 
      id: string;
      rejected_by: string;
      rejection_reason?: string;
    }) => {
      const { data, error } = await supabase
        .from('onboardings')
        .update({ 
          status: 'rejected',
          rejected_at: new Date().toISOString(),
          rejected_by,
          rejection_reason,
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as Onboarding;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.id] });
    },
  });
};

// Hook: Processar transcrição com IA
export const useProcessTranscription = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      transcription,
      source,
    }: { 
      id: string;
      transcription: string;
      source: 'meeting' | 'manual' | 'zoom' | 'vtt';
    }) => {
      // 1. Salvar transcrição
      await (supabase as any)
        .from('onboardings')
        .update({ 
          transcription_raw: transcription,
          transcription_source: source,
        } as any)
        .eq('id', id);

      // 2. Chamar Edge Function para processar com IA
      const { data: aiResponse, error: aiError } = await supabase.functions.invoke(
        'process-onboarding-transcription',
        {
          body: { onboarding_id: id, transcription },
        }
      );

      if (aiError) throw aiError;

      // 3. Buscar onboarding atualizado
      const { data, error } = await (supabase as any)
        .from('onboardings')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      return { onboarding: data as Onboarding, aiResponse };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.onboarding.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.onboarding.organization_id] });
    },
  });
};

// Hook: Deletar onboarding
export const useDeleteOnboarding = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, organizationId }: { id: string; organizationId: string }) => {
      console.log('🗑️ Tentando excluir onboarding:', id);
      
      const { data, error } = await (supabase as any)
        .from('onboardings')
        .delete()
        .eq('id', id)
        .select();

      console.log('🗑️ Resultado da exclusão:', { data, error });

      if (error) {
        console.error('❌ Erro ao excluir:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn('⚠️ Nenhum registro foi excluído - pode ser RLS bloqueando');
      }
      
      return { id, organizationId };
    },
    onSuccess: (data) => {
      console.log('✅ Onboarding excluído com sucesso, invalidando queries...');
      queryClient.invalidateQueries({ queryKey: ['onboarding', data.id] });
      queryClient.invalidateQueries({ queryKey: ['organization-onboardings', data.organizationId] });
      queryClient.invalidateQueries({ queryKey: ['onboardings'] });
    },
  });
};
