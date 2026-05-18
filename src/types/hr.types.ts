// =============================================
// TIPOS DO SISTEMA DE RH / RECRUTAMENTO
// =============================================

export type VacancyStatus = 'draft' | 'published' | 'paused' | 'closed' | 'filled';
export type WorkModel = 'presencial' | 'remoto' | 'hibrido';
export type EmploymentType = 'clt' | 'pj' | 'estagio' | 'freelancer';
export type ApplicationStatus = 'active' | 'hired' | 'rejected' | 'withdrawn';
export type InterviewType = 'phone' | 'video' | 'presencial';
export type InterviewStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type AssessmentType = 'general' | 'technical' | 'cultural' | 'reference' | 'test';
export type OfferStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'negotiating' | 'expired';
export type FormFieldType = 'text' | 'textarea' | 'select' | 'multi_select' | 'checkbox' | 'file' | 'url' | 'number' | 'date';

// =============================================
// PIPELINE STAGES
// =============================================

export interface HRPipelineStage {
  id: string;
  name: string;
  slug: string;
  position: number;
  color: string;
  description: string | null;
  is_default: boolean;
  is_hired: boolean;
  is_rejected: boolean;
  created_at: string;
}

// =============================================
// VAGAS
// =============================================

export interface HRVacancy {
  id: string;
  title: string;
  department: string | null;
  location: string | null;
  work_model: WorkModel | null;
  employment_type: EmploymentType | null;
  salary_range_min: number | null;
  salary_range_max: number | null;
  show_salary: boolean;
  description: string | null;
  requirements: string | null;
  responsibilities: string | null;
  benefits: string | null;
  status: VacancyStatus;
  application_token: string;
  application_deadline: string | null;
  positions_count: number;
  created_by: string | null;
  assigned_recruiter_id: string | null;
  ai_description_metadata: Record<string, any> | null;
  settings: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined
  creator?: { id: string; name: string } | null;
  recruiter?: { id: string; name: string } | null;
  form_fields?: HRVacancyFormField[];
  _count?: {
    total_applications: number;
    active_applications: number;
  };
}

export interface HRVacancyFormField {
  id: string;
  vacancy_id: string;
  field_label: string;
  field_type: FormFieldType;
  field_options: any | null;
  is_required: boolean;
  position: number;
  placeholder: string | null;
  help_text: string | null;
  created_at: string;
}

// =============================================
// CANDIDATOS
// =============================================

export interface HRCandidate {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  instagram_handle: string | null;
  portfolio_url: string | null;
  resume_url: string | null;
  resume_filename: string | null;
  avatar_url: string | null;
  source: string;
  notes: string | null;
  tags: string[] | null;
  metadata: Record<string, any>;
  instagram_analysis: Record<string, any> | null;
  created_at: string;
  updated_at: string;

  // Joined
  applications?: HRApplication[];
}

// =============================================
// APPLICATIONS (candidato ↔ vaga)
// =============================================

export interface HRApplication {
  id: string;
  candidate_id: string;
  vacancy_id: string;
  stage_id: string;
  status: ApplicationStatus;
  custom_answers: Record<string, any> | null;
  ai_score: number | null;
  ai_score_breakdown: AIScoreBreakdown | null;
  ai_score_reasoning: string | null;
  rejection_reason: string | null;
  applied_at: string;
  moved_at: string;
  created_at: string;
  updated_at: string;

  // Joined
  candidate?: HRCandidate;
  vacancy?: HRVacancy;
  stage?: HRPipelineStage;
}

export interface AIScoreBreakdown {
  skills: number;
  experience: number;
  education: number;
  culture_fit: number;
  availability: number;
}

// =============================================
// TIMELINE / ATIVIDADES
// =============================================

export interface HRCandidateActivity {
  id: string;
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  metadata: Record<string, any>;
  created_by: string | null;
  created_at: string;

  // Joined
  creator?: { id: string; name: string } | null;
}

// =============================================
// ENTREVISTAS
// =============================================

export interface HRInterview {
  id: string;
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  interviewer_id: string | null;
  interview_type: InterviewType;
  scheduled_at: string | null;
  duration_minutes: number;
  status: InterviewStatus;
  call_history_id: string | null;
  transcription: any | null;
  ai_analysis: Record<string, any> | null;
  ai_summary: string | null;
  script_questions: any[] | null;
  interviewer_notes: string | null;
  rating: number | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined
  interviewer?: { id: string; name: string } | null;
  candidate?: HRCandidate;
  vacancy?: HRVacancy;
}

// =============================================
// AVALIAÇÕES
// =============================================

export interface HRAssessment {
  id: string;
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  assessor_id: string | null;
  assessment_type: AssessmentType;
  title: string;
  score: number | null;
  notes: string | null;
  criteria: Record<string, any> | null;
  status: 'pending' | 'completed';
  completed_at: string | null;
  created_at: string;

  // Joined
  assessor?: { id: string; name: string } | null;
}

// =============================================
// OFERTAS
// =============================================

export interface HROffer {
  id: string;
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  salary_offered: number | null;
  benefits_offered: string | null;
  start_date: string | null;
  contract_type: string | null;
  additional_terms: string | null;
  status: OfferStatus;
  sent_at: string | null;
  responded_at: string | null;
  rejection_reason: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;

  // Joined
  candidate?: HRCandidate;
  vacancy?: HRVacancy;
}

// =============================================
// INPUT TYPES
// =============================================

export interface CreateVacancyInput {
  title: string;
  department?: string;
  location?: string;
  work_model?: WorkModel;
  employment_type?: EmploymentType;
  salary_range_min?: number;
  salary_range_max?: number;
  show_salary?: boolean;
  description?: string;
  requirements?: string;
  responsibilities?: string;
  benefits?: string;
  application_deadline?: string;
  positions_count?: number;
  created_by?: string;
  assigned_recruiter_id?: string;
  settings?: Record<string, any>;
}

export interface UpdateVacancyInput extends Partial<CreateVacancyInput> {
  id: string;
  status?: VacancyStatus;
  ai_description_metadata?: Record<string, any>;
}

export interface CreateCandidateInput {
  name: string;
  email?: string;
  phone?: string;
  linkedin_url?: string;
  instagram_handle?: string;
  portfolio_url?: string;
  resume_url?: string;
  resume_filename?: string;
  source?: string;
  notes?: string;
  tags?: string[];
}

export interface CreateApplicationInput {
  candidate_id: string;
  vacancy_id: string;
  stage_id: string;
  custom_answers?: Record<string, any>;
}

export interface CreateInterviewInput {
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  interviewer_id?: string;
  interview_type?: InterviewType;
  scheduled_at?: string;
  duration_minutes?: number;
  script_questions?: any[];
}

export interface CreateAssessmentInput {
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  assessor_id?: string;
  assessment_type?: AssessmentType;
  title: string;
  score?: number;
  notes?: string;
  criteria?: Record<string, any>;
}

export interface CreateOfferInput {
  application_id: string;
  candidate_id: string;
  vacancy_id: string;
  salary_offered?: number;
  benefits_offered?: string;
  start_date?: string;
  contract_type?: string;
  additional_terms?: string;
}

// =============================================
// FILTER TYPES
// =============================================

export interface VacancyFilters {
  status?: VacancyStatus;
  department?: string;
  work_model?: WorkModel;
  search?: string;
}

export interface CandidateFilters {
  search?: string;
  source?: string;
  tags?: string[];
}

export interface ApplicationFilters {
  vacancy_id?: string;
  stage_id?: string;
  status?: ApplicationStatus;
  search?: string;
}

// =============================================
// PIPELINE COLUMN (para Kanban)
// =============================================

export interface HRPipelineColumn {
  stage: HRPipelineStage;
  applications: (HRApplication & {
    candidate: HRCandidate;
    time_in_stage_days?: number;
  })[];
  count: number;
}
