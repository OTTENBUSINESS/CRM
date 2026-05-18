import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { deleteWithUndo } from '@/lib/undoable-delete';
import type { SalesAlert, AlertFilters, AlertType } from '@/types/sales.types';

// Fetch all alerts with filters
export const useSalesAlerts = (filters?: AlertFilters) => {
  return useQuery({
    queryKey: ['sales-alerts', filters],
    queryFn: async () => {
      let query = supabase
        .from('sales_alerts')
        .select('*')
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      if (filters?.sales_rep_id) {
        query = query.eq('sales_rep_id', filters.sales_rep_id);
      }
      if (filters?.alert_type) {
        query = query.eq('alert_type', filters.alert_type);
      }
      if (filters?.is_read !== undefined) {
        query = query.eq('is_read', filters.is_read);
      }
      if (filters?.is_actioned !== undefined) {
        query = query.eq('is_actioned', filters.is_actioned);
      }
      if (filters?.min_priority) {
        query = query.gte('priority', filters.min_priority);
      }

      const { data: alerts, error } = await query;
      if (error) throw error;
      if (!alerts || alerts.length === 0) return [];

      // Fetch related leads
      const leadIds = alerts.map(a => a.lead_id).filter(Boolean);
      let leadsMap = new Map();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, email, phone, sales_score, sales_stage')
          .in('id', leadIds);
        leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
      }

      return alerts.map(alert => ({
        ...alert,
        contact: leadsMap.get(alert.lead_id) || null,
      })) as SalesAlert[];
    },
  });
};

// Fetch unread alerts count
export const useUnreadAlertsCount = (salesRepId?: string) => {
  return useQuery({
    queryKey: ['unread-alerts-count', salesRepId],
    queryFn: async () => {
      let query = supabase
        .from('sales_alerts')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false);

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    },
  });
};

// Fetch high priority alerts (hot leads) - excludes leads in won/lost stages
export const useHotLeadAlerts = (limit: number = 5) => {
  return useQuery({
    queryKey: ['hot-lead-alerts', limit],
    queryFn: async () => {
      // Get won/lost stage IDs to exclude
      const { data: stages } = await supabase
        .from('sales_pipeline_stages')
        .select('id')
        .or('is_won.eq.true,is_lost.eq.true');

      const excludeStageIds = stages?.map(s => s.id) || [];

      const { data: alerts, error } = await supabase
        .from('sales_alerts')
        .select('*')
        .in('alert_type', ['hot_lead', 'urgency_detected', 'score_spike'])
        .eq('is_actioned', false)
        .gte('priority', 7)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit * 2); // Fetch more to filter later

      if (error) throw error;
      if (!alerts || alerts.length === 0) return [];

      // Fetch related leads with pipeline_stage_id
      const leadIds = alerts.map(a => a.lead_id).filter(Boolean);
      let leadsMap = new Map<string, any>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, email, phone, sales_score, sales_stage, pipeline_stage_id')
          .in('id', leadIds);
        leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
      }

      // Filter out alerts for leads in won/lost stages
      const filteredAlerts = alerts
        .filter(alert => {
          if (!alert.lead_id) return true;
          const lead = leadsMap.get(alert.lead_id);
          if (!lead) return true;
          return !excludeStageIds.includes(lead.pipeline_stage_id);
        })
        .slice(0, limit);

      return filteredAlerts.map(alert => ({
        ...alert,
        contact: leadsMap.get(alert.lead_id) || null,
      })) as SalesAlert[];
    },
  });
};

// All actionable alerts (new alert system + hot leads) for dashboard panel
export const useActionableAlerts = (salesRepId?: string, limit: number = 10) => {
  return useQuery({
    queryKey: ['actionable-alerts', salesRepId, limit],
    queryFn: async () => {
      let query = supabase
        .from('sales_alerts')
        .select('*')
        .eq('is_actioned', false)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit);

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { data: alerts, error } = await query;
      if (error) throw error;
      if (!alerts || alerts.length === 0) return [];

      // Enrich with lead info
      const leadIds = [...new Set(alerts.map(a => a.lead_id).filter(Boolean))];
      let leadsMap = new Map<string, any>();
      if (leadIds.length > 0) {
        const { data: leads } = await supabase
          .from('leads')
          .select('id, name, phone, sales_score, company_name')
          .in('id', leadIds as string[]);
        leadsMap = new Map(leads?.map(l => [l.id, l]) || []);
      }

      return alerts.map(alert => ({
        ...alert,
        contact: leadsMap.get(alert.lead_id) || null,
      })) as SalesAlert[];
    },
    refetchInterval: 60_000, // Refresh every minute
  });
};

// Fetch alerts for specific lead
export const useContactAlerts = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['contact-alerts', leadId],
    queryFn: async () => {
      if (!leadId) return [];

      const { data, error } = await supabase
        .from('sales_alerts')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesAlert[];
    },
    enabled: !!leadId,
  });
};

// Mark alert as read
export const useMarkAlertRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase
        .from('sales_alerts')
        .update({ is_read: true })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
    },
  });
};

// Mark all alerts as read
export const useMarkAllAlertsRead = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (salesRepId?: string) => {
      let query = supabase
        .from('sales_alerts')
        .update({ is_read: true })
        .eq('is_read', false);

      if (salesRepId) {
        query = query.eq('sales_rep_id', salesRepId);
      }

      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
    },
  });
};

// Mark alert as actioned
export const useMarkAlertActioned = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ alertId, actionTaken }: { alertId: string; actionTaken?: string }) => {
      const { data, error } = await supabase
        .from('sales_alerts')
        .update({
          is_actioned: true,
          actioned_at: new Date().toISOString(),
          action_taken: actionTaken,
          is_read: true,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
      queryClient.invalidateQueries({ queryKey: ['hot-lead-alerts'] });
    },
  });
};

// Dismiss alert (mark as actioned without action)
export const useDismissAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      const { data, error } = await supabase
        .from('sales_alerts')
        .update({
          is_actioned: true,
          actioned_at: new Date().toISOString(),
          action_taken: 'Dismissed',
          is_read: true,
        })
        .eq('id', alertId)
        .select()
        .single();

      if (error) throw error;
      return data as SalesAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
      queryClient.invalidateQueries({ queryKey: ['hot-lead-alerts'] });
    },
  });
};

// Create alert (usually done by AI/backend, but exposing for manual creation)
export const useCreateAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      contact_id?: string;
      lead_id?: string;
      deal_id?: string;
      sales_rep_id?: string;
      alert_type: AlertType;
      title: string;
      description?: string;
      priority?: number;
      ai_reasoning?: string;
      expires_at?: string;
      metadata?: Record<string, unknown>;
    }) => {
      const { data, error } = await supabase
        .from('sales_alerts')
        .insert({
          ...input,
          priority: input.priority || 5,
          is_read: false,
          is_actioned: false,
        })
        .select()
        .single();

      if (error) throw error;
      return data as SalesAlert;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-alerts'] });
      queryClient.invalidateQueries({ queryKey: ['unread-alerts-count'] });
      queryClient.invalidateQueries({ queryKey: ['hot-lead-alerts'] });
    },
  });
};

// Delete alert
export const useDeleteAlert = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (alertId: string) => {
      await deleteWithUndo({
        table: 'sales_alerts',
        id: alertId,
        label: 'Alerta',
        queryClient,
        queryKeys: [['sales-alerts'], ['unread-alerts-count']],
      });
    },
  });
};

// Active alerts for a specific deal (by deal_id in metadata)
export const useActiveAlertsForDeal = (dealId: string | undefined) => {
  return useQuery({
    queryKey: ['deal-alerts', dealId],
    queryFn: async () => {
      if (!dealId) return [];
      const { data, error } = await supabase
        .from('sales_alerts')
        .select('*')
        .eq('is_actioned', false)
        .in('alert_type', [
          'no_followup_critical',
          'no_followup_medium',
          'overdue_task',
          'overdue_task_escalated',
          'unconfirmed_meeting',
          'unconfirmed_meeting_escalated',
        ])
        .contains('metadata', { deal_id: dealId })
        .order('priority', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesAlert[];
    },
    enabled: !!dealId,
  });
};

// Active alerts for a specific lead (all types from the new alert system)
export const useActiveAlertsForLead = (leadId: string | undefined) => {
  return useQuery({
    queryKey: ['lead-active-alerts', leadId],
    queryFn: async () => {
      if (!leadId) return [];
      const { data, error } = await supabase
        .from('sales_alerts')
        .select('*')
        .eq('lead_id', leadId)
        .eq('is_actioned', false)
        .in('alert_type', [
          'no_followup_critical',
          'no_followup_medium',
          'overdue_task',
          'overdue_task_escalated',
          'unconfirmed_meeting',
          'unconfirmed_meeting_escalated',
        ])
        .order('priority', { ascending: false });

      if (error) throw error;
      return (data || []) as SalesAlert[];
    },
    enabled: !!leadId,
  });
};

// Get alerts summary by type
export const useAlertsSummary = () => {
  return useQuery({
    queryKey: ['alerts-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_alerts')
        .select('alert_type, is_read, is_actioned');

      if (error) throw error;

      const summary: Record<
        AlertType,
        { total: number; unread: number; pending: number }
      > = {
        hot_lead: { total: 0, unread: 0, pending: 0 },
        checkout_abandoned: { total: 0, unread: 0, pending: 0 },
        reengagement: { total: 0, unread: 0, pending: 0 },
        urgency_detected: { total: 0, unread: 0, pending: 0 },
        score_spike: { total: 0, unread: 0, pending: 0 },
        proposal_follow_up: { total: 0, unread: 0, pending: 0 },
        inactive_warning: { total: 0, unread: 0, pending: 0 },
      };

      data?.forEach((alert) => {
        const type = alert.alert_type as AlertType;
        if (summary[type]) {
          summary[type].total++;
          if (!alert.is_read) summary[type].unread++;
          if (!alert.is_actioned) summary[type].pending++;
        }
      });

      return summary;
    },
  });
};
