import { useState } from "react";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Sparkles,
  Play,
  ThumbsUp,
  ThumbsDown,
  Minus,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  Eye,
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
import {
  useCallHistory,
  useReprocessCallAnalysis,
  formatDuration,
  CallHistoryRecord,
} from "@/hooks/useWavoip";
import { CallDetailModal } from "./CallDetailModal";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CallHistoryProps {
  teamMemberId?: string;
  leadId?: string;
  leadIds?: string[];
  limit?: number;
  showTitle?: boolean;
  compact?: boolean;
}

// Agrupa chamadas por data
function groupCallsByDate(calls: CallHistoryRecord[]) {
  const groups: { [key: string]: CallHistoryRecord[] } = {};

  calls.forEach(call => {
    const date = new Date(call.started_at);
    let key: string;

    if (isToday(date)) {
      key = 'Hoje';
    } else if (isYesterday(date)) {
      key = 'Ontem';
    } else {
      key = format(date, "EEEE, d 'de' MMMM", { locale: ptBR });
      // Capitalizar primeira letra
      key = key.charAt(0).toUpperCase() + key.slice(1);
    }

    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(call);
  });

  return groups;
}

export function CallHistory({
  teamMemberId,
  leadId,
  leadIds,
  limit = 10,
  showTitle = true,
  compact = false,
}: CallHistoryProps) {
  const { data: calls, isLoading, error } = useCallHistory({
    teamMemberId,
    leadId,
    leadIds,
    limit,
  });

  const isInsideLead = !!leadId;

  if (isLoading) {
    return (
      <Card className="border-0 shadow-sm">
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 rounded-lg">
                <Phone className="h-4 w-4 text-emerald-600" />
              </div>
              Histórico de Chamadas
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
            <CardTitle className="text-base font-semibold">Histórico de Chamadas</CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <p className="text-sm text-destructive">Erro ao carregar histórico</p>
        </CardContent>
      </Card>
    );
  }

  if (!calls || calls.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        {showTitle && (
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 rounded-lg">
                <Phone className="h-4 w-4 text-emerald-600" />
              </div>
              Histórico de Chamadas
            </CardTitle>
          </CardHeader>
        )}
        <CardContent>
          <div className="text-center py-10">
            <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 rounded-full flex items-center justify-center">
              <Phone className="h-8 w-8 text-slate-300" />
            </div>
            <p className="text-sm font-medium text-slate-500">Nenhuma chamada registrada</p>
            <p className="text-xs text-slate-400 mt-1">As chamadas aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const groupedCalls = groupCallsByDate(calls);

  return (
    <Card className="border-0 shadow-sm">
      {showTitle && (
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <div className="p-1.5 bg-emerald-100 rounded-lg">
                <Phone className="h-4 w-4 text-emerald-600" />
              </div>
              Histórico de Chamadas
            </CardTitle>
            <Badge variant="secondary" className="font-normal">
              {calls.length} {calls.length === 1 ? 'chamada' : 'chamadas'}
            </Badge>
          </div>
        </CardHeader>
      )}
      <CardContent className="pt-0">
        <ScrollArea className={cn(calls.length > 5 && "h-[450px]")}>
          <div className="space-y-6">
            {Object.entries(groupedCalls).map(([dateLabel, dateCalls]) => (
              <div key={dateLabel}>
                {/* Date header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-medium text-slate-500 px-2 bg-white">
                    {dateLabel}
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                {/* Timeline de chamadas */}
                <div className="relative">
                  {/* Linha vertical da timeline */}
                  <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" />

                  {/* Chamadas */}
                  <div className="space-y-0">
                    {dateCalls.map((call, index) => (
                      <CallHistoryItem
                        key={call.id}
                        call={call}
                        compact={compact}
                        isInsideLead={isInsideLead}
                        isLast={index === dateCalls.length - 1}
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

// Item individual do histórico (formato timeline)
function CallHistoryItem({
  call,
  compact,
  isInsideLead,
  isLast,
}: {
  call: CallHistoryRecord;
  compact: boolean;
  isInsideLead: boolean;
  isLast: boolean;
}) {
  const [showDetailModal, setShowDetailModal] = useState(false);
  const reprocessMutation = useReprocessCallAnalysis();

  const isIncoming = call.direction === "INCOMING";
  const isMissed = ["REJECTED", "NOT_ANSWERED", "FAILED"].includes(call.status);
  const hasAI = !!call.ai_summary;
  const hasRecording = call.record_status === "READY" && call.record_url;
  const hasTranscription = call.transcriptions && (call.transcriptions as any[]).length > 0;

  const getDirectionConfig = () => {
    if (isMissed) {
      return {
        icon: PhoneMissed,
        color: "text-red-500",
        bg: "bg-red-100",
        border: "border-red-300",
        label: "Perdida"
      };
    }
    if (isIncoming) {
      return {
        icon: PhoneIncoming,
        color: "text-blue-500",
        bg: "bg-blue-100",
        border: "border-blue-300",
        label: "Recebida"
      };
    }
    return {
      icon: PhoneOutgoing,
      color: "text-emerald-500",
      bg: "bg-emerald-100",
      border: "border-emerald-300",
      label: "Realizada"
    };
  };

  const getSentimentConfig = () => {
    const sentiment = call.ai_sentiment;
    if (sentiment === "positive" || sentiment === "positivo") {
      return { icon: ThumbsUp, color: "text-emerald-600", bg: "bg-emerald-50", label: "Positivo" };
    }
    if (sentiment === "negative" || sentiment === "negativo") {
      return { icon: ThumbsDown, color: "text-red-600", bg: "bg-red-50", label: "Negativo" };
    }
    return { icon: Minus, color: "text-slate-500", bg: "bg-slate-50", label: "Neutro" };
  };

  const directionConfig = getDirectionConfig();
  const DirectionIcon = directionConfig.icon;
  const sentimentConfig = getSentimentConfig();
  const SentimentIcon = sentimentConfig.icon;

  const handleReprocess = (e: React.MouseEvent) => {
    e.stopPropagation();
    reprocessMutation.mutate(call.id);
  };

  const callTime = format(new Date(call.started_at), "HH:mm");

  return (
    <>
      <div
        className={cn(
          "group relative pl-12 pr-2 py-3 cursor-pointer transition-colors rounded-lg hover:bg-slate-50",
          isMissed && "hover:bg-red-50/50"
        )}
        onClick={() => setShowDetailModal(true)}
      >
        {/* Nó da timeline */}
        <div className={cn(
          "absolute left-3 top-4 w-5 h-5 rounded-full border-2 bg-white flex items-center justify-center z-10",
          directionConfig.border
        )}>
          <DirectionIcon className={cn("h-2.5 w-2.5", directionConfig.color)} />
        </div>

        {/* Conteúdo */}
        <div className={cn(
          "p-3 rounded-xl border transition-all",
          isMissed
            ? "bg-red-50/50 border-red-200 hover:border-red-300"
            : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-sm"
        )}>
          <div className="flex items-start justify-between gap-3">
            {/* Info principal */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-medium text-sm text-slate-900 truncate">
                  {call.peer_name || call.peer_phone}
                </p>
                <span className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  directionConfig.bg,
                  directionConfig.color
                )}>
                  {directionConfig.label}
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
                <span className="font-medium">{callTime}</span>
                <span className="text-slate-300">•</span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(call.duration_seconds)}
                </span>
                {hasTranscription && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1" title="Transcrição disponível">
                      <MessageSquare className="h-3 w-3" />
                      {(call.transcriptions as any[]).length}
                    </span>
                  </>
                )}
                {hasRecording && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span className="flex items-center gap-1" title="Gravação disponível">
                      <Play className="h-3 w-3" />
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
                {hasTranscription && !hasAI && (
                  <DropdownMenuItem onClick={handleReprocess} disabled={reprocessMutation.isPending}>
                    {reprocessMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-2" />
                    )}
                    Analisar com IA
                  </DropdownMenuItem>
                )}
                {hasAI && (
                  <DropdownMenuItem onClick={handleReprocess} disabled={reprocessMutation.isPending}>
                    {reprocessMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Reprocessar análise
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Preview da análise */}
          {!compact && hasAI && call.ai_summary && (
            <p className="text-xs text-slate-500 mt-2 line-clamp-2 bg-violet-50/50 rounded-lg px-2.5 py-1.5 border border-violet-100">
              <Sparkles className="h-3 w-3 inline mr-1 text-violet-500" />
              {call.ai_summary}
            </p>
          )}
        </div>
      </div>

      <CallDetailModal
        open={showDetailModal}
        onOpenChange={setShowDetailModal}
        call={call}
        hideLeadLink={isInsideLead}
      />
    </>
  );
}

// Estatísticas rápidas
export function CallStats({
  teamMemberId,
  period = "today",
}: {
  teamMemberId?: string;
  period?: "today" | "week" | "month";
}) {
  const { data: calls } = useCallHistory({ teamMemberId, limit: 100 });

  if (!calls) return null;

  const now = new Date();
  let startDate: Date;

  switch (period) {
    case "today":
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "week":
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
  }

  const filteredCalls = calls.filter(
    (c) => new Date(c.started_at) >= startDate
  );
  const completed = filteredCalls.filter((c) => c.status === "ENDED");
  const totalDuration = completed.reduce(
    (acc, c) => acc + (c.duration_seconds || 0),
    0
  );

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-200">
        <p className="text-2xl font-bold text-slate-900">{filteredCalls.length}</p>
        <p className="text-xs text-slate-500 mt-0.5">Total de chamadas</p>
      </div>
      <div className="bg-gradient-to-br from-emerald-50 to-green-100 rounded-xl p-4 border border-emerald-200">
        <p className="text-2xl font-bold text-emerald-700">
          {filteredCalls.filter((c) => c.direction === "OUTGOING").length}
        </p>
        <p className="text-xs text-emerald-600 mt-0.5">Realizadas</p>
      </div>
      <div className="bg-gradient-to-br from-blue-50 to-indigo-100 rounded-xl p-4 border border-blue-200">
        <p className="text-2xl font-bold text-blue-700">
          {filteredCalls.filter((c) => c.direction === "INCOMING").length}
        </p>
        <p className="text-xs text-blue-600 mt-0.5">Recebidas</p>
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
