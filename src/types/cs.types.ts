// Tipos para o CS Panel

export type HealthStatus = "healthy" | "alert" | "monitoring" | "risk";

export type JourneyStage = 
  | "pending_onboard" 
  | "onboard_scheduled" 
  | "onboard_done" 
  | "monitoring_7d" 
  | "ongoing" 
  | "success";

export type Sentiment = "positive" | "neutral" | "negative";

export interface Objective {
  id: string;
  description: string;
  daysTarget: 30 | 60 | 90;
  deadline: string;
  status: "pending" | "in_progress" | "completed" | "overdue";
  completedAt?: string;
}

export interface WhatsAppMessage {
  id: string;
  content: string;
  timestamp: string;
  sender: "client" | "cs";
  senderName: string;
}

export interface InteractionEvent {
  id: string;
  type: "whatsapp" | "email" | "call" | "meeting" | "note";
  date: string;
  summary: string;
  sentiment?: Sentiment;
  csResponsible?: string;
}

export interface SuccessMetrics {
  testimonial: {
    collected: boolean;
    date?: string;
    content?: string;
  };
  upsell: {
    done: boolean;
    value?: number;
    product?: string;
    date?: string;
  };
  referrals: {
    count: number;
    target: number;
  };
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  avatar?: string;
  entryDate: string;
  onboardDate?: string;
  journeyStage: JourneyStage;
  healthStatus: HealthStatus;
  healthScore: number;
  objectives: Objective[];
  engagement: {
    memberArea: {
      lastAccess?: string;
      completedLessons: number;
      totalLessons: number;
    };
    whatsappGroup: {
      lastMessage?: string;
      totalMessages: number;
    };
    zoom: {
      lastParticipation?: string;
      totalParticipations: number;
    };
  };
  interactions: InteractionEvent[];
  whatsappMessages: WhatsAppMessage[];
  successMetrics: SuccessMetrics;
  csResponsible: string;
  notes?: string;
}
