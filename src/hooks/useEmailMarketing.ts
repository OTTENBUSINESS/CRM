import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import type {
  EmailTemplate,
  EmailCampaign,
  EmailCampaignLead,
  EmailCampaignStatus,
  EmailCampaignLeadStatus,
  EmailUnsubscribe,
  EmailAudienceFilters,
} from '@/types/email.types';

// ---------------------------------------------------------------------------
// Query keys — centralizadas pra invalidar lista + individual sem digitar
// string solta em cada lugar.
// ---------------------------------------------------------------------------
const templateKeys = {
  all: ['email-templates'] as const,
  detail: (id?: string) => ['email-template', id] as const,
};

const campaignKeys = {
  all: ['email-campaigns'] as const,
  detail: (id?: string) => ['email-campaign', id] as const,
};

const unsubscribeKeys = {
  all: ['email-unsubscribes'] as const,
};

// Linha de log de envio (usada pelo AutomationReportSheet e páginas de dashboard)
export interface EmailSendLogRow {
  id: string;
  campaign_id: string | null;
  automation_run_id: string | null;
  lead_id: string | null;
  email: string;
  status: string;
  html: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  open_count: number | null;
  clicked_at: string | null;
  click_count: number | null;
  clicked_url: string | null;
  bounced_at: string | null;
  bounce_reason: string | null;
  error_message: string | null;
  created_at: string;
  lead?: { id: string; name: string } | null;
  campaign?: { id: string; name: string; subject: string } | null;
}

// ===========================================================================
// TEMPLATES
// ===========================================================================

export function useEmailTemplates() {
  return useQuery({
    queryKey: templateKeys.all,
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('email_templates' as any)
        .select('*')
        .eq('is_active', true)
        .order('updated_at', { ascending: false }) as any);

      if (error) {
        console.error('Error fetching email templates');
        throw error;
      }
      return (data || []) as EmailTemplate[];
    },
  });
}

export function useEmailTemplate(id?: string) {
  return useQuery({
    queryKey: templateKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('email_templates' as any)
        .select('*')
        .eq('id', id)
        .single() as any);

      if (error) {
        console.error('Error fetching email template');
        throw error;
      }
      return data as EmailTemplate;
    },
    enabled: !!id,
  });
}

export function useCreateEmailTemplate() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async (template: Partial<EmailTemplate>) => {
      const { data, error } = await (supabase
        .from('email_templates' as any)
        .insert({
          ...template,
          created_by: teamMember?.id,
        })
        .select()
        .single() as any);

      if (error) {
        console.error('Error creating email template');
        throw error;
      }
      return data as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(data?.id) });
    },
  });
}

export function useUpdateEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailTemplate> & { id: string }) => {
      const { data, error } = await (supabase
        .from('email_templates' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single() as any);

      if (error) {
        console.error('Error updating email template');
        throw error;
      }
      return data as EmailTemplate;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(data?.id) });
    },
  });
}

export function useDeleteEmailTemplate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Soft delete — mantém histórico de campanhas que usaram o template
      const { error } = await (supabase
        .from('email_templates' as any)
        .update({ is_active: false })
        .eq('id', id) as any);

      if (error) {
        console.error('Error deleting email template');
        throw error;
      }
      return id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: templateKeys.all });
      queryClient.invalidateQueries({ queryKey: templateKeys.detail(id) });
    },
  });
}

// Envia teste a partir do editor de template (assinatura: { to, subject, html_content })
export function useSendTestEmail() {
  return useMutation({
    mutationFn: async ({
      to,
      subject,
      html_content,
    }: {
      to: string;
      subject: string;
      html_content: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-email-campaign', {
        body: { test_email: to, subject, html: html_content },
      });

      if (error) {
        console.error('Error sending test email');
        throw error;
      }
      return data;
    },
  });
}

// ===========================================================================
// CAMPANHAS
// ===========================================================================

export function useEmailCampaigns(status?: EmailCampaignStatus, sourceType: string = 'campaign') {
  return useQuery({
    queryKey: [...campaignKeys.all, status ?? 'all', sourceType],
    queryFn: async () => {
      let query = (supabase
        .from('email_campaigns' as any)
        .select(`
          *,
          created_by_member:team_members!created_by(id, name),
          template:email_templates!template_id(id, name, subject)
        `)
        .eq('source_type', sourceType)
        .order('created_at', { ascending: false }) as any);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching email campaigns');
        throw error;
      }
      return (data || []) as EmailCampaign[];
    },
  });
}

export function useEmailCampaign(id?: string) {
  return useQuery({
    queryKey: campaignKeys.detail(id),
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('email_campaigns' as any)
        .select(`
          *,
          created_by_member:team_members!created_by(id, name),
          template:email_templates!template_id(*)
        `)
        .eq('id', id)
        .single() as any);

      if (error) {
        console.error('Error fetching email campaign');
        throw error;
      }
      return data as EmailCampaign;
    },
    enabled: !!id,
  });
}

export function useCreateEmailCampaign() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async (campaign: Partial<EmailCampaign>) => {
      const { data, error } = await (supabase
        .from('email_campaigns' as any)
        .insert({
          ...campaign,
          created_by: teamMember?.id,
        })
        .select()
        .single() as any);

      if (error) {
        console.error('Error creating email campaign');
        throw error;
      }
      return data as EmailCampaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(data?.id) });
    },
  });
}

export function useUpdateEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<EmailCampaign> & { id: string }) => {
      const { data, error } = await (supabase
        .from('email_campaigns' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single() as any);

      if (error) {
        console.error('Error updating email campaign');
        throw error;
      }
      return data as EmailCampaign;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(data?.id) });
    },
  });
}

// Dispara a campanha: popula leads, marca como "sending" e invoca a edge function
export function useStartEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (campaignId: string) => {
      // 1) Popula os leads da campanha a partir dos filtros salvos
      const { error: rpcError } = await supabase.rpc('populate_email_campaign_leads', {
        p_campaign_id: campaignId,
      });
      if (rpcError) {
        console.error('Error populating campaign leads');
        throw rpcError;
      }

      // 2) Marca a campanha como "enviando"
      const { error: updateError } = await (supabase
        .from('email_campaigns' as any)
        .update({ status: 'sending', started_at: new Date().toISOString() })
        .eq('id', campaignId) as any);
      if (updateError) {
        console.error('Error updating campaign status');
        throw updateError;
      }

      // 3) Invoca a edge function que faz o disparo real
      const { data, error: fnError } = await supabase.functions.invoke('send-email-campaign', {
        body: { campaign_id: campaignId },
      });
      if (fnError) {
        console.error('Error invoking send-email-campaign');
        throw fnError;
      }
      return data;
    },
    onSuccess: (_data, campaignId) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

export function useScheduleEmailCampaign() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      campaignId,
      scheduledAt,
    }: {
      campaignId: string;
      scheduledAt: string;
    }) => {
      const { data, error } = await (supabase
        .from('email_campaigns' as any)
        .update({
          status: 'scheduled',
          scheduled_at: new Date(scheduledAt).toISOString(),
        })
        .eq('id', campaignId)
        .select()
        .single() as any);

      if (error) {
        console.error('Error scheduling email campaign');
        throw error;
      }
      return data as EmailCampaign;
    },
    onSuccess: (_data, { campaignId }) => {
      queryClient.invalidateQueries({ queryKey: campaignKeys.all });
      queryClient.invalidateQueries({ queryKey: campaignKeys.detail(campaignId) });
    },
  });
}

// Envia teste a partir do wizard de campanha (assinatura: { campaignId, testEmail, html })
export function useSendEmailCampaignTest() {
  return useMutation({
    mutationFn: async ({
      campaignId,
      testEmail,
      html,
    }: {
      campaignId: string;
      testEmail: string;
      html: string;
    }) => {
      const { data, error } = await supabase.functions.invoke('send-email-campaign', {
        body: { campaign_id: campaignId, test_email: testEmail, html },
      });

      if (error) {
        console.error('Error sending campaign test email');
        throw error;
      }
      return data;
    },
  });
}

// Conta quantos leads a audiência atinge (ou usa lead_ids quando em modo "específicos")
export function useEmailAudienceCount(filters: EmailAudienceFilters) {
  return useQuery({
    queryKey: ['email-audience-count', filters],
    queryFn: async () => {
      // Modo "leads específicos": não precisa bater no banco
      if (filters.lead_ids?.length) {
        return filters.lead_ids.length;
      }

      const { data, error } = await supabase.rpc('get_email_audience_count', {
        p_filters: filters,
      });

      if (error) {
        console.error('Error counting email audience');
        throw error;
      }
      return (data as number) ?? 0;
    },
  });
}

// ===========================================================================
// LEADS DA CAMPANHA
// ===========================================================================

export function useEmailCampaignLeads(
  campaignId: string,
  status?: EmailCampaignLeadStatus,
  page: number = 0,
  pageSize: number = 50,
  campaignStatus?: string,
) {
  return useQuery({
    queryKey: ['email-campaign-leads', campaignId, status ?? 'all', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase
        .from('email_campaign_leads' as any)
        .select(
          `
          *,
          lead:leads!lead_id(id, name, phone, email, city_name, state, sales_rep_id)
        `,
          { count: 'exact' },
        )
        .eq('campaign_id', campaignId)
        .order('created_at', { ascending: false })
        .range(from, to) as any);

      if (status) {
        query = query.eq('status', status);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching campaign leads');
        throw error;
      }
      return {
        leads: (data || []) as EmailCampaignLead[],
        total: count ?? 0,
      };
    },
    enabled: !!campaignId,
    // Enquanto a campanha está enviando, atualiza sozinho pra acompanhar o progresso
    refetchInterval: campaignStatus === 'sending' ? 5000 : false,
  });
}

// ===========================================================================
// CONFIG / REMETENTE (Brevo/Resend)
// ===========================================================================

export function useBrevoSettings() {
  return useQuery({
    queryKey: ['brevo-settings'],
    queryFn: async () => {
      const { data, error } = await (supabase
        .from('config' as any)
        .select('key,value')
        .in('key', ['EMAIL_FROM', 'EMAIL_FROM_NAME']) as any);

      if (error) {
        console.error('Error fetching sender settings');
        throw error;
      }

      const rows = (data || []) as Array<{ key: string; value: string }>;
      if (!rows.length) return null;

      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return {
        sender_name: map['EMAIL_FROM_NAME'] || '',
        sender_email: map['EMAIL_FROM'] || '',
      };
    },
  });
}

// ===========================================================================
// DESCADASTROS (unsubscribes)
// ===========================================================================

export function useEmailUnsubscribes(page: number = 0) {
  const pageSize = 50;
  return useQuery({
    queryKey: [...unsubscribeKeys.all, page],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      const { data, error, count } = await (supabase
        .from('email_unsubscribes' as any)
        .select('*', { count: 'exact' })
        .order('unsubscribed_at', { ascending: false })
        .range(from, to) as any);

      if (error) {
        console.error('Error fetching unsubscribes');
        throw error;
      }
      return {
        unsubscribes: (data || []) as EmailUnsubscribe[],
        total: count ?? 0,
      };
    },
  });
}

export function useManualUnsubscribe() {
  const queryClient = useQueryClient();
  const { teamMember } = useAuth();

  return useMutation({
    mutationFn: async ({ email, reason }: { email: string; reason?: string }) => {
      const { data, error } = await (supabase
        .from('email_unsubscribes' as any)
        .insert({
          email: email.trim().toLowerCase(),
          reason: reason || null,
          source: 'manual',
          created_by: teamMember?.id,
        })
        .select()
        .single() as any);

      if (error) {
        console.error('Error creating manual unsubscribe');
        throw error;
      }
      return data as EmailUnsubscribe;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unsubscribeKeys.all });
    },
  });
}

// ===========================================================================
// AUTOMAÇÃO — envios e execuções
// ===========================================================================

// Envios (email_sends) disparados por uma automação.
// Ligação: email_sends.automation_run_id → email_flow_runs.id (que tem automation_id).
export function useAutomationSends(automationId: string, page: number = 0, size: number = 25) {
  return useQuery({
    queryKey: ['automation-sends', automationId, page, size],
    queryFn: async () => {
      const from = page * size;
      const to = from + size - 1;

      // 1) Pega os run ids dessa automação
      const { data: runs, error: runsError } = await (supabase
        .from('email_flow_runs' as any)
        .select('id')
        .eq('automation_id', automationId) as any);

      if (runsError) {
        console.error('Error fetching automation runs for sends');
        throw runsError;
      }

      const runIds = (runs || []).map((r: { id: string }) => r.id);
      if (!runIds.length) {
        return { rows: [] as EmailSendLogRow[], total: 0 };
      }

      // 2) Busca os envios ligados a esses runs
      const { data, error, count } = await (supabase
        .from('email_sends' as any)
        .select(
          `
          *,
          lead:leads!lead_id(id, name),
          campaign:email_campaigns!campaign_id(id, name, subject)
        `,
          { count: 'exact' },
        )
        .in('automation_run_id', runIds)
        .order('created_at', { ascending: false })
        .range(from, to) as any);

      if (error) {
        console.error('Error fetching automation sends');
        throw error;
      }
      return {
        rows: (data || []) as EmailSendLogRow[],
        total: count ?? 0,
      };
    },
    enabled: !!automationId,
  });
}

// Execuções (email_flow_runs) de uma automação.
export function useAutomationRuns(automationId: string, page: number = 0, size: number = 25) {
  return useQuery({
    queryKey: ['automation-runs', automationId, page, size],
    queryFn: async () => {
      const from = page * size;
      const to = from + size - 1;

      const { data, error, count } = await (supabase
        .from('email_flow_runs' as any)
        .select(
          `
          *,
          lead:leads!lead_id(id, name)
        `,
          { count: 'exact' },
        )
        .eq('automation_id', automationId)
        .order('started_at', { ascending: false })
        .range(from, to) as any);

      if (error) {
        console.error('Error fetching automation runs');
        throw error;
      }
      return {
        rows: (data || []) as any[],
        total: count ?? 0,
      };
    },
    enabled: !!automationId,
  });
}

// ===========================================================================
// DASHBOARD — KPIs, série temporal e log de envios
// ===========================================================================

export interface EmailKpis {
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  open_rate: number;
  click_rate: number;
}

// KPIs agregados dos últimos `period` dias (default 30)
export function useEmailKpis(period: number = 30) {
  return useQuery({
    queryKey: ['email-kpis', period],
    queryFn: async (): Promise<EmailKpis> => {
      const since = new Date();
      since.setDate(since.getDate() - period);

      const { data, error } = await (supabase
        .from('email_sends' as any)
        .select('status, sent_at, delivered_at, opened_at, clicked_at, bounced_at')
        .gte('created_at', since.toISOString()) as any);

      if (error) {
        console.error('Error fetching email KPIs');
        throw error;
      }

      const rows = (data || []) as EmailSendLogRow[];
      const total_sent = rows.filter((r) => !!r.sent_at).length;
      const total_delivered = rows.filter((r) => !!r.delivered_at).length;
      const total_opened = rows.filter((r) => !!r.opened_at).length;
      const total_clicked = rows.filter((r) => !!r.clicked_at).length;
      const total_bounced = rows.filter((r) => !!r.bounced_at).length;

      const base = total_delivered || total_sent || 1;
      return {
        total_sent,
        total_delivered,
        total_opened,
        total_clicked,
        total_bounced,
        open_rate: Math.round((total_opened / base) * 100),
        click_rate: Math.round((total_clicked / base) * 100),
      };
    },
  });
}

export interface EmailTimeseriePoint {
  date: string;
  sent: number;
  opened: number;
  clicked: number;
}

// Série temporal (envios/abertos/cliques por dia) dos últimos `days` dias
export function useEmailSendsTimeseries(days: number = 14) {
  return useQuery({
    queryKey: ['email-sends-timeseries', days],
    queryFn: async (): Promise<EmailTimeseriePoint[]> => {
      const since = new Date();
      since.setDate(since.getDate() - days);

      const { data, error } = await (supabase
        .from('email_sends' as any)
        .select('sent_at, opened_at, clicked_at, created_at')
        .gte('created_at', since.toISOString()) as any);

      if (error) {
        console.error('Error fetching email timeseries');
        throw error;
      }

      // Bucketiza por dia (YYYY-MM-DD)
      const buckets = new Map<string, EmailTimeseriePoint>();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        buckets.set(key, { date: key, sent: 0, opened: 0, clicked: 0 });
      }

      for (const r of (data || []) as EmailSendLogRow[]) {
        const day = (r.sent_at || r.created_at)?.slice(0, 10);
        const point = day ? buckets.get(day) : undefined;
        if (!point) continue;
        if (r.sent_at) point.sent += 1;
        if (r.opened_at) point.opened += 1;
        if (r.clicked_at) point.clicked += 1;
      }

      return Array.from(buckets.values());
    },
  });
}

export interface EmailSendsLogFilters {
  status?: string;
  campaignId?: string;
  page?: number;
  pageSize?: number;
}

// Log paginado de envios com filtro opcional por status/campanha
export function useEmailSendsLog(filters: EmailSendsLogFilters = {}) {
  const { status, campaignId, page = 0, pageSize = 50 } = filters;
  return useQuery({
    queryKey: ['email-sends-log', status ?? 'all', campaignId ?? 'all', page, pageSize],
    queryFn: async () => {
      const from = page * pageSize;
      const to = from + pageSize - 1;

      let query = (supabase
        .from('email_sends' as any)
        .select(
          `
          *,
          lead:leads!lead_id(id, name),
          campaign:email_campaigns!campaign_id(id, name, subject)
        `,
          { count: 'exact' },
        )
        .order('created_at', { ascending: false })
        .range(from, to) as any);

      if (status) {
        query = query.eq('status', status);
      }
      if (campaignId) {
        query = query.eq('campaign_id', campaignId);
      }

      const { data, error, count } = await query;

      if (error) {
        console.error('Error fetching email sends log');
        throw error;
      }
      return {
        rows: (data || []) as EmailSendLogRow[],
        total: count ?? 0,
      };
    },
  });
}
