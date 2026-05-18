// Types para o Sales Coach com Playbooks
// =====================================================

// =====================================================
// ENUMS & CONSTANTS
// =====================================================

export type PlaybookType = 'sales' | 'cs' | 'onboarding' | 'support' | 'custom';

export type AlertSeverity = 'warning' | 'error' | 'info';

export type SuggestionType = 'objection_handler' | 'question' | 'closing' | 'info' | 'tip';

export type ChecklistItemStatus = 'pending' | 'completed' | 'skipped';

// =====================================================
// PLAYBOOK STRUCTURE
// =====================================================

export interface PlaybookChecklistItem {
  id: string;
  text: string;
  required?: boolean;
}

export interface PlaybookAlert {
  id: string;
  trigger: string; // Palavra-chave ou padrão que dispara o alerta
  message: string;
  severity: AlertSeverity;
}

export interface PlaybookPhase {
  id: string;
  name: string;
  description?: string;
  order: number;
  // Checklist can be array of objects or array of strings (for backwards compatibility)
  checklist: (PlaybookChecklistItem | string)[];
  // Alerts can be objects or just trigger strings
  alerts?: (PlaybookAlert | string)[];
  tips?: string[];
  instructions?: string; // AI instructions for this phase
  suggested_duration_seconds?: number;
}

// =====================================================
// COACH PLAYBOOK (from DB)
// =====================================================

export interface CoachPlaybook {
  id: string;
  name: string;
  type: PlaybookType;
  description?: string;
  context?: string; // Contexto adicional para a IA
  phases: PlaybookPhase[];
  is_active: boolean;
  is_default: boolean;
  created_by?: string;
  organization_id?: string;
  created_at: string;
  updated_at: string;
}

// =====================================================
// COACH SESSION (from DB)
// =====================================================

export interface CoachSessionEvent {
  id: string;
  type: 'phase_change' | 'alert_triggered' | 'suggestion_shown' | 'checklist_item_completed' | 'manual_note';
  timestamp: string;
  data: Record<string, unknown>;
}

export interface CoachSession {
  id: string;
  call_id?: string;
  playbook_id?: string;
  lead_id?: string;
  team_member_id?: string;
  briefing?: string;
  current_phase_index: number;
  checklist_state: Record<string, ChecklistItemStatus>; // { "item_id": "completed" }
  events: CoachSessionEvent[];
  phases_completed: number;
  alerts_triggered: number;
  suggestions_shown: number;
  started_at: string;
  ended_at?: string;
  created_at: string;

  // Relations
  playbook?: CoachPlaybook;
  lead?: {
    id: string;
    name: string;
    company?: string;
  };
}

// =====================================================
// COACH REAL-TIME STATE
// =====================================================

export interface CoachSuggestion {
  id: string;
  type: SuggestionType;
  text: string;
  confidence: number;
  timestamp: string;
  context?: string; // O que disparou a sugestão
}

export interface CoachAlert {
  id: string;
  message: string;
  severity: AlertSeverity;
  timestamp: string;
  phaseId?: string;
  dismissed: boolean;
}

export interface CoachState {
  isActive: boolean;
  sessionId?: string;
  playbook?: CoachPlaybook;
  currentPhaseIndex: number;
  checklistState: Record<string, ChecklistItemStatus>;

  // Real-time data
  briefing?: string;
  currentSuggestion?: CoachSuggestion;
  suggestionHistory: CoachSuggestion[];
  activeAlerts: CoachAlert[];

  // Stats
  phasesCompleted: number;
  alertsTriggered: number;
  suggestionsShown: number;
  startedAt?: string;
}

// =====================================================
// INPUT TYPES
// =====================================================

export interface CreatePlaybookInput {
  name: string;
  type: PlaybookType;
  description?: string;
  context?: string;
  phases: PlaybookPhase[];
  is_default?: boolean;
  organization_id?: string;
}

export interface UpdatePlaybookInput {
  id: string;
  name?: string;
  type?: PlaybookType;
  description?: string;
  context?: string;
  phases?: PlaybookPhase[];
  is_default?: boolean;
  is_active?: boolean;
}

export interface StartCoachSessionInput {
  playbookId?: string; // Null = sem coach, apenas transcrição
  leadId?: string;
  callId?: string;
}

// =====================================================
// AI BRIEFING
// =====================================================

export interface LeadBriefingData {
  // Basic info
  name: string;
  company?: string;
  position?: string;
  phone?: string;
  email?: string;

  // Sales data
  salesScore?: number;
  salesStage?: string;
  expectedRevenue?: number;

  // BANT
  bantBudget?: boolean;
  bantAuthority?: boolean;
  bantNeed?: boolean;
  bantTimeline?: boolean;

  // AI insights
  aiSentiment?: string;
  aiUrgencyLevel?: number;
  aiObjections?: string[];
  aiInterests?: string[];

  // History
  lastContactAt?: string;
  totalCalls?: number;
  lastCallSummary?: string;

  // Instagram/Social
  instagramHandle?: string;
  instagramFollowers?: number;
  instagramBio?: string;

  // Notes
  notes?: string;
}

export interface BriefingResponse {
  briefing: string; // Texto gerado pela IA
  highlights: string[]; // Pontos principais
  warnings: string[]; // Alertas sobre o lead
  suggestedApproach: string; // Abordagem sugerida
}

// =====================================================
// AI SUGGESTION REQUEST
// =====================================================

export interface SuggestionRequest {
  sessionId: string;
  playbookContext?: string;
  currentPhase: PlaybookPhase;
  recentTranscription: string; // Últimos 30s de transcrição
  leadContext?: LeadBriefingData;
}

export interface SuggestionResponse {
  suggestion?: CoachSuggestion;
  alerts?: CoachAlert[];
  phaseComplete?: boolean;
  suggestedPhaseChange?: number;
}

// =====================================================
// PLAYBOOK TYPE LABELS
// =====================================================

export const playbookTypeLabels: Record<PlaybookType, string> = {
  sales: 'Vendas',
  cs: 'Customer Success',
  onboarding: 'Onboarding',
  support: 'Suporte',
  custom: 'Personalizado',
};

export const alertSeverityLabels: Record<AlertSeverity, string> = {
  warning: 'Atenção',
  error: 'Alerta',
  info: 'Informação',
};

export const suggestionTypeLabels: Record<SuggestionType, string> = {
  objection_handler: 'Objeção',
  question: 'Pergunta',
  closing: 'Fechamento',
  info: 'Informação',
  tip: 'Dica',
};
