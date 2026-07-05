// Campaign Module Types

export type CampaignStatus = 'draft' | 'scheduled' | 'sending' | 'paused' | 'completed' | 'cancelled';

export type CampaignLeadStatus = 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'responded' | 'failed' | 'blocked' | 'skipped';

export type AssignmentMode = 'sdr_round_robin' | 'specific_sdr' | 'closer_round_robin' | 'specific_closer' | 'keep_current';

export type CampaignProvider = 'uazapi' | 'cloud_api';

/**
 * Parâmetro de template Meta. Cada um corresponde a um {{1}}, {{2}}... no template aprovado.
 *   - type='static': valor fixo digitado pelo usuário
 *   - type='lead_field': resolve do lead em runtime (ex: 'nome', 'primeiro_nome', 'cidade')
 */
export interface CloudTemplateParam {
  index: number;            // 1, 2, 3...
  type: 'static' | 'lead_field';
  value: string;            // texto OU nome do campo do lead
}

export interface CampaignTemplate {
  id: string;
  name: string;
  content: string;
  category: string;
  variables: string[];
  is_active: boolean;
  usage_count: number;
  last_used_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  provider: CampaignProvider;
  template_id: string | null;
  cloud_template_id: string | null;
  cloud_template_params: CloudTemplateParam[];
  message_content: string;
  message_contents?: string[];
  audience_filters: AudienceFilters;
  audience_count: number;
  instance_ids: string[];
  assignment_mode: AssignmentMode;
  assignment_target_id: string | null;
  assignment_distribution_config_id: string | null;
  scheduled_at: string | null;
  business_hours_start: string;
  business_hours_end: string;
  delay_min_seconds: number;
  delay_max_seconds: number;
  batch_size: number;
  batch_pause_min_seconds: number;
  batch_pause_max_seconds: number;
  hourly_limit_per_instance: number;
  daily_limit_per_instance: number;
  total_leads: number;
  sent_count: number;
  delivered_count: number;
  read_count: number;
  responded_count: number;
  failed_count: number;
  blocked_count: number;
  started_at: string | null;
  completed_at: string | null;
  paused_at: string | null;
  pause_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  created_by_member?: { id: string; name: string } | null;
  template?: CampaignTemplate | null;
}

export interface CampaignLead {
  id: string;
  campaign_id: string;
  lead_id: string;
  status: CampaignLeadStatus;
  resolved_message: string | null;
  instance_id: string | null;
  whatsapp_message_id: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  responded_at: string | null;
  failed_at: string | null;
  error_message: string | null;
  retry_count: number;
  assigned_to: string | null;
  response_message_id: string | null;
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
  assigned_member?: { id: string; name: string } | null;
}

export interface AudienceFilters {
  pipeline_stage_ids?: string[];
  sales_stages?: string[];
  created_after?: string;
  created_before?: string;
  last_interaction_after?: string;
  last_interaction_before?: string;
  capital_min?: number;
  capital_max?: number;
  cities?: string[];
  states?: string[];
  utm_sources?: string[];
  utm_campaigns?: string[];
  score_min?: number;
  score_max?: number;
  sales_rep_ids?: string[];
  no_sales_rep?: boolean;
  bant_budget?: boolean;
  bant_authority?: boolean;
  bant_need?: boolean;
  bant_timeline?: boolean;
  exclude_campaign_days?: number;
  exclude_lead_ids?: string[];
}

export interface CampaignMetrics {
  total_campaigns: number;
  active_campaigns: number;
  total_leads_contacted: number;
  total_responded: number;
  avg_response_rate: number;
  total_blocked: number;
}

export interface CampaignVariable {
  key: string;
  label: string;
  example: string;
}

export const CAMPAIGN_VARIABLES: CampaignVariable[] = [
  { key: '{{nome}}', label: 'Nome do Lead', example: 'João Silva' },
  { key: '{{primeiro_nome}}', label: 'Primeiro Nome', example: 'João' },
  { key: '{{email}}', label: 'Email', example: 'joao@email.com' },
  { key: '{{telefone}}', label: 'Telefone', example: '5531999999999' },
  { key: '{{cidade}}', label: 'Cidade', example: 'Belo Horizonte' },
  { key: '{{estado}}', label: 'Estado', example: 'MG' },
  { key: '{{empresa}}', label: 'Empresa', example: 'Empresa X' },
  { key: '{{vendedor}}', label: 'Vendedor Responsável', example: 'Maria' },
];

export const CAMPAIGN_STATUS_CONFIG: Record<CampaignStatus, { label: string; color: string; bgColor: string }> = {
  draft: { label: 'Rascunho', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  scheduled: { label: 'Agendada', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sending: { label: 'Enviando', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  paused: { label: 'Pausada', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  completed: { label: 'Concluída', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: 'Cancelada', color: 'text-red-600', bgColor: 'bg-red-100' },
};

export const CAMPAIGN_LEAD_STATUS_CONFIG: Record<CampaignLeadStatus, { label: string; color: string; bgColor: string }> = {
  pending: { label: 'Pendente', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  sending: { label: 'Enviando', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sent: { label: 'Enviado', color: 'text-sky-600', bgColor: 'bg-sky-100' },
  delivered: { label: 'Entregue', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  read: { label: 'Lido', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  responded: { label: 'Respondeu', color: 'text-green-600', bgColor: 'bg-green-100' },
  failed: { label: 'Falhou', color: 'text-red-600', bgColor: 'bg-red-100' },
  blocked: { label: 'Bloqueado', color: 'text-rose-600', bgColor: 'bg-rose-100' },
  skipped: { label: 'Pulado', color: 'text-slate-600', bgColor: 'bg-slate-100' },
};

export const ASSIGNMENT_MODE_LABELS: Record<AssignmentMode, string> = {
  sdr_round_robin: 'Grupo SDR (round-robin)',
  specific_sdr: 'SDR Específico',
  closer_round_robin: 'Grupo Closer (round-robin)',
  specific_closer: 'Closer Específico',
  keep_current: 'Manter Responsável Atual',
};
