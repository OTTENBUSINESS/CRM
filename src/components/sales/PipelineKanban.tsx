import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { PipelineColumn, Deal, PipelineStage } from "@/types/sales.types";
import {
  Plus, TrendingUp, DollarSign, Target, Phone, Video,
  Clock, MessageSquare, AlertTriangle, Flame, Snowflake,
  Calendar, User, Users, Crown, ExternalLink, Send, PhoneCall, CheckCircle,
  UserX, Pause, XCircle, Building2, Star, Trash2, Sparkles
} from "lucide-react";
import { useUpdateLeadSales } from "@/hooks/useSalesLeads";
import { useDemoMode } from "@/contexts/DemoModeContext";
import { AlertBadge } from "@/components/sales/AlertBadge";
import { useUpcomingCallsForLeads } from "@/hooks/useTasks";
import { format, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export type PipelineSortBy = "urgency" | "recent" | "value" | "score" | "time_in_stage" | "revenue";

// Extract the highest numeric value from a revenue string for sorting
function getRevenueRank(revenue: string | null | undefined): number {
  if (!revenue) return 0;
  const r = revenue.toLowerCase();
  if (r.includes("não") || r.includes("ainda")) return 0;
  // Extract all numbers (e.g. "Entre R$ 10.000 e R$ 50.000" → [10000, 50000])
  const numbers = r.match(/[\d]+[.\d]*/g);
  if (!numbers || numbers.length === 0) return 0;
  // Parse numbers removing dots as thousand separators
  const parsed = numbers.map(n => parseInt(n.replace(/\./g, ''), 10)).filter(n => !isNaN(n));
  if (parsed.length === 0) return 0;
  // For "Mais de" / "Acima de" use the value * 2 to rank higher
  const isAbove = r.includes("mais de") || r.includes("acima de");
  // For "Até" / "Menos de" use value * 0.5
  const isBelow = r.includes("até") || r.includes("menos de");
  const maxVal = Math.max(...parsed);
  if (isAbove) return maxVal * 2;
  if (isBelow && parsed.length === 1) return maxVal * 0.5;
  // Range: use the upper bound
  return maxVal;
}

interface PipelineKanbanProps {
  columns: PipelineColumn[];
  onDealClick?: (deal: Deal) => void;
  onViewLead?: (leadId: string) => void;
  onDealMove?: (dealId: string, fromStageId: string, toStageId: string) => void;
  onAddDeal?: (stageId: string) => void;
  onDeleteDeal?: (dealId: string) => void;
  className?: string;
  isLoading?: boolean;
  sortBy?: PipelineSortBy;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(value);
}

// Ação de Hoje config
const ACAO_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  ENVIAR_MENSAGEM: { icon: Send, label: "Enviar msg", color: "text-green-700", bg: "bg-green-100" },
  LIGAR: { icon: PhoneCall, label: "Ligar", color: "text-blue-700", bg: "bg-blue-100" },
  CONFIRMAR_CALL: { icon: CheckCircle, label: "Confirmar", color: "text-purple-700", bg: "bg-purple-100" },
  RESGATAR_NO_SHOW: { icon: UserX, label: "Resgatar", color: "text-red-700", bg: "bg-red-100" },
  AGUARDAR: { icon: Pause, label: "Aguardar", color: "text-slate-500", bg: "bg-slate-100" },
  ENCERRAR: { icon: XCircle, label: "Encerrado", color: "text-slate-400", bg: "bg-slate-50" },
};

// Stage colors
const stageColors: Record<string, { bg: string; dot: string; text: string }> = {
  gray: { bg: "bg-slate-50", dot: "bg-slate-400", text: "text-slate-600" },
  slate: { bg: "bg-slate-50", dot: "bg-slate-500", text: "text-slate-600" },
  blue: { bg: "bg-blue-50", dot: "bg-blue-500", text: "text-blue-600" },
  cyan: { bg: "bg-cyan-50", dot: "bg-cyan-500", text: "text-cyan-600" },
  yellow: { bg: "bg-amber-50", dot: "bg-amber-500", text: "text-amber-600" },
  amber: { bg: "bg-amber-50", dot: "bg-amber-500", text: "text-amber-600" },
  purple: { bg: "bg-violet-50", dot: "bg-violet-500", text: "text-violet-600" },
  indigo: { bg: "bg-indigo-50", dot: "bg-indigo-500", text: "text-indigo-600" },
  orange: { bg: "bg-orange-50", dot: "bg-orange-500", text: "text-orange-600" },
  green: { bg: "bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-600" },
  red: { bg: "bg-red-50", dot: "bg-red-500", text: "text-red-600" },
};

export function PipelineKanban({
  columns,
  onDealClick,
  onViewLead,
  onDealMove,
  onAddDeal,
  onDeleteDeal,
  className,
  isLoading,
  sortBy = "urgency",
}: PipelineKanbanProps) {
  const { dv } = useDemoMode();
  const [draggedDeal, setDraggedDeal] = useState<{
    deal: Deal;
    fromStageId: string;
  } | null>(null);
  const [dragOverStageId, setDragOverStageId] = useState<string | null>(null);

  // Resizable columns
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ stageId: string; startX: number; startWidth: number } | null>(null);

  const getColumnWidth = useCallback((stageId: string) => {
    return columnWidths[stageId] || 280;
  }, [columnWidths]);

  const handleResizeStart = useCallback((e: React.MouseEvent, stageId: string) => {
    e.preventDefault();
    e.stopPropagation();
    resizingRef.current = {
      stageId,
      startX: e.clientX,
      startWidth: columnWidths[stageId] || 280,
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [columnWidths]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = e.clientX - resizingRef.current.startX;
      const newWidth = Math.max(220, Math.min(600, resizingRef.current.startWidth + delta));
      setColumnWidths(prev => ({
        ...prev,
        [resizingRef.current!.stageId]: newWidth,
      }));
    };

    const handleMouseUp = () => {
      if (resizingRef.current) {
        resizingRef.current = null;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Extract all lead IDs from deals to fetch scheduled calls
  const leadIds = useMemo(() => {
    const ids = new Set<string>();
    columns.forEach(col => {
      col.deals.forEach(deal => {
        if (deal.lead_id) ids.add(deal.lead_id);
      });
    });
    return Array.from(ids);
  }, [columns]);

  // Fetch scheduled calls for all leads in pipeline
  const { data: callsByLead } = useUpcomingCallsForLeads(leadIds);

  const handleDragStart = (deal: Deal, stageId: string) => {
    setDraggedDeal({ deal, fromStageId: stageId });
  };

  const handleDragOver = (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStageId(stageId);
  };

  const handleDragLeave = () => {
    setDragOverStageId(null);
  };

  const handleDrop = (e: React.DragEvent, toStageId: string) => {
    e.preventDefault();
    setDragOverStageId(null);

    if (draggedDeal && draggedDeal.fromStageId !== toStageId) {
      onDealMove?.(draggedDeal.deal.id, draggedDeal.fromStageId, toStageId);
    }

    setDraggedDeal(null);
  };

  const handleDragEnd = () => {
    setDraggedDeal(null);
    setDragOverStageId(null);
  };

  // Persist horizontal scroll position
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Restore scroll position
    try {
      const saved = sessionStorage.getItem("pipeline_hscroll");
      if (saved) el.scrollLeft = Number(saved);
    } catch (_e) {}

    const handleScroll = () => {
      try { sessionStorage.setItem("pipeline_hscroll", String(el.scrollLeft)); } catch (_e) {}
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isLoading]);

  if (isLoading) {
    return (
      <div className={cn("flex gap-3 pb-4", className)}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="flex-shrink-0 w-[280px] bg-slate-100/50 rounded-xl h-[500px] animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={cn("flex gap-3 pb-4", className)}>
      {columns.map((column) => (
        <KanbanColumn
          key={column.stage.id}
          column={column}
          onDealClick={onDealClick}
          onViewLead={onViewLead}
          onAddDeal={onAddDeal}
          onDeleteDeal={onDeleteDeal}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
          isDragOver={dragOverStageId === column.stage.id}
          isDragging={draggedDeal !== null}
          callsByLead={callsByLead}
          sortBy={sortBy}
          width={getColumnWidth(column.stage.id)}
          onResizeStart={(e) => handleResizeStart(e, column.stage.id)}
        />
      ))}
    </div>
  );
}

interface ScheduledCall {
  id: string;
  name: string;
  scheduled_at: string | null;
  due_datetime?: string | null;
  task_type: string;
  status: string;
  meeting_link?: string | null;
  confirmed_by_client?: boolean;
}

interface KanbanColumnProps {
  column: PipelineColumn;
  onDealClick?: (deal: Deal) => void;
  onViewLead?: (leadId: string) => void;
  onAddDeal?: (stageId: string) => void;
  onDeleteDeal?: (dealId: string) => void;
  onDragStart: (deal: Deal, stageId: string) => void;
  onDragOver: (e: React.DragEvent, stageId: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, stageId: string) => void;
  onDragEnd: () => void;
  isDragOver: boolean;
  isDragging: boolean;
  callsByLead?: Record<string, ScheduledCall>;
  sortBy: PipelineSortBy;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
}

// Wrapper to persist vertical scroll per column
function ColumnScrollArea({ stageId, children }: { stageId: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const key = `pipeline_vscroll_${stageId}`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const saved = sessionStorage.getItem(key);
      if (saved) el.scrollTop = Number(saved);
    } catch (_e) {}

    const handleScroll = () => {
      try { sessionStorage.setItem(key, String(el.scrollTop)); } catch (_e) {}
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [key]);

  return (
    <div
      ref={ref}
      className={[
        "flex-1 max-h-[calc(100vh-300px)] overflow-y-scroll mr-[10px]",
        // Scrollbar sempre visível e clicável (não overlay)
        "[&::-webkit-scrollbar]:w-[8px]",
        "[&::-webkit-scrollbar-track]:bg-slate-100",
        "[&::-webkit-scrollbar-track]:rounded-full",
        "[&::-webkit-scrollbar-thumb]:bg-slate-300",
        "[&::-webkit-scrollbar-thumb]:rounded-full",
        "[&::-webkit-scrollbar-thumb:hover]:bg-slate-400",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function KanbanColumn({
  column,
  onDealClick,
  onViewLead,
  onAddDeal,
  onDeleteDeal,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  isDragOver,
  isDragging,
  callsByLead,
  sortBy,
  width,
  onResizeStart,
}: KanbanColumnProps) {
  const { dv } = useDemoMode();
  const { stage, deals, total_value, count } = column;
  const colors = stageColors[stage.color] || stageColors.gray;

  // Contar deals críticos e com alerta nesta coluna
  const criticalCount = deals.filter(deal => {
    const scheduledCall = deal.lead_id ? callsByLead?.[deal.lead_id] : undefined;
    const urgency = getUrgencyInfo(deal, stage.id, scheduledCall);
    return urgency.level === 'critical';
  }).length;
  
  const warningCount = deals.filter(deal => {
    const scheduledCall = deal.lead_id ? callsByLead?.[deal.lead_id] : undefined;
    const urgency = getUrgencyInfo(deal, stage.id, scheduledCall);
    return urgency.level === 'warning';
  }).length;

  return (
    <div
      className={cn(
        "flex-shrink-0 flex flex-col rounded-xl relative group/col",
        "bg-white border border-slate-200",
        isDragOver && "ring-2 ring-blue-400 border-blue-400 bg-blue-50/30",
        isDragging && !isDragOver && "opacity-70"
      )}
      style={{ width: `${width}px` }}
      onDragOver={(e) => onDragOver(e, stage.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, stage.id)}
    >
      {/* Column Header - Sempre Visível */}
      <div className={cn("p-3 rounded-t-xl border-b", colors.bg)}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className={cn("w-2.5 h-2.5 rounded-full", colors.dot)} />
            <h3 className={cn("font-semibold text-sm", colors.text)}>{stage.name}</h3>
            <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium">
              {count}
            </Badge>
            {/* Indicadores de urgência no header */}
            {criticalCount > 0 && (
              <Badge className="h-5 px-1.5 text-xs font-bold bg-red-500 text-white hover:bg-red-600">
                🔴 {criticalCount}
              </Badge>
            )}
            {warningCount > 0 && criticalCount === 0 && (
              <Badge className="h-5 px-1.5 text-xs font-medium bg-amber-500 text-white hover:bg-amber-600">
                🟡 {warningCount}
              </Badge>
            )}
          </div>
          {/* Botão Add no Header - Sempre Visível */}
          {onAddDeal && !stage.is_won && !stage.is_lost && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-slate-400 hover:text-slate-600"
              onClick={() => onAddDeal(stage.id)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>
        <p className="text-sm font-medium text-slate-700">
          {formatCurrency(dv(total_value))}
        </p>
      </div>

      {/* Deals List - Scrollable */}
      <ColumnScrollArea stageId={stage.id}>
        <div className="p-2 space-y-2">
          {[...deals].sort((a, b) => {
            // Orange star always goes to top
            const starA = (a.lead as any)?.star_type === 'orange' ? 0 : 1;
            const starB = (b.lead as any)?.star_type === 'orange' ? 0 : 1;
            if (starA !== starB) return starA - starB;

            // Call Agendada: always sort by scheduled date (overdue first → soonest upcoming)
            if (stage.id === STAGE_IDS.CALL_AGENDADA) {
              const callA = a.lead_id ? callsByLead?.[a.lead_id] : undefined;
              const callB = b.lead_id ? callsByLead?.[b.lead_id] : undefined;
              const now = Date.now();
              const timeA = callA?.scheduled_at ? new Date(callA.scheduled_at).getTime() : Infinity;
              const timeB = callB?.scheduled_at ? new Date(callB.scheduled_at).getTime() : Infinity;
              const isPastA = timeA < now;
              const isPastB = timeB < now;
              // Overdue cards first
              if (isPastA !== isPastB) return isPastA ? -1 : 1;
              // Among overdue: oldest first (most overdue on top)
              if (isPastA && isPastB) return timeA - timeB;
              // Among upcoming: soonest first
              return timeA - timeB;
            }

            // New deals (≤30min) go to top
            const now = Date.now();
            const isNewA = (now - new Date(a.created_at).getTime()) < 30 * 60 * 1000;
            const isNewB = (now - new Date(b.created_at).getTime()) < 30 * 60 * 1000;
            if (isNewA !== isNewB) return isNewA ? -1 : 1;

            switch (sortBy) {
              case "recent":
                return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
              case "value":
                return (Number(b.negotiated_price) || Number(b.expected_value) || 0) - (Number(a.negotiated_price) || Number(a.expected_value) || 0);
              case "revenue":
                return getRevenueRank((b as any).diagnostic_revenue) - getRevenueRank((a as any).diagnostic_revenue);
              case "score":
                return ((b.lead as any)?.sales_score || 0) - ((a.lead as any)?.sales_score || 0);
              case "time_in_stage":
                return ((b as any).days_since_interaction || 0) - ((a as any).days_since_interaction || 0);
              case "urgency":
              default: {
                const scheduledCallA = a.lead_id ? callsByLead?.[a.lead_id] : undefined;
                const scheduledCallB = b.lead_id ? callsByLead?.[b.lead_id] : undefined;
                const urgencyA = getUrgencyInfo(a, stage.id, scheduledCallA);
                const urgencyB = getUrgencyInfo(b, stage.id, scheduledCallB);
                const order = { critical: 0, warning: 1, ok: 2 };
                return order[urgencyA.level] - order[urgencyB.level];
              }
            }
          }).map((deal) => (
            <DealCard
              key={deal.id}
              deal={deal}
              stageId={stage.id}
              onView={() => onDealClick?.(deal)}
              onViewLead={onViewLead}
              onDelete={onDeleteDeal ? () => onDeleteDeal(deal.id) : undefined}
              onDragStart={() => onDragStart(deal, stage.id)}
              onDragEnd={onDragEnd}
              scheduledCall={deal.lead_id ? callsByLead?.[deal.lead_id] : undefined}
              isFinalized={stage.is_won || stage.is_lost}
            />
          ))}

          {deals.length === 0 && (
            <div className="text-center py-8 px-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-2">
                <Target className="h-5 w-5 text-slate-400" />
              </div>
              <p className="text-xs text-slate-500">Nenhum deal neste estágio</p>
              {onAddDeal && !stage.is_won && !stage.is_lost && (
                <Button
                  variant="link"
                  size="sm"
                  className="mt-2 text-xs h-auto p-0"
                  onClick={() => onAddDeal(stage.id)}
                >
                  + Adicionar deal
                </Button>
              )}
            </div>
          )}
        </div>
      </ColumnScrollArea>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 w-2 h-full cursor-col-resize z-10 group/resize"
        onMouseDown={onResizeStart}
      >
        <div className="absolute right-0 top-0 w-[3px] h-full bg-transparent group-hover/col:bg-blue-300 group-hover/resize:bg-blue-500 transition-colors rounded-full" />
      </div>
    </div>
  );
}

// Helper to format call time
function formatCallTime(call: ScheduledCall): string {
  const dateStr = call.scheduled_at;
  if (!dateStr) return "Sem data";

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Data inválida";

  // Extrair hora do datetime
  const time = format(date, "HH:mm", { locale: ptBR });
  
  if (isToday(date)) return `Hoje ${time}`;
  if (isTomorrow(date)) return `Amanhã ${time}`;
  return `${format(date, "dd/MM", { locale: ptBR })} ${time}`;
}

// Get initials from name
function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Stage IDs para referência
const STAGE_IDS = {
  NOVO: '11111111-0001-0001-0001-000000000001',
  EM_CONTATO: '11111111-0001-0001-0001-000000000002',
  QUALIFICADO: '11111111-0001-0001-0001-000000000003',
  CALL_AGENDADA: '11111111-0001-0001-0001-000000000004',
  NO_SHOW: '11111111-0001-0001-0001-000000000005',
  CALL_REALIZADA: '11111111-0001-0001-0001-000000000006',
  EM_FECHAMENTO: '11111111-0001-0001-0001-000000000007',
  GANHO: '11111111-0001-0001-0001-000000000008',
  PERDIDO: '11111111-0001-0001-0001-000000000009',
};

// Tipo de urgência
type UrgencyLevel = 'critical' | 'warning' | 'ok';

interface UrgencyInfo {
  level: UrgencyLevel;
  message: string;
  icon: React.ElementType;
}

// Calcular urgência baseado no estágio e dados do deal
function getUrgencyInfo(deal: any, stageId: string, scheduledCall?: ScheduledCall): UrgencyInfo {
  const minutes = deal.minutes_since_interaction || 0;
  const hours = deal.hours_since_interaction || 0;
  const days = deal.days_since_interaction || 0;
  const hasNextTask = deal.has_next_task || false;

  switch (stageId) {
    case STAGE_IDS.NOVO:
      // Lead novo: > 30 min = crítico
      if (minutes > 30) {
        return { level: 'critical', message: `${minutes > 60 ? Math.floor(minutes/60) + 'h' : minutes + 'min'} sem contato!`, icon: AlertTriangle };
      }
      if (minutes > 15) {
        return { level: 'warning', message: `${minutes}min sem contato`, icon: Clock };
      }
      return { level: 'ok', message: 'Novo', icon: Clock };

    case STAGE_IDS.EM_CONTATO:
    case STAGE_IDS.QUALIFICADO:
      // Em contato/Qualificado: se conversou hoje está OK, senão > 1 dia = crítico
      if (days === 0) {
        // Conversou hoje - está OK
        return { level: 'ok', message: '', icon: Clock };
      }
      if (days >= 1) {
        return { level: 'critical', message: `${days}d sem interação!`, icon: AlertTriangle };
      }
      if (!hasNextTask) {
        return { level: 'warning', message: 'Sem tarefa agendada', icon: Calendar };
      }
      return { level: 'ok', message: '', icon: Clock };

    case STAGE_IDS.CALL_AGENDADA:
      // Call agendada: verificar status da call
      if (scheduledCall) {
        // Tem call agendada
        const callTime = new Date(scheduledCall.scheduled_at);
        const now = new Date();
        const diffMinutes = (callTime.getTime() - now.getTime()) / (1000 * 60);
        
        // Call em andamento - OK
        if (scheduledCall.status === 'in_progress') {
          return { level: 'ok', message: '', icon: Clock };
        }
        
        // Call passou (mais de 30 min atrás) e não moveu de etapa
        if (diffMinutes < -30) {
          return { level: 'critical', message: 'Call passou! Mover estágio', icon: AlertTriangle };
        }
        
        // Call é hoje e está próxima ou passou recentemente - OK (está acontecendo)
        if (diffMinutes >= -30 && diffMinutes <= 60) {
          return { level: 'ok', message: '', icon: Clock };
        }
        
        // Call futura - OK
        return { level: 'ok', message: '', icon: Clock };
      } else {
        // Não tem call agendada mas está na etapa "Call Agendada"
        if (days >= 1) {
          return { level: 'critical', message: 'Sem call! Agendar ou mover', icon: AlertTriangle };
        }
        return { level: 'warning', message: 'Sem call agendada', icon: Calendar };
      }

    case STAGE_IDS.NO_SHOW:
    case STAGE_IDS.CALL_REALIZADA:
    case STAGE_IDS.EM_FECHAMENTO: {
      // Semáforo: verde (tarefa pendente ou msg hoje), amarelo (1d), vermelho (2d+)
      const hasPendingAction = deal.has_pending_call_or_meeting;
      if (hasPendingAction || days === 0) {
        return { level: 'ok', message: '', icon: CheckCircle };
      }
      if (days === 1) {
        return { level: 'warning', message: '1d sem mensagem', icon: Clock };
      }
      return { level: 'critical', message: `${days}d sem interação!`, icon: AlertTriangle };
    }

    default:
      return { level: 'ok', message: '', icon: Clock };
  }
}

// Calculate days since last interaction (uses pre-calculated value from hook)
function getDaysSinceInteraction(deal: Deal): number {
  // Use pre-calculated value from usePipelineDeals hook
  if ((deal as any).days_since_interaction !== undefined) {
    return (deal as any).days_since_interaction;
  }
  // Fallback to stage_changed_at or created_at
  const stageDate = deal.stage_changed_at || deal.created_at;
  if (!stageDate) return 0;
  const diff = Date.now() - new Date(stageDate).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Get temperature color based on score
function getTemperatureInfo(score?: number | null): { icon: React.ElementType; color: string; label: string } {
  if (!score || score === 0) return { icon: User, color: "text-slate-400", label: "Não qualificado" };
  if (score >= 70) return { icon: Flame, color: "text-red-500", label: "Quente" };
  if (score >= 40) return { icon: TrendingUp, color: "text-amber-500", label: "Morno" };
  return { icon: Snowflake, color: "text-blue-500", label: "Frio" };
}

// Deal Card Component - Mais Informativo
function DealCard({
  deal,
  stageId,
  onView,
  onViewLead,
  onDelete,
  onDragStart,
  onDragEnd,
  scheduledCall,
  isFinalized = false,
}: {
  deal: Deal;
  stageId: string;
  onView: () => void;
  onViewLead?: (leadId: string) => void;
  onDelete?: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  scheduledCall?: ScheduledCall;
  isFinalized?: boolean;
}) {
  const { dv } = useDemoMode();
  const [contactPopoverOpen, setContactPopoverOpen] = useState(false);
  const updateLead = useUpdateLeadSales();
  const starType = (deal.lead as any)?.star_type as 'yellow' | 'orange' | null;
  const isOrangeStar = starType === 'orange';
  const hasAnyStar = starType === 'yellow' || starType === 'orange';

  const handleStarToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!deal.lead_id) return;
    const next: 'yellow' | 'orange' | null =
      starType === null ? 'yellow' :
      starType === 'yellow' ? 'orange' : null;
    updateLead.mutate({ id: deal.lead_id, star_type: next });
  };
  const CallIcon = scheduledCall?.task_type === 'meeting' ? Video : Phone;
  const callDate = scheduledCall?.scheduled_at;
  const isCallToday = callDate ? isToday(new Date(callDate)) : false;

  // Verificar se a call está em andamento pelo status da tarefa
  const isCallInProgress = scheduledCall?.status === 'in_progress';

  // Verificar se a call é em breve (próximos 30 min)
  const isCallSoon = (() => {
    if (!callDate || isCallInProgress) return false;
    const callTime = new Date(callDate);
    const now = new Date();
    const diffMinutes = (callTime.getTime() - now.getTime()) / (1000 * 60);
    // Call em breve: começa em 0-30 minutos
    return diffMinutes > 0 && diffMinutes <= 30;
  })();

  // Calcular urgência baseada no estágio (passa scheduledCall para verificar status da call)
  const urgency = isFinalized ? { level: 'ok' as UrgencyLevel, message: '', icon: Clock } : getUrgencyInfo(deal, stageId, scheduledCall);
  const isCritical = urgency.level === 'critical';
  const isWarning = urgency.level === 'warning';

  // Verificar se interagiu hoje
  const interactedToday = (deal as any).days_since_interaction === 0;

  // Mensagens não respondidas do WhatsApp
  const unreadCount = (deal as any).unread_messages_count || 0;
  const hasUnreadMessages = unreadCount > 0;

  const isMultiContact = deal.contacts && deal.contacts.length >= 2;

  // Para multi-contact: buscar company_name de qualquer contato
  const companyName = useMemo(() => {
    if (!isMultiContact) return null;
    for (const contact of deal.contacts || []) {
      if (contact.lead?.company_name) return contact.lead.company_name;
    }
    return null;
  }, [deal.contacts, isMultiContact]);

  // Nome do card: company_name para multi-contact, senão nome do lead
  const leadName = deal.lead?.name || deal.title || "Sem nome";
  const displayName = isMultiContact && companyName ? companyName : leadName;
  const leadScore = deal.lead?.sales_score;
  const leadPhoto = (deal as any)?.profile_picture_url;
  const isNewDeal = (Date.now() - new Date(deal.created_at).getTime()) < 30 * 60 * 1000;
  const temperature = getTemperatureInfo(leadScore);
  const TempIcon = temperature.icon;

  const handleCardClick = (e: React.MouseEvent) => {
    if (isMultiContact && onViewLead) {
      e.stopPropagation();
      setContactPopoverOpen(true);
    } else {
      onView();
    }
  };

  return (
    <TooltipProvider>
      <div
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={handleCardClick}
        className={cn(
          "rounded-lg p-3 cursor-pointer group relative",
          "border shadow-sm hover:shadow-md",
          "transition-all duration-200",
          "active:scale-[0.98]",
          // Orange star neon border (highest priority)
          isOrangeStar && "border-2 border-[#FF6B00] shadow-[0_0_8px_#FF6B00] bg-orange-50/30",
          // New deal (≤30min) orange contour
          !isOrangeStar && isNewDeal && "border-2 border-orange-500 ring-2 ring-orange-500/30 bg-orange-50/20",
          // Urgência visual forte
          !isOrangeStar && !isNewDeal && isCritical && "bg-red-50 border-red-300 border-l-4 border-l-red-500 hover:bg-red-100",
          !isOrangeStar && !isNewDeal && isWarning && !isCritical && "bg-amber-50 border-amber-300 border-l-4 border-l-amber-500 hover:bg-amber-100",
          // Verde claro para estágios de ação (call realizada, em fechamento, no-show) quando OK
          !isOrangeStar && !isNewDeal && !isCritical && !isWarning && [STAGE_IDS.CALL_REALIZADA, STAGE_IDS.EM_FECHAMENTO, STAGE_IDS.NO_SHOW].includes(stageId) && "bg-green-50 border-green-300 hover:border-green-400",
          !isOrangeStar && !isNewDeal && !isCritical && !isWarning && ![STAGE_IDS.CALL_REALIZADA, STAGE_IDS.EM_FECHAMENTO, STAGE_IDS.NO_SHOW].includes(stageId) && "bg-white border-slate-200 hover:border-slate-300",
          // Call hoje tem destaque azul
          !isOrangeStar && !isNewDeal && isCallToday && !isCritical && !isWarning && "ring-2 ring-blue-400 border-blue-400"
        )}
      >
        {/* Delete button (hover only) */}
        {onDelete && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="absolute top-1.5 left-1.5 z-10 p-1 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-red-100 transition-all"
              >
                <Trash2 className="h-3.5 w-3.5 text-red-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>Excluir deal</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Star indicator + toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleStarToggle}
              className={cn(
                "absolute top-1.5 right-1.5 z-10 p-0.5 rounded transition-all",
                hasAnyStar || isOrangeStar
                  ? "opacity-100"
                  : "opacity-0 group-hover:opacity-60 hover:!opacity-100"
              )}
            >
              <Star
                className={cn(
                  "h-4 w-4 transition-colors",
                  isOrangeStar && "fill-[#FF6B00] text-[#FF6B00] drop-shadow-[0_0_4px_#FF6B00]",
                  starType === 'yellow' && !isOrangeStar && "fill-[#FFD700] text-[#FFD700]",
                  !hasAnyStar && !isOrangeStar && "text-slate-300"
                )}
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p>{isOrangeStar ? 'Lead QUENTE (clique para remover)' : starType === 'yellow' ? 'Favorito (clique: laranja)' : 'Marcar estrela'}</p>
          </TooltipContent>
        </Tooltip>

        {/* Header: Avatar(s) + Name + Temperature */}
        <div className="flex items-start gap-2 mb-2">
          {/* Avatars - stacked when multiple contacts */}
          {deal.contacts && deal.contacts.length >= 2 ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex -space-x-2 flex-shrink-0">
                  {/* Primary contact avatar */}
                  <Avatar className="h-8 w-8 ring-2 ring-white z-10">
                    {leadPhoto && <AvatarImage src={leadPhoto} alt={leadName} />}
                    <AvatarFallback className={cn(
                      "text-xs font-medium",
                      leadScore && leadScore >= 70 ? "bg-red-100 text-red-700" :
                      leadScore && leadScore >= 40 ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600"
                    )}>
                      {getInitials(leadName)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Second contact or +N badge */}
                  {deal.contacts.length === 2 ? (
                    <Avatar className="h-7 w-7 ring-2 ring-white">
                      <AvatarFallback className="text-[10px] font-medium bg-blue-100 text-blue-700">
                        {getInitials(deal.contacts.find(c => !c.is_primary)?.lead?.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                  ) : (
                    <Avatar className="h-7 w-7 ring-2 ring-white">
                      <AvatarFallback className="text-[10px] font-bold bg-slate-200 text-slate-700">
                        +{deal.contacts.length - 1}
                      </AvatarFallback>
                    </Avatar>
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="p-0">
                <div className="p-2 space-y-1.5 min-w-[180px]">
                  <p className="text-xs font-semibold text-muted-foreground px-1 pb-1 border-b">
                    {deal.contacts.length} contatos neste deal
                  </p>
                  {deal.contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center gap-2 px-1">
                      {contact.is_primary && <Crown className="h-3 w-3 text-amber-500 flex-shrink-0" />}
                      {!contact.is_primary && <User className="h-3 w-3 text-slate-400 flex-shrink-0" />}
                      <div className="min-w-0">
                        <p className="text-xs font-medium truncate">{contact.lead?.name || "Sem nome"}</p>
                        {contact.role && (
                          <p className="text-[10px] text-muted-foreground capitalize">{contact.role}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          ) : (
            <Avatar className="h-8 w-8 flex-shrink-0">
              {leadPhoto && <AvatarImage src={leadPhoto} alt={leadName} />}
              <AvatarFallback className={cn(
                "text-xs font-medium",
                leadScore && leadScore >= 70 ? "bg-red-100 text-red-700" :
                leadScore && leadScore >= 40 ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              )}>
                {getInitials(leadName)}
              </AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              {isMultiContact && companyName && (
                <Building2 className="h-3 w-3 text-slate-400 flex-shrink-0" />
              )}
              <h4 className="font-medium text-sm text-slate-800 truncate">
                {displayName}
              </h4>
              {isMultiContact && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px] font-medium flex-shrink-0">
                  <Users className="h-2.5 w-2.5 mr-0.5" />
                  {deal.contacts!.length}
                </Badge>
              )}
              {isNewDeal && (
                <Badge className="h-4 px-1.5 text-[9px] font-bold bg-orange-500 text-white border-0 flex-shrink-0 animate-pulse">
                  NOVO
                </Badge>
              )}
            </div>
            {/* Nomes dos contatos quando card mostra empresa */}
            {isMultiContact && companyName && (
              <p className="text-[10px] text-slate-400 truncate">
                {deal.contacts!.map(c => c.lead?.name || "?").join(", ")}
              </p>
            )}
            {/* Responsável */}
            <div className="flex items-center gap-1 text-xs text-slate-500">
              <User className="h-3 w-3" />
              <span className={cn(
                "truncate",
                !deal.sales_rep && "text-amber-600 font-medium"
              )}>
                {deal.sales_rep?.name || "Sem responsável"}
              </span>
            </div>
          </div>
          {/* Temperature Indicator */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={cn("flex-shrink-0", temperature.color)}>
                <TempIcon className="h-4 w-4" />
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>{temperature.label} {leadScore ? `(${leadScore}%)` : ''}</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Webinario badges + atendencia + fonte */}
        {(() => {
          const enrollment = (deal as any).webinar_enrollment;
          const utmSource = (deal.lead as any)?.utm_source;
          if (!enrollment?.webinar_title && !utmSource) return null;

          let attendanceBadge: React.ReactNode = null;
          if (enrollment?.webinar_title) {
            const eventDate = enrollment.event_date ? new Date(enrollment.event_date) : null;
            const eventHasHappened = eventDate ? eventDate <= new Date() : false;
            if (!eventHasHappened) {
              attendanceBadge = (
                <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                  Aguardando
                </span>
              );
            } else if (enrollment.attended) {
              const mins = enrollment.attended_duration || 0;
              const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 > 0 ? `${mins % 60}m` : ''}` : mins > 0 ? `${mins}min` : '';
              attendanceBadge = (
                <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
                  ✓ {dur || 'Compareceu'}
                </span>
              );
            } else {
              attendanceBadge = (
                <span className="inline-flex items-center text-[9px] px-1 py-0.5 rounded bg-red-100 text-red-700 font-semibold">
                  Faltou
                </span>
              );
            }
          }

          const sourceMap: Record<string, string> = {
            facebook: 'FB', instagram: 'IG', ig: 'IG', google: 'GG',
            whatsapp: 'WA', organic: 'Org', direct: 'Direto',
          };
          const sourceShort = utmSource ? (sourceMap[utmSource.toLowerCase()] || utmSource) : null;

          return (
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              {enrollment?.webinar_title && (
                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-semibold max-w-[120px] truncate">
                  <Sparkles className="h-2.5 w-2.5 shrink-0" />
                  <span className="truncate">{enrollment.webinar_title}</span>
                </span>
              )}
              {attendanceBadge}
              {sourceShort && (
                <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold" title={`Origem: ${utmSource}`}>
                  {sourceShort}
                </span>
              )}
            </div>
          );
        })()}

        {/* Value + Probability */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-slate-900">
            {formatCurrency(dv(deal.negotiated_price || deal.expected_value || 0))}
          </span>
          {deal.probability && deal.probability > 0 && (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs h-5",
                deal.probability >= 70 ? "bg-emerald-100 text-emerald-700" :
                deal.probability >= 40 ? "bg-amber-100 text-amber-700" :
                "bg-slate-100 text-slate-600"
              )}
            >
              {deal.probability}%
            </Badge>
          )}
        </div>

        {/* Info Pills */}
        <div className="flex flex-wrap gap-1.5">
          {/* Mensagem não respondida - PRIORIDADE ALTA */}
          {!isFinalized && hasUnreadMessages && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-bold bg-green-500 text-white animate-pulse">
                  <MessageSquare className="h-3 w-3" />
                  <span>{unreadCount} msg{unreadCount > 1 ? 's' : ''}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>💬 {unreadCount} mensagem{unreadCount > 1 ? 'ns' : ''} não respondida{unreadCount > 1 ? 's' : ''} no WhatsApp!</p>
                <p className="text-xs text-muted-foreground">Clique para responder</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Alert Badge - alertas ativos (follow-up, tarefa, reunião) */}
          {!isFinalized && deal.lead_id && (
            <AlertBadge leadId={deal.lead_id} compact={false} />
          )}

          {/* Interagiu hoje - badge verde */}
          {!isFinalized && interactedToday && !isCritical && !isWarning && !hasUnreadMessages && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                  <CheckCircle className="h-3 w-3" />
                  <span>Interagiu hoje</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>✅ Você interagiu com este lead hoje</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Ação de Hoje - Destaque Principal */}
          {deal.lead?.acao_de_hoje && ACAO_CONFIG[deal.lead.acao_de_hoje] &&
           deal.lead.acao_de_hoje !== 'AGUARDAR' && deal.lead.acao_de_hoje !== 'ENCERRAR' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                  ACAO_CONFIG[deal.lead.acao_de_hoje].bg,
                  ACAO_CONFIG[deal.lead.acao_de_hoje].color
                )}>
                  {(() => {
                    const AcaoIcon = ACAO_CONFIG[deal.lead.acao_de_hoje].icon;
                    return <AcaoIcon className="h-3 w-3" />;
                  })()}
                  <span>{ACAO_CONFIG[deal.lead.acao_de_hoje].label}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Ação de hoje: {ACAO_CONFIG[deal.lead.acao_de_hoje].label}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Call em andamento - destaque máximo */}
          {scheduledCall && isCallInProgress && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-green-500 text-white animate-pulse">
                  <span className="inline-block w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
                  <Video className="h-3 w-3" />
                  <span>Em call</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{scheduledCall.name}</p>
                <p className="text-xs text-muted-foreground">Call em andamento</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Call em breve */}
          {scheduledCall && isCallSoon && !isCallInProgress && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-500 text-white">
                  <CallIcon className="h-3 w-3" />
                  <span>⏰ {formatCallTime(scheduledCall)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{scheduledCall.name}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Scheduled Call - normal */}
          {scheduledCall && !isCallInProgress && !isCallSoon && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs",
                  isCallToday ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
                )}>
                  <CallIcon className="h-3 w-3" />
                  <span>{formatCallTime(scheduledCall)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>{scheduledCall.name}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Diagnostic Score */}
          {(deal as any).diagnostic_score && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                  (deal as any).diagnostic_score >= 70 ? "bg-emerald-100 text-emerald-700" :
                  (deal as any).diagnostic_score >= 40 ? "bg-amber-100 text-amber-700" :
                  "bg-slate-100 text-slate-600"
                )}>
                  <Target className="h-3 w-3" />
                  <span>{(deal as any).diagnostic_score}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Score Diagnóstico: {(deal as any).diagnostic_score}/100</p>
                {(deal as any).diagnostic_revenue && <p>Faturamento: {(deal as any).diagnostic_revenue}</p>}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Faturamento - prioriza monthly_revenue do lead, fallback pra diagnostic */}
          {((deal.lead as any)?.monthly_revenue || (deal as any).diagnostic_revenue) && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700">
                  <DollarSign className="h-3 w-3" />
                  <span className="whitespace-nowrap">{(deal.lead as any)?.monthly_revenue || (deal as any).diagnostic_revenue}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>Faturamento: {(deal.lead as any)?.monthly_revenue || (deal as any).diagnostic_revenue}</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Scheduled call date for Call Agendada */}
        {!isFinalized && stageId === STAGE_IDS.CALL_AGENDADA && scheduledCall?.scheduled_at && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className={cn(
              "text-[10px] flex items-center gap-0.5 font-medium",
              new Date(scheduledCall.scheduled_at) < new Date()
                ? "text-red-600"
                : isCallToday
                  ? "text-blue-600"
                  : "text-slate-500"
            )}>
              <Calendar className="h-3 w-3" />
              {(() => {
                const d = new Date(scheduledCall.scheduled_at);
                const isPast = d < new Date();
                if (isPast) {
                  return `Atrasada — ${format(d, "dd/MM 'às' HH:mm", { locale: ptBR })}`;
                }
                if (isToday(d)) {
                  return `Hoje às ${format(d, "HH:mm")}`;
                }
                if (isTomorrow(d)) {
                  return `Amanhã às ${format(d, "HH:mm")}`;
                }
                return format(d, "dd/MM 'às' HH:mm", { locale: ptBR });
              })()}
            </span>
          </div>
        )}

        {/* Days in stage badge */}
        {!isFinalized && stageId !== STAGE_IDS.CALL_AGENDADA && (deal as any).days_in_stage > 0 && (
          <div className="flex items-center gap-1 mt-1.5">
            <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
              <Calendar className="h-3 w-3" /> {(deal as any).days_in_stage}d nesta etapa
            </span>
          </div>
        )}

        {/* Última mensagem WhatsApp */}
        {(deal as any).last_message_content && (
          <div className={cn(
            "flex items-center gap-1.5 mt-2 pt-2 border-t text-xs",
            (deal as any).last_message_is_from_me ? "text-slate-400" : "text-slate-600"
          )}>
            <MessageSquare className="h-3 w-3 flex-shrink-0" />
            <span className="truncate">
              {(deal as any).last_message_is_from_me ? "Você: " : ""}
              {((deal as any).last_message_content as string).slice(0, 60)}
              {((deal as any).last_message_content as string).length > 60 ? "…" : ""}
            </span>
          </div>
        )}

        {/* Popover de seleção de contato para multi-contact deals */}
        {isMultiContact && onViewLead && (
          <Popover open={contactPopoverOpen} onOpenChange={setContactPopoverOpen}>
            <PopoverTrigger asChild>
              <span className="hidden" />
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start" side="right">
              <div className="p-3 border-b">
                <p className="text-sm font-semibold text-slate-800">{companyName || deal.title || "Deal"}</p>
                <p className="text-xs text-muted-foreground">{deal.contacts!.length} contatos vinculados</p>
              </div>
              <div className="p-1">
                {deal.contacts!.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setContactPopoverOpen(false);
                      if (contact.lead_id) onViewLead(contact.lead_id);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover:bg-slate-100 transition-colors text-left"
                  >
                    <Avatar className="h-7 w-7 flex-shrink-0">
                      <AvatarFallback className={cn(
                        "text-[10px] font-medium",
                        contact.is_primary ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      )}>
                        {getInitials(contact.lead?.name || "?")}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-800 truncate">{contact.lead?.name || "Sem nome"}</p>
                      <div className="flex items-center gap-1">
                        {contact.is_primary && (
                          <span className="text-[10px] text-amber-600 font-medium">Principal</span>
                        )}
                        {contact.role && (
                          <span className="text-[10px] text-muted-foreground capitalize">{contact.role}</span>
                        )}
                      </div>
                    </div>
                    <ExternalLink className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />
                  </button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </TooltipProvider>
  );
}

// Stats Header
export function PipelineKanbanHeader({
  columns,
  className,
}: {
  columns: PipelineColumn[];
  className?: string;
}) {
  const { dv } = useDemoMode();
  const totalDeals = columns.reduce((sum, c) => sum + c.count, 0);
  const totalValue = columns.reduce((sum, c) => sum + c.total_value, 0);
  const wonColumn = columns.find((c) => c.stage.is_won);
  const wonValue = wonColumn?.total_value || 0;
  const wonCount = wonColumn?.count || 0;
  const conversionRate = totalDeals > 0 ? Math.round((wonCount / totalDeals) * 100) : 0;

  // Count stale deals (using days_since_interaction from hook)
  const staleDeals = columns.reduce((sum, col) => {
    return sum + col.deals.filter(deal => ((deal as any).days_since_interaction || 0) >= 7).length;
  }, 0);

  return (
    <div className={cn("flex flex-wrap items-center gap-6", className)}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <Target className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{totalDeals}</p>
          <p className="text-xs text-slate-500">Leads ativos</p>
        </div>
      </div>

      <div className="w-px h-12 bg-slate-200" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
          <DollarSign className="w-5 h-5 text-slate-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-slate-900">{formatCurrency(dv(totalValue))}</p>
          <p className="text-xs text-slate-500">Valor total</p>
        </div>
      </div>

      <div className="w-px h-12 bg-slate-200" />

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-emerald-600" />
        </div>
        <div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(dv(wonValue))}</p>
          <p className="text-xs text-slate-500">{wonCount} ganhos ({conversionRate}%)</p>
        </div>
      </div>

      {staleDeals > 0 && (
        <>
          <div className="w-px h-12 bg-slate-200" />
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-600">{staleDeals}</p>
              <p className="text-xs text-slate-500">Precisam atenção</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Mini pipeline for preview/card view
export function PipelineMini({
  stages,
  currentStageId,
  className,
}: {
  stages: PipelineStage[];
  currentStageId?: string;
  className?: string;
}) {
  const currentIndex = stages.findIndex((s) => s.id === currentStageId);

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {stages.map((stage, index) => {
        const isActive = stage.id === currentStageId;
        const isPast = index < currentIndex;
        const colors = stageColors[stage.color] || stageColors.gray;

        return (
          <div
            key={stage.id}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-all duration-300",
              isActive ? colors.dot : isPast ? "bg-emerald-400" : "bg-slate-200"
            )}
            title={stage.name}
          />
        );
      })}
    </div>
  );
}
