import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export const useDashboardStats = (productId?: string) => {
  return useQuery({
    queryKey: ['dashboard-stats', productId],
    queryFn: async () => {
      // Get health stats (join org to exclude churned)
      let healthQuery = supabase
        .from('cs_health_current')
        .select('health_status, organization_id, organization:organizations!inner(status)');

      if (productId) {
        healthQuery = healthQuery.eq('product_id', productId);
      }

      const { data: rawHealthData, error: healthError } = await healthQuery;
      if (healthError) throw healthError;

      // Exclude churned organizations (defense in depth)
      const healthData = (rawHealthData || []).filter(
        (h: any) => h.organization?.status !== 'churned'
      );

      // Buscar tasks reais de onboarding (fonte de verdade)
      // Only count onboarding tasks in active phases (not ongoing/monitoring which are post-onboarding)
      let onboardingTasksQuery = supabase
        .from('company_activities')
        .select('id, status, organization_id, product_id')
        .eq('task_type', 'onboarding')
        .eq('completed', false)
        .in('status', ['not_started', 'scheduled', 'confirmed', 'in_progress']);

      if (productId) {
        onboardingTasksQuery = onboardingTasksQuery.eq('product_id', productId);
      }

      const { data: onboardingTasks, error: onboardingError } = await onboardingTasksQuery;
      if (onboardingError) throw onboardingError;

      // Get success metrics — scoped to active orgs from health data
      const activeOrgIds = healthData.map((h: any) => h.organization_id).filter(Boolean);
      let successQuery = supabase
        .from('cs_success_metrics')
        .select('testimonial_collected, upsell_done, upsell_value, referrals_count')
        .in('organization_id', activeOrgIds.length ? activeOrgIds : ['__none__']);

      if (productId) {
        successQuery = successQuery.eq('product_id', productId);
      }

      const { data: successData, error: successError } = await successQuery;
      if (successError) throw successError;

      // Calculate stats
      const stats = {
        total: healthData?.length || 0,
        healthy: healthData?.filter(h => h.health_status === 'healthy').length || 0,
        alert: healthData?.filter(h => h.health_status === 'alert').length || 0,
        monitoring: healthData?.filter(h => h.health_status === 'monitoring').length || 0,
        risk: healthData?.filter(h => h.health_status === 'risk').length || 0,
        pendingOnboard: (onboardingTasks || []).length,
        onboardAwaitingSchedule: (onboardingTasks || []).filter(t =>
          t.status === 'not_started'
        ).length,
        onboardScheduled: (onboardingTasks || []).filter(t =>
          t.status === 'scheduled' || t.status === 'in_progress'
        ).length,
        totalTestimonials: successData?.filter(s => s.testimonial_collected).length || 0,
        totalUpsells: successData?.filter(s => s.upsell_done).length || 0,
        totalUpsellValue: successData?.reduce((acc, s) => acc + (Number(s.upsell_value) || 0), 0) || 0,
        totalReferrals: successData?.reduce((acc, s) => acc + (s.referrals_count || 0), 0) || 0,
      };

      return stats;
    },
  });
};

export const useOrganizationsNeedingAction = (productId?: string) => {
  return useQuery({
    queryKey: ['organizations-needing-action', productId],
    queryFn: async () => {
      // Get organizations at risk or with overdue objectives
      let query = supabase
        .from('cs_health_current')
        .select(`
          *,
          organization:organizations!inner(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          )
        `)
        .in('health_status', ['risk', 'alert', 'monitoring'])
        .neq('organization.status', 'churned')
        .order('overall_score', { ascending: true })
        .limit(100);

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useObjectivesExpiringSoon = (days: number = 7, productId?: string) => {
  return useQuery({
    queryKey: ['objectives-expiring-soon', days, productId],
    queryFn: async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + days);

      // Include overdue objectives (no lower bound) + upcoming within `days`
      let query = supabase
        .from('cs_objectives')
        .select(`
          *,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          ),
          product:products(*)
        `)
        .in('status', ['pending', 'in_progress'])
        .lte('deadline', futureDate.toISOString().split('T')[0])
        .order('deadline', { ascending: true });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useInactiveOrganizations = (days: number = 7, productId?: string) => {
  return useQuery({
    queryKey: ['inactive-organizations', days, productId],
    queryFn: async () => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      let query = supabase
        .from('cs_engagement_metrics')
        .select(`
          *,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          ),
          product:products(*)
        `)
        .or(`member_area_last_access.lt.${cutoffDate.toISOString()},member_area_last_access.is.null`)
        .order('member_area_last_access', { ascending: true, nullsFirst: true })
        .limit(10);

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

/** Get São Paulo timezone offset string (handles DST correctly) */
function getSaoPauloOffset(): string {
  const now = new Date();
  const spTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    timeZoneName: 'shortOffset',
  }).formatToParts(now);
  const offsetPart = spTime.find(p => p.type === 'timeZoneName')?.value || 'GMT-3';
  // Converts "GMT-3" → "-03:00", "GMT-2" → "-02:00"
  const match = offsetPart.match(/GMT([+-])(\d+)/);
  if (match) {
    const sign = match[1];
    const hours = match[2].padStart(2, '0');
    return `${sign}${hours}:00`;
  }
  return '-03:00'; // fallback
}

export const useTodaysTouchpoints = (productId?: string) => {
  return useQuery({
    queryKey: ['todays-touchpoints', productId],
    queryFn: async () => {
      // Calcular limites em horário de São Paulo (DST-aware)
      const now = new Date();
      const offset = getSaoPauloOffset();
      const spFormatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric', month: '2-digit', day: '2-digit',
      });
      const todayStr = spFormatter.format(now);
      const nextWeek = new Date(`${todayStr}T23:59:59${offset}`);
      nextWeek.setDate(nextWeek.getDate() + 7);

      // Limite inferior: 30 dias atrás para capturar tarefas atrasadas
      const pastLimit = new Date(`${todayStr}T00:00:00${offset}`);
      pastLimit.setDate(pastLimit.getDate() - 30);

      // Buscar tarefas de CS agendadas (company_activities com scheduled_at)
      // Exclui: tarefas internas (team=internal) e fases de acompanhamento (ongoing, monitoring_7d)
      let query = (supabase as any)
        .from('company_activities')
        .select(`
          *,
          organization:organizations(
            *,
            primary_contact:leads!organizations_primary_contact_id_fkey(*)
          )
        `)
        .not('scheduled_at', 'is', null)
        .gte('scheduled_at', pastLimit.toISOString())
        .lte('scheduled_at', nextWeek.toISOString())
        .eq('completed', false)
        .eq('team', 'cs')
        .neq('status', 'ongoing')
        .neq('status', 'monitoring_7d')
        .order('scheduled_at', { ascending: true })
        .limit(50);

      // Aplicar filtro de produto quando selecionado
      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Mapear para formato esperado pelo componente
      return (data || []).map((task: any) => ({
        ...task,
        next_contact_date: task.scheduled_at,
        activity_type: task.task_type || 'follow_up',
      }));
    },
    refetchInterval: 60000, // Atualizar a cada 60 segundos
  });
};

// Hook: Buscar onboardings pendentes de aprovação (cliente completou)
export const usePendingOnboardingApprovals = (productId?: string) => {
  return useQuery({
    queryKey: ['pending-onboarding-approvals', productId],
    queryFn: async () => {
      let query = supabase
        .from('onboardings')
        .select(`
          id,
          status,
          form_completed_at,
          organization_id,
          product_id,
          organization:organizations(
            id,
            name
          )
        `)
        .eq('status', 'client_completed')
        .order('form_completed_at', { ascending: false });

      if (productId) {
        query = query.eq('product_id', productId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Erro ao buscar onboardings pendentes:', error);
        throw error;
      }
      return data || [];
    },
    refetchInterval: 60000,
  });
};
