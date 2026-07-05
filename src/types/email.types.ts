// Email Marketing Module Types

export type EmailCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled';

export type EmailCampaignLeadStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed' | 'failed' | 'skipped';



export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  html_content: string;
  text_content: string | null;
  design_json: any | null; // Unlayer JSON
  thumbnail_url: string | null;
  category: string;
  variables: string[];
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailCampaign {
  id: string;
  name: string;
  description: string | null;
  status: EmailCampaignStatus;
  template_id: string | null;
  subject: string;
  from_name: string;
  from_email: string;
  reply_to: string | null;
  html_content: string | null;
  audience_filters: EmailAudienceFilters;
  // Denormalized metrics
  total_leads: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  complained_count: number;
  unsubscribed_count: number;
  failed_count: number;
  // Scheduling
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  // Meta
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  created_by_member?: { id: string; name: string } | null;
  template?: EmailTemplate | null;
}

export interface EmailCampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string | null;
  email: string;
  name: string | null;
  status: EmailCampaignLeadStatus;
  brevo_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  open_count: number;
  click_count: number;
  clicked_urls: string[];
  created_at: string;
  updated_at: string;
  // Joined
  lead?: {
    id: string;
    name: string;
    phone: string | null;
    email: string | null;
    city_name: string | null;
    state: string | null;
    sales_rep_id: string | null;
  } | null;
}


export interface EmailUnsubscribe {
  id: string;
  email: string;
  lead_id: string | null;
  reason: string | null;
  source: string;
  unsubscribed_at: string;
  created_at: string;
}

export interface EmailAudienceFilters {
  pipeline_stage_ids?: string[];
  states?: string[];
  cities?: string[];
  utm_sources?: string[];
  utm_campaigns?: string[];
  score_min?: number;
  score_max?: number;
  created_after?: string;
  created_before?: string;
  sales_rep_ids?: string[];
  exclude_campaign_days?: number;
  exclude_lead_ids?: string[];
  // Modo "leads específicos": quando preenchido, ignora os demais filtros
  lead_ids?: string[];
}

export interface EmailMetrics {
  total_campaigns: number;
  active_campaigns: number;
  total_sent: number;
  total_delivered: number;
  total_opened: number;
  total_clicked: number;
  total_bounced: number;
  total_unsubscribed: number;
  avg_open_rate: number;
  avg_click_rate: number;
}

export interface BrevoSettings {
  api_key: string;
  sender_name: string;
  sender_email: string;
}

// Status display configs
export const EMAIL_CAMPAIGN_STATUS_CONFIG: Record<EmailCampaignStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Rascunho', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  scheduled: { label: 'Agendada', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sending: { label: 'Enviando', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  paused: { label: 'Pausada', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  completed: { label: 'Concluída', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelada', color: 'text-red-600', bgColor: 'bg-red-100' },
};

export const EMAIL_LEAD_STATUS_CONFIG: Record<EmailCampaignLeadStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pendente', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  sending: { label: 'Enviando', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sent: { label: 'Enviado', color: 'text-sky-600', bgColor: 'bg-sky-100' },
  delivered: { label: 'Entregue', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  opened: { label: 'Aberto', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  clicked: { label: 'Clicou', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  bounced: { label: 'Bounce', color: 'text-red-600', bgColor: 'bg-red-100' },
  complained: { label: 'Spam', color: 'text-rose-600', bgColor: 'bg-rose-100' },
  unsubscribed: { label: 'Descadastrou', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  failed: { label: 'Falhou', color: 'text-red-600', bgColor: 'bg-red-100' },
  skipped: { label: 'Pulado', color: 'text-slate-600', bgColor: 'bg-slate-100' },
};


export const EMAIL_VARIABLES = [
  { key: '{{nome}}', label: 'Nome do Lead', example: 'João Silva' },
  { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'João' },
  { key: '{{email}}', label: 'Email', example: 'joao@email.com' },
  { key: '{{telefone}}', label: 'Telefone', example: '5531999999999' },
  { key: '{{cidade}}', label: 'Cidade', example: 'Belo Horizonte' },
  { key: '{{estado}}', label: 'Estado', example: 'MG' },
  { key: '{{empresa}}', label: 'Empresa', example: 'Empresa X' },
  { key: '{{link_descadastro}}', label: 'Link Descadastro', example: 'https://...' },
];
