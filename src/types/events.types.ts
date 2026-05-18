// =============================================
// TIPOS DO SISTEMA DE EVENTOS RSVP
// =============================================

export type EventStatus = 'draft' | 'published' | 'cancelled' | 'completed';
export type RsvpStatus = 'confirmed' | 'declined' | 'maybe' | 'pending';
export type RsvpSource = 'public_form' | 'manual' | 'import';

export interface Event {
  id: string;
  name: string;
  description: string | null;
  slug: string | null;

  // Datas
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;

  // Local
  location: string | null;
  location_details: string | null;
  is_online: boolean;
  online_link: string | null;

  // Capacidade
  capacity: number | null;

  // RSVP Config
  rsvp_token: string;
  rsvp_enabled: boolean;
  rsvp_deadline: string | null;
  allow_companion: boolean;
  max_companions_per_guest: number;

  // Associações
  product_id: string | null;

  // Customização
  custom_questions: CustomQuestion[];
  settings: EventSettings;
  banner_url: string | null;
  guide_url: string | null;
  event_info: EventInfoSection[];
  invitation_template: string | null;

  // Status
  status: EventStatus;

  // Meta
  created_by: string | null;
  created_at: string;
  updated_at: string;

  // Joined data
  product?: { id: string; name: string } | null;
  created_by_member?: { id: string; nome: string } | null;

  // Computed (from RSVPs)
  _count?: {
    total: number;
    confirmed: number;
    declined: number;
    maybe: number;
    checked_in: number;
    with_companion: number;
  };
}

export interface CustomQuestion {
  id: string;
  question: string;
  type: 'text' | 'select' | 'checkbox';
  required: boolean;
  options?: string[];
}

export interface EventSettings {
  primaryColor?: string;
  showCapacity?: boolean;
  confirmationMessage?: string;
  [key: string]: any;
}

export interface EventInfoSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface EventRsvp {
  id: string;
  event_id: string;

  // Dados do convidado
  guest_name: string;
  guest_email: string;
  guest_phone: string | null;
  guest_company: string | null;

  // Match interno
  lead_id: string | null;
  organization_id: string | null;
  is_client: boolean;

  // Status
  rsvp_status: RsvpStatus;
  confirmed_at: string | null;

  // Acompanhante
  has_companion: boolean;
  companion_name: string | null;
  companion_email: string | null;
  companion_phone: string | null;

  // Check-in
  checked_in_at: string | null;
  checked_in_by: string | null;
  companion_checked_in: boolean;
  companion_checked_in_at: string | null;

  // Extras
  dietary_restrictions: string | null;
  notes: string | null;
  custom_answers: Record<string, any>;

  // UTM tracking
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;

  // Convite
  confirmation_token: string | null;
  invitation_sent_at: string | null;
  invitation_channel: string | null;
  invitation_count: number;

  // Meta
  source: RsvpSource;
  created_at: string;
  updated_at: string;

  // Joined data
  event?: Event;
  lead?: { id: string; name: string } | null;
  organization?: { id: string; name: string } | null;
  checked_in_by_member?: { id: string; nome: string } | null;
}

// Input types
export interface CreateEventInput {
  name: string;
  description?: string;
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  location_details?: string;
  is_online?: boolean;
  online_link?: string;
  capacity?: number;
  rsvp_deadline?: string;
  allow_companion?: boolean;
  max_companions_per_guest?: number;
  product_id?: string;
  banner_url?: string;
  guide_url?: string;
  event_info?: EventInfoSection[];
  custom_questions?: CustomQuestion[];
  settings?: EventSettings;
  created_by?: string;
}

export interface UpdateEventInput extends Partial<CreateEventInput> {
  id: string;
  status?: EventStatus;
}

export interface CreateRsvpInput {
  event_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string;
  guest_company?: string;
  rsvp_status?: RsvpStatus;
  has_companion?: boolean;
  companion_name?: string;
  companion_email?: string;
  companion_phone?: string;
  dietary_restrictions?: string;
  notes?: string;
  custom_answers?: Record<string, any>;
  source?: RsvpSource;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

export interface UpdateRsvpInput extends Partial<CreateRsvpInput> {
  id: string;
}

// Stats type
export interface EventStats {
  total: number;
  confirmed: number;
  declined: number;
  maybe: number;
  pending: number;
  checkedIn: number;
  withCompanion: number;
  totalAttendees: number; // confirmed + companions
  capacityUsed: number;
  capacityPercentage: number;
}
