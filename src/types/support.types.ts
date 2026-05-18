export type TicketStatus = 'novo' | 'em_atendimento' | 'aguardando_cliente' | 'resolvido';
export type TicketPriority = 'baixa' | 'media' | 'alta' | 'urgente';
export type TicketChannel = 'whatsapp_individual' | 'whatsapp_grupo' | 'email' | 'chat';
export type TeamType = 'suporte' | 'cs' | 'comercial' | 'interno';
export type AlertSeverity = 'danger' | 'warning' | 'success' | 'info';

export interface Ticket {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar?: string;
  clientCompany: string;
  channel: TicketChannel;
  channelName?: string;
  status: TicketStatus;
  priority: TicketPriority;
  team: TeamType;
  assignee?: string;
  assigneeAvatar?: string;
  subject: string;
  lastMessage: string;
  lastMessageAt: string;
  createdAt: string;
  firstResponseAt?: string;
  resolvedAt?: string;
  messages: TicketMessage[];
  tags: string[];
  slaBreached: boolean;
}

export interface TicketMessage {
  id: string;
  ticketId: string;
  sender: 'client' | 'agent' | 'system';
  senderName: string;
  senderAvatar?: string;
  content: string;
  createdAt: string;
  read: boolean;
}

export interface SupportMetrics {
  ticketsPendentes: number;
  emAtendimento: number;
  aguardandoCliente: number;
  semResposta: number;
  ticketsHoje: number;
  ticketsFechados: number;
  ticketsSemResposta: number;
  tempoMedioResposta: number;
  tempoMedioPrimeiraResposta: number;
  tempoMedioResolucao: number;
  taxaResolucaoPrimeiroContato: number;
  csat: number;
  ticketsPorHora: { hora: string; quantidade: number }[];
  ticketsPorCanal: { canal: string; quantidade: number }[];
  slaBreached: number;
}

export interface CSMetrics {
  clientesAtivos: number;
  clientesEmRisco: number;
  npsScore: number;
  checkinsHoje: number;
  checkinsPendentes: number;
  taxaChurn: number;
  expansaoMRR: number;
  healthDistribution: { status: string; quantidade: number; fill: string }[];
}

export interface Playbook {
  id: string;
  name: string;
  trigger: string;
  steps: PlaybookStep[];
  isActive: boolean;
}

export interface PlaybookStep {
  id: string;
  action: string;
  delay?: string;
  template?: string;
}

export interface Checkin {
  id: string;
  clientId: string;
  clientName: string;
  clientAvatar?: string;
  type: 'onboarding' | 'quarterly' | 'renewal' | 'upsell' | 'risk';
  scheduledAt: string;
  status: 'pendente' | 'concluido' | 'cancelado';
  notes?: string;
  assignee: string;
}

export interface NPSResponse {
  id: string;
  clientId: string;
  clientName: string;
  score: number;
  feedback?: string;
  createdAt: string;
  category: 'promoter' | 'passive' | 'detractor';
}
