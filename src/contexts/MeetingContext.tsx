import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { Task } from '@/hooks/useTasks';
import { setCallMode } from '@/lib/call-mode';
import { isLiveKitLink, extractRoomNameFromLink, getMeetUrl } from '@/lib/livekit';

// =====================================================
// TIPOS
// =====================================================

export interface ActiveMeeting {
  meetingId: string;
  activityId?: string;
  entityType: 'lead' | 'organization';
  entityId: string;
  entityName: string;
  meetingLink: string;
  taskType: string;
  meetingType: string; // cs_meeting, sales_call, onboarding, internal
  isRecovered?: boolean;
  clientData?: {
    name?: string;
    phone?: string;
    email?: string;
    dealValue?: number;
    pipelineStage?: string;
    healthScore?: number;
    lastActivity?: string;
    aiInsights?: string;
  };
}

interface MeetingContextType {
  // Estado
  activeMeeting: ActiveMeeting | null;
  isLoading: boolean;
  hasPendingSession: boolean;
  pendingSessionInfo: { entityName: string; meetingLink: string; taskType: string } | null;

  // Ações
  startMeeting: (task: Task, entityData?: any) => Promise<void>;
  endMeeting: (status?: 'completed' | 'no_show' | 'cancelled') => void;
  closeMeetingPanel: () => void;
  recoverSession: () => void;
  dismissPendingSession: () => void;

  // Helpers
  isTaskInMeeting: (taskId: string) => boolean;
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined);

// =====================================================
// HELPER: Buscar clientData do banco
// =====================================================
async function fetchClientData(
  entityType: 'lead' | 'organization',
  entityId: string,
  leadId?: string | null
): Promise<ActiveMeeting['clientData']> {
  const clientData: ActiveMeeting['clientData'] = {};

  if (entityType === 'lead' && entityId) {
    const { data: lead } = await supabase
      .from('leads')
      .select('name, phone, email')
      .eq('id', entityId)
      .single();
    if (lead) {
      clientData.name = lead.name;
      clientData.phone = lead.phone;
      clientData.email = lead.email;
    }

    // Buscar deal ativo
    const { data: deal } = await supabase
      .from('deals')
      .select('negotiated_price, original_price, pipeline_stage:sales_pipeline_stages(name)')
      .eq('lead_id', entityId)
      .not('status', 'in', '("won","lost")')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (deal) {
      clientData.dealValue = deal.negotiated_price || deal.original_price;
      clientData.pipelineStage = (deal.pipeline_stage as any)?.name;
    }
  }

  if (entityType === 'organization' && entityId) {
    const { data: org } = await supabase
      .from('organizations')
      .select('name, health_score, ai_insights')
      .eq('id', entityId)
      .single();
    if (org) {
      clientData.name = org.name;
      clientData.healthScore = org.health_score;
      clientData.aiInsights = typeof org.ai_insights === 'string'
        ? org.ai_insights
        : org.ai_insights?.content;
    }
  }

  return clientData;
}

// =====================================================
// PROVIDER
// =====================================================

export function MeetingProvider({ children }: { children: ReactNode }) {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeMeeting, setActiveMeeting] = useState<ActiveMeeting | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [pendingSession, setPendingSession] = useState<ActiveMeeting | null>(null);

  // Call Mode - silencia notificações durante reunião ativa
  useEffect(() => {
    if (activeMeeting) setCallMode(true);
    return () => setCallMode(false);
  }, [activeMeeting]);

  // Verificar sessão pendente ao carregar — BANCO é a fonte da verdade
  useEffect(() => {
    if (!teamMember?.id) return;

    supabase
      .from('meetings')
      .select('id, title, activity_id, organization_id, lead_id, meeting_link, meeting_type, status, transcriptions')
      .eq('created_by', teamMember.id)
      .eq('status', 'active')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(async ({ data: meeting, error }) => {
        if (error || !meeting) return;

        console.log('[MeetingContext] ✅ Meeting ativa no banco:', meeting.id);

        // Determinar entidade
        let entityName = 'Cliente';
        let entityType: 'lead' | 'organization' = 'lead';
        let entityId = '';

        if (meeting.organization_id) {
          entityType = 'organization';
          entityId = meeting.organization_id;
          const { data: org } = await supabase
            .from('organizations')
            .select('name')
            .eq('id', meeting.organization_id)
            .single();
          entityName = org?.name || 'Cliente';
        } else if (meeting.lead_id) {
          entityType = 'lead';
          entityId = meeting.lead_id;
          const { data: lead } = await supabase
            .from('leads')
            .select('name')
            .eq('id', meeting.lead_id)
            .single();
          entityName = lead?.name || 'Lead';
        }

        // Verificar se a reunião está ativa em outra aba (não mostrar banner se sim)
        try {
          const activeFlag = localStorage.getItem('crm_active_meeting');
          if (activeFlag) {
            const parsed = JSON.parse(activeFlag);
            // Se o flag é da mesma reunião e foi setado há menos de 4h, significa que está ativa em outra aba
            if (parsed.meetingId === meeting.id && (Date.now() - parsed.ts) < 4 * 60 * 60 * 1000) {
              console.log('[MeetingContext] ⏭️ Reunião ativa em outra aba — não mostrando banner');
              return;
            }
          }
        } catch {}

        // Verificar se o usuário já descartou este banner (não mostrar de novo)
        try {
          const dismissedFlag = localStorage.getItem('crm_dismissed_meeting');
          if (dismissedFlag) {
            const parsed = JSON.parse(dismissedFlag);
            // Se descartou a mesma reunião há menos de 4h, não mostrar de novo
            if (parsed.meetingId === meeting.id && (Date.now() - parsed.ts) < 4 * 60 * 60 * 1000) {
              console.log('[MeetingContext] ⏭️ Banner já descartado pelo usuário — não mostrando');
              return;
            }
          }
        } catch {}

        setPendingSession({
          meetingId: meeting.id,
          activityId: meeting.activity_id || undefined,
          entityType,
          entityId,
          entityName,
          meetingLink: meeting.meeting_link || '',
          taskType: meeting.meeting_type || 'meeting',
          meetingType: meeting.meeting_type || 'sales_call',
        });
      });
  }, [teamMember?.id]);

  // Iniciar reunião
  const startMeeting = useCallback(async (task: Task, entityData?: any) => {
    if (!teamMember) {
      toast({ title: "Erro", description: "Usuário não autenticado", variant: "destructive" });
      return;
    }

    // === SALA PRÓPRIA (LiveKit) ===
    // O link /meet/ tem sala com gravação e transcrição embutidas — o fluxo
    // antigo (abrir Google Meet + compartilhar aba pra transcrever) NÃO se aplica.
    // Abre direto como host e não inicia sessão do painel.
    if (task.meeting_link && isLiveKitLink(task.meeting_link)) {
      const roomName = extractRoomNameFromLink(task.meeting_link);
      if (roomName) {
        const hostUrl = getMeetUrl(roomName, {
          role: 'host',
          name: teamMember.name || undefined,
          leadId: task.lead_id || undefined,
        });
        window.open(hostUrl, '_blank', 'noopener');
        toast({ title: "🎥 Sala própria aberta", description: "Você entrou como host — gravação automática ao entrar." });
        return;
      }
    }

    // Guard: não iniciar nova reunião se já tem uma ativa no contexto
    if (activeMeeting) {
      console.warn('[MeetingContext] ⚠️ startMeeting ignorado — já existe reunião ativa:', activeMeeting.meetingId.slice(0,8));
      toast({ title: "Reunião em andamento", description: "Finalize a reunião atual antes de iniciar outra" });
      return;
    }

    setIsLoading(true);

    try {
      // Fechar qualquer meeting ativa anterior deste usuário
      // Se já teve started_at (reunião aconteceu), marcar como completed
      const { data: activeMeetings } = await supabase
        .from('meetings')
        .select('id, started_at, title')
        .eq('created_by', teamMember.id)
        .eq('status', 'active');

      if (activeMeetings && activeMeetings.length > 0) {
        console.log(`[MeetingContext] ⚠️ Fechando ${activeMeetings.length} meetings ativas anteriores ao iniciar nova:`);
        for (const m of activeMeetings) {
          const newStatus = m.started_at ? 'completed' : 'cancelled';
          console.log(`[MeetingContext]   → ${m.id.slice(0,8)} "${m.title}" → ${newStatus}`);
          await supabase
            .from('meetings')
            .update({
              status: newStatus,
              ended_at: new Date().toISOString()
            })
            .eq('id', m.id);
        }
      }

      // Limpar flags de localStorage
      try { localStorage.removeItem('crm_dismissed_meeting'); } catch {}

      const entityType = task.organization_id ? 'organization' : 'lead';
      const entityId = task.organization_id || task.lead_id || '';
      const entityName = task.organization?.name || task.lead?.name || 'Cliente';

      // 1. Criar registro na tabela meetings
      // Determinar meeting_type baseado no team da task
      const taskTeam = task.team || 'sales';
      let meetingType = 'sales_call';
      if (task.task_type === 'onboarding') {
        meetingType = 'onboarding';
      } else if (taskTeam === 'cs') {
        meetingType = 'cs_meeting';
      } else if (taskTeam === 'internal') {
        meetingType = 'internal';
      }

      const participantRole = taskTeam === 'cs' ? 'CS' : taskTeam === 'internal' ? 'Time' : 'Vendedor';

      const meetingData: any = {
        title: task.name,
        type: 'online',
        meeting_type: meetingType,
        team: taskTeam,
        organization_id: task.organization_id || null,
        lead_id: task.lead_id || null,
        activity_id: task.id,
        meeting_link: task.meeting_link,
        status: 'active',
        started_at: new Date().toISOString(),
        participants: [
          { name: teamMember.name || 'Você', role: participantRole },
          { name: entityName, role: 'Cliente' },
        ],
        transcriptions: [],
      };

      if (teamMember.id) {
        meetingData.created_by = teamMember.id;
      }

      const { data: meeting, error: meetingError } = await supabase
        .from('meetings')
        .insert(meetingData)
        .select()
        .single();

      if (meetingError) throw meetingError;

      console.log('✅ Meeting criado:', meeting.id);

      // 2. Buscar dados do cliente do banco
      const clientData = await fetchClientData(entityType, entityId);
      clientData.name = entityName;
      clientData.phone = clientData.phone || task.lead?.phone || entityData?.phone;
      clientData.email = clientData.email || task.lead?.email || entityData?.email;

      // 3. Ativar reunião no contexto
      const meetingState = {
        meetingId: meeting.id,
        activityId: task.id,
        entityType,
        entityId,
        entityName,
        meetingLink: task.meeting_link || '',
        taskType: task.task_type,
        meetingType,
        clientData,
      };
      setActiveMeeting(meetingState);

      // Sinalizar para outras abas que reunião está ativa
      try { localStorage.setItem('crm_active_meeting', JSON.stringify({ meetingId: meeting.id, ts: Date.now() })); } catch {}

      toast({
        title: "🎙️ Configure a transcrição",
        description: "Autorize o microfone e compartilhe a aba do Meet",
      });

    } catch (error: any) {
      console.error('❌ Erro ao iniciar meeting:', error);
      toast({
        title: "Erro ao iniciar reunião",
        description: error?.message || "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [teamMember, toast, activeMeeting]);

  // Encerrar reunião
  // NOTA: NÃO sobrescrever se handleConfirmFinish já salvou (com transcriptions)
  // O handleConfirmFinish salva transcriptions + status + ended_at atomicamente.
  // Aqui só atualizamos status/ended_at SE ainda não foram definidos.
  const endMeeting = useCallback((status: 'completed' | 'no_show' | 'cancelled' = 'completed') => {
    if (!activeMeeting) return;

    const meetingId = activeMeeting.meetingId;
    const activityId = activeMeeting.activityId;
    console.log(`[MeetingContext] 🔚 endMeeting(${status}) para ${meetingId.slice(0,8)}, activityId: ${activityId?.slice(0,8) || 'N/A'}`);

    // Verificar se o meeting já foi finalizado (ended_at preenchido) antes de sobrescrever
    supabase
      .from('meetings')
      .select('ended_at, status')
      .eq('id', meetingId)
      .single()
      .then(({ data }) => {
        if (data?.ended_at && data?.status !== 'active') {
          // Já foi finalizado pelo handleConfirmFinish — não sobrescrever
          console.log(`[MeetingContext] ⏭️ Meeting já finalizado (status: ${data.status}), pulando update`);
        } else {
          // Ainda ativo — atualizar status e ended_at
          supabase
            .from('meetings')
            .update({
              status: status,
              ended_at: new Date().toISOString(),
            })
            .eq('id', meetingId)
            .then(({ error }) => {
              if (error) console.error(`[MeetingContext] ❌ Erro ao finalizar:`, error.message);
              else console.log(`[MeetingContext] ✅ Meeting finalizado: ${meetingId.slice(0,8)}`);
            });
        }
      });

    // Safety net: marcar task como concluída (se handleConfirmFinish já fez, é idempotente)
    if (activityId && (status === 'completed' || status === 'no_show')) {
      const taskStatus = status === 'no_show' ? 'no_show' : 'completed';
      supabase
        .from('company_activities')
        .select('completed')
        .eq('id', activityId)
        .single()
        .then(({ data }) => {
          if (data && !data.completed) {
            console.log(`[MeetingContext] 🔧 Safety net: marcando task ${activityId.slice(0,8)} como ${taskStatus}`);
            supabase
              .from('company_activities')
              .update({
                status: taskStatus,
                completed: true,
                completed_at: new Date().toISOString(),
              })
              .eq('id', activityId)
              .then(({ error }) => {
                if (error) console.error(`[MeetingContext] ❌ Safety net task falhou:`, error.message);
                else console.log(`[MeetingContext] ✅ Safety net task OK`);
              });
          } else {
            console.log(`[MeetingContext] ⏭️ Task já completed, safety net desnecessário`);
          }
        });
    }

    // Invalidar cache de tasks para refletir mudanças no frontend
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['agenda-v2-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['cockpit-meu-dia-tasks'] });
    queryClient.invalidateQueries({ queryKey: ['focus-queue'] });

    setActiveMeeting(null);
    setPendingSession(null);
    try { localStorage.removeItem('crm_active_meeting'); } catch {}
    try { localStorage.removeItem('crm_dismissed_meeting'); } catch {}
  }, [activeMeeting, queryClient]);

  // Fechar painel sem encerrar (minimizar)
  const closeMeetingPanel = useCallback(() => {
    setActiveMeeting(null);
  }, []);

  // Recuperar sessão pendente — busca clientData do banco
  const recoverSession = useCallback(async () => {
    if (!pendingSession) return;

    const clientData = await fetchClientData(
      pendingSession.entityType,
      pendingSession.entityId
    );

    setActiveMeeting({
      ...pendingSession,
      isRecovered: true,
      clientData,
    });
    setPendingSession(null);
    // Sinalizar para outras abas que reunião está ativa e limpar dismiss
    try { localStorage.setItem('crm_active_meeting', JSON.stringify({ meetingId: pendingSession.meetingId, ts: Date.now() })); } catch {}
    try { localStorage.removeItem('crm_dismissed_meeting'); } catch {}
    toast({
      title: "🔄 Sessão recuperada",
      description: `Continuando reunião com ${pendingSession.entityName}`,
    });
  }, [pendingSession, toast]);

  // Descartar sessão pendente — NÃO marca como completed automaticamente
  // Apenas remove o banner de recovery. A meeting permanece 'active' no banco
  // até que o usuário a finalize explicitamente ou inicie outra reunião.
  const dismissPendingSession = useCallback(async () => {
    if (pendingSession) {
      console.log('[MeetingContext] ⏭️ Banner descartado (meeting permanece active):', pendingSession.meetingId);
      // Limpar flag de aba ativa para que o banner não reapareça nesta aba
      try { localStorage.setItem('crm_dismissed_meeting', JSON.stringify({ meetingId: pendingSession.meetingId, ts: Date.now() })); } catch {}
    }
    setPendingSession(null);
  }, [pendingSession]);

  // Verificar se uma tarefa está em reunião ativa
  const isTaskInMeeting = useCallback((taskId: string) => {
    if (activeMeeting?.activityId === taskId) return true;
    if (pendingSession?.activityId === taskId) return true;
    return false;
  }, [activeMeeting, pendingSession]);

  return (
    <MeetingContext.Provider
      value={{
        activeMeeting,
        isLoading,
        hasPendingSession: !!pendingSession,
        pendingSessionInfo: pendingSession ? {
          entityName: pendingSession.entityName,
          meetingLink: pendingSession.meetingLink,
          taskType: pendingSession.taskType,
        } : null,
        startMeeting,
        endMeeting,
        closeMeetingPanel,
        recoverSession,
        dismissPendingSession,
        isTaskInMeeting,
      }}
    >
      {children}
    </MeetingContext.Provider>
  );
}

// =====================================================
// HOOK
// =====================================================

export function useMeeting() {
  const context = useContext(MeetingContext);
  if (context === undefined) {
    throw new Error('useMeeting must be used within a MeetingProvider');
  }
  return context;
}
