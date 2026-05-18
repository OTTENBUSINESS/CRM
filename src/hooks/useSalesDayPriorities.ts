import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

interface DealWithLead {
  id: string;
  lead_id: string;
  negotiated_price: number;
  status: string;
  created_at: string;
  updated_at: string;
  lead: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    sales_score: number;
  };
  stage: {
    id: string;
    name: string;
    position: number;
  };
  days_in_stage: number;
  has_completed_meeting?: boolean;
}

interface DayPriorities {
  novos: DealWithLead[];
  emFechamento: DealWithLead[];
  callRealizada: DealWithLead[];
  callAgendada: DealWithLead[];
  noShow: DealWithLead[];
  qualificado: DealWithLead[];
  emContato: DealWithLead[];
  agendaHoje: any[];
  tarefasAtrasadas: any[];
  auditoria: any[];
  totals: {
    novos: number;
    emFechamento: number;
    callRealizada: number;
    callAgendada: number;
    noShow: number;
    qualificado: number;
    emContato: number;
    valorTotal: number;
  };
}

export const useSalesDayPriorities = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['sales-day-priorities', salesRepId],
    queryFn: async (): Promise<DayPriorities> => {
      if (!salesRepId) {
        return {
          novos: [],
          emFechamento: [],
          callRealizada: [],
          callAgendada: [],
          noShow: [],
          qualificado: [],
          emContato: [],
          agendaHoje: [],
          tarefasAtrasadas: [],
          auditoria: [],
          totals: { novos: 0, emFechamento: 0, callRealizada: 0, callAgendada: 0, noShow: 0, qualificado: 0, emContato: 0, valorTotal: 0 },
        };
      }

      // Buscar todos os deals abertos do vendedor com estágio
      const { data: deals } = await supabase
        .from('deals')
        .select(`
          id, lead_id, negotiated_price, status, created_at, updated_at,
          lead:leads!deals_lead_id_fkey(id, name, phone, email, sales_score),
          stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(id, name, position)
        `)
        .eq('sales_rep_id', salesRepId)
        .eq('status', 'open')
        .not('pipeline_stage_id', 'is', null);

      // Buscar leads que tiveram call/meeting COMPLETADA
      const leadIds = (deals || []).map((d: any) => d.lead_id).filter(Boolean);
      const leadsWithCompletedMeeting = new Set<string>();

      if (leadIds.length > 0) {
        const { data: completedMeetings } = await supabase
          .from('company_activities')
          .select('lead_id')
          .in('lead_id', leadIds)
          .in('task_type', ['call', 'meeting'])
          .eq('completed', true)
          .eq('team', 'comercial');

        (completedMeetings || []).forEach((m: any) => {
          if (m.lead_id) leadsWithCompletedMeeting.add(m.lead_id);
        });
      }

      // Buscar agenda de hoje
      const today = new Date().toISOString().split('T')[0];
      const { data: agendaHoje } = await supabase
        .from('company_activities')
        .select('*, lead:leads(id, name, phone)')
        .eq('responsavel_id', salesRepId)
        .gte('scheduled_at', `${today}T00:00:00`)
        .lte('scheduled_at', `${today}T23:59:59`)
        .eq('completed', false)
        .order('scheduled_at', { ascending: true });

      // Buscar tarefas atrasadas
      const { data: tarefasAtrasadas } = await supabase
        .from('company_activities')
        .select('*, lead:leads(id, name, phone)')
        .eq('responsavel_id', salesRepId)
        .lt('scheduled_at', new Date().toISOString())
        .eq('completed', false)
        .order('scheduled_at', { ascending: false })
        .limit(10);

      // Buscar auditoria (deals com status inconsistente)
      const { data: auditoria } = await supabase
        .from('deals')
        .select(`
          id, lead_id, status,
          lead:leads!deals_lead_id_fkey(name),
          stage:sales_pipeline_stages!deals_pipeline_stage_id_fkey(name, position)
        `)
        .eq('sales_rep_id', salesRepId)
        .or('status.eq.won,status.eq.lost');

      // Calcular dias no estágio
      const now = new Date();

      let lastInteractions = new Map<string, Date>();
      if (leadIds.length > 0) {
        const { data: lastMessages } = await supabase
          .from('whatsapp_messages')
          .select('lead_id, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false });

        const { data: lastActivities } = await supabase
          .from('company_activities')
          .select('lead_id, created_at')
          .in('lead_id', leadIds)
          .order('created_at', { ascending: false });

        [...(lastMessages || []), ...(lastActivities || [])].forEach((item: any) => {
          const date = new Date(item.created_at);
          const current = lastInteractions.get(item.lead_id);
          if (!current || date > current) {
            lastInteractions.set(item.lead_id, date);
          }
        });
      }

      const dealsWithDays = (deals || []).map((deal: any) => {
        const lastInteraction = lastInteractions.get(deal.lead_id);
        const referenceDate = lastInteraction || new Date(deal.updated_at);
        return {
          ...deal,
          days_in_stage: Math.floor((now.getTime() - referenceDate.getTime()) / (1000 * 60 * 60 * 24)),
          last_interaction: lastInteraction,
          has_completed_meeting: leadsWithCompletedMeeting.has(deal.lead_id),
        };
      });

      // Buscar calls agendadas para hoje ou amanhã (D-1)
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      const todayStr = now.toISOString().split('T')[0];

      const { data: scheduledCalls } = await supabase
        .from('company_activities')
        .select('*, lead:leads(id, name, phone)')
        .eq('responsavel_id', salesRepId)
        .in('task_type', ['call', 'meeting', 'onboarding'])
        .eq('completed', false)
        .gte('scheduled_at', `${todayStr}T00:00:00`)
        .lte('scheduled_at', `${tomorrowStr}T23:59:59`)
        .order('scheduled_at', { ascending: true });

      const callsWithConfirmation = (scheduledCalls || []).map((call: any) => {
        const callDate = new Date(call.scheduled_at);
        const isToday = callDate.toISOString().split('T')[0] === todayStr;
        const isTomorrow = callDate.toISOString().split('T')[0] === tomorrowStr;
        const lastLeadInteraction = lastInteractions.get(call.lead_id);
        const daysSinceInteraction = lastLeadInteraction
          ? Math.floor((now.getTime() - lastLeadInteraction.getTime()) / (1000 * 60 * 60 * 24))
          : 999;
        const needsConfirmation = isTomorrow && daysSinceInteraction >= 2;

        return {
          ...call,
          isToday,
          isTomorrow,
          needsConfirmation,
          daysSinceInteraction,
          callTime: callDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        };
      });

      // --- Separar por estágio (usar NOME, não position) ---
      // Em Fechamento: TODOS (oportunidade quente, sempre mostrar)
      const emFechamento = dealsWithDays.filter((d: any) => d.stage?.name === 'Em Fechamento');
      // Call Realizada: TODOS (meeting feita, precisa follow-up)
      const callRealizada = dealsWithDays.filter((d: any) => d.stage?.name === 'Call Realizada');
      // Call Agendada: usar a lista de calls agendadas
      const callAgendada = callsWithConfirmation;
      // No-show: TODOS (precisa reagendar)
      const noShow = dealsWithDays.filter((d: any) => d.stage?.name === 'No-show');
      // Novos: só se >= 1 dia sem interação
      const novos = dealsWithDays.filter((d: any) => d.stage?.name === 'Novo' && d.days_in_stage >= 1);
      // Em Contato: só se >= 1 dia
      const emContato = dealsWithDays.filter((d: any) => d.stage?.name === 'Em Contato' && d.days_in_stage >= 1);
      // Qualificado: só se >= 1 dia
      const qualificado = dealsWithDays.filter((d: any) => d.stage?.name === 'Qualificado' && d.days_in_stage >= 1);

      // Filtrar auditoria (deals won/lost que ainda estão em estágio anterior ao esperado)
      const STAGES_BEFORE_WON = ['Novo', 'Não atendeu', 'Em Contato', 'Qualificado', 'Em Agendamento', 'Call Agendada', 'No-show', 'Call Realizada', 'Em Fechamento'];
      const STAGES_BEFORE_LOST = ['Novo', 'Não atendeu', 'Em Contato', 'Qualificado', 'Em Agendamento', 'Call Agendada', 'No-show', 'Call Realizada', 'Em Fechamento', 'Ganho'];
      const auditoriaFiltrada = (auditoria || []).filter((d: any) => {
        if (d.status === 'won' && STAGES_BEFORE_WON.includes(d.stage?.name)) return true;
        if (d.status === 'lost' && STAGES_BEFORE_LOST.includes(d.stage?.name)) return true;
        return false;
      });

      const valorTotal = dealsWithDays.reduce((sum: number, d: any) => sum + (Number(d.negotiated_price) || 0), 0);

      return {
        novos,
        emFechamento,
        callRealizada,
        callAgendada,
        noShow,
        qualificado,
        emContato,
        agendaHoje: agendaHoje || [],
        tarefasAtrasadas: tarefasAtrasadas || [],
        auditoria: auditoriaFiltrada,
        totals: {
          novos: novos.length,
          emFechamento: emFechamento.length,
          callRealizada: callRealizada.length,
          callAgendada: callAgendada.length,
          noShow: noShow.length,
          qualificado: qualificado.length,
          emContato: emContato.length,
          valorTotal,
        },
      };
    },
    enabled: !!salesRepId,
    refetchInterval: 60000,
  });
};
