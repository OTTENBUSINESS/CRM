import { useState } from "react";
import {
  Video,
  Clock,
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Eye,
  UserX,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CallDetailModal } from "@/components/calls/CallDetailModal";
import { cn, ensureHttps } from "@/lib/utils";
import { format, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

interface MeetingRecord {
  id: string;
  title?: string;
  status: 'active' | 'completed' | 'no_show' | 'cancelled';
  started_at: string;
  ended_at?: string;
  meeting_link?: string;
  meeting_type?: string;
  recording_url?: string;
  recording_status?: string;
  transcriptions?: any[];
  ai_analysis?: any;
  lead_id?: string;
  organization_id?: string;
  team?: string;
  created_at: string;
  // Flag para indicar que veio de company_activities (reunião feita por fora)
  _fromActivity?: boolean;
}

interface MeetingHistoryProps {
  leadId?: string;
  leadIds?: string[];
  organizationId?: string;
  limit?: number;
  showTitle?: boolean;
  compact?: boolean;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function useMeetingHistory({ leadId, leadIds, organizationId, limit = 20 }: { leadId?: string; leadIds?: string[]; organizationId?: string; limit?: number }) {
  const effectiveLeadIds = leadIds && leadIds.length > 1 ? leadIds : leadId ? [leadId] : [];

  return useQuery({
    queryKey: ['meeting-history', effectiveLeadIds, organizationId, limit],
    queryFn: async (): Promise<MeetingRecord[]> => {
      // 1. Buscar meetings da tabela meetings
      let meetingsQuery = (supabase
        .from('meetings' as any)
        .select('*')
        .in('status', ['completed', 'no_show'])
        .order('started_at', { ascending: false })
        .limit(limit)) as any;

      if (effectiveLeadIds.length > 1) {
        meetingsQuery = meetingsQuery.in('lead_id', effectiveLeadIds);
      } else if (effectiveLeadIds.length === 1) {
        meetingsQuery = meetingsQuery.eq('lead_id', effectiveLeadIds[0]);
      } else if (organizationId) {
        meetingsQuery = meetingsQuery.eq('organization_id', organizationId);
      }

      const { data: meetingsData, error: meetingsError } = await meetingsQuery;
      if (meetingsError) throw meetingsError;

      const meetings = (meetingsData || []) as MeetingRecord[];

      // 2. Buscar company_activities com call_analysis no metadata (reuniões feitas por fora)
      if (effectiveLeadIds.length > 0) {
        // IDs de activities que já estão linkadas a meetings (evitar duplicata)
        const meetingActivityIds = new Set(
          meetings.map((m: any) => m.activity_id).filter(Boolean)
        );

        let actQuery = supabase
          .from('company_activities')
          .select('id, name, task_type, status, scheduled_at, completed_at, metadata, lead_id, organization_id')
          .in('lead_id', effectiveLeadIds)
          .in('task_type', ['meeting', 'call'])
          .in('status', ['completed', 'no_show'])
          .not('metadata', 'is', null)
          .order('scheduled_at', { ascending: false })
          .limit(limit);

        const { data: activitiesData } = await actQuery;

        // Filtrar: só incluir activities que TÊM call_analysis e NÃO estão linkadas a um meeting
        const activityMeetings: MeetingRecord[] = (activitiesData || [])
          .filter((a: any) => {
            if (meetingActivityIds.has(a.id)) return false; // já tem meeting linkado
            const meta = a.metadata;
            return meta && meta.call_analysis; // tem análise
          })
          .map((a: any) => ({
            id: a.id,
            title: a.name || 'Reunião',
            status: a.status === 'no_show' ? 'no_show' as const : 'completed' as const,
            started_at: a.scheduled_at || a.completed_at || a.created_at,
            ended_at: a.completed_at || undefined,
            meeting_type: a.task_type,
            ai_analysis: a.metadata.call_analysis,
            lead_id: a.lead_id,
            organization_id: a.organization_id,
            created_at: a.scheduled_at || a.completed_at,
            _fromActivity: true,
          }));

        // Merge e ordenar por data desc
        const all = [...meetings, ...activityMeetings];
        all.sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
        return all.slice(0, limit);
      }

      return meetings;
    },
    enabled: !!(effectiveLeadIds.length > 0 || organizationId),
  });
}

function groupMeetingsByDate(meetings: MeetingRecord[]) {
  const groups: { [key: string]: MeetingRecord[] } = {};

  meetings.forEach(meeting => {
    const date = new Date(meeting.started_at);
    let key: string;

    if (isToday(date)) {
      key = 'Hoje';
    } else if (isYesterday(date)) {
      key = 'Ontem';
    } else {
      key = format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
      key = key.charAt(0).toUpperCase() + key.slice(1);
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(meeting);
  });

  return groups;
}

export function MeetingHistory({
  leadId,
  leadIds,
  organizationId,
  limit = 20,
  showTitle = true,
  compact = false,
}: MeetingHistoryProps) {
  const { data: meetings, isLoading, error } = useMeetingHistory({
    leadId,
    leadIds,
    organizationId,
    limit,
  });

  const isInsideLead = !!leadId;

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-violet-100 rounded-lg">
                <Video className="h-4 w-4 text-violet-600" />
              </div>
              Histórico de Reuniões
            </CardTitle>
          </CardHeader>
        )}
        <CardContent className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-0 shadow-sm">
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Histórico de Reuniões</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-destructive">Erro ao carregar histórico</p>
        </CardContent>
      </Card>
    );
  }

  if (!meetings || meetings.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-violet-100 rounded-lg">
                <Video className="h-4 w-4 text-violet-600" />
              </div>
              Histórico de Reuniões
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
              <Video className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">Nenhuma reunião registrada</p>
            <p className="text-xs text-slate-400 mt-1">As reuniões aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedMeetings = groupMeetingsByDate(meetings);

  return (
    <Card className="border-0 shadow-sm">
      {showTitle && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-violet-100 rounded-lg">
                <Video className="h-4 w-4 text-violet-600" />
              </div>
              Histórico de Reuniões
            </CardTitle>
            <Badge variant="secondary" className="font-normal">
              {meetings.length} {meetings.length === 1 ? 'reunião' : 'reuniões'}
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className="pt-0">
        <ScrollArea className={cn(meetings.length > 5 && "h-[450px]")}>
          <div className="space-y-6">
            {Object.entries(groupedMeetings).map(([dateLabel, dateMeetings]) => (
              <div key={dateLabel}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-500 px-2 bg-white">
                    {dateLabel}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Timeline de reuniões */}
                <div className="relative">
                  {/* Linha vertical da timeline */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />

                  {/* Reuniões */}
                  <div className="space-y-0">
                    {dateMeetings.map((meeting, index) => (
                      <MeetingHistoryItem
                        key={meeting.id}
                        meeting={meeting}
                        compact={compact}
                        isInsideLead={isInsideLead}
                        isLast={index === dateMeetings.length - 1}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

function MeetingHistoryItem({
  meeting,
  compact,
  isInsideLead,
  isLast,
}: {
  meeting: MeetingRecord;
  compact: boolean;
  isInsideLead: boolean;
  isLast: boolean;
}) {
  const [showDetailModal, setShowDetailModal] = useState(false);

  const isNoShow = meeting.status === 'no_show';
  const hasAI = !!meeting.ai_analysis;
  const hasTranscription = meeting.transcriptions && meeting.transcriptions.length > 0;

  const durationSeconds = meeting.started_at && meeting.ended_at
    ? Math.floor((new Date(meeting.ended_at).getTime() - new Date(meeting.started_at).getTime()) / 1000)
    : 0;

  const getStatusConfig = () => {
    if (isNoShow) {
      return {
        icon: UserX,
        color: "text-red-500",
        bg: "bg-red-100",
        border: "border-red-300",
        label: "No-show"
      };
    }
    return {
      icon: CheckCircle2,
      color: "text-emerald-500",
      bg: "bg-emerald-100",
      border: "border-emerald-300",
      label: "Concluída"
    };
  };

  // Normalizar análise (meetings usa diagnostico/pontos_chave, activities usa resumo/pontos_principais)
  const normalizedAnalysis = hasAI ? {
    diagnostico: meeting.ai_analysis?.diagnostico || meeting.ai_analysis?.resumo || '',
    sentimento: meeting.ai_analysis?.sentimento,
    pontos_chave: meeting.ai_analysis?.pontos_chave || meeting.ai_analysis?.pontos_principais || [],
  } : null;

  const getSentimentConfig = () => {
    const sentiment = normalizedAnalysis?.sentimento;
    if (sentiment === "positive" || sentiment === "positivo") {
      return { icon: ThumbsUp, color: "text-emerald-600", bg: "bg-emerald-50", label: "Positivo" };
    }
    if (sentiment === "negative" || sentiment === "negativo") {
      return { icon: ThumbsDown, color: "text-red-600", bg: "bg-red-50", label: "Negativo" };
    }
    return { icon: Minus, color: "text-slate-500", bg: "bg-slate-50", label: "Neutro" };
  };

  const statusConfig = getStatusConfig();
  const StatusIcon = statusConfig.icon;
  const sentimentConfig = getSentimentConfig();
  const SentimentIcon = sentimentConfig.icon;

  const meetingTime = format(new Date(meeting.started_at), "HH:mm");

  // Converter meeting para formato de call para reutilizar CallDetailModal
  // CallDetailModal normaliza: diagnostico||resumo, pontos_chave||pontos_principais, riscos||objecoes
  const meetingAsCall = {
    id: meeting.id,
    direction: 'OUTGOING',
    status: isNoShow ? 'NOT_ANSWERED' : 'ANSWERED',
    started_at: meeting.started_at,
    ended_at: meeting.ended_at,
    duration_seconds: durationSeconds,
    peer_name: meeting.title || 'Reunião',
    lead_id: meeting.lead_id,
    transcriptions: meeting.transcriptions || [],
    metadata: {
      ai_analysis: meeting.ai_analysis,
    },
    ai_summary: normalizedAnalysis?.diagnostico,
    ai_sentiment: normalizedAnalysis?.sentimento,
    ai_key_points: normalizedAnalysis?.pontos_chave,
    ai_suggested_tasks: meeting.ai_analysis?.tarefas_sugeridas,
    is_meeting: true,
    meeting_type: meeting.meeting_type,
    meeting_link: meeting.meeting_link,
    recording_url: meeting.recording_url,
    _fromActivity: meeting._fromActivity,
  };

  return (
    <>
      <div
        className={cn(
          "group relative pl-12 pr-2 py-3 cursor-pointer transition-colors rounded-lg hover:bg-slate-50",
          isNoShow && "hover:bg-red-50/50"
        )}
        onClick={() => setShowDetailModal(true)}
      >
        {/* Nó da timeline */}
        <div className={cn(
          "absolute left-3 top-4 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center z-10",
          statusConfig.border
        )}>
          <StatusIcon className={cn("h-2.5 w-2.5", statusConfig.color)} />
        </div>

        {/* Conteúdo */}
        <div className={cn(
          "p-3 rounded-xl border transition-all",
          isNoShow
            ? "bg-red-50/50 border-red-200 hover:border-red-300"
            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
        )}>
          <div className="flex items-start justify-between gap-3">
            {/* Info principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm text-slate-900 truncate">
                  {meeting.title || 'Reunião'}
                </p>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  statusConfig.bg,
                  statusConfig.color
                )}>
                  {statusConfig.label}
                </span>
                {hasAI && (
                  <span className={cn(
                    "text-[10px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5",
                    sentimentConfig.bg,
                    sentimentConfig.color
                  )}>
                    <SentimentIcon className="h-2.5 w-2.5" />
                    {sentimentConfig.label}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-1.5 text-xs text-slate-500">
                <span className="font-medium">{meetingTime}</span>
                {durationSeconds > 0 && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDuration(durationSeconds)}
                    </span>
                  </>
                )}
                {hasTranscription && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1" title="Transcrição disponível">
                      <MessageSquare className="h-3 w-3" />
                      {meeting.transcriptions!.length}
                    </span>
                  </>
                )}
                {meeting.meeting_type && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1">
                      <Video className="h-3 w-3" />
                      {meeting.meeting_type}
                    </span>
                  </>
                )}
                {hasAI && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1 text-violet-500" title="Analisado por IA">
                      <Sparkles className="h-3 w-3" />
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Menu de ações */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setShowDetailModal(true)}>
                  <Eye className="h-4 w-4 mr-2" />
                  Ver detalhes
                </DropdownMenuItem>
                {meeting.meeting_link && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    window.open(ensureHttps(meeting.meeting_link), '_blank');
                  }}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Abrir link da reunião
                  </DropdownMenuItem>
                )}
                {meeting.recording_url && (
                  <DropdownMenuItem onClick={(e) => {
                    e.stopPropagation();
                    window.open(meeting.recording_url, '_blank');
                  }}>
                    <Video className="h-4 w-4 mr-2 text-violet-600" />
                    Ver gravação
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Preview da análise */}
          {!compact && hasAI && normalizedAnalysis?.diagnostico && (
            <p className="text-xs text-slate-500 mt-2 line-clamp-2 bg-violet-50/50 rounded-lg px-2.5 py-1.5 border border-violet-100">
              <Sparkles className="h-3 w-3 inline mr-1 text-violet-500" />
              {normalizedAnalysis.diagnostico}
            </p>
          )}
        </div>
      </div>

      <CallDetailModal
        open={showDetailModal}
        onOpenChange={setShowDetailModal}
        call={meetingAsCall}
        hideLeadLink={isInsideLead}
      />
    </>
  );
}

// Estatísticas rápidas de reuniões
export function MeetingStats({
  leadId,
  organizationId,
}: {
  leadId?: string;
  organizationId?: string;
}) {
  const { data: meetings } = useMeetingHistory({ leadId, organizationId, limit: 100 });

  if (!meetings) return null;

  const completed = meetings.filter((m) => m.status === 'completed');
  const noShows = meetings.filter((m) => m.status === 'no_show');
  const withAI = meetings.filter((m) => !!m.ai_analysis);
  const totalDuration = completed.reduce((acc, m) => {
    if (m.started_at && m.ended_at) {
      return acc + Math.floor((new Date(m.ended_at).getTime() - new Date(m.started_at).getTime()) / 1000);
    }
    return acc;
  }, 0);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
        <p className="text-2xl font-bold text-slate-900">{meetings.length}</p>
        <p className="text-xs text-slate-500 mt-0.5">Total de reuniões</p>
      </div>
      <div className="bg-gradient-to-br from-emerald-50 to-green-100 rounded-xl p-4 border border-emerald-200">
        <p className="text-2xl font-bold text-emerald-700">{completed.length}</p>
        <p className="text-xs text-emerald-600 mt-0.5">Concluídas</p>
      </div>
      <div className="bg-gradient-to-br from-red-50 to-rose-100 rounded-xl p-4 border border-red-200">
        <p className="text-2xl font-bold text-red-700">{noShows.length}</p>
        <p className="text-xs text-red-600 mt-0.5">No-shows</p>
      </div>
      <div className="bg-gradient-to-br from-violet-50 to-purple-100 rounded-xl p-4 border border-violet-200">
        <p className="text-2xl font-bold text-violet-700">
          {formatDuration(totalDuration)}
        </p>
        <p className="text-xs text-violet-600 mt-0.5">Tempo total</p>
      </div>
    </div>
  );
}
