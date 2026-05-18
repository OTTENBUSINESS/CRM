import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PipelineKanban, PipelineKanbanHeader, type PipelineSortBy } from "@/components/sales/PipelineKanban";
import { CreateLeadOrDealModal } from "@/components/sales/CreateLeadOrDealModal";
import { LoseDealModal } from "@/components/sales/LoseDealModal";
import { BatchImportDealsModal } from "@/components/sales/BatchImportDealsModal";
import { BulkWhatsAppModal } from "@/components/sales/BulkWhatsAppModal";
import { SalesAIChat } from "@/components/sales/ai";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePipelineDeals } from "@/hooks/useSalesPipeline";
import { usePipelines } from "@/hooks/usePipelineConfig";
// Webinar configs foi removido junto com o m\u00f3dulo de eventos.
const useWebinarConfigs = () => ({ data: [] as Array<{ id: string; name: string }> });
import { useMoveDealStage, useTransferDealPipeline, useDeleteDeal } from "@/hooks/useSalesDeals";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  RefreshCw,
  CalendarDays,
  Search,
  AlertTriangle,
  X,
  DollarSign,
  ArrowUpDown,
  Link,
  Upload,
  MessageSquare,
  Phone,
  Trophy,
  Clock,
  SlidersHorizontal,
  Sparkles,
  MoreHorizontal,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Deal, PipelineColumn } from "@/types/sales.types";
import { navigateTo } from "@/lib/utils";

// Função para remover acentos
function removeAccents(str: string): string {
  return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Stage IDs para cálculo de urgência
const STAGE_IDS = {
  NOVO: '11111111-0001-0001-0001-000000000001',
  EM_CONTATO: '11111111-0001-0001-0001-000000000002',
  QUALIFICADO: '11111111-0001-0001-0001-000000000003',
  CALL_AGENDADA: '11111111-0001-0001-0001-000000000004',
  NO_SHOW: '11111111-0001-0001-0001-000000000005',
  CALL_REALIZADA: '11111111-0001-0001-0001-000000000006',
  EM_FECHAMENTO: '11111111-0001-0001-0001-000000000007',
};

// Calcular urgência de um deal (mesma lógica do PipelineKanban)
function getDealUrgency(deal: any, stageId: string): 'critical' | 'warning' | 'ok' {
  const minutes = deal.minutes_since_interaction || 0;
  const hours = deal.hours_since_interaction || 0;
  const days = deal.days_since_interaction || 0;
  const hasNextTask = deal.has_next_task || false;

  switch (stageId) {
    case STAGE_IDS.NOVO:
      if (minutes > 30) return 'critical';
      if (minutes > 15) return 'warning';
      return 'ok';
    case STAGE_IDS.EM_CONTATO:
    case STAGE_IDS.QUALIFICADO:
      if (days === 0) return 'ok';
      if (days >= 1) return 'critical';
      if (!hasNextTask) return 'warning';
      return 'ok';
    case STAGE_IDS.CALL_AGENDADA:
      if (!hasNextTask && days >= 1) return 'critical';
      return 'ok';
    case STAGE_IDS.NO_SHOW:
      if (!hasNextTask) return 'critical';
      if (hours >= 4) return 'critical';
      if (hours >= 1) return 'warning';
      return 'ok';
    case STAGE_IDS.CALL_REALIZADA:
      if (!hasNextTask) return 'critical';
      if (days >= 1) return 'critical';
      return 'ok';
    case STAGE_IDS.EM_FECHAMENTO:
      if (days === 0) return 'ok';
      if (days >= 1) return 'critical';
      return 'ok';
    default:
      return 'ok';
  }
}

// Hook para persistir estado no sessionStorage
function useSessionState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch (_e) {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback((value: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch (_e) {}
      return next;
    });
  }, [key]);

  return [state, setPersistedState];
}

// Helper para calcular range de datas baseado no preset
function getDateRange(
  period: string,
  customFrom: string,
  customTo: string
): { from: Date; to: Date } | null {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "this_week": {
      const day = now.getDay();
      const diffToMonday = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diffToMonday);
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return { from: startOfDay(monday), to: endOfDay(sunday) };
    }
    case "this_month":
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(now),
      };
    case "last_month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: first, to: endOfDay(last) };
    }
    case "last_3_months": {
      const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: threeMonthsAgo, to: endOfDay(now) };
    }
    case "custom": {
      if (!customFrom && !customTo) return null;
      const from = customFrom ? startOfDay(new Date(customFrom + "T00:00:00")) : new Date(0);
      const to = customTo ? endOfDay(new Date(customTo + "T00:00:00")) : endOfDay(now);
      return { from, to };
    }
    default:
      return null;
  }
}

export function PipelineBoardContent() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const [viewFilter, setViewFilter] = useSessionState<string>("pipeline_viewFilter", "all");
  const [searchQuery, setSearchQuery] = useSessionState<string>("pipeline_searchQuery", "");
  const [urgencyFilter, setUrgencyFilter] = useSessionState<string>("pipeline_urgencyFilter", "all");
  const [revenueFilter, setRevenueFilter] = useSessionState<string>("pipeline_revenueFilter", "all");
  const [activityFilter, setActivityFilter] = useSessionState<string>("pipeline_activityFilter", "all");
  const [utmSourceFilter, setUtmSourceFilter] = useState<string>("all");
  const [utmCampaignFilter, setUtmCampaignFilter] = useState<string>("all");
  const [utmContentFilter, setUtmContentFilter] = useState<string>("all");
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [selectedStageId, setSelectedStageId] = useState<string | undefined>();
  const [selectedPipelineId, setSelectedPipelineId] = useSessionState<string | undefined>(
    "pipeline_selectedPipelineId",
    searchParams.get('pipeline') || undefined
  );
  const [periodFilter, setPeriodFilter] = useSessionState<string>("pipeline_periodFilter", "all");
  const [dateField, setDateField] = useSessionState<"created_at" | "won_at">("pipeline_dateField", "created_at");
  const [customDateFrom, setCustomDateFrom] = useSessionState<string>("pipeline_customDateFrom", "");
  const [customDateTo, setCustomDateTo] = useSessionState<string>("pipeline_customDateTo", "");
  const [sortBy, setSortBy] = useSessionState<PipelineSortBy>("pipeline_sortBy", "urgency");
  const [loseDealTarget, setLoseDealTarget] = useState<{ dealId: string; deal: Deal } | null>(null);
  const [isBatchImportOpen, setIsBatchImportOpen] = useState(false);
  const [isBulkWhatsAppOpen, setIsBulkWhatsAppOpen] = useState(false);
  const [webinarFilter, setWebinarFilter] = useSessionState<string | undefined>("pipeline_webinarFilter", undefined);

  const { data: pipelines } = usePipelines();
  const { data: webinarConfigs = [] } = useWebinarConfigs();

  // Set default pipeline on load (fallback pro primeiro se n\u00e3o houver is_default)
  const activePipelineId =
    selectedPipelineId ||
    pipelines?.find((p) => p.is_default)?.id ||
    pipelines?.[0]?.id;
  const WEBINAR_PIPELINE_ID = '90b09d81-8282-4503-a869-1787baf8f736';
  const isWebinarPipeline = activePipelineId === WEBINAR_PIPELINE_ID;

  const salesRepId = viewFilter === "mine" ? teamMember?.id : undefined;

  const {
    data: pipeline,
    isLoading,
    refetch,
  } = usePipelineDeals(salesRepId, activePipelineId, isWebinarPipeline ? webinarFilter : undefined);

  const moveDealMutation = useMoveDealStage();
  const transferMutation = useTransferDealPipeline();
  const deleteDealMutation = useDeleteDeal();

  const PRE_VENDAS_PIPELINE_ID = 'fabb8cee-ca6c-4980-9b88-919c85e0b12f';
  const CLOSER_PIPELINE_ID = '9c21bd06-a898-44a1-88db-ad3c6ec7140c';
  const CLOSER_CALL_AGENDADA_STAGE_ID = '11111111-0001-0001-0001-000000000004';

  // Persist outer horizontal scroll
  const outerScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = outerScrollRef.current;
    if (!el) return;
    try {
      const saved = sessionStorage.getItem("pipeline_outer_hscroll");
      if (saved) el.scrollLeft = Number(saved);
    } catch (_e) {}
    const handleScroll = () => {
      try { sessionStorage.setItem("pipeline_outer_hscroll", String(el.scrollLeft)); } catch (_e) {}
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [isLoading]);

  // Filtrar pipeline baseado nos filtros
  const filteredPipeline = useMemo(() => {
    if (!pipeline) return [];

    const searchNormalized = removeAccents(searchQuery.trim());
    const hasSearch = searchNormalized.length > 0;
    const hasUrgencyFilter = urgencyFilter !== "all";
    const hasRevenueFilter = revenueFilter !== "all";
    const hasActivityFilter = activityFilter !== "all";
    const hasUtmSourceFilter = utmSourceFilter !== "all";
    const hasUtmCampaignFilter = utmCampaignFilter !== "all";
    const hasUtmContentFilter = utmContentFilter !== "all";
    const dateRange = getDateRange(periodFilter, customDateFrom, customDateTo);
    const hasPeriodFilter = dateRange !== null;

    if (!hasSearch && !hasUrgencyFilter && !hasActivityFilter && !hasRevenueFilter && !hasUtmSourceFilter && !hasUtmCampaignFilter && !hasUtmContentFilter && !hasPeriodFilter) return pipeline;

    return pipeline.map((column): PipelineColumn => {
      const filteredDeals = column.deals.filter((deal) => {
        // Filtro de busca (nome, email, telefone)
        if (hasSearch) {
          const leadName = removeAccents(deal.lead?.name || deal.title || "");
          const leadEmail = removeAccents(deal.lead?.email || "");
          const leadPhone = (deal.lead?.phone || "").replace(/\D/g, "");
          const searchPhone = searchNormalized.replace(/\D/g, "");
          // Só buscar por telefone se a query parece ser um número (>50% dígitos e pelo menos 3 dígitos)
          const isPhoneSearch = searchPhone.length >= 3 && (searchPhone.length / searchNormalized.length) > 0.5;

          // Buscar nos nomes dos contatos secundários
          const contactNames = (deal.contacts || [])
            .filter(c => !c.is_primary)
            .map(c => removeAccents(c.lead?.name || ""));
          const matchesContactName = contactNames.some(name => name.includes(searchNormalized));

          const matchesSearch =
            leadName.includes(searchNormalized) ||
            leadEmail.includes(searchNormalized) ||
            (isPhoneSearch && leadPhone.includes(searchPhone)) ||
            matchesContactName;

          if (!matchesSearch) return false;
        }

        // Filtro de urgência
        if (hasUrgencyFilter) {
          const dealUrgency = getDealUrgency(deal, column.stage.id);
          if (urgencyFilter === "critical" && dealUrgency !== "critical") return false;
          if (urgencyFilter === "warning" && dealUrgency !== "warning") return false;
          if (urgencyFilter === "ok" && dealUrgency !== "ok") return false;
        }

        // Filtro de atividade (calls/tarefas hoje)
        if (hasActivityFilter) {
          if (activityFilter === "call_today" && !(deal as any).has_call_today) return false;
          if (activityFilter === "meeting_today" && !(deal as any).today_task_types?.includes('meeting')) return false;
          if (activityFilter === "task_today" && !(deal as any).has_task_today) return false;
          if (activityFilter === "no_task_today" && (deal as any).has_task_today) return false;
          if (activityFilter === "any_task" && !(deal as any).has_any_task) return false;
          if (activityFilter === "overdue" && !(deal as any).has_overdue_task) return false;
        }

        // Filtro de UTM Source
        if (hasUtmSourceFilter) {
          const source = (deal.lead?.utm_source || "").toLowerCase();
          if (utmSourceFilter === "_sem_utm") {
            if (source !== "") return false;
          } else if (source !== utmSourceFilter.toLowerCase()) return false;
        }

        // Filtro de UTM Campaign
        if (hasUtmCampaignFilter) {
          const campaign = (deal.lead?.utm_campaign || "").toLowerCase();
          if (utmCampaignFilter === "_sem_utm") {
            if (campaign !== "") return false;
          } else if (campaign !== utmCampaignFilter.toLowerCase()) return false;
        }

        // Filtro de UTM Content
        if (hasUtmContentFilter) {
          const content = (deal.lead?.utm_content || "").toLowerCase();
          if (utmContentFilter === "_sem_utm") {
            if (content !== "") return false;
          } else if (content !== utmContentFilter.toLowerCase()) return false;
        }

        // Filtro de período (created_at ou won_at)
        if (hasPeriodFilter && dateRange) {
          const rawDate = dateField === "won_at" ? (deal as any).won_at : deal.created_at;
          const dateVal = rawDate ? new Date(rawDate) : null;
          if (!dateVal || dateVal < dateRange.from || dateVal > dateRange.to) return false;
        }

        // Filtro de faturamento (extrai valor numérico máximo do texto)
        if (hasRevenueFilter) {
          const revenue = (deal as any).diagnostic_revenue || "";
          if (revenueFilter === "sem_faturamento") {
            if (revenue !== "") return false;
          } else {
            if (!revenue) return false;
            const rLow = revenue.toLowerCase();
            if (rLow.includes("não") || rLow.includes("ainda")) return false;
            const nums = revenue.match(/[\d]+[.\d]*/g);
            const parsed = (nums || []).map((n: string) => parseInt(n.replace(/\./g, ''), 10)).filter((n: number) => !isNaN(n));
            const maxVal = parsed.length > 0 ? Math.max(...parsed) : 0;
            const isAbove = rLow.includes("mais de") || rLow.includes("acima de");

            if (revenueFilter === "100k+") {
              // 100k+ only if "mais de/acima de 100k" or max value > 100k
              if (!(maxVal >= 100000 && isAbove)) return false;
            }
            if (revenueFilter === "50k-100k") {
              // Range includes upper bound 50k-100k
              if (isAbove && maxVal >= 100000) return false; // that's 100k+
              if (maxVal < 50000 || maxVal > 100000) return false;
            }
            if (revenueFilter === "10k-50k") {
              if (maxVal < 10000 || maxVal > 50000) return false;
              if (maxVal === 50000 && (rLow.includes("50.000") && rLow.includes("100.000"))) return false; // 50k-100k range
            }
            if (revenueFilter === "ate10k") {
              if (maxVal > 10000) return false;
            }
          }
        }

        return true;
      });

      return {
        ...column,
        deals: filteredDeals,
        count: filteredDeals.length,
        total_value: filteredDeals.reduce((sum, d) => sum + (Number(d.negotiated_price) || 0), 0),
      };
    });
  }, [pipeline, searchQuery, urgencyFilter, activityFilter, revenueFilter, utmSourceFilter, utmCampaignFilter, utmContentFilter, periodFilter, dateField, customDateFrom, customDateTo]);

  // Contar totais de urgência para mostrar no filtro
  const urgencyCounts = useMemo(() => {
    if (!pipeline) return { critical: 0, warning: 0, ok: 0 };
    
    let critical = 0, warning = 0, ok = 0;
    pipeline.forEach(col => {
      if (col.stage.is_won || col.stage.is_lost) return;
      col.deals.forEach(deal => {
        const urgency = getDealUrgency(deal, col.stage.id);
        if (urgency === 'critical') critical++;
        else if (urgency === 'warning') warning++;
        else ok++;
      });
    });
    return { critical, warning, ok };
  }, [pipeline]);

  // Contar atividades de hoje para mostrar no filtro
  const activityCounts = useMemo(() => {
    if (!pipeline) return { callToday: 0, meetingToday: 0, taskToday: 0, noTaskToday: 0, anyTask: 0, overdue: 0 };

    let callToday = 0, meetingToday = 0, taskToday = 0, noTaskToday = 0, anyTask = 0, overdue = 0;
    pipeline.forEach(col => {
      if (col.stage.is_won || col.stage.is_lost) return;
      col.deals.forEach(deal => {
        if ((deal as any).has_call_today) callToday++;
        if ((deal as any).today_task_types?.includes('meeting')) meetingToday++;
        if ((deal as any).has_task_today) taskToday++;
        else noTaskToday++;
        if ((deal as any).has_any_task) anyTask++;
        if ((deal as any).has_overdue_task) overdue++;
      });
    });
    return { callToday, meetingToday, taskToday, noTaskToday, anyTask, overdue };
  }, [pipeline]);

  // Extrair valores únicos de UTM dos deals
  const utmOptions = useMemo(() => {
    if (!pipeline) return { sources: [] as string[], campaigns: [] as string[], contents: [] as string[] };
    const sources = new Set<string>();
    const campaigns = new Set<string>();
    const contents = new Set<string>();
    pipeline.forEach(col => {
      col.deals.forEach(deal => {
        const src = deal.lead?.utm_source;
        const cmp = deal.lead?.utm_campaign;
        const cnt = deal.lead?.utm_content;
        if (src) sources.add(src);
        if (cmp) campaigns.add(cmp);
        if (cnt) contents.add(cnt);
      });
    });
    return {
      sources: Array.from(sources).sort((a, b) => a.localeCompare(b)),
      campaigns: Array.from(campaigns).sort((a, b) => a.localeCompare(b)),
      contents: Array.from(contents).sort((a, b) => a.localeCompare(b)),
    };
  }, [pipeline]);

  const hasActiveFilters = searchQuery.trim() !== "" || urgencyFilter !== "all" || activityFilter !== "all" || revenueFilter !== "all" || utmSourceFilter !== "all" || utmCampaignFilter !== "all" || utmContentFilter !== "all" || periodFilter !== "all";

  // Count active advanced filters (excludes search, sort, view - those are always visible)
  const activeAdvancedFilters = useMemo(() => {
    const filters: { key: string; label: string; onRemove: () => void }[] = [];
    if (urgencyFilter !== "all") filters.push({ key: "urgency", label: urgencyFilter === "critical" ? "Críticos" : urgencyFilter === "warning" ? "Alertas" : "OK", onRemove: () => setUrgencyFilter("all") });
    if (activityFilter !== "all") filters.push({ key: "activity", label: { call_today: "Calls hoje", meeting_today: "Reuniões hoje", task_today: "Tarefas hoje", no_task_today: "Sem tarefa", any_task: "Com tarefa", overdue: "Atrasadas" }[activityFilter] || activityFilter, onRemove: () => setActivityFilter("all") });
    if (periodFilter !== "all") filters.push({ key: "period", label: { today: "Hoje", this_week: "Semana", this_month: "Este mês", last_month: "Mês passado", last_3_months: "3 meses", custom: "Customizado" }[periodFilter] || "Período", onRemove: () => { setPeriodFilter("all"); setDateField("created_at"); setCustomDateFrom(""); setCustomDateTo(""); } });
    if (revenueFilter !== "all") filters.push({ key: "revenue", label: { "100k+": "+R$100k", "50k-100k": "R$50k-100k", "10k-50k": "R$10k-50k", "ate10k": "Até R$10k", "sem_faturamento": "Sem info" }[revenueFilter] || revenueFilter, onRemove: () => setRevenueFilter("all") });
    if (utmSourceFilter !== "all") filters.push({ key: "utm_source", label: `Origem: ${utmSourceFilter === "_sem_utm" ? "Sem" : utmSourceFilter}`, onRemove: () => setUtmSourceFilter("all") });
    if (utmCampaignFilter !== "all") filters.push({ key: "utm_campaign", label: `Campanha: ${utmCampaignFilter === "_sem_utm" ? "Sem" : utmCampaignFilter}`, onRemove: () => setUtmCampaignFilter("all") });
    if (utmContentFilter !== "all") filters.push({ key: "utm_content", label: `Conteúdo: ${utmContentFilter === "_sem_utm" ? "Sem" : utmContentFilter}`, onRemove: () => setUtmContentFilter("all") });
    return filters;
  }, [urgencyFilter, activityFilter, periodFilter, revenueFilter, utmSourceFilter, utmCampaignFilter, utmContentFilter]);

  const handleDealClick = (deal: Deal, e?: React.MouseEvent) => {
    if (deal.lead_id) {
      const url = `/comercial/leads/${deal.lead_id}?deal=${deal.id}`;
      if (e) {
        navigateTo(e, url, navigate);
      } else {
        navigate(url);
      }
    }
  };

  const handleDealMove = async (
    dealId: string,
    fromStageId: string,
    toStageId: string
  ) => {
    // Verificar se o destino é etapa "Perdido"
    const targetColumn = filteredPipeline.find((col) => col.stage.id === toStageId);
    if (targetColumn?.stage.is_lost) {
      // Encontrar o deal para passar ao modal
      const fromColumn = filteredPipeline.find((col) => col.stage.id === fromStageId);
      const deal = fromColumn?.deals.find((d) => d.id === dealId);
      if (deal) {
        setLoseDealTarget({ dealId, deal });
        return; // Não move direto — abre modal de motivo
      }
    }

    try {
      await moveDealMutation.mutateAsync({ dealId, stageId: toStageId });

      // Auto-transfer: se moveu para "Call Agendada" no Pré-Vendas → transferir para Closer
      const isPreVendas = activePipelineId === PRE_VENDAS_PIPELINE_ID;
      const targetStageName = targetColumn?.stage.name;
      if (isPreVendas && targetStageName === 'Call Agendada') {
        try {
          await transferMutation.mutateAsync({
            dealId,
            targetPipelineId: CLOSER_PIPELINE_ID,
            targetStageId: CLOSER_CALL_AGENDADA_STAGE_ID,
            transferredByName: teamMember?.name || 'Sistema (auto-transfer)',
          });
          toast({
            title: "Deal transferido para Closer",
            description: "Movido automaticamente para Closer → Call Agendada",
          });
          return;
        } catch {
          toast({
            title: "Deal movido, mas erro na transferência",
            description: "O deal foi movido para Call Agendada mas não foi transferido para o Closer.",
            variant: "destructive",
          });
          return;
        }
      }

      toast({
        title: "Deal movido",
        description: "O deal foi movido para o novo estágio.",
      });
    } catch (_e) {
      toast({
        title: "Erro ao mover deal",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleAddDeal = (stageId?: string) => {
    setSelectedStageId(stageId);
    setIsCreateDealOpen(true);
  };

  const handleDeleteDeal = useCallback((dealId: string) => {
    if (!confirm("Tem certeza que deseja excluir este deal? Esta ação não pode ser desfeita.")) return;
    deleteDealMutation.mutate(dealId, {
      onSuccess: () => {
        toast({ title: "Deal excluído com sucesso" });
      },
      onError: (err: any) => {
        toast({ title: "Erro ao excluir deal", description: err?.message, variant: "destructive" });
      },
    });
  }, [deleteDealMutation, toast]);

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Header Fixo */}
        <div className="flex-shrink-0 pb-4 space-y-3">
          {/* Row 1: Title bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-semibold text-slate-900">Pipeline</h1>
              {pipelines && pipelines.length > 1 && (
                <div className="flex items-center gap-1">
                  {pipelines.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setSelectedPipelineId(p.id)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        activePipelineId === p.id
                          ? "bg-primary text-primary-foreground"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={() => handleAddDeal()} className="h-9 px-4 text-sm">
                <Plus className="h-4 w-4 mr-1.5" />
                Novo Deal
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setIsBatchImportOpen(true)}>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar Leads
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setIsBulkWhatsAppOpen(true)}>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Disparar WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => refetch()} disabled={isLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                    Atualizar
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Row 2: Filter bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Buscar nome, email, tel..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-[200px] h-9 text-sm"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {/* View toggle: Todos / Meus */}
            <div className="flex items-center rounded-md border border-slate-200 overflow-hidden h-9">
              <button
                onClick={() => setViewFilter("all")}
                className={`px-3 h-full text-sm font-medium transition-colors ${
                  viewFilter === "all"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Todos
              </button>
              <button
                onClick={() => setViewFilter("mine")}
                className={`px-3 h-full text-sm font-medium transition-colors border-l border-slate-200 ${
                  viewFilter === "mine"
                    ? "bg-slate-900 text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                Meus
              </button>
            </div>

            {/* Sort */}
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as PipelineSortBy)}>
              <SelectTrigger className="w-[155px] h-9 text-sm border-slate-200">
                <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgency">Urgencia</SelectItem>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="value">Maior valor deal</SelectItem>
                <SelectItem value="revenue">Maior faturamento</SelectItem>
                <SelectItem value="score">Score do lead</SelectItem>
                <SelectItem value="time_in_stage">Tempo na etapa</SelectItem>
              </SelectContent>
            </Select>

            {/* Advanced Filters Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={activeAdvancedFilters.length > 0 ? "default" : "outline"}
                  size="sm"
                  className={`h-9 text-sm gap-1.5 ${
                    activeAdvancedFilters.length > 0
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "border-slate-200 text-slate-600"
                  }`}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Filtros{activeAdvancedFilters.length > 0 ? ` (${activeAdvancedFilters.length})` : ""}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[420px] p-0">
                <div className="px-4 pt-4 pb-3">
                  <p className="text-sm font-semibold text-slate-800">Filtros avancados</p>
                </div>

                <div className="border-t border-slate-100 px-4 py-3 grid grid-cols-2 gap-3">
                  {/* Urgencia */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Urgencia</label>
                    <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                      <SelectTrigger className="h-9 text-sm border-slate-200">
                        <AlertTriangle className="h-3.5 w-3.5 mr-2 text-slate-400" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="critical">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Criticos ({urgencyCounts.critical})
                          </span>
                        </SelectItem>
                        <SelectItem value="warning">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            Alertas ({urgencyCounts.warning})
                          </span>
                        </SelectItem>
                        <SelectItem value="ok">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            OK ({urgencyCounts.ok})
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Atividades */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Atividades</label>
                    <Select value={activityFilter} onValueChange={setActivityFilter}>
                      <SelectTrigger className="h-9 text-sm border-slate-200">
                        <Phone className="h-3.5 w-3.5 mr-2 text-slate-400" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="call_today">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            Calls hoje ({activityCounts.callToday})
                          </span>
                        </SelectItem>
                        <SelectItem value="meeting_today">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                            Reunioes hoje ({activityCounts.meetingToday})
                          </span>
                        </SelectItem>
                        <SelectItem value="task_today">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                            Tarefas hoje ({activityCounts.taskToday})
                          </span>
                        </SelectItem>
                        <SelectItem value="any_task">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-cyan-500"></span>
                            Com tarefa ({activityCounts.anyTask})
                          </span>
                        </SelectItem>
                        <SelectItem value="overdue">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Atrasadas ({activityCounts.overdue})
                          </span>
                        </SelectItem>
                        <SelectItem value="no_task_today">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            Sem tarefa hoje ({activityCounts.noTaskToday})
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Webinario — só aparece no pipeline Webinário */}
                  {isWebinarPipeline && webinarConfigs.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Webinario</label>
                      <Select value={webinarFilter || "all"} onValueChange={(v) => setWebinarFilter(v === "all" ? undefined : v)}>
                        <SelectTrigger className="h-9 text-sm border-slate-200">
                          <Sparkles className="h-3.5 w-3.5 mr-2 text-violet-400" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos os webinarios</SelectItem>
                          {webinarConfigs.map(w => (
                            <SelectItem key={w.id} value={w.id}>{w.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Faturamento */}
                  <div>
                    <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Faturamento</label>
                    <Select value={revenueFilter} onValueChange={setRevenueFilter}>
                      <SelectTrigger className="h-9 text-sm border-slate-200">
                        <DollarSign className="h-3.5 w-3.5 mr-2 text-slate-400" />
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="100k+">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                            +R$ 100k
                          </span>
                        </SelectItem>
                        <SelectItem value="50k-100k">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            R$ 50k-100k
                          </span>
                        </SelectItem>
                        <SelectItem value="10k-50k">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                            R$ 10k-50k
                          </span>
                        </SelectItem>
                        <SelectItem value="ate10k">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                            Ate R$ 10k
                          </span>
                        </SelectItem>
                        <SelectItem value="sem_faturamento">
                          <span className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-red-400"></span>
                            Sem info
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* UTM Source */}
                  {utmOptions.sources.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Origem UTM</label>
                      <Select value={utmSourceFilter} onValueChange={setUtmSourceFilter}>
                        <SelectTrigger className="h-9 text-sm border-slate-200">
                          <Link className="h-3.5 w-3.5 mr-2 text-slate-400" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {utmOptions.sources.map(src => (
                            <SelectItem key={src} value={src}>{src}</SelectItem>
                          ))}
                          <SelectItem value="_sem_utm">Sem origem</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* UTM Campaign */}
                  {utmOptions.campaigns.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Campanha UTM</label>
                      <Select value={utmCampaignFilter} onValueChange={setUtmCampaignFilter}>
                        <SelectTrigger className="h-9 text-sm border-slate-200">
                          <Link className="h-3.5 w-3.5 mr-2 text-slate-400" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas</SelectItem>
                          {utmOptions.campaigns.map(cmp => (
                            <SelectItem key={cmp} value={cmp}>{cmp}</SelectItem>
                          ))}
                          <SelectItem value="_sem_utm">Sem campanha</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* UTM Content */}
                  {utmOptions.contents.length > 0 && (
                    <div>
                      <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1.5 block">Conteudo UTM</label>
                      <Select value={utmContentFilter} onValueChange={setUtmContentFilter}>
                        <SelectTrigger className="h-9 text-sm border-slate-200">
                          <Link className="h-3.5 w-3.5 mr-2 text-slate-400" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todos</SelectItem>
                          {utmOptions.contents.map(cnt => (
                            <SelectItem key={cnt} value={cnt}>{cnt}</SelectItem>
                          ))}
                          <SelectItem value="_sem_utm">Sem conteudo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {/* Periodo section - full width */}
                <div className="border-t border-slate-100 px-4 py-3">
                  <label className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-2 block">Periodo</label>
                  {/* Date field toggle */}
                  <div className="flex gap-1 mb-2">
                    <button
                      onClick={() => setDateField("created_at")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        dateField === "created_at"
                          ? "bg-slate-900 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Data de criacao
                    </button>
                    <button
                      onClick={() => setDateField("won_at")}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        dateField === "won_at"
                          ? "bg-emerald-600 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      <Trophy className="h-3.5 w-3.5" />
                      Data de ganho
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { value: "today", label: "Hoje" },
                      { value: "this_week", label: "Semana" },
                      { value: "this_month", label: "Este mes" },
                      { value: "last_month", label: "Mes passado" },
                      { value: "last_3_months", label: "3 meses" },
                      { value: "custom", label: "Customizado" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setPeriodFilter(periodFilter === opt.value ? "all" : opt.value)}
                        className={`px-2 py-1.5 rounded-md text-xs font-medium transition-colors text-center ${
                          periodFilter === opt.value
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {periodFilter === "custom" && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1">
                        <label className="text-xs text-slate-500 mb-1 block">De</label>
                        <Input
                          type="date"
                          value={customDateFrom}
                          onChange={(e) => setCustomDateFrom(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                      <span className="text-slate-300 mt-4">&rarr;</span>
                      <div className="flex-1">
                        <label className="text-xs text-slate-500 mb-1 block">Ate</label>
                        <Input
                          type="date"
                          value={customDateTo}
                          onChange={(e) => setCustomDateTo(e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Clear all */}
                {activeAdvancedFilters.length > 0 && (
                  <div className="border-t border-slate-100 px-4 py-3 flex justify-end">
                    <button
                      onClick={() => {
                        setUrgencyFilter("all");
                        setActivityFilter("all");
                        setPeriodFilter("all");
                        setDateField("created_at");
                        setCustomDateFrom("");
                        setCustomDateTo("");
                        setRevenueFilter("all");
                        setUtmSourceFilter("all");
                        setUtmCampaignFilter("all");
                        setUtmContentFilter("all");
                      }}
                      className="text-sm text-primary hover:underline font-medium"
                    >
                      Limpar todos os filtros
                    </button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Active filter pills */}
            {activeAdvancedFilters.length > 0 && (
              <>
                {activeAdvancedFilters.map((filter) => (
                  <span
                    key={filter.key}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                  >
                    {filter.label}
                    <button
                      onClick={filter.onRemove}
                      className="hover:bg-primary/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setUrgencyFilter("all");
                    setActivityFilter("all");
                    setPeriodFilter("all");
                    setDateField("created_at");
                    setCustomDateFrom("");
                    setCustomDateTo("");
                    setRevenueFilter("all");
                    setUtmSourceFilter("all");
                    setUtmCampaignFilter("all");
                    setUtmContentFilter("all");
                  }}
                  className="text-xs text-slate-500 hover:text-slate-700 underline"
                >
                  Limpar tudo
                </button>
              </>
            )}
          </div>

          {/* Row 3: Stats Header */}
          {filteredPipeline && filteredPipeline.length > 0 && (
            <PipelineKanbanHeader columns={filteredPipeline} />
          )}
        </div>

        {/* Kanban Board - Área com Scroll */}
        <div className="flex-1 min-h-0 mt-4 overflow-hidden">
          <div ref={outerScrollRef} className="bg-slate-50/80 rounded-2xl p-4 h-full overflow-x-auto">
            <PipelineKanban
              columns={filteredPipeline}
              onDealClick={handleDealClick}
              onViewLead={(leadId) => navigate(`/comercial/leads/${leadId}`)}
              onDealMove={handleDealMove}
              onAddDeal={handleAddDeal}
              onDeleteDeal={handleDeleteDeal}
              isLoading={isLoading}
              sortBy={sortBy}
            />
          </div>
        </div>

        {/* Empty state */}
        {!isLoading && filteredPipeline && filteredPipeline.every((col) => col.count === 0) && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <CalendarDays className="h-8 w-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-800 mb-1">Pipeline vazio</h3>
            <p className="text-slate-500 mb-6 text-sm">
              Crie seu primeiro deal para visualizá-lo aqui
            </p>
            <Button onClick={() => handleAddDeal()} className="h-9 px-4">
              <Plus className="h-4 w-4 mr-1.5" />
              Criar deal
            </Button>
          </div>
        )}
      </div>

      {/* Create Deal Modal */}
      <CreateLeadOrDealModal
        open={isCreateDealOpen}
        onOpenChange={setIsCreateDealOpen}
        mode="deal"
        defaultStageId={selectedStageId}
        pipelineId={activePipelineId}
      />

      {/* Lose Deal Modal (disparado pelo drag para etapa perdido) */}
      <LoseDealModal
        open={!!loseDealTarget}
        onOpenChange={(open) => {
          if (!open) setLoseDealTarget(null);
        }}
        deal={loseDealTarget?.deal || null}
      />

      {/* Batch Import Modal */}
      <BatchImportDealsModal
        open={isBatchImportOpen}
        onOpenChange={setIsBatchImportOpen}
        defaultPipelineId={activePipelineId}
      />

      {/* Bulk WhatsApp Modal */}
      <BulkWhatsAppModal
        open={isBulkWhatsAppOpen}
        onOpenChange={setIsBulkWhatsAppOpen}
        columns={filteredPipeline}
      />

      {/* Sales AI Copilot */}
      <SalesAIChat />
    </>
  );
}

export default function SalesPipeline() {
  return (
    <AppLayout>
      <PipelineBoardContent />
    </AppLayout>
  );
}
