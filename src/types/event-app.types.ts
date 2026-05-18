// =============================================
// TIPOS DO APP DO PARTICIPANTE DE EVENTOS
// =============================================

// ---- Sessao do participante ----
export interface ParticipantSession {
  id: string;
  event_id: string;
  rsvp_id: string;
  token: string;
  expires_at: string;
  created_at: string;
  last_seen_at: string | null;
}

// ---- Perfil estendido do participante ----
export interface ParticipantProfile {
  id: string;
  rsvp_id: string;
  event_id: string;
  display_name: string;
  company: string | null;
  job_title: string | null;
  bio: string | null;
  avatar_url: string | null;
  skills: string[];
  interests: string[];
  linkedin_url: string | null;
  show_email: boolean;
  show_phone: boolean;
  show_linkedin: boolean;
  created_at: string;
  updated_at: string;
  // Joined
  rsvp?: {
    guest_name: string;
    guest_email: string;
    guest_phone: string | null;
    guest_company: string | null;
  };
}

export interface UpdateProfileInput {
  display_name?: string;
  company?: string | null;
  job_title?: string | null;
  bio?: string | null;
  avatar_url?: string | null;
  skills?: string[];
  interests?: string[];
  linkedin_url?: string | null;
  show_email?: boolean;
  show_phone?: boolean;
  show_linkedin?: boolean;
}

// ---- Feed ----
export interface FeedPost {
  id: string;
  event_id: string;
  author_name: string;
  author_avatar_url: string | null;
  content: string;
  image_urls: string[];
  is_pinned: boolean;
  likes_count: number;
  created_at: string;
  updated_at: string;
  // Client-side
  is_liked?: boolean;
}

export interface CreateFeedPostInput {
  content: string;
  image_urls?: string[];
  is_pinned?: boolean;
}

// ---- Feed Likes ----
export interface FeedLike {
  id: string;
  post_id: string;
  rsvp_id: string;
  created_at: string;
}

// ---- Cronograma ----
export interface ScheduleItem {
  id: string;
  event_id: string;
  title: string;
  description: string | null;
  speaker_name: string | null;
  speaker_title: string | null;
  speaker_avatar_url: string | null;
  room: string | null;
  day_date: string; // YYYY-MM-DD
  start_time: string; // HH:MM
  end_time: string; // HH:MM
  category: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  materials?: Pick<Material, 'id' | 'title' | 'file_url' | 'file_type' | 'is_available'>[];
  // Client-side
  is_bookmarked?: boolean;
  is_happening_now?: boolean;
}

export interface CreateScheduleItemInput {
  title: string;
  description?: string;
  speaker_name?: string;
  speaker_title?: string;
  speaker_avatar_url?: string;
  room?: string;
  day_date: string;
  start_time: string;
  end_time: string;
  category?: string;
  sort_order?: number;
}

// ---- Favoritos do cronograma ----
export interface ScheduleBookmark {
  id: string;
  schedule_item_id: string;
  rsvp_id: string;
  created_at: string;
}

// ---- Materiais ----
export interface Material {
  id: string;
  event_id: string;
  schedule_item_id: string | null;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string | null;
  file_size: number | null;
  category: string | null;
  available_after: string | null; // ISO timestamp
  sort_order: number;
  created_at: string;
  updated_at: string;
  // Joined
  schedule_item?: { title: string } | null;
  // Client-side
  is_available?: boolean;
}

export interface CreateMaterialInput {
  title: string;
  description?: string;
  file_url: string;
  file_type?: string;
  file_size?: number;
  category?: string;
  schedule_item_id?: string;
  available_after?: string;
  sort_order?: number;
}

// ---- Conexoes (Networking) ----
export type ConnectionStatus = 'pending' | 'accepted' | 'declined';

export interface Connection {
  id: string;
  event_id: string;
  requester_rsvp_id: string;
  target_rsvp_id: string;
  status: ConnectionStatus;
  created_at: string;
  updated_at: string;
  // Joined
  requester_profile?: ParticipantProfile;
  target_profile?: ParticipantProfile;
}

// ---- Auth context ----
export interface EventInfoSection {
  id: string;
  title: string;
  content: string;
  order: number;
}

export interface EventAppParticipant {
  sessionToken: string;
  rsvpId: string;
  eventId: string;
  profile: ParticipantProfile;
  event: {
    id: string;
    name: string;
    description: string | null;
    start_date: string;
    end_date: string | null;
    start_time: string | null;
    end_time: string | null;
    location: string | null;
    location_details: string | null;
    banner_url: string | null;
    guide_url: string | null;
    settings: { primaryColor?: string; [key: string]: any };
    event_info: EventInfoSection[];
  };
}

// ---- Networking participant card ----
export interface NetworkingParticipant extends ParticipantProfile {
  compatibility_score?: number;
  connection_status?: ConnectionStatus | null;
  connection_id?: string | null;
}
