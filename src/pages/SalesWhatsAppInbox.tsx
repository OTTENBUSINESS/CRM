import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { isCallModeActive } from "@/hooks/useNotifications";
import { isNotificationsMuted } from "@/lib/notification-mute";
import { MuteNotificationsToggle } from "@/components/inbox/MuteNotificationsToggle";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { WhatsAppChat } from "@/components/inbox/WhatsAppChat";
import { ClientInfoPanel } from "@/components/inbox";
import { AIAgentBadge } from "@/components/inbox/AIAgentBadge";
import { InboxMiniAgenda } from "@/components/inbox/InboxMiniAgenda";
import { SalesConversationRow } from "@/components/inbox/SalesConversationRow";
import { InstanceHealthInlineBanner } from "@/components/inbox/InstanceHealthBanner";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCreateTask } from "@/hooks/useTasks";
import { addDays, format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useInboxMetrics,
  useInboxConversations,
  useMarkAsHandled,
  useUnmarkAsHandled,
  getConversationFunnelStage,
  type InboxFilters,
  type InboxConversation,
} from "@/hooks/useCSInbox";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MessageSquare,
  RefreshCw,
  Search,
  AlertCircle,
  Clock,
  Settings,
  WifiOff,
  Wifi,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  EyeOff,
  Phone,
  Check,
  ChevronDown,
  ChevronUp,
  Bot,
  UserCheck,
  ArrowLeft,
  Info,
  Zap,
  Loader2,
  Video,
  MoreHorizontal,
  Filter,
  DollarSign,
  X,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { extractMeetingDateTime } from "@/hooks/useExtractMeetingDateTime";

// Hook para persistir estado no sessionStorage (mesmo padrão do SalesPipeline)
function useSessionState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = sessionStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersistedState = useCallback((value: T | ((prev: T) => T)) => {
    setState(prev => {
      const next = typeof value === 'function' ? (value as (prev: T) => T)(prev) : value;
      try { sessionStorage.setItem(key, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [key]);

  return [state, setPersistedState];
}

const SalesWhatsAppInbox = () => {
  const { teamMember } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const myInstanceId = teamMember?.whatsapp_instance_id;
  const isMobile = useIsMobile();

  // Buscar todas as instâncias comerciais (pra filtro no inbox)
  const [commercialInstances, setCommercialInstances] = useState<{ id: string; name: string; status?: string }[]>([]);
  useEffect(() => {
    supabase.from('whatsapp_instances').select('id, name, status').contains('teams', ['comercial'])
      .then(({ data }) => {
        if (data && data.length > 0) {
          setCommercialInstances(data);
        } else {
          supabase.from('whatsapp_instances').select('id, name, status')
            .not('name', 'ilike', '%example-exclude%')
            .then(({ data: all }) => setCommercialInstances(all || []));
        }
      });
  }, []);

  // Buscar pipelines e stages para filtro
  const [pipelines, setPipelines] = useState<{ id: string; name: string }[]>([]);
  const [pipelineStages, setPipelineStages] = useState<{ id: string; name: string; pipeline_id: string }[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useSessionState<string | null>("sales-inbox-pipeline", null);
  useEffect(() => {
    supabase.from('sales_pipelines').select('id, name').order('name').then(({ data }) => {
      setPipelines(data || []);
    });
    supabase.from('sales_pipeline_stages').select('id, name, pipeline_id').eq('is_won', false).eq('is_lost', false).order('position').then(({ data }) => {
      setPipelineStages(data || []);
    });
  }, []);

  // Instância selecionada no filtro (default: a do usuário, ou "all")
  const [selectedInstanceId, setSelectedInstanceId] = useSessionState<string>("sales-inbox-instance", myInstanceId || "all");
  const instanceId = selectedInstanceId === "all" ? undefined : selectedInstanceId;

  // State — persisted in sessionStorage
  const [selectedConvId, setSelectedConvId] = useSessionState<string | null>("sales-inbox-selected", null);
  const [selectedConversation, _setSelectedConversation] = useState<InboxConversation | null>(null);
  const setSelectedConversation = useCallback((conv: InboxConversation | null) => {
    _setSelectedConversation(conv);
    setSelectedConvId(conv?.conversation_id || null);
  }, [setSelectedConvId]);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [showInfoPanel, setShowInfoPanel] = useState(false);

  // Capturar lead_id da URL para abrir conversa automaticamente
  useEffect(() => {
    const leadId = searchParams.get('lead');
    if (leadId) {
      setPendingLeadId(leadId);
      // Limpar o parâmetro da URL para não ficar poluído
      searchParams.delete('lead');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [filters, setFilters] = useSessionState<InboxFilters>("sales-inbox-filters-v2", { instanceId: instanceId || undefined, sortMode: "recent", hideHandled: false });
  const [searchTerm, setSearchTerm] = useState("");
  const [agentFilter, setAgentFilter] = useSessionState<"all" | "active" | "paused" | "transferred" | "none" | "error">("sales-inbox-agent-filter", "all");
  const [qualFilter, setQualFilter] = useSessionState<string>("sales-inbox-qual-filter", "all");
  const [agentErrorLeadIds, setAgentErrorLeadIds] = useState<Set<string>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Quick Follow-up state
  const [quickFuOpen, setQuickFuOpen] = useState(false);
  const [quickFuTitle, setQuickFuTitle] = useState("");
  const [quickFuWhen, setQuickFuWhen] = useState<0 | 1 | 2>(0); // 0=today, 1=tomorrow, 2=2days
  const createTask = useCreateTask();
  const quickFuInputRef = useRef<HTMLInputElement | null>(null);

  // Schedule Meeting state
  const [metricsCollapsed, setMetricsCollapsed] = useSessionState("sales-inbox-metrics-collapsed", false);
  const [isScheduleMeetingOpen, setIsScheduleMeetingOpen] = useState(false);
  const [meetingDefaults, setMeetingDefaults] = useState<{ title?: string; due_datetime?: string }>({});
  const [isExtractingMeeting, setIsExtractingMeeting] = useState(false);

  // Buscar leads com erro no agente (últimas 48h)
  useEffect(() => {
    const fetchAgentErrors = async () => {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      // Leads com última tentativa failed + sem resposta depois
      const { data } = await supabase
        .from('ai_agent_message_queue')
        .select('lead_id')
        .eq('status', 'failed')
        .gte('created_at', cutoff);
      if (data) {
        // Pegar apenas lead_ids únicos
        const ids = new Set(data.map((d: any) => d.lead_id).filter(Boolean));
        setAgentErrorLeadIds(ids);
      }
    };
    fetchAgentErrors();
    // Refresh a cada 60s
    const interval = setInterval(fetchAgentErrors, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleQuickFollowUp = useCallback(async () => {
    if (!selectedConversation?.lead_id || !teamMember || createTask.isPending) return;
    const title = quickFuTitle.trim() || `Follow-up ${selectedConversation.conversation_name?.split(" ")[0] || "Lead"}`;
    const scheduledDate = addDays(new Date(), quickFuWhen);
    scheduledDate.setHours(9, 0, 0, 0);

    createTask.mutate({
      title,
      description: "",
      task_type: "follow_up",
      priority: "medium",
      team: "sales",
      assigned_to: teamMember.id,
      lead_id: selectedConversation.lead_id,
      scheduled_at: scheduledDate.toISOString(),
    }, {
      onSuccess: () => {
        toast({ title: "Follow-up criado", description: `${title} — ${quickFuWhen === 0 ? "Hoje" : quickFuWhen === 1 ? "Amanhã" : "Em 2 dias"}` });
        setQuickFuOpen(false);
        setQuickFuTitle("");
        setQuickFuWhen(0);
      },
    });
  }, [selectedConversation, teamMember, quickFuTitle, quickFuWhen, createTask, toast]);

  // Extract meeting datetime from chat via AI, then open modal
  const handleScheduleMeeting = useCallback(async () => {
    if (!selectedConversation?.lead_id || isExtractingMeeting) return;
    setIsExtractingMeeting(true);
    try {
      const { data: msgs } = await (supabase.rpc as any)('get_conversation_messages', {
        p_lead_id: selectedConversation.lead_id,
        p_group_id: null,
        p_limit: 30,
        p_instance_id: instanceId || null,
      });
      if (msgs && msgs.length > 0) {
        const result = await extractMeetingDateTime(
          msgs.map((m: any) => ({ content: m.content, is_from_me: m.is_from_me, sent_at: m.sent_at })),
          selectedConversation.conversation_name || "Lead"
        );
        if (result.found && result.datetime) {
          setMeetingDefaults({ title: result.title, due_datetime: result.datetime });
        } else {
          setMeetingDefaults({});
        }
      } else {
        setMeetingDefaults({});
      }
    } catch {
      setMeetingDefaults({});
    }
    setIsExtractingMeeting(false);
    setIsScheduleMeetingOpen(true);
  }, [selectedConversation, instanceId, isExtractingMeeting]);

  // Persist + restore scroll position
  useEffect(() => {
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    // Restaurar scroll salvo (ex: após carregar mais)
    requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem("sales-inbox-scroll");
        if (saved) el.scrollTop = Number(saved);
      } catch {}
    });
    const handleScroll = () => {
      try { sessionStorage.setItem("sales-inbox-scroll", String(el.scrollTop)); } catch {}
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  // Instance status
  const [instanceStatus, setInstanceStatus] = useState<"connected" | "disconnected" | "checking">("checking");
  const [showDisconnectedModal, setShowDisconnectedModal] = useState(false);
  const lastStatusRef = useRef<string | null>(null);

  // Update filters when selected instance changes
  useEffect(() => {
    setFilters((prev) => ({ ...prev, instanceId: instanceId || undefined, sortMode: prev.sortMode, hideHandled: prev.hideHandled }));
  }, [instanceId]);

  const toggleSortMode = () => {
    setFilters({ ...filters, sortMode: filters.sortMode === "priority" ? "recent" : "priority" });
  };

  const { data: metrics, refetch: refetchMetrics } = useInboxMetrics(instanceId || undefined, instanceId ? undefined : 'comercial');
  // Sempre sobrescrever instanceId do filters com o real do teamMember
  // Quando "Todas instâncias", usar teamFilter='comercial' pra RPC filtrar server-side (não client-side)
  // funnelFilter com UUID = stage_id (filtro por etapa via RPC)
  const isStageFilter = filters.funnelFilter?.includes('-');
  const effectiveFilters = useMemo(() => ({
    ...filters,
    instanceId: instanceId || undefined,
    teamFilter: instanceId ? undefined : 'comercial',
    pipelineId: selectedPipelineId || undefined,
    stageId: isStageFilter ? filters.funnelFilter : undefined,
    funnelFilter: isStageFilter ? undefined : filters.funnelFilter,
  }), [filters, instanceId, selectedPipelineId, isStageFilter]);
  const [conversationLimit, setConversationLimit] = useState(100);
  const { data: conversations, isLoading, isError, refetch: refetchConversations } = useInboxConversations(
    effectiveFilters,
    conversationLimit
  );
  const hasMoreConversations = (conversations?.length || 0) >= conversationLimit;

  // Restaurar scroll quando conversations atualiza (ex: "Ver mais")
  useEffect(() => {
    if (!conversations?.length) return;
    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
    if (!el) return;
    requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem("sales-inbox-scroll");
        if (saved) el.scrollTop = Number(saved);
      } catch {}
    });
  }, [conversations]);

  // Lookup: lead_id → pipeline info (batch fetch from deals)
  const [leadPipelineMap, setLeadPipelineMap] = useState<Record<string, string>>({});
  const [leadPipelineIdMap, setLeadPipelineIdMap] = useState<Record<string, string>>({});
  const [leadStageIdMap, setLeadStageIdMap] = useState<Record<string, string>>({});

  // Buscar stages separadamente quando pipeline é selecionado (independente das conversations)
  useEffect(() => {
    if (!selectedPipelineId) { setLeadStageIdMap({}); return; }
    supabase
      .from('deals')
      .select('lead_id, pipeline_stage_id')
      .eq('pipeline_id', selectedPipelineId)
      .in('status', ['open', 'negotiation'])
      .then(({ data }) => {
        if (!data) return;
        const stageMap: Record<string, string> = {};
        for (const d of data) {
          if (d.lead_id && d.pipeline_stage_id) stageMap[d.lead_id] = d.pipeline_stage_id;
        }
        setLeadStageIdMap(stageMap);
        console.log('[Inbox] StageMap (direto):', Object.keys(stageMap).length, 'leads');
        const agendouLeads = Object.entries(stageMap).filter(([_, sid]) => sid === '8c08612a-6ff8-4505-836e-006ee69fb5c3');
        console.log('[Inbox] Leads em Agendou:', agendouLeads.length);
      });
  }, [selectedPipelineId]);

  useEffect(() => {
    if (!conversations?.length || pipelines.length === 0) return;
    const leadIds = [...new Set(conversations
      .filter(c => c.lead_id)
      .map(c => c.lead_id!))];
    if (leadIds.length === 0) return;

    supabase
      .from('deals')
      .select('lead_id, pipeline_id, pipeline_stage_id')
      .in('lead_id', leadIds)
      .in('status', ['open', 'negotiation'])
      .then(({ data }) => {
        if (!data) return;
        const nameMap: Record<string, string> = {};
        const idMap: Record<string, string> = {};
        const pipelineNameMap = new Map(pipelines.map(p => [p.id, p.name]));
        for (const d of data) {
          if (d.lead_id && d.pipeline_id) {
            const name = pipelineNameMap.get(d.pipeline_id);
            if (name && !nameMap[d.lead_id]) {
              nameMap[d.lead_id] = name;
              idMap[d.lead_id] = d.pipeline_id;
            }
          }
        }
        setLeadPipelineMap(nameMap);
        setLeadPipelineIdMap(idMap);
      });
  }, [conversations, pipelines]);

  // Debounce realtime refetches to avoid hammering the RPC
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedRefetch = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      refetchConversations();
      refetchMetrics();
    }, 5000);
  }, [refetchConversations, refetchMetrics]);

  // Auto-selecionar conversa quando vier da notificação
  useEffect(() => {
    if (pendingLeadId && conversations && conversations.length > 0) {
      const targetConversation = conversations.find(c => c.lead_id === pendingLeadId);
      if (targetConversation) {
        setSelectedConversation(targetConversation);
        setPendingLeadId(null);
      }
    }
  }, [pendingLeadId, conversations]);

  // Restaurar conversa selecionada do sessionStorage ao carregar lista
  useEffect(() => {
    if (selectedConvId && !selectedConversation && conversations && conversations.length > 0 && !pendingLeadId) {
      const saved = conversations.find(c => c.conversation_id === selectedConvId);
      if (saved) _setSelectedConversation(saved);
    }
  }, [selectedConvId, selectedConversation, conversations, pendingLeadId]);

  // Mark as handled mutations
  const markAsHandled = useMarkAsHandled();
  const unmarkAsHandled = useUnmarkAsHandled();

  const handleMarkAsHandled = useCallback((conv: InboxConversation) => {
    markAsHandled.mutate({
      leadId: conv.lead_id || undefined,
      groupId: conv.group_id || undefined,
      handledBy: teamMember?.id,
      reason: "replied_manually",
    }, {
      onSuccess: () => {
        toast({
          title: "Conversa marcada como resolvida",
          action: (
            <ToastAction altText="Desfazer" onClick={() => {
              unmarkAsHandled.mutate({
                leadId: conv.lead_id || undefined,
                groupId: conv.group_id || undefined,
              }, {
                onSuccess: () => toast({ title: "Conversa voltou para pendentes" }),
              });
            }}>
              Desfazer
            </ToastAction>
          ),
        });
      },
      onError: () => {
        toast({ title: "Erro ao marcar conversa", variant: "destructive" });
      }
    });
  }, [markAsHandled, unmarkAsHandled, teamMember?.id, toast]);

  const handleUnmarkAsHandled = useCallback((conv: InboxConversation) => {
    unmarkAsHandled.mutate({
      leadId: conv.lead_id || undefined,
      groupId: conv.group_id || undefined,
    }, {
      onSuccess: () => {
        toast({ title: "Conversa voltou para pendentes" });
      },
      onError: () => {
        toast({ title: "Erro ao desmarcar conversa", variant: "destructive" });
      }
    });
  }, [unmarkAsHandled, toast]);

  // Status da instância via Realtime (webhook atualiza o banco, frontend escuta)
  useEffect(() => {
    if (!myInstanceId) return;

    // Buscar status inicial
    supabase.from("whatsapp_instances").select("status").eq("id", myInstanceId).single()
      .then(({ data }) => {
        const s = data?.status === "connected" ? "connected" : "disconnected";
        setInstanceStatus(s);
        lastStatusRef.current = s;
      });

    // Escutar mudanças em tempo real
    const channel = supabase
      .channel(`instance-status-${myInstanceId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_instances',
        filter: `id=eq.${myInstanceId}`,
      }, (payload) => {
        const newStatus = payload.new.status === "connected" ? "connected" : "disconnected";
        setInstanceStatus(newStatus);

        // Modal só quando CAI (era connected → virou disconnected)
        if (newStatus === "disconnected" && lastStatusRef.current === "connected") {
          setShowDisconnectedModal(true);
          if (audioRef.current && !isCallModeActive() && !isNotificationsMuted()) {
            audioRef.current.play().catch(() => {});
          }
        }

        // Fechar modal automaticamente quando reconecta
        if (newStatus === "connected" && lastStatusRef.current === "disconnected") {
          setShowDisconnectedModal(false);
        }

        lastStatusRef.current = newStatus;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [myInstanceId]);

  // Realtime for messages (debounced to prevent hammering)
  useEffect(() => {
    if (!instanceId) return;

    const channel = supabase
      .channel("sales-whatsapp-inbox-realtime")
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "whatsapp_messages",
        filter: `instance_id=eq.${instanceId}`,
      }, (payload) => {
        console.log('[RT-Inbox] Nova msg recebida:', payload?.new?.id);
        debouncedRefetch();
      })
      .subscribe((status) => {
        console.log('[RT-Inbox] Subscription status:', status);
      });

    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
      supabase.removeChannel(channel);
    };
  }, [instanceId, debouncedRefetch]);

  // Realtime for instance status
  useEffect(() => {
    if (!instanceId) return;

    const channel = supabase
      .channel("sales-whatsapp-instance-status")
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "whatsapp_instances",
        filter: `id=eq.${instanceId}`,
      }, (payload) => {
        const newStatus = payload.new?.status === "connected" ? "connected" : "disconnected";
        setInstanceStatus(newStatus);

        if (newStatus === "disconnected" && lastStatusRef.current === "connected") {
          setShowDisconnectedModal(true);
          if (audioRef.current) {
            if (!isCallModeActive() && !isNotificationsMuted()) audioRef.current.play().catch(() => {});
          }
        }
        lastStatusRef.current = newStatus;
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [instanceId]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setFilters({ ...filters, search: searchTerm || undefined });
  };

  useEffect(() => {
    if (!searchTerm && filters.search) {
      setFilters((prev) => ({ ...prev, search: undefined }));
    }
  }, [searchTerm]);

  const handleFilterSLA = (sla: string | undefined) => {
    const newSla = filters.slaFilter === sla ? undefined : sla;
    setFilters({
      ...filters,
      slaFilter: newSla,
      // Quando filtra por SLA, mostrar tudo (incluindo handled) pra bater com o contador
      hideHandled: newSla ? false : true,
    });
  };

  // Metrics
  const criticalCount = metrics?.critical_count ?? 0;
  const warningCount = metrics?.warning_count ?? 0;
  const pendingCount = metrics?.total_pending ?? 0;

  // No instance configured — mas só mostra se teamMember já carregou
  if (!myInstanceId && teamMember) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="text-center max-w-md">
            <Phone className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h2 className="text-xl font-semibold mb-2">WhatsApp não configurado</h2>
            <p className="text-muted-foreground mb-4">
              Você ainda não tem uma instância de WhatsApp vinculada ao seu perfil.
              Entre em contato com o administrador para configurar.
            </p>
            <Button variant="outline" onClick={() => navigate("/comercial/configuracoes?tab=team")}>
              <Settings className="h-4 w-4 mr-2" />
              Configurações
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // teamMember ainda carregando
  if (!instanceId && !teamMember) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <audio ref={audioRef} src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3" preload="auto" />

      {/* Disconnected Modal */}
      <Dialog open={showDisconnectedModal} onOpenChange={setShowDisconnectedModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <WifiOff className="h-6 w-6" />
              WhatsApp Desconectado!
            </DialogTitle>
            <DialogDescription className="pt-4">
              <div className="space-y-4">
                <p className="text-base">
                  Sua instância de WhatsApp perdeu a conexão.
                </p>
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-800 font-medium">Ações necessárias:</p>
                  <ul className="text-sm text-red-700 mt-2 space-y-1">
                    <li>1. Vá para <strong>WhatsApp → Configurações</strong></li>
                    <li>2. Clique em <strong>Gerar QR Code</strong></li>
                    <li>3. Escaneie o código com o celular</li>
                  </ul>
                </div>
                <p className="text-sm text-muted-foreground">
                  Enquanto desconectado, você não receberá novas mensagens.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowDisconnectedModal(false)}>
              Fechar
            </Button>
            <Button onClick={() => window.open("/whatsapp", "_blank")}>
              Ir para Configurações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="h-[calc(100dvh-4rem)] flex flex-col bg-background">
        {/* ============================================================
         *  HEADER — slim, alinhado ao design system (sem azul gritante)
         * ============================================================ */}
        <header className="shrink-0 border-b border-border/60 bg-background/95 backdrop-blur-sm">
          {/* Linha 1: título + status + ações */}
          <div className="h-14 px-4 sm:px-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="relative shrink-0 w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
                  <MessageSquare className="h-4 w-4 text-primary" strokeWidth={2.25} />
                </div>
                <div className="flex flex-col leading-tight min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-[15px] font-semibold tracking-tight text-foreground truncate">
                      Inbox
                    </h1>
                    <span className="hidden sm:inline text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground/80">
                      WhatsApp
                    </span>
                  </div>
                  <span className="hidden sm:block text-[11px] text-muted-foreground truncate">
                    {teamMember?.name}
                  </span>
                </div>
              </div>

              {/* Separator vertical sutil */}
              <span className="hidden sm:block h-6 w-px bg-border/60" aria-hidden />

              {/* Status pill refinado */}
              <button
                type="button"
                onClick={() => instanceStatus === "disconnected" && setShowDisconnectedModal(true)}
                className={cn(
                  "group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all",
                  "ring-1 ring-inset",
                  instanceStatus === "connected" &&
                    "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
                  instanceStatus === "disconnected" &&
                    "bg-red-500/10 text-red-400 ring-red-500/30 cursor-pointer hover:bg-red-500/20",
                  !["connected", "disconnected"].includes(instanceStatus || "") &&
                    "bg-muted text-muted-foreground ring-border"
                )}
              >
                <span className={cn(
                  "relative flex h-1.5 w-1.5 rounded-full",
                  instanceStatus === "connected" && "bg-emerald-400",
                  instanceStatus === "disconnected" && "bg-red-400",
                  !["connected", "disconnected"].includes(instanceStatus || "") && "bg-muted-foreground"
                )}>
                  {instanceStatus === "connected" && (
                    <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />
                  )}
                </span>
                {instanceStatus === "connected" && "Online"}
                {instanceStatus === "disconnected" && "Desconectado"}
                {!["connected", "disconnected"].includes(instanceStatus || "") && "Verificando"}
              </button>
            </div>

            {/* Ações */}
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => setMetricsCollapsed(!metricsCollapsed)}
                  >
                    {metricsCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{metricsCollapsed ? "Mostrar métricas" : "Esconder métricas"}</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      refetchConversations();
                      refetchMetrics();
                      checkInstanceStatus();
                    }}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Atualizar</TooltipContent>
              </Tooltip>

              <MuteNotificationsToggle />
            </div>
          </div>

          {/* Linha 2: KPIs unificados — também funcionam como filtros */}
          {!metricsCollapsed && (
            <div className="px-4 sm:px-5 pb-3 flex items-center gap-2 overflow-x-auto">
              <KpiPill
                icon={MessageSquare}
                label="Aguardando"
                value={pendingCount}
                subLabel={
                  metrics?.avg_wait_minutes != null && metrics.avg_wait_minutes > 0
                    ? `~${metrics.avg_wait_minutes < 60
                        ? `${Math.floor(metrics.avg_wait_minutes)}min`
                        : `${Math.floor(metrics.avg_wait_minutes / 60)}h${Math.floor(metrics.avg_wait_minutes % 60)}m`}`
                    : undefined
                }
                active={filters.onlyPending}
                tone="accent"
                onClick={() => setFilters({ ...filters, onlyPending: !filters.onlyPending })}
              />
              <KpiPill
                icon={AlertCircle}
                label="Urgentes"
                value={criticalCount}
                active={filters.slaFilter === "critical"}
                tone="danger"
                onClick={() => handleFilterSLA(filters.slaFilter === "critical" ? undefined : "critical")}
              />
              <KpiPill
                icon={Clock}
                label="Atenção"
                value={warningCount}
                active={filters.slaFilter === "warning"}
                tone="warning"
                onClick={() => handleFilterSLA(filters.slaFilter === "warning" ? undefined : "warning")}
              />
              <KpiPill
                icon={CheckCircle2}
                label="Resolvidos hoje"
                value={metrics?.resolved_today ?? 0}
                tone="success"
                readOnly
              />
            </div>
          )}
        </header>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Conversations List */}
          {(!isMobile || !selectedConversation) && (
          <aside className={cn("border-r border-border/60 flex flex-col bg-background/50", isMobile ? "w-full" : "w-96")}>
            {/* Alerta de saúde da instância */}
            <InstanceHealthInlineBanner instanceId={instanceId} />

            {/* ============================================================
             *  Sticky Filter Header — reorganizado
             * ============================================================ */}
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/60">
              {/* Search — destaque primário */}
              <form onSubmit={handleSearch} className="p-3">
                <div className="relative group">
                  <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <Input
                    placeholder="Buscar conversas..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 h-9 bg-muted/40 border-border/60 focus-visible:ring-1 focus-visible:ring-primary/40 placeholder:text-muted-foreground/60"
                  />
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      aria-label="Limpar busca"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </form>

              {/* Pipeline + Instance */}
              <div className="px-3 pb-2 flex items-center gap-1.5">
                <Select
                  value={selectedPipelineId || "all"}
                  onValueChange={(val) => {
                    setSelectedPipelineId(val === "all" ? null : val);
                    setFilters((prev) => ({ ...prev, funnelFilter: undefined }));
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 text-[12px] border-border/60 bg-muted/30 hover:bg-muted/60 rounded-lg px-2.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60">
                    <SelectValue placeholder="Pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os pipelines</SelectItem>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={selectedInstanceId}
                  onValueChange={(val) => {
                    setSelectedInstanceId(val);
                    setFilters((prev) => ({ ...prev, instanceId: val === "all" ? undefined : val }));
                  }}
                >
                  <SelectTrigger className="h-8 flex-1 text-[12px] border-border/60 bg-muted/30 hover:bg-muted/60 rounded-lg px-2.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60">
                    <div className="flex items-center gap-1.5 truncate">
                      {selectedInstanceId !== "all" && (() => {
                        const inst = commercialInstances.find(i => i.id === selectedInstanceId);
                        const isConnected = inst?.status === "connected" || inst?.status === "cloud_api";
                        return <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isConnected ? "bg-emerald-400" : "bg-red-400")} />;
                      })()}
                      <SelectValue placeholder="Instância" />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as instâncias</SelectItem>
                    {commercialInstances.map((inst) => {
                      const isConnected = inst.status === "connected" || inst.status === "cloud_api";
                      return (
                        <SelectItem key={inst.id} value={inst.id}>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isConnected ? "bg-emerald-400" : "bg-red-400")} />
                            {inst.name.replace(/^[A-Z]+ - /i, '')}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {/* Stage chips — só quando pipeline selecionado */}
              {selectedPipelineId && (() => {
                const stages = pipelineStages.filter(s => s.pipeline_id === selectedPipelineId);
                return stages.length > 0 ? (
                  <div className="px-3 pb-2 flex items-center gap-1 flex-wrap">
                    <StageChip
                      active={!filters.funnelFilter}
                      onClick={() => setFilters(prev => ({ ...prev, funnelFilter: undefined }))}
                    >
                      Todas
                    </StageChip>
                    {stages.map(s => (
                      <StageChip
                        key={s.id}
                        active={filters.funnelFilter === s.id}
                        onClick={() => setFilters(prev => ({ ...prev, funnelFilter: prev.funnelFilter === s.id ? undefined : s.id }))}
                      >
                        {s.name}
                      </StageChip>
                    ))}
                  </div>
                ) : null;
              })()}

              {/* Filtros secundários: IA · Qualificação · Ordenar · Limpar */}
              <div className="px-3 pb-3 flex items-center gap-1.5">
                <Select value={agentFilter} onValueChange={(val) => setAgentFilter(val as typeof agentFilter)}>
                  <SelectTrigger className={cn(
                    "h-7 text-[11px] rounded-md px-2 gap-1 flex-1 min-w-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60 transition-colors",
                    agentFilter === "error"
                      ? "border-red-500/40 bg-red-500/10 text-red-400"
                      : agentFilter !== "all"
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border/60 bg-muted/30 hover:bg-muted/60"
                  )}>
                    <Bot className="h-3 w-3 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">IA: todos</SelectItem>
                    <SelectItem value="active">IA ativo</SelectItem>
                    <SelectItem value="paused">IA pausado</SelectItem>
                    <SelectItem value="transferred">Transferidos</SelectItem>
                    <SelectItem value="none">Sem IA</SelectItem>
                    <SelectItem value="error">
                      <span className="flex items-center gap-1.5">
                        Erro IA
                        {agentErrorLeadIds.size > 0 && (
                          <span className="text-[9px] bg-red-500 text-white rounded-full px-1.5 font-bold">
                            {agentErrorLeadIds.size}
                          </span>
                        )}
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Select value={qualFilter} onValueChange={setQualFilter}>
                  <SelectTrigger className={cn(
                    "h-7 text-[11px] rounded-md px-2 gap-1 flex-1 min-w-0 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:opacity-60 transition-colors",
                    qualFilter !== "all"
                      ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                      : "border-border/60 bg-muted/30 hover:bg-muted/60"
                  )}>
                    <DollarSign className="h-3 w-3 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Qualificação</SelectItem>
                    <SelectItem value="with_revenue">Com faturamento</SelectItem>
                    <SelectItem value="with_company">Com empresa</SelectItem>
                    <SelectItem value="with_employees">Com funcionários</SelectItem>
                    <SelectItem value="qualified">Qualificado completo</SelectItem>
                    <SelectItem value="no_data">Sem dados</SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={toggleSortMode}
                      className="h-7 text-[11px] px-2 rounded-md flex items-center gap-1 border border-border/60 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                      <ArrowUpDown className="h-3 w-3 opacity-60" />
                      {filters.sortMode === "priority" ? "Prior." : "Recentes"}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {filters.sortMode === "priority" ? "Ordenar por data" : "Ordenar por prioridade"}
                  </TooltipContent>
                </Tooltip>

                {(filters.slaFilter || filters.onlyPending || filters.search || agentFilter !== "all" || filters.funnelFilter || selectedPipelineId || qualFilter !== "all") && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => { setSearchTerm(""); setAgentFilter("all"); setQualFilter("all"); setSelectedInstanceId(myInstanceId || "all"); setSelectedPipelineId(null); setFilters({ instanceId: myInstanceId || undefined, sortMode: filters.sortMode, hideHandled: false }); }}
                        className="h-7 w-7 rounded-md flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 border border-red-500/30 shrink-0 transition-colors"
                        aria-label="Limpar filtros"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Limpar filtros</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* List */}
            <ScrollArea className="flex-1" ref={scrollAreaRef}>
              {isError ? (
                <div className="p-4 text-center">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                  <p className="text-sm text-gray-600 mb-2">Erro ao carregar conversas</p>
                  <Button size="sm" variant="outline" onClick={() => { refetchConversations(); refetchMetrics(); }}>
                    <RefreshCw className="h-3 w-3 mr-1" /> Tentar novamente
                  </Button>
                </div>
              ) : isLoading ? (
                <p className="p-4 text-center text-gray-500">Carregando...</p>
              ) : (() => {
                const commercialInstanceIds = new Set(commercialInstances.map(i => i.id));
                const filteredConversations = (conversations || []).filter(conv => {
                  // Filtrar grupos (inbox comercial é só individual)
                  if (conv.conversation_type === "grupo") return false;
                  // Quando "Todas instâncias", mostrar só conversas das instâncias comerciais
                  if (!instanceId && commercialInstanceIds.size > 0 && conv.instance_id && !commercialInstanceIds.has(conv.instance_id)) return false;
                  // Pipeline filter: agora filtrado no banco via RPC (p_pipeline_id / p_stage_id)
                  // Manter filtro local como fallback pra pipelines sem deals
                  if (selectedPipelineId && conv.lead_id && !effectiveFilters.pipelineId) {
                    if (leadPipelineIdMap[conv.lead_id] !== selectedPipelineId) return false;
                  }
                  // Filtro de agente IA
                  if (agentFilter === "active" && conv.ai_agent_status !== "active") return false;
                  if (agentFilter === "paused" && !conv.ai_agent_status?.startsWith("paused")) return false;
                  if (agentFilter === "transferred" && conv.ai_agent_status !== "transferred") return false;
                  if (agentFilter === "none" && conv.ai_agent_status) return false;
                  if (agentFilter === "error" && (!conv.lead_id || !agentErrorLeadIds.has(conv.lead_id))) return false;
                  // Filtro de qualificação
                  if (qualFilter !== "all") {
                    const rev = (conv as any).monthly_revenue || conv.lead_monthly_revenue;
                    const emp = (conv as any).employee_count || conv.lead_employee_count;
                    const comp = (conv as any).company_name || (conv as any).lead_company_name;
                    if (qualFilter === "with_revenue" && !rev) return false;
                    if (qualFilter === "with_company" && !comp) return false;
                    if (qualFilter === "with_employees" && !emp) return false;
                    if (qualFilter === "qualified" && (!comp || !rev || !(conv as any).lead_challenges)) return false;
                    if (qualFilter === "no_data" && (comp || rev || emp)) return false;
                  }
                  return true;
                });
                return filteredConversations.length === 0 ? (
                  <p className="p-4 text-center text-gray-500">Nenhuma conversa</p>
                ) : (
                  <>
                    {filteredConversations.map((conv) => (
                      <SalesConversationRow
                        key={conv.conversation_id}
                        conv={conv}
                        isSelected={selectedConversation?.conversation_id === conv.conversation_id}
                        pipelineName={conv.lead_id ? leadPipelineMap[conv.lead_id] : undefined}
                        onClick={() => setSelectedConversation(conv)}
                        onNavigateToLead={() => {
                          if (conv.lead_id) {
                            navigate(`/comercial/leads/${conv.lead_id}?from=inbox`);
                          }
                        }}
                        onMarkHandled={() => handleMarkAsHandled(conv)}
                        onUnmarkHandled={() => handleUnmarkAsHandled(conv)}
                      />
                    ))}
                  </>
                );
              })()}
            </ScrollArea>

            {/* Load more + Footer */}
            <div className="border-t">
              <div className="p-3 flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // Salvar posição do scroll antes de carregar mais
                    const el = scrollAreaRef.current?.querySelector('[data-radix-scroll-area-viewport]') as HTMLElement | null;
                    if (el) sessionStorage.setItem("sales-inbox-scroll", String(el.scrollTop));
                    setConversationLimit((prev) => prev + 200);
                  }}
                  className="text-sm gap-2 px-4 py-2 font-medium w-full"
                >
                  <RefreshCw className="h-4 w-4" />
                  Ver mais conversas
                </Button>
              </div>
            </div>
            <div className="p-2 border-t text-xs text-gray-500 text-center">
              {(() => {
                const commercialInstanceIds = new Set(commercialInstances.map(i => i.id));
                const visibleCount = (conversations || []).filter(conv => {
                  if (conv.conversation_type === "grupo") return false;
                  if (!instanceId && commercialInstanceIds.size > 0 && conv.instance_id && !commercialInstanceIds.has(conv.instance_id)) return false;
                  if (selectedPipelineId && conv.lead_id && leadPipelineIdMap[conv.lead_id] !== selectedPipelineId) return false;
                  if (agentFilter === "active") return conv.ai_agent_status === "active";
                  if (agentFilter === "paused") return conv.ai_agent_status?.startsWith("paused");
                  if (agentFilter === "transferred") return conv.ai_agent_status === "transferred";
                  if (agentFilter === "none") return !conv.ai_agent_status;
                  if (agentFilter === "error") return conv.lead_id && agentErrorLeadIds.has(conv.lead_id);
                  return true;
                }).length;
                const totalCount = (conversations || []).length;
                const hasFilter = filters.slaFilter || filters.onlyPending || filters.search || agentFilter !== "all" || filters.funnelFilter || selectedPipelineId;
                return (
                  <>
                    {visibleCount} conversa{visibleCount !== 1 ? "s" : ""}
                    {hasFilter && visibleCount !== totalCount && ` (de ${totalCount})`}
                    {hasFilter && " \u2022 filtro ativo"}
                  </>
                );
              })()}
            </div>
          </aside>
          )}

          {/* Chat */}
          {(!isMobile || !!selectedConversation) && (
          <main className={cn("flex flex-col bg-[#e5ddd5]", isMobile ? "w-full" : "flex-1 min-w-0")}>
            {selectedConversation ? (
              <>
                {/* Chat Header */}
                <div className="flex-shrink-0 px-3 sm:px-4 py-3 bg-blue-600 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {isMobile && (
                        <button onClick={() => setSelectedConversation(null)} className="p-1 -ml-1 hover:bg-white/20 rounded">
                          <ArrowLeft className="h-5 w-5" />
                        </button>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{selectedConversation.conversation_name}</h3>
                        <p className="text-xs text-blue-100 truncate">
                          {selectedConversation.contact_phone || ""} • {selectedConversation.conversation_type === "grupo" ? "Grupo" : "Individual"}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {/* Botão Concluir - visível quando conversa pendente/urgente */}
                      {selectedConversation.pending_reply && !selectedConversation.is_handled && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-amber-500/30 text-amber-100 px-2 py-1 rounded-full flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Aguardando {selectedConversation.wait_minutes < 60
                              ? `${Math.floor(selectedConversation.wait_minutes)}min`
                              : `${Math.floor(selectedConversation.wait_minutes / 60)}h${Math.floor(selectedConversation.wait_minutes % 60)}m`}
                          </span>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="sm" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white gap-1 h-7 text-xs">
                                <Check className="h-3.5 w-3.5" />
                                Concluir
                                <ChevronDown className="h-3 w-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {[
                                { label: "Sem necessidade de ação", reason: "no_action_needed" },
                                { label: "Já respondido por fora", reason: "replied_externally" },
                                { label: "Outro", reason: "replied_manually" },
                              ].map(({ label, reason }) => (
                                <DropdownMenuItem key={reason} onClick={() => {
                                  const conv = selectedConversation;
                                  markAsHandled.mutate({
                                    leadId: conv.lead_id || undefined,
                                    groupId: conv.group_id || undefined,
                                    handledBy: teamMember?.id,
                                    reason,
                                  }, {
                                    onSuccess: () => {
                                      setSelectedConversation({ ...conv, is_handled: true, pending_reply: false });
                                      toast({
                                        title: "Conversa concluída",
                                        action: (
                                          <ToastAction altText="Desfazer" onClick={() => {
                                            unmarkAsHandled.mutate({
                                              leadId: conv.lead_id || undefined,
                                              groupId: conv.group_id || undefined,
                                            }, {
                                              onSuccess: () => {
                                                setSelectedConversation({ ...conv, is_handled: false, pending_reply: true });
                                                toast({ title: "Conversa voltou para pendentes" });
                                              },
                                            });
                                          }}>
                                            Desfazer
                                          </ToastAction>
                                        ),
                                      });
                                    },
                                  });
                                }}>
                                  {label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      )}
                      {/* Ações Dropdown — Follow-up + Agendar Reunião */}
                      {selectedConversation.lead_id && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="bg-white/20 hover:bg-white/30 text-white gap-1 h-7 text-xs">
                              <MoreHorizontal className="h-3.5 w-3.5" />
                              Ações
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => {
                              setQuickFuTitle(`Follow-up ${selectedConversation.conversation_name?.split(" ")[0] || "Lead"}`);
                              setQuickFuWhen(0);
                              setQuickFuOpen(true);
                              setTimeout(() => quickFuInputRef.current?.select(), 100);
                            }}>
                              <Zap className="h-4 w-4 mr-2 text-yellow-500" />
                              Follow-up rápido
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={handleScheduleMeeting} disabled={isExtractingMeeting}>
                              {isExtractingMeeting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Video className="h-4 w-4 mr-2 text-blue-500" />}
                              Agendar Reunião
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                      {/* Follow-up Popover (opened by dropdown) */}
                      <Popover open={quickFuOpen} onOpenChange={setQuickFuOpen}>
                        <PopoverTrigger asChild>
                          <span className="hidden" />
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-72 p-3">
                          <div className="space-y-2">
                            <Input
                              ref={quickFuInputRef}
                              value={quickFuTitle}
                              onChange={(e) => setQuickFuTitle(e.target.value)}
                              placeholder="Título do follow-up"
                              className="h-8 text-sm"
                              onKeyDown={(e) => e.key === "Enter" && handleQuickFollowUp()}
                            />
                            <div className="flex gap-1">
                              {([["Hoje", 0], ["Amanhã", 1], ["2 dias", 2]] as const).map(([label, val]) => (
                                <button
                                  key={val}
                                  onClick={() => setQuickFuWhen(val)}
                                  className={cn(
                                    "flex-1 text-xs py-1 px-2 rounded border transition-colors",
                                    quickFuWhen === val
                                      ? "bg-yellow-100 border-yellow-400 text-yellow-800 font-medium"
                                      : "bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100"
                                  )}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              className="w-full h-8 bg-yellow-500 hover:bg-yellow-600 text-white"
                              onClick={handleQuickFollowUp}
                              disabled={createTask.isPending}
                            >
                              {createTask.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                              Criar Follow-up
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                      {/* Mini Agenda - verificar horários livres */}
                      <InboxMiniAgenda className="bg-white/20 border-white/30 text-white hover:bg-white/30" />
                      {/* AI Agent Badge - apenas para conversas individuais com lead */}
                      {selectedConversation.lead_id && selectedConversation.conversation_type !== "grupo" && (
                        <AIAgentBadge
                          leadId={selectedConversation.lead_id}
                          showControls={true}
                          className="bg-white/20 border-white/30 text-white hover:bg-white/30"
                        />
                      )}
                      {/* Info button for mobile */}
                      {isMobile && selectedConversation.lead_id && (
                        <button onClick={() => setShowInfoPanel(true)} className="p-1.5 hover:bg-white/20 rounded">
                          <Info className="h-5 w-5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <WhatsAppChat
                  contactName={selectedConversation.conversation_name}
                  contactPhone={selectedConversation.contact_phone}
                  leadId={selectedConversation.lead_id}
                  groupId={selectedConversation.group_id}
                  instanceId={selectedConversation.instance_id || instanceId}
                  isGroup={selectedConversation.conversation_type === "grupo"}
                  className="flex-1"
                  onMessageSent={() => { refetchConversations(); refetchMetrics(); }}
                  hideHeader
                  availableInstances={commercialInstances}
                />
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <MessageSquare className="h-16 w-16 mx-auto mb-4 opacity-30" />
                  <p className="text-lg font-medium">Selecione uma conversa</p>
                </div>
              </div>
            )}
          </main>
          )}

          {/* Side Panel - Lead Info (desktop only) */}
          {!isMobile && (
            <aside className="w-72 border-l hidden xl:block">
              <ClientInfoPanel conversation={selectedConversation} instanceId={instanceId || undefined} />
            </aside>
          )}

          {/* Side Panel - Sheet (mobile) */}
          <Sheet open={showInfoPanel} onOpenChange={setShowInfoPanel}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0">
              <ClientInfoPanel conversation={selectedConversation} instanceId={instanceId || undefined} />
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Modal Agendar Reunião */}
      {selectedConversation?.lead_id && (
        <CreateTaskModal
          open={isScheduleMeetingOpen}
          onOpenChange={setIsScheduleMeetingOpen}
          defaultValues={{
            lead_id: selectedConversation.lead_id,
            lead_name: selectedConversation.conversation_name,
            team: 'sales',
            task_type: 'meeting',
            ...meetingDefaults,
          }}
        />
      )}
    </AppLayout>
  );
};

export default SalesWhatsAppInbox;

/* ==================================================================
 *  Helpers visuais — usados no header/filters do inbox
 * ================================================================== */

interface KpiPillProps {
  icon: React.ElementType;
  label: string;
  value: number;
  subLabel?: string;
  active?: boolean;
  readOnly?: boolean;
  tone: "accent" | "danger" | "warning" | "success";
  onClick?: () => void;
}

function KpiPill({ icon: Icon, label, value, subLabel, active, readOnly, tone, onClick }: KpiPillProps) {
  const toneMap: Record<typeof tone, { active: string; idle: string; icon: string }> = {
    accent: {
      active: "bg-primary/15 text-primary ring-primary/40",
      idle: "hover:bg-primary/10 hover:text-primary/90 text-muted-foreground ring-border/60",
      icon: "text-primary",
    },
    danger: {
      active: "bg-red-500/15 text-red-400 ring-red-500/40",
      idle: "hover:bg-red-500/10 hover:text-red-400 text-muted-foreground ring-border/60",
      icon: "text-red-400",
    },
    warning: {
      active: "bg-amber-500/15 text-amber-400 ring-amber-500/40",
      idle: "hover:bg-amber-500/10 hover:text-amber-400 text-muted-foreground ring-border/60",
      icon: "text-amber-400",
    },
    success: {
      active: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/40",
      idle: "bg-muted/30 text-muted-foreground ring-border/60",
      icon: "text-emerald-400",
    },
  };

  const styles = toneMap[tone];

  const Component = readOnly ? "div" : "button";

  return (
    <Component
      {...(!readOnly && { onClick, type: "button" as const })}
      className={cn(
        "shrink-0 flex items-center gap-2 px-3 h-9 rounded-lg ring-1 ring-inset transition-all",
        "text-[12px] font-medium tabular-nums",
        !readOnly && "cursor-pointer",
        active ? styles.active : styles.idle
      )}
      aria-pressed={readOnly ? undefined : active}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", active || readOnly ? styles.icon : "opacity-60")} strokeWidth={2} />
      <span className="text-[14px] font-semibold leading-none">{value}</span>
      <span className="text-[11px] uppercase tracking-wider font-medium opacity-80">{label}</span>
      {subLabel && (
        <span className="text-[10px] opacity-60 ml-0.5 border-l border-current/20 pl-2">{subLabel}</span>
      )}
    </Component>
  );
}

interface StageChipProps {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

function StageChip({ active, onClick, children }: StageChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[10px] px-2 py-0.5 rounded-full transition-all border",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-transparent border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
      )}
    >
      {children}
    </button>
  );
}
