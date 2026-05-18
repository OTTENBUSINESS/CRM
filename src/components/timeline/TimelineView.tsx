/**
 * TimelineView — Componente unificado de timeline
 * Usado tanto no SalesLeadDetail (comercial) quanto no ClientDetail (CS)
 * Mesma visualização, mesmos tipos, mesmas interações
 */
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  User, Globe, MessageSquare, DollarSign, Instagram, Ticket, Activity,
  Clock, StickyNote, Mail, Send, Receipt, UserX, Mic, Video, ExternalLink,
  FileText, BookOpen, CreditCard, Zap, CheckCircle2, UserPlus, Megaphone,
} from "lucide-react";

interface TimelineViewProps {
  timeline: any[];
  /** Contexto: CS mostra filtro CS, comercial mostra filtro Comercial */
  context?: "sales" | "cs";
  /** Callbacks pra abrir modais (opcionais — se não passar, não é clicável) */
  onEmailClick?: (html: string, subject: string) => void;
  onTaskClick?: (task: any) => void;
  onDealClick?: (deal: any) => void;
  onDiagnosticClick?: (metadata: any) => void;
  onCallClick?: (call: any) => void;
  onMeetingClick?: (meeting: any) => void;
  onNoteClick?: (note: any) => void;
  onInstagramClick?: () => void;
  onEventClick?: (event: any) => void;
  /** Dados pra resolver cliques */
  contactDeals?: any[];
  clientTasks?: any[];
}

const formatDateTime = (dateString: string | null | undefined) => {
  if (!dateString) return "Nunca";
  const date = new Date(dateString);
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " às " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const getIcon = (type: string) => {
  switch (type) {
    case 'lead': return UserPlus;
    case 'visit': return Globe;
    case 'access': return BookOpen;
    case 'lesson': return Video;
    case 'support': case 'whatsapp': return MessageSquare;
    case 'checkout': return CreditCard;
    case 'purchase': case 'payment': return DollarSign;
    case 'onboarding': return CheckCircle2;
    case 'registration': return FileText;
    case 'event_rsvp': return Ticket;
    case 'instagram': return Instagram;
    case 'call': return null; // Custom WhatsApp icon
    case 'note': return StickyNote;
    case 'email_sent': return Mail;
    case 'nfse': return Receipt;
    case 'billing': return Send;
    case 'churn': case 'refund': return UserX;
    case 'palestra': return Mic;
    case 'webinar': return Video;
    case 'touchpoint': return MessageSquare;
    case 'campaign': return Megaphone;
    default: return Activity;
  }
};

const getColor = (type: string) => {
  switch (type) {
    case 'lead': return 'bg-indigo-500';
    case 'visit': return 'bg-gray-500';
    case 'access': return 'bg-orange-500';
    case 'lesson': return 'bg-amber-500';
    case 'support': case 'whatsapp': return 'bg-green-500';
    case 'checkout': case 'purchase': case 'payment': return 'bg-emerald-500';
    case 'onboarding': return 'bg-cyan-500';
    case 'registration': return 'bg-purple-500';
    case 'event_rsvp': return 'bg-violet-500';
    case 'instagram': return 'bg-pink-500';
    case 'call': return 'bg-[#25D366]';
    case 'note': return 'bg-amber-500';
    case 'email_sent': return 'bg-blue-500';
    case 'nfse': return 'bg-purple-500';
    case 'billing': return 'bg-orange-500';
    case 'churn': case 'refund': return 'bg-red-600';
    case 'palestra': return 'bg-teal-500';
    case 'webinar': return 'bg-cyan-500';
    case 'touchpoint': return 'bg-teal-500';
    case 'campaign': return 'bg-violet-500';
    default: return 'bg-gray-500';
  }
};

const WhatsAppCallIcon = () => (
  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
  </svg>
);

export function TimelineView({
  timeline,
  context = "sales",
  onEmailClick,
  onTaskClick,
  onDealClick,
  onDiagnosticClick,
  onCallClick,
  onMeetingClick,
  onNoteClick,
  onInstagramClick,
  onEventClick,
  contactDeals,
  clientTasks,
}: TimelineViewProps) {
  const [filter, setFilter] = useState<"all" | "sales" | "cs">("all");

  const filteredTimeline = (timeline || []).filter((event: any) => {
    if (filter === "all") return true;
    return event.team === filter;
  });

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-blue-500" />
              {context === "cs" ? "Jornada do Cliente" : "Jornada do Lead"}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">Histórico completo de interações</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-muted rounded-lg p-1">
              <button
                onClick={() => setFilter("all")}
                className={`px-3 py-1.5 text-sm rounded-md transition-all font-medium ${filter === "all" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Todos
              </button>
              <button
                onClick={() => setFilter("sales")}
                className={`px-3 py-1.5 text-sm rounded-md transition-all font-medium ${filter === "sales" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                Comercial
              </button>
              <button
                onClick={() => setFilter("cs")}
                className={`px-3 py-1.5 text-sm rounded-md transition-all font-medium ${filter === "cs" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                CS
              </button>
            </div>
            <Badge variant="secondary">{filteredTimeline.length} eventos</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-1">
            {filteredTimeline.length > 0 ? (
              filteredTimeline.map((event: any, i: number) => {
                const Icon = getIcon(event.type);

                const isEmail = !!event.metadata?.email_html;
                const isTask = !isEmail && (event.id?.startsWith('task-') || event.metadata?.task_id);
                const isDeal = event.id?.startsWith('deal-');
                const isDiagnostic = event.id?.startsWith('diagnostic-') || event.metadata?.diagnostic;
                const isCall = event.type === 'call' || event.id?.startsWith('call-');
                const isMeeting = event.type === 'meeting' || event.id?.startsWith('meeting-');
                const isNote = event.type === 'note' || event.id?.startsWith('note-');
                const isInstagramDM = event.id?.startsWith('ig-dm-');
                const isNfse = event.type === 'nfse';
                const isBilling = event.type === 'billing';
                const isPalestra = event.type === 'palestra';
                const isClickable = (isEmail && onEmailClick) || (isTask && onTaskClick) || (isDeal && onDealClick) ||
                  (isDiagnostic && onDiagnosticClick) || (isCall && onCallClick) || (isMeeting && onMeetingClick) ||
                  (isNote && onNoteClick) || (isInstagramDM && onInstagramClick) ||
                  ((isNfse || isBilling || isPalestra) && onEventClick);

                const handleEventClick = (e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();

                  if (isEmail && onEmailClick) {
                    onEmailClick(event.metadata.email_html, event.metadata.email_subject || event.title);
                  } else if (isTask && onTaskClick) {
                    const taskId = event.metadata?.task_id || event.id?.replace('task-scheduled-', '').replace('task-created-', '');
                    const task = clientTasks?.find((t: any) => t.id === taskId);
                    if (task) onTaskClick(task);
                  } else if (isDeal && onDealClick) {
                    const dealId = event.metadata?.deal_id || event.id?.replace('deal-created-', '').replace('deal-won-', '').replace('deal-lost-', '');
                    const deal = contactDeals?.find((d: any) => d.id === dealId);
                    if (deal) onDealClick(deal);
                  } else if (isDiagnostic && onDiagnosticClick) {
                    onDiagnosticClick(event.metadata);
                  } else if (isCall && onCallClick) {
                    onCallClick(event.metadata?.call || event.metadata);
                  } else if (isMeeting && onMeetingClick) {
                    onMeetingClick(event.metadata);
                  } else if (isNote && onNoteClick) {
                    onNoteClick(event.metadata?.note || event.metadata);
                  } else if (isInstagramDM && onInstagramClick) {
                    onInstagramClick();
                  } else if ((isNfse || isBilling || isPalestra) && onEventClick) {
                    onEventClick(event);
                  }
                };

                return (
                  <div
                    key={event.id || i}
                    className={`relative pl-10 pb-6 last:pb-0 group ${isClickable ? 'cursor-pointer' : ''}`}
                    onClick={isClickable ? handleEventClick : undefined}
                  >
                    {i < filteredTimeline.length - 1 && (
                      <div className="absolute left-[18px] top-10 bottom-0 w-0.5 bg-border" />
                    )}
                    <div className={`absolute left-0 top-0 w-9 h-9 rounded-lg ${getColor(event.type)} flex items-center justify-center z-10`}>
                      {event.type === 'call' ? (
                        <WhatsAppCallIcon />
                      ) : Icon ? (
                        <Icon className="h-4 w-4 text-white" />
                      ) : null}
                    </div>
                    <div className="ml-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-muted-foreground">
                          {formatDateTime(event.date)}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {event.team === 'cs' ? 'CS' : 'Comercial'}
                        </Badge>
                        {isClickable && (
                          <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                            Clique para ver
                          </Badge>
                        )}
                      </div>
                      <h4 className="font-semibold text-foreground mb-2">
                        {event.title}
                        {event.tags?.map((tag: string, idx: number) => (
                          <Badge key={idx} variant="secondary" className="ml-2 text-xs bg-purple-100 text-purple-700">
                            {tag}
                          </Badge>
                        ))}
                      </h4>
                      <div className={`p-4 bg-muted/50 rounded-lg border transition-colors ${isClickable ? 'group-hover:bg-blue-50 group-hover:border-blue-200' : 'group-hover:bg-muted/70'}`}>
                        <p className="text-sm text-muted-foreground leading-relaxed">{event.description}</p>
                        {event.details && (
                          <p className="text-xs text-muted-foreground/70 mt-2">{event.details}</p>
                        )}
                        {/* Contexto da conversa */}
                        {event.metadata?.context && (
                          <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">💬 Contexto da Conversa:</p>
                            <p className="text-sm text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{event.metadata.context}</p>
                          </div>
                        )}
                        {/* Dados do agendamento */}
                        {event.metadata?.source === 'book_meeting_page' && (
                          <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800 space-y-1">
                            <p className="text-xs font-medium text-orange-700 dark:text-orange-400 mb-1">📋 Dados do agendamento:</p>
                            {event.metadata.company && (
                              <p className="text-xs"><span className="font-semibold text-orange-600">Empresa:</span> {event.metadata.company}</p>
                            )}
                            {event.metadata.revenue && (
                              <p className="text-xs"><span className="font-semibold text-orange-600">Faturamento:</span> R$ {(event.metadata.revenue / 1000).toFixed(0)}k/mês</p>
                            )}
                            {event.metadata.evento && (
                              <p className="text-xs"><span className="font-semibold text-orange-600">Evento:</span> {event.metadata.evento}</p>
                            )}
                            {event.metadata.utm_source && (
                              <p className="text-xs"><span className="font-semibold text-orange-600">Origem:</span> {event.metadata.utm_source} / {event.metadata.utm_campaign || '-'}</p>
                            )}
                            {event.metadata.meeting_link && (
                              <a href={event.metadata.meeting_link} target="_blank" rel="noopener noreferrer" className="text-xs text-orange-600 hover:underline">🔗 Link da reunião</a>
                            )}
                          </div>
                        )}
                        {/* Prints/Anexos */}
                        {event.metadata?.attachments && event.metadata.attachments.length > 0 && (
                          <div className="mt-3">
                            <p className="text-xs font-medium text-purple-700 dark:text-purple-400 mb-2">📎 Prints Anexados:</p>
                            <div className="grid grid-cols-3 gap-2">
                              {event.metadata.attachments.map((url: string, idx: number) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="relative group/img rounded-lg overflow-hidden border hover:border-purple-300 transition-colors"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <img src={url} alt={`Print ${idx + 1}`} className="w-full h-20 object-cover" />
                                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                    <ExternalLink className="h-4 w-4 text-white" />
                                  </div>
                                </a>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Nenhuma interação registrada</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
