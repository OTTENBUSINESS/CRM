// Types para o CRM Comercial AI-First

// =====================================================
// ENUMS & CONSTANTS
// =====================================================

export type SalesStage =
  | 'new'
  | 'captura'
  | 'qualificacao'
  | 'agendamento'
  | 'negociacao'
  | 'fechado'
  | 'perdido';

export type DealStatus =
  | 'negotiation'
  | 'proposal_sent'
  | 'won'
  | 'lost';

export type AlertType =
  | 'hot_lead'
  | 'checkout_abandoned'
  | 'reengagement'
  | 'urgency_detected'
  | 'score_spike'
  | 'proposal_follow_up'
  | 'inactive_warning'
  | 'no_followup_critical'
  | 'no_followup_medium'
  | 'overdue_task'
  | 'overdue_task_escalated'
  | 'unconfirmed_meeting'
  | 'unconfirmed_meeting_escalated'
  | 'no_show_max_attempts';

export type ActivityType =
  | 'call'
  | 'whatsapp'
  | 'email'
  | 'meeting'
  | 'follow_up'
  | 'proposal'
  | 'demo'
  | 'negotiation'
  | 'closing'
  | 'other';

export type ActivityStatus =
  | 'pending'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export type OutcomeType =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'no_answer'
  | 'rescheduled';

export type Sentiment =
  | 'positive'
  | 'neutral'
  | 'negative'
  | 'mixed';

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export type ContactMethod =
  | 'whatsapp'
  | 'phone'
  | 'zoom'
  | 'meet'
  | 'presencial'
  | 'email';

// =====================================================
// PIPELINES
// =====================================================

export interface SalesPipeline {
  id: string;
  name: string;
  description: string | null;
  position: number;
  is_default: boolean;
  is_active: boolean;
  default_sales_rep_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PipelineTransition {
  id: string;
  source_pipeline_id: string;
  source_stage_id: string;
  target_pipeline_id: string;
  target_stage_id: string;
  action: 'move' | 'duplicate';
  is_active: boolean;
  created_at: string;
}

// =====================================================
// PIPELINE STAGES
// =====================================================

export interface PipelineStage {
  id: string;
  pipeline_id: string;
  name: string;
  position: number;
  color: string;
  is_won: boolean;
  is_lost: boolean;
  description?: string;
  auto_move_conditions?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// =====================================================
// BANT QUALIFICATION
// =====================================================

export interface BANTQualification {
  budget: boolean | null;
  authority: boolean | null;
  need: boolean | null;
  timeline: boolean | null;
}

export function calculateBANTScore(bant: BANTQualification): number {
  let score = 0;
  if (bant.budget) score += 25;
  if (bant.authority) score += 25;
  if (bant.need) score += 25;
  if (bant.timeline) score += 25;
  return score;
}

// =====================================================
// SPIN QUALIFICATION
// =====================================================

export interface SPINQualification {
  situation: boolean | null;
  problem: boolean | null;
  implication: boolean | null;
  need: boolean | null;
}

export function calculateSPINScore(spin: SPINQualification): number {
  let score = 0;
  if (spin.situation) score += 25;
  if (spin.problem) score += 25;
  if (spin.implication) score += 25;
  if (spin.need) score += 25;
  return score;
}

// =====================================================
// SALES LEAD (Contact with sales data)
// =====================================================

export interface SalesLead {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  company_name?: string;
  job_title?: string;
  role?: string;
  avatar_url?: string;

  // Lead tracking
  status?: string;
  lead_score: number;
  sales_score: number;
  sales_score_reason?: string;
  sales_stage: SalesStage;
  sales_rep_id?: string;
  expected_revenue?: number;

  // BANT Qualification
  bant_budget?: boolean;
  bant_authority?: boolean;
  bant_need?: boolean;
  bant_timeline?: boolean;

  // Qualification fields
  employee_count?: number;
  monthly_revenue?: string;
  challenges?: string;

  // AI Insights
  ai_conversation_insights?: Record<string, unknown>;
  ai_last_analysis_at?: string;
  ai_objections?: string[];
  ai_interests?: string[];
  ai_sentiment?: Sentiment;
  ai_urgency_level: number;

  // Contact tracking
  last_contact_at?: string;
  next_contact_at?: string;
  first_touch_at?: string;
  last_touch_at?: string;
  converted_at?: string;

  // UTM tracking
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;

  // Webinar tracking (carimbado pela quiz-api no momento do cadastro)
  webinar_config_id?: string | null;

  // Related
  organization_id?: string;
  organization?: {
    id: string;
    name: string;
  };
  sales_rep?: {
    id: string;
    name: string;
    full_name?: string; // alias for compatibility
    avatar_url?: string;
  };

  // Instagram
  instagram?: string;
  instagram_id?: string;
  instagram_profile_id?: string;
  instagram_verified_at?: string;

  // SPIN Qualification
  spin_situation?: boolean;
  spin_problem?: boolean;
  spin_implication?: boolean;
  spin_need?: boolean;

  // Vendor flags
  star_type?: 'yellow' | 'orange' | null;
  is_vip?: boolean;
  tags?: string[];

  // Meeting confirmation
  meeting_confirmation_status?: 'awaiting_confirmation' | 'confirmed' | 'no_show_risk' | null;

  // Metadata
  interested_products?: string[];
  notes?: string;
  metadata?: Record<string, unknown>;
  attachments?: string[];
  created_at: string;
  updated_at: string;
}

// =====================================================
// DEALS / OPPORTUNITIES
// =====================================================

export interface Deal {
  id: string;
  lead_id: string;
  contact_id?: string; // Alias para lead_id (compatibilidade)
  organization_id?: string;
  product_id: string;
  pipeline_id?: string;
  pipeline_stage_id?: string;
  sales_rep_id?: string;
  sdr_id?: string | null;
  title?: string;

  // Pricing
  original_price: number;
  negotiated_price: number;
  discount_percent?: number;
  discount_reason?: string;

  // Payment
  payment_method?: string;
  installments?: number;
  installment_amount?: number;
  entry_amount?: number;
  payment_confirmed_at?: string;

  // Commitment (sinal)
  commitment_amount?: number;
  commitment_date?: string;

  // Status
  status: DealStatus;
  expected_close_date?: string;
  won_at?: string;
  lost_at?: string;
  lost_reason?: string;

  // Proposal
  proposal_sent_at?: string;
  proposal_url?: string;

  // AI
  ai_proposal_suggestion?: {
    recommended_product?: string;
    suggested_price?: number;
    max_discount?: number;
    payment_suggestion?: string;
    selling_points?: string[];
  };
  ai_win_probability: number;

  // Metadata
  notes?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;

  // Related
  lead?: SalesLead;
  contact?: SalesLead; // Alias para lead (compatibilidade)
  organization?: {
    id: string;
    name: string;
  };
  product?: {
    id: string;
    name: string;
    price?: number;
  };
  pipeline_stage?: PipelineStage;
  sales_rep?: {
    id: string;
    name: string;
    full_name?: string; // alias for compatibility
    avatar_url?: string;
  };
  sdr?: {
    id: string;
    name: string;
  } | null;
  contacts?: Array<{
    id: string;
    lead_id: string;
    role: string | null;
    is_primary: boolean;
    lead?: { id: string; name: string; phone: string | null; company_name: string | null };
  }>;
}

// =====================================================
// SALES ACTIVITIES
// =====================================================

export interface SalesActivity {
  id: string;
  contact_id?: string;
  lead_id?: string;
  deal_id?: string;
  organization_id?: string;
  sales_rep_id?: string;

  // Activity details
  activity_type: ActivityType;
  title: string;
  description?: string;
  notes?: string;

  // Outcome
  outcome?: string;
  outcome_type?: OutcomeType;

  // Scheduling
  priority: Priority;
  status: ActivityStatus;
  scheduled_at?: string;
  completed_at?: string;
  duration_minutes?: number;

  // Contact method
  contact_method?: ContactMethod;
  meeting_link?: string;

  // AI
  ai_generated: boolean;
  ai_suggestion?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;

  // Related
  contact?: {
    id: string;
    name: string;
    phone?: string;
  };
  deal?: {
    id: string;
    negotiated_price: number;
    status: DealStatus;
  };
  sales_rep?: {
    id: string;
    name: string;
    full_name?: string;
  };
}

// =====================================================
// SALES ALERTS
// =====================================================

export interface SalesAlert {
  id: string;
  contact_id?: string;
  lead_id?: string;
  deal_id?: string;
  sales_rep_id?: string;

  // Alert details
  alert_type: AlertType;
  title: string;
  description?: string;
  priority: number; // 1-10

  // Status
  is_read: boolean;
  is_actioned: boolean;
  actioned_at?: string;
  action_taken?: string;
  expires_at?: string;

  // AI
  ai_reasoning?: string;

  // Metadata
  metadata?: Record<string, unknown>;
  created_at: string;

  // Related
  contact?: SalesLead;
  deal?: Deal;
}

// =====================================================
// CONVERSATION ANALYSIS
// =====================================================

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  conversation_id?: string;
  analysis_type: 'full' | 'incremental' | 'summary';
  messages_analyzed: number;
  last_message_id?: string;

  // Analysis results
  sentiment?: Sentiment;
  interest_level?: number; // 0-10
  urgency_level?: number; // 0-10
  objections: string[];
  interests: string[];
  key_topics: string[];
  unanswered_questions: string[];
  recommended_actions: string[];
  summary?: string;

  // Raw data
  raw_analysis?: Record<string, unknown>;
  created_at: string;
}

// =====================================================
// MESSAGE TEMPLATES
// =====================================================

export type MessageTemplateType =
  | 'first_contact'
  | 'follow_up'
  | 'objection_handling'
  | 'proposal'
  | 'reengagement'
  | 'closing'
  | 'custom';

export interface SalesMessageTemplate {
  id: string;
  contact_id: string;
  template_type: MessageTemplateType;
  title: string;
  content: string;
  context?: Record<string, unknown>;
  is_used: boolean;
  used_at?: string;
  effectiveness_rating?: number; // 1-5
  created_at: string;
}

// =====================================================
// DASHBOARD STATS
// =====================================================

export interface SalesDashboardStats {
  // Pipeline overview
  total_leads: number;
  leads_by_stage: Record<SalesStage, number>;

  // Deals
  total_deals: number;
  deals_value: number;
  won_deals: number;
  won_value: number;
  lost_deals: number;

  // Conversion
  conversion_rate: number;
  avg_deal_value: number;
  avg_sales_cycle_days: number;

  // Activity
  activities_today: number;
  activities_overdue: number;
  calls_made: number;
  proposals_sent: number;

  // AI metrics
  hot_leads_count: number;
  unread_alerts: number;
  ai_score_avg: number;
}

export interface SalesForecast {
  period: string;
  expected_revenue: number;
  deals_count: number;
  probability_weighted_value: number;
}

// =====================================================
// PIPELINE VIEW
// =====================================================

export interface PipelineColumn {
  stage: PipelineStage;
  deals: Deal[];
  total_value: number;
  count: number;
}

// =====================================================
// INPUT TYPES
// =====================================================

export interface CreateDealInput {
  lead_id: string;
  contact_id?: string; // Alias para lead_id (compatibilidade)
  organization_id?: string;
  product_id: string;
  pipeline_id?: string;
  pipeline_stage_id?: string;
  sales_rep_id?: string;
  sdr_id?: string;
  original_price: number;
  negotiated_price: number;
  discount_percent?: number;
  discount_reason?: string;
  payment_method?: string;
  installments?: number;
  expected_close_date?: string;
  notes?: string;
}

export interface UpdateDealInput extends Partial<CreateDealInput> {
  id: string;
  status?: DealStatus;
  won_at?: string;
  lost_at?: string;
  lost_reason?: string;
  proposal_sent_at?: string;
  proposal_url?: string;
}

export interface CreateActivityInput {
  contact_id?: string;
  lead_id?: string;
  deal_id?: string;
  organization_id?: string;
  sales_rep_id?: string;
  activity_type: ActivityType;
  title: string;
  description?: string;
  priority?: Priority;
  scheduled_at?: string;
  contact_method?: ContactMethod;
  meeting_link?: string;
}

export interface UpdateActivityInput extends Partial<CreateActivityInput> {
  id: string;
  status?: ActivityStatus;
  outcome?: string;
  outcome_type?: OutcomeType;
  notes?: string;
  completed_at?: string;
  duration_minutes?: number;
}

export interface UpdateLeadSalesInput {
  id: string;
  sales_score?: number;
  sales_score_reason?: string;
  sales_stage?: SalesStage;
  sales_rep_id?: string;
  expected_revenue?: number;
  bant_budget?: boolean;
  bant_authority?: boolean;
  bant_need?: boolean;
  bant_timeline?: boolean;
  next_contact_at?: string;
  star_type?: 'yellow' | 'orange' | null;
}

// =====================================================
// FILTERS
// =====================================================

export interface SalesLeadFilters {
  sales_stage?: SalesStage;
  sales_rep_id?: string;
  min_score?: number;
  has_deal?: boolean;
  search?: string;
}

export interface DealFilters {
  pipeline_stage_id?: string;
  status?: DealStatus;
  sales_rep_id?: string;
  product_id?: string;
  min_value?: number;
  max_value?: number;
}

export interface ActivityFilters {
  sales_rep_id?: string;
  activity_type?: ActivityType;
  status?: ActivityStatus;
  contact_id?: string;
  deal_id?: string;
  from_date?: string;
  to_date?: string;
}

export interface AlertFilters {
  sales_rep_id?: string;
  alert_type?: AlertType;
  is_read?: boolean;
  is_actioned?: boolean;
  min_priority?: number;
}
