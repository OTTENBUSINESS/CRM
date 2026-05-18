import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";

// Sales components
import {
  LeadScoreBadge,
  QualificationCard,
  LeadWebinarsCard,
  DealCard,
  CreateDealModal,
  EditDealModal,
  RegisterNegotiationModal,
  WinDealModal,
} from "@/components/sales";

// Sales AI components
import {
  LeadInsightsCard,
  LeadIntelligencePanel,
  ObjectionHandler,
  SalesAIChat,
} from "@/components/sales/ai";

// Financial components
import {
  FinancialSummaryCards,
  DealPaymentsList,
  FinancialTimeline,
} from "@/components/sales/financial";

// Shared components
import { WhatsAppChat } from "@/components/inbox/WhatsAppChat";
import { TaskList } from "@/components/tasks/TaskList";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { ViewDealModal } from "@/components/sales/ViewDealModal";
import { TransferPipelineModal } from "@/components/sales/TransferPipelineModal";
import { LoseDealModal } from "@/components/sales/LoseDealModal";
import { FarmingReasonModal } from "@/components/sales/FarmingReasonModal";
import { CallButton, CallHistory, CallDetailModal } from "@/components/calls";
import { MeetingHistory } from "@/components/meeting/MeetingHistory";
import { NotesList } from "@/components/sales/NotesList";
import { AddNoteModal } from "@/components/sales/AddNoteModal";
import { DealContactsTab } from "@/components/sales/DealContactsTab";
import { MergeLeadsModal } from "@/components/sales/MergeLeadsModal";
import { AIAgentBadge } from "@/components/inbox/AIAgentBadge";
import { SidebarDeals } from "@/components/sales/SidebarDeals";
import { TimelineView } from "@/components/timeline/TimelineView";
import { CancelRefundModal } from "@/components/sales/CancelRefundModal";
import { ScheduleMessageModal } from "@/components/sales/ScheduleMessageModal";
import { LeadTagsInput } from "@/components/sales/LeadTagsInput";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Hooks
import { useSalesLead, useUpdateLeadStage, useUpdateLeadPipelineStage, useUpdateBANT, useUpdateLeadInfo, useUpdateLeadQualification, useUpdateLeadSales, useDeleteLead } from "@/hooks/useSalesLeads";
import { useLeadDuplicates, useLeadConversions, useLinkedOrganizations } from "@/hooks/useMergeLeads";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { usePipelines } from "@/hooks/usePipelineConfig";
import { useCalculateLeadScore } from "@/hooks/useSalesAI";
import { useContactDeals, useDeleteDeal } from "@/hooks/useSalesDeals";
import { useLeadDeals, useLinkedContacts, useUnlinkContact, type LinkedContact } from "@/hooks/useDealContacts";
import { useLeadTransactions, useClientLTV, convertTransactionAmount } from "@/hooks/useTransactions";
import { useClientTimeline } from "@/hooks/useClientTimeline";
import { useInstagramProfile, useInstagramPosts, useInstagramStories } from "@/hooks/useInstagramProfile";
import { LeadInstagramChat, InstagramStoriesCarousel, PostViewerModal } from "@/components/sales/instagram";
import { useClientTasks, useCreateTask, Task } from "@/hooks/useTasks";
import { usePartnerLeadIds } from "@/hooks/usePartnerLeads";
import { useLeadByPhone } from "@/hooks/useWhatsAppInbox";
import { extractMeetingDateTime } from "@/hooks/useExtractMeetingDateTime";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCall } from "@/contexts/CallContext";

import {
  MessageSquare, Activity, Target, TrendingUp, ArrowLeft, Mail, Phone,
  Building2, Users, Clock, ExternalLink, Video, Calendar, CheckCircle2,
  Copy, DollarSign, FileText, User, Wallet, Globe, Hash, Instagram,
  Sparkles, Briefcase, RefreshCw, Pencil, Save, X, Heart, GraduationCap, AlertTriangle,
  StickyNote, Ticket, Merge, GitMerge, Receipt, Send, Star, GitBranch, ChevronDown, Zap, Loader2, UserX, Mic, Trash2, Sprout, XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn, navigateTo } from "@/lib/utils";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { supabase } from "@/lib/supabase";
import type { SalesStage } from "@/types/sales.types";

// Reusable content component (used by FocusMode and the page itself)
export const SalesLeadDetailContent = ({ leadId, hideBackButton }: {
  leadId: string;
  hideBackButton?: boolean;
}) => {
  const id = leadId;
  const [searchParams] = useSearchParams();
  const defaultTab = searchParams.get('tab') || 'timeline';
  const navigate = useNavigate();
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const queryClient = useQueryClient();
  const { whatsappDraft, clearWhatsAppDraft } = useCall();

  // Instâncias comerciais (para seletor de envio no chat)
  const [commercialInstances, setCommercialInstances] = useState<{ id: string; name: string; status?: string; metadata?: any }[]>([]);
  useEffect(() => {
    supabase.from('whatsapp_instances').select('id, name, status, metadata').contains('teams', ['comercial'])
      .then(({ data }) => { if (data) setCommercialInstances(data); });
  }, []);

  const [activeTab, setActiveTab] = useState(defaultTab);
  const [draftMessage, setDraftMessage] = useState<string | undefined>(undefined);
  const [timelineFilter, setTimelineFilter] = useState<"all" | "sales" | "cs">("all");
  const [msgChannel, setMsgChannel] = useState<"whatsapp" | "instagram">("whatsapp");
  const [interacoesTab, setInteracoesTab] = useState<"calls" | "meetings">("calls");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isResponsavelPopoverOpen, setIsResponsavelPopoverOpen] = useState(false);
  const [isPipelinePopoverOpen, setIsPipelinePopoverOpen] = useState(false);
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);
  const [deleteLeadConfirm, setDeleteLeadConfirm] = useState(false);
  const [unlinkContactConfirm, setUnlinkContactConfirm] = useState<LinkedContact | null>(null);
  const deleteLead = useDeleteLead();
  const unlinkContact = useUnlinkContact();

  // Consumir WhatsApp draft quando é para este lead
  useEffect(() => {
    if (whatsappDraft && whatsappDraft.leadId === id) {
      setDraftMessage(whatsappDraft.message);
      setActiveTab('mensagens');
      setMsgChannel('whatsapp');
      clearWhatsAppDraft();
      toast({
        title: '💬 Mensagem preparada',
        description: 'Revise a mensagem no WhatsApp e envie quando quiser',
      });
    }
  }, [whatsappDraft, id, clearWhatsAppDraft, toast]);

  // Data fetching - busca da tabela LEADS
  const { data: lead, isLoading: leadLoading, refetch } = useSalesLead(id);
  
  // Team members para atribuir responsável
  const { data: teamMembers } = useTeamMembers();

  // Função para atribuir responsável ao lead E aos deals associados
  const handleAssignResponsavel = async (memberId: string | null) => {
    if (!id) return;
    
    // 1. Atualizar o lead
    const { error } = await supabase
      .from('leads')
      .update({ sales_rep_id: memberId })
      .eq('id', id);
    
    if (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atribuir o responsável",
        variant: "destructive",
      });
      return;
    }
    
    // 2. Atualizar todos os deals deste lead para manter consistência
    await supabase
      .from('deals')
      .update({ sales_rep_id: memberId })
      .eq('lead_id', id);
    
    // Invalidar cache do pipeline para refletir mudança
    queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
    queryClient.invalidateQueries({ queryKey: ['contact-deals', id] });
    
    toast({
      title: "Sucesso",
      description: memberId ? "Responsável atribuído com sucesso" : "Responsável removido",
    });
    
    setIsResponsavelPopoverOpen(false);
    refetch();
  };

  // WhatsApp lead (para o chat)
  const { data: whatsappLead } = useLeadByPhone(lead?.phone);

  // Sales data
  const { data: contactDeals } = useContactDeals(id);
  const { data: dealParticipations } = useLeadDeals(id); // Deals onde este lead participa como contato secundário
  const { data: linkedData } = useLinkedContacts(id);
  // Determinar pipeline e stage real: prioriza deal selecionado via URL > deal aberto > lead
  const dealIdFromUrl = searchParams.get('deal');
  const [selectedDealIdState, setSelectedDealIdState] = useState<string | null>(null);
  const selectedDealId = selectedDealIdState || dealIdFromUrl || null;

  const activeDeal = selectedDealId
    ? contactDeals?.find((d: any) => d.id === selectedDealId)
    : contactDeals?.find((d: any) => d.status !== 'won' && d.status !== 'lost' && d.pipeline_stage);
  const leadPipelineId = (activeDeal as any)?.pipeline_stage?.pipeline_id
    || (lead as any)?.pipeline_stage?.pipeline_id
    || undefined;
  const effectiveStageId = (activeDeal as any)?.pipeline_stage_id || lead?.pipeline_stage_id;
  const { data: pipelineStages } = usePipelineStages(leadPipelineId);
  const { data: allPipelines } = usePipelines();
  const updateStage = useUpdateLeadStage();
  const updatePipelineStage = useUpdateLeadPipelineStage();
  const updateBANT = useUpdateBANT();
  const updateLeadSales = useUpdateLeadSales();
  const updateQualification = useUpdateLeadQualification();
  const calculateScore = useCalculateLeadScore();

  // Transactions & LTV
  const { data: transactions } = useLeadTransactions(id);
  const { data: ltv } = useClientLTV(id);

  // Timeline
  const { data: timeline } = useClientTimeline(id, undefined);

  // Instagram data
  const instagramProfileId = lead?.instagram_profile_id;
  const { data: instagramProfile } = useInstagramProfile(instagramProfileId);
  const { data: instagramPosts } = useInstagramPosts(instagramProfileId);
  const { data: instagramStories } = useInstagramStories(instagramProfileId);

  // Partner leads cluster (for mirroring tasks/calls/meetings)
  const { data: partnerLeadIds } = usePartnerLeadIds(id);

  // Tasks — use cluster of lead IDs to show tasks from all linked leads
  const { data: clientTasks } = useClientTasks(undefined, partnerLeadIds && partnerLeadIds.length > 1 ? partnerLeadIds : id);
  const pendingTasks = (clientTasks || []).filter(t => !t.completed);
  const completedTasks = (clientTasks || []).filter(t => t.completed);
  const [taskFilter, setTaskFilter] = useState<'pending' | 'completed'>('pending');
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  // Quick Follow-up
  const [quickFuOpen, setQuickFuOpen] = useState(false);
  const [quickFuTitle, setQuickFuTitle] = useState("");
  const [quickFuWhen, setQuickFuWhen] = useState<0 | 1 | 2>(0);
  const createTaskMut = useCreateTask();
  const quickFuInputRef = useRef<HTMLInputElement | null>(null);

  // Timeline interaction state
  const [selectedTimelineTask, setSelectedTimelineTask] = useState<Task | null>(null);
  const [selectedTimelineDeal, setSelectedTimelineDeal] = useState<any>(null);
  const [selectedDiagnostic, setSelectedDiagnostic] = useState<any>(null);
  const [selectedCall, setSelectedCall] = useState<any>(null);
  const [selectedMeeting, setSelectedMeeting] = useState<any>(null);
  const [selectedNote, setSelectedNote] = useState<any>(null);
  const [selectedTimelineEvent, setSelectedTimelineEvent] = useState<any>(null);
  const [isTimelineEventOpen, setIsTimelineEventOpen] = useState(false);
  const [isTaskDetailOpen, setIsTaskDetailOpen] = useState(false);
  const [isDealDetailOpen, setIsDealDetailOpen] = useState(false);
  const [isDiagnosticDetailOpen, setIsDiagnosticDetailOpen] = useState(false);
  const [isNoteDetailOpen, setIsNoteDetailOpen] = useState(false);
  const [isCallDetailOpen, setIsCallDetailOpen] = useState(false);
  const [isMeetingDetailOpen, setIsMeetingDetailOpen] = useState(false);
  const [isEmailPreviewOpen, setIsEmailPreviewOpen] = useState(false);
  const [selectedEmailHtml, setSelectedEmailHtml] = useState<string>("");
  const [selectedEmailSubject, setSelectedEmailSubject] = useState<string>("");

  // AI Modals state
  const [isScheduleMessageOpen, setIsScheduleMessageOpen] = useState(false);
  const [isScheduleMeetingFromChat, setIsScheduleMeetingFromChat] = useState(false);
  const [meetingDefaults, setMeetingDefaults] = useState<{ title?: string; due_datetime?: string }>({});
  const [isExtractingMeeting, setIsExtractingMeeting] = useState(false);
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [isPaymentConfigOpen, setIsPaymentConfigOpen] = useState(false);
  const [isWinDealOpen, setIsWinDealOpen] = useState(false);
  const [isEditDealOpen, setIsEditDealOpen] = useState(false);
  const [isTransferPipelineOpen, setIsTransferPipelineOpen] = useState(false);
  const [isLoseDealOpen, setIsLoseDealOpen] = useState(false);
  const [isRefundDealOpen, setIsRefundDealOpen] = useState(false);
  const [isFarmingReasonOpen, setIsFarmingReasonOpen] = useState(false);
  const [farmingTargetStageId, setFarmingTargetStageId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<any>(null);
  const [deleteDealConfirm, setDeleteDealConfirm] = useState<any>(null);
  const [managingContactsDealId, setManagingContactsDealId] = useState<string | null>(null);
  const deleteDeal = useDeleteDeal();

  // Extract meeting datetime from chat via AI, then open modal
  const handleScheduleMeetingFromChat = async () => {
    if (!id || isExtractingMeeting) return;
    setIsExtractingMeeting(true);
    try {
      const { data: msgs } = await (supabase.rpc as any)('get_conversation_messages', {
        p_lead_id: whatsappLead?.id || id,
        p_group_id: null,
        p_limit: 30,
        p_instance_id: teamMember?.whatsapp_instance_id || null,
      });
      if (msgs && msgs.length > 0) {
        const result = await extractMeetingDateTime(
          msgs.map((m: any) => ({ content: m.content, is_from_me: m.is_from_me, sent_at: m.sent_at })),
          lead?.name || "Lead"
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
    setIsScheduleMeetingFromChat(true);
  };

  // Merge Lead Modal
  const [isMergeLeadOpen, setIsMergeLeadOpen] = useState(false);
  const { data: leadDuplicates } = useLeadDuplicates(id);
  const { data: leadConversions } = useLeadConversions(id);
  const { data: linkedOrgs } = useLinkedOrganizations(id);

  // Post Viewer Modal
  const [postViewerOpen, setPostViewerOpen] = useState(false);
  const [postViewerIndex, setPostViewerIndex] = useState(0);

  // Edit Lead Modal
  const [isEditLeadOpen, setIsEditLeadOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    email: '',
    phone: '',
    instagram: '',
    region: '',
    utm_source: '',
    utm_campaign: '',
    utm_content: '',
    company_name: '',
    job_title: '',
  });
  const updateLeadInfo = useUpdateLeadInfo();

  // Helpers
  const getInitials = (name: string) => name?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "??";
  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Nunca";
    return new Date(dateString).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  };
  const formatDateTime = (dateString: string | null | undefined) => {
    if (!dateString) return "Nunca";
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + " às " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };
  const getDaysSince = (dateString: string | null | undefined) => {
    if (!dateString) return null;
    return Math.ceil((new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60 * 60 * 24));
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleStageChange = async (stage: SalesStage) => {
    if (!id) return;
    try {
      await updateStage.mutateAsync({ contactId: id, stage });
      toast({ title: "Estágio atualizado", description: `Lead movido para ${stage}` });
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  // Helper: registrar movimentação de etapa na timeline
  const logStageMove = async (dealId: string, leadId: string, fromStage: string, toStage: string, pipelineName?: string) => {
    try {
      await supabase.from('company_activities').insert({
        lead_id: leadId,
        team: 'sales',
        task_type: 'stage_change',
        name: `Movido: ${fromStage} → ${toStage}`,
        description: pipelineName ? `Pipeline: ${pipelineName}` : undefined,
        status: 'completed',
        completed: true,
        metadata: { deal_id: dealId, from_stage: fromStage, to_stage: toStage, pipeline: pipelineName, changed_by: teamMember?.name },
      });
    } catch { /* silent */ }
  };

  const handlePipelineStageChange = async (stageId: string, stageName: string) => {
    if (!id) return;

    const targetStage = pipelineStages?.find(s => s.id === stageId);
    const currentStageName = currentPipelineStage?.name || 'Desconhecido';
    const pipelineName = allPipelines?.find(p => p.id === leadPipelineId)?.name;
    const dealIsWonOrLost = activeDeal?.status === 'won' || activeDeal?.status === 'lost';

    // Se deal tá ganho/perdido e vendedor quer mover pra outra etapa → confirmar reabertura
    if (dealIsWonOrLost && !targetStage?.is_won && !targetStage?.is_lost) {
      const statusLabel = activeDeal?.status === 'won' ? 'GANHA' : 'PERDIDA';
      const confirmed = window.confirm(
        `Esta oportunidade está marcada como ${statusLabel}.\n\nDeseja reabrir e mover para "${stageName}"?\n\nIsso será registrado na timeline.`
      );
      if (!confirmed) return;

      try {
        if (activeDeal) {
          await supabase
            .from('deals')
            .update({
              status: 'open',
              won_at: null,
              lost_at: null,
              lost_reason: null,
              pipeline_stage_id: stageId,
              updated_at: new Date().toISOString(),
            })
            .eq('id', activeDeal.id);
          await logStageMove(activeDeal.id, id, `${currentStageName} (${statusLabel})`, stageName, pipelineName);
          queryClient.invalidateQueries({ queryKey: ['contact-deals', id] });
          queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
          queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
        }
        await updatePipelineStage.mutateAsync({ leadId: id, stageId });
        toast({ title: "Oportunidade reaberta", description: `Movido para ${stageName}` });
      } catch (error) {
        toast({ title: "Erro ao reabrir", variant: "destructive" });
      }
      return;
    }

    // Ganho → abrir WinDealModal
    if (targetStage?.is_won) {
      if (activeDeal) {
        setSelectedDeal(activeDeal);
        setIsWinDealOpen(true);
      }
      return;
    }

    // Perdido → abrir LoseDealModal
    if (targetStage?.is_lost) {
      if (activeDeal) {
        setSelectedDeal(activeDeal);
        setIsLoseDealOpen(true);
      } else {
        setSelectedDeal({
          id: `lead-${id}`,
          lead_id: id,
          lead: lead,
          contact: lead,
          title: lead?.name || 'Lead',
          _isLeadOnly: true,
          _lostStageId: stageId,
        });
        setIsLoseDealOpen(true);
      }
      return;
    }

    // Farming → abrir FarmingReasonModal
    if ((targetStage as any)?.is_farming) {
      setFarmingTargetStageId(stageId);
      setIsFarmingReasonOpen(true);
      return;
    }

    // Demais etapas → mover o DEAL + registrar na timeline
    try {
      if (activeDeal) {
        await supabase
          .from('deals')
          .update({ pipeline_stage_id: stageId, updated_at: new Date().toISOString() })
          .eq('id', activeDeal.id);
        await logStageMove(activeDeal.id, id, currentStageName, stageName, pipelineName);
        queryClient.invalidateQueries({ queryKey: ['contact-deals', id] });
        queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
        queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
      }
      await updatePipelineStage.mutateAsync({ leadId: id, stageId });
      toast({ title: "Estágio atualizado", description: `Movido para ${stageName}` });
    } catch (error) {
      toast({ title: "Erro ao atualizar estágio", variant: "destructive" });
    }
  };

  // Fetch stages for a pending pipeline change (to show stage picker)
  const { data: pendingPipelineStages } = usePipelineStages(pendingPipelineId || undefined);

  const handleMoveToPipeline = async (pipelineId: string, stageId: string) => {
    if (!id) return;

    try {
      // Update lead's pipeline_stage_id to the target stage
      await updatePipelineStage.mutateAsync({ leadId: id, stageId });

      // Also update any open deals of this lead to the new pipeline + stage
      if (contactDeals?.length) {
        const openDeals = contactDeals.filter((d: any) => d.status !== 'won' && d.status !== 'lost');
        for (const deal of openDeals) {
          await supabase
            .from('deals')
            .update({ pipeline_id: pipelineId, pipeline_stage_id: stageId })
            .eq('id', deal.id);
        }
        queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
        queryClient.invalidateQueries({ queryKey: ['contact-deals', id] });
      }

      const pipelineName = allPipelines?.find(p => p.id === pipelineId)?.name;
      const stageName = pendingPipelineStages?.find(s => s.id === stageId)?.name || pipelineStages?.find(s => s.id === stageId)?.name;
      toast({ title: "Pipeline atualizado", description: `Lead movido para ${pipelineName} - ${stageName}` });
      setIsPipelinePopoverOpen(false);
      setPendingPipelineId(null);
      refetch();
    } catch {
      toast({ title: "Erro ao mover pipeline", variant: "destructive" });
    }
  };

  const handleBANTChange = async (field: string, value: boolean) => {
    if (!id) return;
    try {
      await updateBANT.mutateAsync({ contactId: id, bant: { [field]: value } });
    } catch (error) {
      toast({ title: "Erro ao atualizar BANT", variant: "destructive" });
    }
  };

  // Open Edit Lead Modal
  const openEditLeadModal = () => {
    if (!lead) return;
    setEditForm({
      name: lead.name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      instagram: lead.instagram || '',
      region: lead.region || '',
      utm_source: lead.utm_source || '',
      utm_campaign: lead.utm_campaign || '',
      utm_content: lead.utm_content || '',
      company_name: (lead as any).company_name || '',
      job_title: (lead as any).job_title || '',
    });
    setIsEditLeadOpen(true);
  };

  // Save Lead Info
  const handleSaveLeadInfo = async () => {
    if (!id) return;
    try {
      await updateLeadInfo.mutateAsync({ leadId: id, data: editForm });
      toast({ title: "Lead atualizado", description: "Informações salvas com sucesso!" });
      setIsEditLeadOpen(false);
      refetch();
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  // Linked contacts: primary lead data for inheritance
  const pl = linkedData?.primaryLead;

  // Helper: check if a value is meaningful (not empty/"não informado"/N/A)
  const hasValue = (v: any) => v != null && String(v).trim() !== "" && !/^n[aã]o\s*informad/i.test(String(v)) && String(v).toLowerCase() !== "n/a";
  const pick = (own: any, fallback: any) => hasValue(own) ? own : hasValue(fallback) ? fallback : null;

  // Get BANT object (inherit from primary lead if this lead has no data)
  const bant = {
    budget: lead?.bant_budget ?? pl?.bant_budget ?? null,
    authority: lead?.bant_authority ?? pl?.bant_authority ?? null,
    need: lead?.bant_need ?? pl?.bant_need ?? null,
    timeline: lead?.bant_timeline ?? pl?.bant_timeline ?? null,
  };

  // Effective lead data: own values with fallback to primary lead
  const effectiveLead = lead ? {
    ...lead,
    company_name: pick(lead.company_name, pl?.company_name) ?? lead.company_name,
    employee_count: pick(lead.employee_count, pl?.employee_count) ?? lead.employee_count,
    monthly_revenue: pick(lead.monthly_revenue, pl?.monthly_revenue) ?? lead.monthly_revenue,
    challenges: pick(lead.challenges, pl?.challenges) ?? lead.challenges,
  } : lead;

  // Filter timeline events
  const filteredTimeline = (timeline || []).filter((event: any) => {
    if (timelineFilter === "all") return true;
    return event.team === timelineFilter;
  });

  // Score color
  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-green-600";
    if (score >= 40) return "text-yellow-600";
    return "text-red-600";
  };

  // Loading state
  if (leadLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <div className="grid grid-cols-12 gap-6">
          <Skeleton className="col-span-4 h-[600px]" />
          <Skeleton className="col-span-8 h-[600px]" />
        </div>
      </div>
    );
  }

  // Not found state
  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="text-6xl mb-4">😕</div>
        <h2 className="text-xl font-semibold mb-2">Lead não encontrado</h2>
        <p className="text-muted-foreground mb-4">O lead que você procura não existe.</p>
        <Button onClick={() => navigate("/comercial/leads")}>Voltar para Leads</Button>
      </div>
    );
  }

  const salesScore = lead.sales_score || 0;
  // Use stage do deal (prioridade) ou do lead
  const currentPipelineStage = pipelineStages?.find(s => s.id === effectiveStageId);
  const salesStage = currentPipelineStage?.name || lead.sales_stage || 'Novo';
  const daysAsLead = getDaysSince(lead.created_at) || 0;

  return (
    <>
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back button */}
      {!hideBackButton && (
        <Button variant="ghost" size="sm" onClick={() => {
          const from = searchParams.get('from');
          if (from === 'inbox') {
            navigate('/comercial/inbox');
          } else if (from === 'instagram') {
            navigate('/comercial/instagram');
          } else if (from === 'dashboard') {
            navigate('/comercial');
          } else if (from === 'cockpit') {
            navigate('/comercial/cockpit?tab=agenda');
          } else if (from === 'deals') {
            navigate('/comercial/deals');
          } else if (from === 'leads') {
            navigate('/comercial/leads');
          } else if (from === 'marketing-pipeline') {
            navigate('/marketing/pipeline');
          } else {
            navigate(leadPipelineId ? `/comercial/pipeline?pipeline=${leadPipelineId}` : "/comercial/pipeline");
          }
        }} className="mb-2">
          <ArrowLeft className="h-4 w-4 mr-2" />
          {searchParams.get('from') === 'inbox' ? 'Voltar ao Inbox' : 'Voltar'}
        </Button>
      )}

        {/* Header Card */}
        <Card className="overflow-hidden">
          <div className={cn(
            "h-2",
            salesScore >= 70 && "bg-green-500",
            salesScore >= 40 && salesScore < 70 && "bg-yellow-500",
            salesScore < 40 && "bg-red-500",
          )} />
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-start gap-6">
              <Avatar className="h-20 w-20 ring-4 ring-background shadow-lg">
                {instagramProfile?.stored_profile_picture_url || instagramProfile?.profile_picture_url_hd ? (
                  <AvatarImage
                    src={instagramProfile.stored_profile_picture_url || instagramProfile.profile_picture_url_hd}
                    alt={lead.name}
                    className="object-cover"
                  />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-primary text-2xl font-bold">
                  {getInitials(lead.name)}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-3 mb-3">
                  <h1 className="text-2xl font-bold text-foreground" data-sensitive="name">{lead.name}</h1>
                  {/* Star toggle */}
                  <button
                    onClick={() => {
                      const current = lead.star_type as 'yellow' | 'orange' | null;
                      const next: 'yellow' | 'orange' | null =
                        !current ? 'yellow' : current === 'yellow' ? 'orange' : null;
                      updateLeadSales.mutate({ id: lead.id, star_type: next });
                    }}
                    className="p-1 rounded-md hover:bg-muted transition-colors"
                    title={lead.star_type === 'orange' ? 'Remover estrela' : lead.star_type === 'yellow' ? 'Promover para laranja' : 'Marcar estrela'}
                  >
                    <Star className={cn(
                      "h-5 w-5 transition-colors",
                      lead.star_type === 'orange' && "fill-[#FF6B00] text-[#FF6B00] drop-shadow-[0_0_4px_#FF6B00]",
                      lead.star_type === 'yellow' && "fill-[#FFD700] text-[#FFD700]",
                      !lead.star_type && "text-slate-300 hover:text-slate-400"
                    )} />
                  </button>
                  <LeadScoreBadge score={salesScore} size="md" />
                  <Button variant="ghost" size="sm" onClick={openEditLeadModal} className="h-7 px-2">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleteLeadConfirm(true)} className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {linkedOrgs && linkedOrgs.length > 0 && linkedOrgs.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => navigate(`/clientes/${org.id}`)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                      title="Contato principal desta organização"
                    >
                      <Building2 className="h-3 w-3" />
                      {org.name}
                    </button>
                  ))}
                </div>

                {/* Tags */}
                <div className="mb-3">
                  <LeadTagsInput leadId={lead.id} tags={lead.tags} createdAt={lead.created_at} />
                </div>

                {/* Sales Funnel Stage - Dynamic from pipeline do lead/deal */}
                <div className="flex items-center gap-1 mb-4 flex-wrap">
                  {/* Pipeline selector */}
                  <Popover open={isPipelinePopoverOpen} onOpenChange={(open) => { setIsPipelinePopoverOpen(open); if (!open) setPendingPipelineId(null); }}>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded border transition-all mr-2",
                        leadPipelineId
                          ? "bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300"
                          : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100 dark:bg-amber-900/30 dark:border-amber-700 dark:text-amber-400"
                      )}>
                        <GitBranch className="h-3 w-3" />
                        {leadPipelineId
                          ? allPipelines?.find(p => p.id === leadPipelineId)?.name || 'Pipeline'
                          : 'Sem pipeline'}
                        <ChevronDown className="h-3 w-3 opacity-60" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <div className="p-2 border-b">
                        <p className="text-xs font-medium text-muted-foreground px-1">
                          {pendingPipelineId ? 'Selecione a etapa:' : 'Mover para pipeline:'}
                        </p>
                      </div>
                      <div className="p-1 max-h-64 overflow-y-auto">
                        {!pendingPipelineId ? (
                          // Step 1: Show pipeline list
                          allPipelines?.map(pipeline => {
                            const isCurrent = pipeline.id === leadPipelineId;
                            return (
                              <button
                                key={pipeline.id}
                                onClick={() => {
                                  if (isCurrent) {
                                    setIsPipelinePopoverOpen(false);
                                    return;
                                  }
                                  setPendingPipelineId(pipeline.id);
                                }}
                                className={cn(
                                  "w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left transition-colors",
                                  isCurrent ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted"
                                )}
                              >
                                <GitBranch className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{pipeline.name}</span>
                                {isCurrent && <Badge variant="secondary" className="ml-auto text-[9px] h-4 px-1">Atual</Badge>}
                              </button>
                            );
                          })
                        ) : (
                          // Step 2: Show stages for selected pipeline
                          <>
                            <button
                              onClick={() => setPendingPipelineId(null)}
                              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-muted mb-1"
                            >
                              <ArrowLeft className="h-3 w-3" />
                              Voltar
                            </button>
                            {pendingPipelineStages?.filter(s => !s.is_won && !s.is_lost).map(stage => (
                              <button
                                key={stage.id}
                                onClick={() => handleMoveToPipeline(pendingPipelineId, stage.id)}
                                disabled={updatePipelineStage.isPending}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-left hover:bg-muted transition-colors disabled:opacity-50"
                              >
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color || '#94a3b8' }} />
                                {stage.name}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>

                  {/* Stage pills */}
                  {leadPipelineId && (() => {
                    const normalStages = (pipelineStages || []).filter(s => !s.is_lost);
                    const lostStages = (pipelineStages || []).filter(s => s.is_lost);
                    const allStages = [...normalStages, ...lostStages];
                    const currentStageId = effectiveStageId;
                    const currentStage = pipelineStages?.find(s => s.id === currentStageId);
                    const currentPosition = currentStage?.position ?? 0;

                    return allStages.map((stage, i) => {
                      const isPassed = !stage.is_lost && !(stage as any).is_farming && stage.position < currentPosition;
                      const isCurrent = stage.id === currentStageId;
                      const isFuture = !stage.is_lost && !(stage as any).is_farming && stage.position > currentPosition;
                      const isLost = stage.is_lost;
                      const isFarming = (stage as any).is_farming;
                      const isFirstLost = isLost && i === normalStages.length;

                      return (
                        <div key={stage.id} className="flex items-center">
                          {isFirstLost && (
                            <div className="w-4 h-px bg-red-300 dark:bg-red-700 mx-0.5" />
                          )}
                          {!isFirstLost && i > 0 && (
                            <div className={cn(
                              "w-3 h-px",
                              isPassed ? "bg-muted-foreground/30" : "bg-muted"
                            )} />
                          )}
                          <button
                            onClick={() => handlePipelineStageChange(stage.id, stage.name)}
                            disabled={updatePipelineStage.isPending}
                            className={cn(
                              "px-2.5 py-1 text-xs font-medium rounded transition-all cursor-pointer disabled:opacity-50",
                              isCurrent && !isLost && !isFarming && "bg-primary text-primary-foreground ring-2 ring-primary/30",
                              isCurrent && isFarming && "bg-amber-600 text-white ring-2 ring-amber-400/30",
                              !isCurrent && isFarming && "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50",
                              isCurrent && isLost && "bg-red-600 text-white ring-2 ring-red-400/30",
                              !isCurrent && isLost && "bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50",
                              isPassed && "bg-muted text-muted-foreground hover:bg-muted/80",
                              isFuture && "bg-muted/40 text-muted-foreground/60 hover:bg-muted/60"
                            )}
                          >
                            {stage.name}
                          </button>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Farming reason banner */}
                {(lead as any).farming_reason && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm mb-2 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
                    <Sprout className="h-4 w-4 shrink-0" />
                    <span><span className="font-medium">Farming:</span> {(lead as any).farming_reason}</span>
                    {(lead as any).farming_at && (
                      <span className="text-xs text-amber-600 dark:text-amber-400 ml-auto shrink-0">
                        {format(new Date((lead as any).farming_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                )}

                {/* Lost reason banner */}
                {(lead as any).lost_reason && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm mb-2 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300">
                    <XCircle className="h-4 w-4 shrink-0" />
                    <span><span className="font-medium">Perdido:</span> {(lead as any).lost_reason}</span>
                    {(lead as any).lost_at && (
                      <span className="text-xs text-red-600 dark:text-red-400 ml-auto shrink-0">
                        {format(new Date((lead as any).lost_at), "dd/MM/yyyy", { locale: ptBR })}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
                  {lead.email && (
                    <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:text-foreground transition-colors">
                      <Mail className="h-4 w-4" />
                      <span data-sensitive="email">{lead.email}</span>
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={(e) => { e.preventDefault(); copyToClipboard(lead.email!, 'email'); }}>
                        {copiedField === 'email' ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </a>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-2">
                      <a
                        href={`https://wa.me/55${lead.phone.replace(/\D/g, '')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 hover:text-green-600 transition-colors"
                      >
                        <Phone className="h-4 w-4" />
                        <span data-sensitive="phone">{lead.phone}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                      <CallButton
                        phoneNumber={lead.phone}
                        leadId={id}
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0"
                      />
                    </div>
                  )}
                  {(effectiveLead?.company_name || (lead as any).job_title) && (
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      <span>
                        {(lead as any).job_title && <span className="text-muted-foreground">{(lead as any).job_title}</span>}
                        {(lead as any).job_title && effectiveLead?.company_name && <span className="text-muted-foreground"> @ </span>}
                        {effectiveLead?.company_name && <span className="font-medium">{effectiveLead.company_name}</span>}
                        {!hasValue(lead.company_name) && hasValue(pl?.company_name) && <Badge variant="secondary" className="ml-1 text-[9px] h-4 px-1">via {pl?.name?.split(" ")[0]}</Badge>}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Lead há {daysAsLead} dias</span>
                  </div>
                  {/* Responsável - Clicável para atribuir */}
                  <Popover open={isResponsavelPopoverOpen} onOpenChange={setIsResponsavelPopoverOpen}>
                    <PopoverTrigger asChild>
                      <button className={cn(
                        "flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity",
                        lead.sales_rep?.name 
                          ? "bg-slate-50 border-slate-200" 
                          : "bg-amber-50 border-amber-300 animate-pulse"
                      )}>
                        <User className="h-3.5 w-3.5" />
                        <span className={cn(
                          "text-xs font-medium",
                          lead.sales_rep?.name ? "text-slate-700" : "text-amber-700"
                        )}>
                          {lead.sales_rep?.name || "Clique para atribuir"}
                        </span>
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-2 bg-white border shadow-lg" align="start">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-slate-500 px-2 py-1">
                          Atribuir responsável
                        </p>
                        {teamMembers?.map((member) => (
                          <button
                            key={member.id}
                            onClick={() => handleAssignResponsavel(member.id)}
                            className={cn(
                              "w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm hover:bg-slate-100 transition-colors text-left text-slate-800",
                              lead.sales_rep?.id === member.id && "bg-blue-50 font-medium text-blue-700"
                            )}
                          >
                            <Avatar className="h-7 w-7 border">
                              <AvatarFallback className="text-xs bg-slate-200 text-slate-700 font-medium">
                                {member.name?.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="font-medium">{member.name}</span>
                          </button>
                        ))}
                        {lead.sales_rep && (
                          <>
                            <div className="border-t my-1" />
                            <button
                              onClick={() => handleAssignResponsavel(null)}
                              className="w-full flex items-center gap-2 px-2 py-2 rounded-md text-sm text-red-600 hover:bg-red-50 transition-colors font-medium"
                            >
                              <X className="h-4 w-4" />
                              Remover responsável
                            </button>
                          </>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {(lead.utm_source || lead.utm_campaign || lead.utm_content) && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <Globe className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
                        {[lead.utm_source, lead.utm_campaign, lead.utm_content].filter(Boolean).join(' / ')}
                      </span>
                    </div>
                  )}
                  {lead.landing_page && (
                    <a
                      href={lead.landing_page}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800 hover:bg-purple-100 transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-purple-600" />
                      <span className="text-xs font-medium text-purple-700 dark:text-purple-400 max-w-[200px] truncate">
                        {(() => { try { return new URL(lead.landing_page).pathname; } catch { return lead.landing_page; } })()}
                      </span>
                    </a>
                  )}
                  {/* Indicador de status no Playbook */}
                  {lead.acao_de_hoje && lead.acao_de_hoje !== 'AGUARDAR' && lead.acao_de_hoje !== 'ENCERRAR' && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800">
                      <Target className="h-3.5 w-3.5 text-emerald-600" />
                      <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        Playbook Dia {lead.dia_do_playbook || 1} • {lead.acao_de_hoje?.replace(/_/g, ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => id && calculateScore.mutate(id)}
                  disabled={calculateScore.isPending}
                  className="bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600"
                >
                  {calculateScore.isPending ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Recalcular
                </Button>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsMergeLeadOpen(true)}
                  className="relative"
                >
                  <GitMerge className="h-4 w-4 mr-2" />
                  Mesclar
                  {(leadDuplicates?.length ?? 0) > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[10px] rounded-full h-4 w-4 flex items-center justify-center font-bold">
                      {leadDuplicates!.length}
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column - Quick Info */}
          <div className="lg:col-span-4 space-y-6">
            {/* Quick Stats - Compact */}
            <div className="grid grid-cols-4 gap-2">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className={cn("text-lg font-bold", getScoreColor(salesScore))}>{salesScore}</p>
                <p className="text-[10px] text-muted-foreground">Score</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold text-green-600">R${((ltv || 0) / 1000).toFixed(0)}k</p>
                <p className="text-[10px] text-muted-foreground">LTV</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold">{contactDeals?.length || 0}</p>
                <p className="text-[10px] text-muted-foreground">Deals</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <p className="text-lg font-bold">{daysAsLead}d</p>
                <p className="text-[10px] text-muted-foreground">No Funil</p>
              </div>
            </div>

            {/* Qualification Card (herda dados do lead principal se necessário) */}
            {effectiveLead && (
              <div className="space-y-1">
                <QualificationCard
                  lead={effectiveLead}
                  onUpdate={(field, value) => {
                    if (!id) return;
                    updateQualification.mutate({ leadId: id, field, value });
                  }}
                />
                {pl && (
                  <p className="text-[10px] text-muted-foreground px-1 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Dados herdados de <span className="font-medium">{pl.name}</span> quando não preenchidos
                  </p>
                )}
              </div>
            )}

            {/* Webinarios — historico de inscricoes e atendencia */}
            {id && <LeadWebinarsCard leadId={id} />}

            {/* Contatos Vinculados */}
            {(() => {
              if (!linkedData) return null;
              // Deduplicar: filtrar linkedContacts que já são o primaryLead
              const uniqueContacts = linkedData.linkedContacts.filter(
                (c, i, arr) => c.lead_id !== pl?.id && arr.findIndex(x => x.lead_id === c.lead_id) === i
              );
              const hasContacts = pl || uniqueContacts.length > 0;
              if (!hasContacts) return null;

              return (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Users className="h-4 w-4 text-indigo-500" />
                      Contatos Vinculados
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">
                        {(pl ? 1 : 0) + uniqueContacts.length}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {/* Lead principal */}
                    {pl && (
                      <div
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-blue-50/60 border border-blue-200/50 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={(e) => navigateTo(e, `/comercial/leads/${pl.id}`, navigate)}
                      >
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{pl.name}</p>
                            <Badge variant="secondary" className="text-[9px] h-4 px-1.5 bg-blue-100 text-blue-700">Principal</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {pl.company_name || pl.phone || pl.email || ""}
                          </p>
                        </div>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    )}
                    {/* Outros contatos (sem duplicar o principal) */}
                    {uniqueContacts.map((contact: LinkedContact) => (
                      <div
                        key={contact.lead_id}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 border hover:bg-muted/50 cursor-pointer transition-colors group"
                        onClick={(e) => navigateTo(e, `/comercial/leads/${contact.lead_id}`, navigate)}
                      >
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-4 w-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-medium truncate">{contact.name}</p>
                            {contact.role && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1.5">{contact.role}</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {contact.phone || contact.email || contact.deal_title}
                          </p>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setUnlinkContactConfirm(contact); }}
                          className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 text-muted-foreground hover:text-red-500 transition-all shrink-0"
                          title="Desvincular contato"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </div>
                    ))}
                    {/* Deal em comum */}
                    {linkedData.deals.length > 0 && (
                      <div className="pt-2 border-t">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Negociação</p>
                        {linkedData.deals.map((deal) => (
                          <div
                            key={deal.id}
                            className="flex items-center justify-between text-xs py-1 cursor-pointer hover:text-blue-600"
                            onClick={(e) => navigateTo(e, `/comercial/deals/${deal.id}`, navigate)}
                          >
                            <span className="truncate">{deal.title}</span>
                            <span className="text-muted-foreground shrink-0 ml-2">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(deal.negotiated_price || 0)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })()}

            {/* Tasks Card */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-blue-500" />
                    Tarefas
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Popover open={quickFuOpen} onOpenChange={(open) => {
                      setQuickFuOpen(open);
                      if (open) {
                        setQuickFuTitle(`Follow-up ${lead?.name?.split(" ")[0] || "Lead"}`);
                        setQuickFuWhen(0);
                        setTimeout(() => quickFuInputRef.current?.select(), 100);
                      }
                    }}>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50 gap-1 h-7 text-xs">
                          <Zap className="h-3.5 w-3.5" />
                          Follow-up
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 p-3">
                        <div className="space-y-2">
                          <Input
                            ref={quickFuInputRef}
                            value={quickFuTitle}
                            onChange={(e) => setQuickFuTitle(e.target.value)}
                            placeholder="Título do follow-up"
                            className="h-8 text-sm"
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && id && teamMember) {
                                const title = quickFuTitle.trim() || `Follow-up ${lead?.name?.split(" ")[0] || "Lead"}`;
                                const scheduledDate = addDays(new Date(), quickFuWhen);
                                scheduledDate.setHours(9, 0, 0, 0);
                                createTaskMut.mutate({
                                  title, description: "", task_type: "follow_up", priority: "medium", team: "sales",
                                  assigned_to: teamMember.id, lead_id: id, scheduled_at: scheduledDate.toISOString(),
                                }, { onSuccess: () => { toast({ title: "Follow-up criado" }); setQuickFuOpen(false); setQuickFuTitle(""); } });
                              }
                            }}
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
                            disabled={createTaskMut.isPending}
                            onClick={() => {
                              if (!id || !teamMember) return;
                              const title = quickFuTitle.trim() || `Follow-up ${lead?.name?.split(" ")[0] || "Lead"}`;
                              const scheduledDate = addDays(new Date(), quickFuWhen);
                              scheduledDate.setHours(9, 0, 0, 0);
                              createTaskMut.mutate({
                                title, description: "", task_type: "follow_up", priority: "medium", team: "sales",
                                assigned_to: teamMember.id, lead_id: id, scheduled_at: scheduledDate.toISOString(),
                              }, { onSuccess: () => { toast({ title: "Follow-up criado" }); setQuickFuOpen(false); setQuickFuTitle(""); } });
                            }}
                          >
                            {createTaskMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 mr-1" />}
                            Criar Follow-up
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Button variant="ghost" size="sm" onClick={() => setIsCreateTaskOpen(true)}>+ Nova</Button>
                  </div>
                </div>
                {/* Tabs para filtrar */}
                <div className="flex gap-1 mt-2">
                  <Button
                    variant={taskFilter === 'pending' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setTaskFilter('pending')}
                  >
                    Pendentes ({pendingTasks.length})
                  </Button>
                  <Button
                    variant={taskFilter === 'completed' ? 'default' : 'ghost'}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setTaskFilter('completed')}
                  >
                    Concluídas ({completedTasks.length})
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="max-h-[400px] overflow-y-auto">
                <TaskList
                  tasks={taskFilter === 'pending' ? pendingTasks : completedTasks}
                  emptyMessage={taskFilter === 'pending' ? "Nenhuma tarefa pendente" : "Nenhuma tarefa concluída"}
                  clientName={lead.name}
                  clientPhone={lead.phone}
                  clientEmail={lead.email}
                />
              </CardContent>
            </Card>

            {/* Oportunidades (Deals) — sempre visível na sidebar */}
            {contactDeals && (
              <SidebarDeals
                deals={contactDeals}
                selectedDealId={activeDeal?.id || null}
                pipelineStages={pipelineStages}
                onSelectDeal={(dealId) => setSelectedDealIdState(dealId)}
                onCreateDeal={() => setIsCreateDealOpen(true)}
                onViewDeal={(deal) => {
                  setSelectedTimelineDeal(deal);
                  setIsDealDetailOpen(true);
                }}
                onEditDeal={(deal) => {
                  setSelectedDeal(deal);
                  setIsEditDealOpen(true);
                }}
                onReopenDeal={async (deal, targetStageId) => {
                  const targetStageName = pipelineStages?.find(s => s.id === targetStageId)?.name || '';
                  const currentStageName = currentPipelineStage?.name || '';
                  const statusLabel = deal.status === 'won' ? 'GANHA' : 'PERDIDA';
                  const confirmed = window.confirm(
                    `Esta oportunidade está marcada como ${statusLabel}.\n\nDeseja reabrir e mover para "${targetStageName}"?\n\nIsso será registrado na timeline.`
                  );
                  if (!confirmed) return;
                  try {
                    await supabase
                      .from('deals')
                      .update({
                        status: 'open',
                        won_at: null,
                        lost_at: null,
                        lost_reason: null,
                        pipeline_stage_id: targetStageId,
                        updated_at: new Date().toISOString(),
                      })
                      .eq('id', deal.id);
                    await logStageMove(deal.id, id!, `${currentStageName} (${statusLabel})`, targetStageName, allPipelines?.find(p => p.id === leadPipelineId)?.name);
                    queryClient.invalidateQueries({ queryKey: ['contact-deals', id] });
                    queryClient.invalidateQueries({ queryKey: ['pipeline-deals'] });
                    queryClient.invalidateQueries({ queryKey: ['client-timeline'] });
                    if (id) await updatePipelineStage.mutateAsync({ leadId: id, stageId: targetStageId });
                    toast({ title: "Oportunidade reaberta", description: `Movido para ${targetStageName}` });
                  } catch {
                    toast({ title: "Erro ao reabrir", variant: "destructive" });
                  }
                }}
                onConfigurePayment={(deal) => {
                  setSelectedDeal(deal);
                  setIsPaymentConfigOpen(true);
                }}
                onWinDeal={(deal) => {
                  setSelectedDeal(deal);
                  setIsWinDealOpen(true);
                }}
                onLoseDeal={(deal) => {
                  setSelectedDeal(deal);
                  setIsLoseDealOpen(true);
                }}
                onTransferPipeline={(deal) => {
                  setSelectedDeal(deal);
                  setIsTransferPipelineOpen(true);
                }}
                onAddContact={(dealId) => setManagingContactsDealId(dealId)}
                onDeleteDeal={(deal) => setDeleteDealConfirm(deal)}
                onRefundDeal={(deal) => {
                  setSelectedDeal(deal);
                  setIsRefundDealOpen(true);
                }}
              />
            )}

            {/* Score Reason */}
            {lead.sales_score_reason && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    Justificativa do Score
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{lead.sales_score_reason}</p>
                </CardContent>
              </Card>
            )}

            {/* Anexos/Prints do Lead */}
            {lead.attachments && lead.attachments.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-purple-500" />
                    Prints / Anexos ({lead.attachments.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-2">
                    {lead.attachments.map((url: string, index: number) => (
                      <a
                        key={index}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative group rounded-lg overflow-hidden border hover:border-purple-300 transition-colors"
                      >
                        <img
                          src={url}
                          alt={`Anexo ${index + 1}`}
                          className="w-full h-32 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <ExternalLink className="h-6 w-6 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column - Tabs */}
          <div className="lg:col-span-8 space-y-6">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
              <TabsList className="grid w-full grid-cols-6 h-12">
                <TabsTrigger value="timeline" className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="hidden sm:inline">Timeline</span>
                </TabsTrigger>
                <TabsTrigger value="comercial" className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  <span className="hidden sm:inline">Comercial</span>
                </TabsTrigger>
                <TabsTrigger value="mensagens" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden sm:inline">Mensagens</span>
                </TabsTrigger>
                <TabsTrigger value="interacoes" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  <span className="hidden sm:inline">Interações</span>
                </TabsTrigger>
                <TabsTrigger value="transactions" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  <span className="hidden sm:inline">Financeiro</span>
                </TabsTrigger>
                <TabsTrigger value="notas" className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4" />
                  <span className="hidden sm:inline">Notas</span>
                </TabsTrigger>
              </TabsList>

              {/* Comercial Tab */}
              <TabsContent value="comercial">
                <div className="space-y-6">
                  {/* Oportunidades movidas pra sidebar — só mantém participações secundárias */}

                      {/* Participação em outros deals como contato secundário (filtra os que já aparecem em contactDeals) */}
                      {dealParticipations && dealParticipations.filter((p: any) => !contactDeals?.some((d: any) => d.id === p.deal_id)).length > 0 && (
                        <div className="mt-6 pt-4 border-t">
                          <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                            <Users className="h-4 w-4" />
                            Participa como contato em {dealParticipations.filter((p: any) => !contactDeals?.some((d: any) => d.id === p.deal_id)).length} outra(s) negociação(ões)
                          </p>
                          <div className="space-y-2">
                            {dealParticipations.filter((p: any) => !contactDeals?.some((d: any) => d.id === p.deal_id)).map((participation: any) => (
                              <div
                                key={participation.id}
                                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                                onClick={(e) => navigateTo(e, `/comercial/deals/${participation.deal?.id}`, navigate)}
                              >
                                <div>
                                  <p className="font-medium text-sm">{participation.deal?.title || "Deal"}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {participation.role && (
                                      <Badge variant="secondary" className="text-xs mr-2">
                                        {participation.role}
                                      </Badge>
                                    )}
                                    {participation.deal?.pipeline_stage?.name || "Em negociação"}
                                  </p>
                                </div>
                                <div className="text-right">
                                  <p className="font-semibold text-sm">
                                    {new Intl.NumberFormat("pt-BR", {
                                      style: "currency",
                                      currency: "BRL",
                                    }).format(participation.deal?.negotiated_price || 0)}
                                  </p>
                                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                  {/* AI Lead Intelligence */}
                  <LeadIntelligencePanel
                    leadId={id || ""}
                    leadName={lead.name}
                    intelligence={(lead.ai_conversation_insights as any)?.full_intelligence}
                    rawInsights={lead.ai_conversation_insights as any}
                    lastAnalysisAt={lead.ai_last_analysis_at}
                  />

                  {/* Origens / Conversões */}
                  {leadConversions && leadConversions.length > 0 && (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Globe className="h-4 w-4 text-blue-500" />
                          Origens ({leadConversions.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-muted/50">
                              <tr>
                                <th className="text-left p-2 font-medium text-xs">Data</th>
                                <th className="text-left p-2 font-medium text-xs">Origem</th>
                                <th className="text-left p-2 font-medium text-xs">Campanha</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {leadConversions.map((conv: any) => (
                                <tr key={conv.id} className="hover:bg-muted/30">
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {format(new Date(conv.created_at), "dd/MM/yy", { locale: ptBR })}
                                  </td>
                                  <td className="p-2">
                                    <Badge variant="outline" className="text-[10px]">
                                      {conv.source || conv.utm_source || "—"}
                                    </Badge>
                                  </td>
                                  <td className="p-2 text-xs text-muted-foreground">
                                    {conv.utm_campaign || "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </TabsContent>

              {/* Notas Tab */}
              <TabsContent value="notas">
                <NotesList leadId={id} showAllFromLead maxHeight="600px" />
              </TabsContent>

              {/* Mensagens Tab (WhatsApp + Instagram) */}
              <TabsContent value="mensagens">
                <div className="space-y-4">
                  {/* Channel Toggle */}
                  <div className="flex items-center gap-2">
                    <div className="flex rounded-lg border p-0.5 bg-muted/50">
                      <button
                        onClick={() => setMsgChannel("whatsapp")}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-md transition-colors",
                          msgChannel === "whatsapp" ? "bg-white shadow-sm font-medium text-green-700" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MessageSquare className="h-3.5 w-3.5 inline mr-1.5" />
                        WhatsApp
                      </button>
                      <button
                        onClick={() => setMsgChannel("instagram")}
                        className={cn(
                          "px-3 py-1.5 text-sm rounded-md transition-colors",
                          msgChannel === "instagram" ? "bg-white shadow-sm font-medium text-pink-700" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Instagram className="h-3.5 w-3.5 inline mr-1.5" />
                        Instagram
                      </button>
                    </div>
                    {msgChannel === "whatsapp" && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsScheduleMessageOpen(true)}
                          className="border-blue-200 hover:bg-blue-50"
                        >
                          <Clock className="h-4 w-4 mr-2 text-blue-500" />
                          Agendar Msg
                        </Button>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleScheduleMeetingFromChat}
                                disabled={isExtractingMeeting}
                                className="border-green-200 hover:bg-green-50"
                              >
                                {isExtractingMeeting ? <Loader2 className="h-4 w-4 mr-2 animate-spin text-green-500" /> : <Video className="h-4 w-4 mr-2 text-green-500" />}
                                Reunião
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Cria reunião no CRM com link do Google Meet.</p>
                              <p>O convite vai automaticamente para a agenda do closer e do lead.</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <div className="ml-auto">
                          <AIAgentBadge leadId={whatsappLead?.id || id!} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* WhatsApp Content */}
                  {msgChannel === "whatsapp" && (
                    <WhatsAppChat
                      contactName={lead.name}
                      contactPhone={lead.phone}
                      leadId={whatsappLead?.id || id}
                      instanceId={undefined}
                      className="h-[500px]"
                      initialMessage={draftMessage}
                      availableInstances={commercialInstances}
                    />
                  )}

                  {/* Instagram Content */}
                  {msgChannel === "instagram" && (
                    <>
                      <LeadInstagramChat
                        leadId={lead.id}
                        instagramUsername={lead.instagram?.replace(/^@/, '')}
                        instagramId={lead.instagram_id}
                      />

                      {instagramProfile ? (
                        <Card>
                          <CardContent className="p-4">
                            <div className="flex items-center gap-4">
                              <img
                                src={instagramProfile.stored_profile_picture_url || instagramProfile.profile_picture_url_hd}
                                alt={instagramProfile.username}
                                className="w-14 h-14 rounded-full object-cover border-2 border-pink-500 flex-shrink-0"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-semibold text-sm">@{instagramProfile.username}</span>
                                  {instagramProfile.is_verified && (
                                    <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0">Verificado</Badge>
                                  )}
                                  <a
                                    href={`https://instagram.com/${instagramProfile.username}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-pink-500 hover:text-pink-600 ml-auto"
                                  >
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </div>
                                <p className="text-xs text-muted-foreground truncate">{instagramProfile.full_name}</p>
                                <div className="flex gap-4 mt-1.5 text-xs">
                                  <span><strong>{(instagramProfile.media_count || 0).toLocaleString()}</strong> Posts</span>
                                  <span><strong>{(instagramProfile.follower_count || 0).toLocaleString()}</strong> Seg</span>
                                  <span><strong>{(instagramProfile.following_count || 0).toLocaleString()}</strong> Seg</span>
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ) : (
                        <Card>
                          <CardContent className="p-6">
                            <div className="text-center py-4 text-muted-foreground">
                              <Instagram className="h-10 w-10 mx-auto mb-2 opacity-30" />
                              <p className="text-sm font-medium">Perfil do Instagram não vinculado</p>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {instagramStories && instagramStories.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Instagram className="h-4 w-4" />
                              Stories
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3">
                            <InstagramStoriesCarousel stories={instagramStories} />
                          </CardContent>
                        </Card>
                      )}

                      {instagramPosts && instagramPosts.length > 0 && (
                        <Card>
                          <CardHeader className="pb-2 pt-3 px-4">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Hash className="h-4 w-4" />
                              Posts Recentes
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="px-4 pb-3">
                            <div className="space-y-3">
                              {instagramPosts.map((post: any, index: number) => (
                                <button
                                  key={post.id}
                                  onClick={() => {
                                    setPostViewerIndex(index);
                                    setPostViewerOpen(true);
                                  }}
                                  className="flex gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors w-full text-left"
                                >
                                  <img
                                    src={post.stored_thumbnail_url || post.thumbnail_url}
                                    alt={post.caption?.substring(0, 50) || 'Post'}
                                    className="w-20 h-20 rounded-lg object-cover flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    {post.caption && (
                                      <p className="text-xs text-foreground line-clamp-2">
                                        {post.caption}
                                      </p>
                                    )}
                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                                      <span>{format(new Date(post.taken_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                                    </div>
                                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                                      <span>❤️ {(post.like_count || 0).toLocaleString()}</span>
                                      <span>💬 {(post.comment_count || 0).toLocaleString()}</span>
                                      {post.play_count > 0 && <span>▶️ {post.play_count.toLocaleString()}</span>}
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>

                            <PostViewerModal
                              posts={instagramPosts}
                              initialIndex={postViewerIndex}
                              open={postViewerOpen}
                              onClose={() => setPostViewerOpen(false)}
                            />
                          </CardContent>
                        </Card>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

              {/* Timeline Tab */}
              <TabsContent value="timeline">
                <TimelineView
                  timeline={timeline || []}
                  context="sales"
                  contactDeals={contactDeals}
                  clientTasks={clientTasks}
                  onEmailClick={(html, subject) => { setSelectedEmailHtml(html); setSelectedEmailSubject(subject); setIsEmailPreviewOpen(true); }}
                  onTaskClick={(task) => { setSelectedTimelineTask(task); setIsTaskDetailOpen(true); }}
                  onDealClick={(deal) => { setSelectedTimelineDeal(deal); setIsDealDetailOpen(true); }}
                  onDiagnosticClick={(metadata) => { setSelectedDiagnostic(metadata); setIsDiagnosticDetailOpen(true); }}
                  onCallClick={(call) => { setSelectedCall(call); setIsCallDetailOpen(true); }}
                  onMeetingClick={(meeting) => { setSelectedMeeting(meeting); setIsMeetingDetailOpen(true); }}
                  onNoteClick={(note) => { setSelectedNote(note); setIsNoteDetailOpen(true); }}
                  onInstagramClick={() => setActiveTab("instagram")}
                  onEventClick={(event) => { setSelectedTimelineEvent(event); setIsTimelineEventOpen(true); }}
                />
              </TabsContent>

              {/* Interações Tab (Calls + Meetings) */}
              <TabsContent value="interacoes">
                <div className="space-y-4">
                  <div className="flex rounded-lg border p-0.5 bg-muted/50 w-fit">
                    <button
                      onClick={() => setInteracoesTab("calls")}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition-colors",
                        interacoesTab === "calls" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Phone className="h-3.5 w-3.5 inline mr-1.5" />
                      Chamadas
                    </button>
                    <button
                      onClick={() => setInteracoesTab("meetings")}
                      className={cn(
                        "px-3 py-1.5 text-sm rounded-md transition-colors",
                        interacoesTab === "meetings" ? "bg-white shadow-sm font-medium" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      <Video className="h-3.5 w-3.5 inline mr-1.5" />
                      Reuniões
                    </button>
                  </div>
                  {interacoesTab === "calls" && (
                    <CallHistory leadId={id} leadIds={partnerLeadIds} limit={20} showTitle={false} />
                  )}
                  {interacoesTab === "meetings" && (
                    <MeetingHistory leadId={id} leadIds={partnerLeadIds} limit={20} showTitle={false} />
                  )}
                </div>
              </TabsContent>

              {/* Transactions Tab */}
              <TabsContent value="transactions">
                <div className="space-y-6">
                  {/* Financial Summary Cards */}
                  <FinancialSummaryCards leadId={id!} />

                  {/* Deal Payments */}
                  <Card>
                    <CardHeader className="pb-4">
                      <CardTitle className="flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-green-500" />
                        Pagamentos
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <DealPaymentsList leadId={id} />
                    </CardContent>
                  </Card>

                  {/* Financial Timeline */}
                  <FinancialTimeline leadId={id!} />

                  {/* Legacy Transactions - Only truly external (not linked to deals or deal_payments) */}
                  {(() => {
                    // Filtra apenas transações que NÃO vieram de deals ou deal_payments para evitar duplicação
                    const externalTransactions = transactions?.filter((tx: any) => !tx.deal_payment_id && !tx.deal_id) || [];
                    return externalTransactions.length > 0 && (
                    <Card>
                      <CardHeader className="pb-4">
                        <CardTitle className="flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-gray-500" />
                          Transacoes Externas
                        </CardTitle>
                        <p className="text-sm text-muted-foreground mt-1">Transacoes importadas de outros sistemas</p>
                      </CardHeader>
                      <CardContent>
                        <div className="divide-y">
                          {externalTransactions.map((tx: any, i: number) => (
                            <div key={tx.id || i} className="flex items-center justify-between py-4">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                                  <DollarSign className="h-5 w-5 text-green-600" />
                                </div>
                                <div>
                                  <p className="font-medium">{tx.product_name}</p>
                                  <p className="text-sm text-muted-foreground">
                                    {formatDate(tx.transaction_date)} • {tx.payment_method === 'CREDIT_CARD' ? 'Cartao' : tx.payment_method === 'bank_slip' ? 'Boleto' : tx.payment_method}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-green-600">
                                  R$ {convertTransactionAmount(tx.amount, tx.payment_method, tx.payment_platform).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                                <Badge className={cn(
                                  "border-0",
                                  (tx.status === 'approved' || tx.status === 'RECEIVED') && "bg-green-100 text-green-700",
                                  tx.status === 'pending' && "bg-yellow-100 text-yellow-700",
                                )}>
                                  {tx.status === 'approved' || tx.status === 'RECEIVED' ? 'Aprovado' : tx.status}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                  })()}

                </div>
              </TabsContent>

              {/* Conversions data moved to Comercial tab bottom - accessible via "Origens" section */}
            </Tabs>
          </div>
        </div>
      </div>

      {/* Sales AI Chat with Superpowers */}
      <SalesAIChat
        leadId={id}
        leadName={lead.name}
        leadPhone={lead.phone}
        leadEmail={lead.email}
        leadContext={{
          salesScore: salesScore,
          salesStage: salesStage,
          bant: bant,
          lastInteraction: lead.last_interaction_at,
          utm_source: lead.utm_source,
          utm_campaign: lead.utm_campaign,
        }}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        open={isCreateTaskOpen}
        onOpenChange={setIsCreateTaskOpen}
        defaultValues={{
          lead_id: id,
          lead_name: lead.name,
          team: 'sales',
        }}
      />

      {/* Task Detail Modal (from Timeline) */}
      <TaskDetailModal
        task={selectedTimelineTask}
        open={isTaskDetailOpen}
        onOpenChange={(open) => {
          setIsTaskDetailOpen(open);
          if (!open) setSelectedTimelineTask(null);
        }}
        clientName={lead.name}
        clientPhone={lead.phone}
        clientEmail={lead.email}
      />

      {/* Deal Detail Modal (from Timeline) */}
      <ViewDealModal
        open={isDealDetailOpen}
        onOpenChange={(open) => {
          setIsDealDetailOpen(open);
          if (!open) setTimeout(() => setSelectedTimelineDeal(null), 300);
        }}
        deal={selectedTimelineDeal}
      />

      {/* Call Detail Modal (from Timeline) */}
      <CallDetailModal
        open={isCallDetailOpen}
        onOpenChange={(open) => {
          setIsCallDetailOpen(open);
          if (!open) setSelectedCall(null);
        }}
        call={selectedCall}
        hideLeadLink
      />

      {/* Meeting Detail Modal (from Timeline) - Reutiliza CallDetailModal */}
      {selectedMeeting && (() => {
        // selectedMeeting é o metadata da timeline que contém todos os campos diretamente
        // ai_analysis/call_analysis estão no nível raiz do metadata
        const aiAnalysis = selectedMeeting.ai_analysis || selectedMeeting.call_analysis || selectedMeeting.meeting?.ai_analysis;
        const meetingAsCall = {
          id: selectedMeeting.meeting_id,
          direction: 'OUTGOING',
          status: selectedMeeting.status === 'no_show' ? 'NOT_ANSWERED' : 'ANSWERED',
          started_at: selectedMeeting.started_at,
          ended_at: selectedMeeting.ended_at,
          duration_seconds: selectedMeeting.started_at && selectedMeeting.ended_at 
            ? Math.floor((new Date(selectedMeeting.ended_at).getTime() - new Date(selectedMeeting.started_at).getTime()) / 1000)
            : 0,
          peer_name: lead?.name,
          lead_id: id,
          transcriptions: selectedMeeting.transcriptions || [],
          // Análise já salva
          metadata: {
            ai_analysis: aiAnalysis,
          },
          ai_summary: aiAnalysis?.diagnostico,
          ai_sentiment: aiAnalysis?.sentimento,
          ai_key_points: aiAnalysis?.pontos_chave,
          ai_suggested_tasks: aiAnalysis?.tarefas_sugeridas,
          // Flag para indicar que é meeting
          is_meeting: true,
          meeting_type: selectedMeeting.meeting_type,
          meeting_link: selectedMeeting.meeting_link,
        };
        return (
          <CallDetailModal
            open={isMeetingDetailOpen}
            onOpenChange={(open) => {
              setIsMeetingDetailOpen(open);
              if (!open) setSelectedMeeting(null);
            }}
            call={meetingAsCall}
            hideLeadLink
          />
        );
      })()}

      {/* Schedule Meeting Modal (from WhatsApp chat) */}
      <CreateTaskModal
        open={isScheduleMeetingFromChat}
        onOpenChange={setIsScheduleMeetingFromChat}
        defaultValues={{
          lead_id: id || "",
          lead_name: lead.name,
          team: 'sales',
          task_type: 'meeting',
          ...meetingDefaults,
        }}
      />

      {/* Schedule Message Modal */}
      <ScheduleMessageModal
        open={isScheduleMessageOpen}
        onOpenChange={setIsScheduleMessageOpen}
        leadId={id || ""}
        leadName={lead.name}
        leadPhone={lead.phone || ""}
        instanceId={teamMember?.whatsapp_instance_id}
      />

      {/* Create Deal Modal */}
      <CreateDealModal
        open={isCreateDealOpen}
        onOpenChange={setIsCreateDealOpen}
        leadId={id || ""}
        leadName={lead.name}
      />

      {/* Register Negotiation / Configure Payment Modal */}
      <RegisterNegotiationModal
        open={isPaymentConfigOpen}
        onOpenChange={(open) => {
          setIsPaymentConfigOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal || {}}
        leadCpfCnpj={lead.cpf_cnpj}
      />

      {/* Win Deal Modal */}
      <WinDealModal
        open={isWinDealOpen}
        onOpenChange={(open) => {
          setIsWinDealOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal || {}}
      />

      {/* Edit Deal Modal */}
      <EditDealModal
        open={isEditDealOpen}
        onOpenChange={(open) => {
          setIsEditDealOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal}
      />

      {/* Transfer Pipeline Modal */}
      <TransferPipelineModal
        open={isTransferPipelineOpen}
        onOpenChange={(open) => {
          setIsTransferPipelineOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal || {}}
      />

      {/* Lose Deal Modal */}
      <LoseDealModal
        open={isLoseDealOpen}
        onOpenChange={(open) => {
          setIsLoseDealOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal || {}}
      />

      <CancelRefundModal
        open={isRefundDealOpen}
        onOpenChange={(open) => {
          setIsRefundDealOpen(open);
          if (!open) setTimeout(() => setSelectedDeal(null), 300);
        }}
        deal={selectedDeal || {}}
        leadId={id}
        mode="refund"
      />

      {/* Farming Reason Modal */}
      {id && (
        <FarmingReasonModal
          open={isFarmingReasonOpen}
          onOpenChange={setIsFarmingReasonOpen}
          leadId={id}
          leadName={lead?.name || "Lead"}
          farmingStageId={farmingTargetStageId || ""}
        />
      )}

      {/* Diagnostic Detail Modal */}
      <Dialog open={isDiagnosticDetailOpen} onOpenChange={(open) => {
        setIsDiagnosticDetailOpen(open);
        if (!open) setSelectedDiagnostic(null);
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <span>Diagnóstico de Qualificação</span>
                {selectedDiagnostic?.qualification_score && (
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={selectedDiagnostic.qualification_score} className="h-2 w-24" />
                    <span className="text-sm font-normal text-muted-foreground">
                      Score: {selectedDiagnostic.qualification_score}/100
                    </span>
                  </div>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedDiagnostic && (
            <ScrollArea className="max-h-[calc(90vh-140px)] pr-4">
              <div className="space-y-6 py-4">
                {/* Cards de destaque */}
                <div className="grid grid-cols-2 gap-3">
                  {selectedDiagnostic.monthly_revenue && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <DollarSign className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Faturamento</span>
                      </div>
                      <p className="text-sm font-semibold">{selectedDiagnostic.monthly_revenue}</p>
                    </div>
                  )}
                  {selectedDiagnostic.ai_knowledge_level && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Sparkles className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Nível IA</span>
                      </div>
                      <p className="text-sm font-semibold">{selectedDiagnostic.ai_knowledge_level}</p>
                    </div>
                  )}
                  {selectedDiagnostic.ai_course_experience && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <GraduationCap className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Curso IA</span>
                      </div>
                      <p className="text-sm font-semibold">{selectedDiagnostic.ai_course_experience}</p>
                    </div>
                  )}
                  {selectedDiagnostic.business_stage && (
                    <div className="p-3 rounded-lg border bg-card">
                      <div className="flex items-center gap-2 text-muted-foreground mb-1">
                        <Target className="h-4 w-4" />
                        <span className="text-xs font-medium uppercase tracking-wide">Objetivo</span>
                      </div>
                      <p className="text-sm font-semibold">{selectedDiagnostic.business_stage}</p>
                    </div>
                  )}
                </div>

                {/* Seções detalhadas */}
                <div className="space-y-4">
                  {selectedDiagnostic.business_description && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5" />
                        Sobre o Negócio
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.business_description}</p>
                    </div>
                  )}

                  {selectedDiagnostic.current_activity && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Briefcase className="h-3.5 w-3.5" />
                        Atividade Atual
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.current_activity}</p>
                    </div>
                  )}

                  {selectedDiagnostic.ai_challenges && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Desafios com IA
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.ai_challenges}</p>
                    </div>
                  )}

                  {selectedDiagnostic.ai_knowledge_detail && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Como Usa IA Hoje
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.ai_knowledge_detail}</p>
                    </div>
                  )}

                  {selectedDiagnostic.which_ai_course && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <GraduationCap className="h-3.5 w-3.5" />
                        Qual Curso de IA Fez
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.which_ai_course}</p>
                    </div>
                  )}

                  {selectedDiagnostic.time_consuming && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        O Que Consome Mais Tempo
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.time_consuming}</p>
                    </div>
                  )}

                  {selectedDiagnostic.motivation && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Heart className="h-3.5 w-3.5" />
                        Motivação
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.motivation}</p>
                    </div>
                  )}

                  {selectedDiagnostic.biggest_dream && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Maior Sonho
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.biggest_dream}</p>
                    </div>
                  )}

                  {selectedDiagnostic.immersion_content && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5" />
                        O Que Espera da Imersão
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.immersion_content}</p>
                    </div>
                  )}

                  {selectedDiagnostic.income_types && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <DollarSign className="h-3.5 w-3.5" />
                        Tipos de Renda
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.income_types}</p>
                    </div>
                  )}

                  {selectedDiagnostic.other_goal && (
                    <div>
                      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-2">
                        <Target className="h-3.5 w-3.5" />
                        Outro Objetivo
                      </h4>
                      <p className="text-sm leading-relaxed bg-muted/30 p-3 rounded-lg">{selectedDiagnostic.other_goal}</p>
                    </div>
                  )}

                  {/* Dados demográficos */}
                  {(selectedDiagnostic.age || selectedDiagnostic.gender) && (
                    <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                      {selectedDiagnostic.age && (
                        <div>
                          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Idade</h4>
                          <p className="text-sm">{selectedDiagnostic.age}</p>
                        </div>
                      )}
                      {selectedDiagnostic.gender && (
                        <div>
                          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">Gênero</h4>
                          <p className="text-sm">{selectedDiagnostic.gender}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      {/* NFSe / Billing Detail Modal */}
      <Dialog open={isTimelineEventOpen} onOpenChange={(open) => {
        setIsTimelineEventOpen(open);
        if (!open) setSelectedTimelineEvent(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                selectedTimelineEvent?.type === 'nfse' ? 'bg-purple-100' : selectedTimelineEvent?.type === 'palestra' ? 'bg-teal-100' : selectedTimelineEvent?.type === 'webinar' ? 'bg-cyan-100' : 'bg-orange-100'
              }`}>
                {selectedTimelineEvent?.type === 'nfse' ? (
                  <Receipt className="h-5 w-5 text-purple-600" />
                ) : selectedTimelineEvent?.type === 'palestra' ? (
                  <Mic className="h-5 w-5 text-teal-600" />
                ) : selectedTimelineEvent?.type === 'webinar' ? (
                  <Video className="h-5 w-5 text-cyan-600" />
                ) : (
                  <Send className="h-5 w-5 text-orange-600" />
                )}
              </div>
              <span>{selectedTimelineEvent?.title}</span>
            </DialogTitle>
          </DialogHeader>
          {selectedTimelineEvent && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-muted-foreground">{selectedTimelineEvent.description}</p>

              {/* Palestra form data */}
              {selectedTimelineEvent.type === 'palestra' && selectedTimelineEvent.metadata && (
                <div className="space-y-3 p-4 bg-teal-50 rounded-xl border border-teal-200">
                  <h4 className="text-sm font-semibold text-teal-800">Dados do Formulario</h4>
                  {selectedTimelineEvent.metadata.nome && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><User className="h-3.5 w-3.5" /> Nome</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.nome}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.empresa && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Building2 className="h-3.5 w-3.5" /> Empresa</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.empresa}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.whatsapp && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Phone className="h-3.5 w-3.5" /> WhatsApp</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.whatsapp}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.email && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Mail className="h-3.5 w-3.5" /> Email</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.email}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.detalhes && (
                    <div className="space-y-1.5">
                      <span className="text-sm text-muted-foreground flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Detalhes</span>
                      <div className="p-3 bg-white rounded-lg border text-sm whitespace-pre-wrap">
                        {selectedTimelineEvent.metadata.detalhes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Webinar detail card */}
              {selectedTimelineEvent.type === 'webinar' && selectedTimelineEvent.metadata && (
                <div className="space-y-3 p-4 bg-cyan-50 rounded-xl border border-cyan-200">
                  <h4 className="text-sm font-semibold text-cyan-800 flex items-center gap-2"><Video className="h-4 w-4" /> Dados do Webinario</h4>
                  {selectedTimelineEvent.metadata.quiz_name && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><FileText className="h-3.5 w-3.5" /> Quiz</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.quiz_name}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.event_topic && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Target className="h-3.5 w-3.5" /> Tema</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.event_topic}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.event_date && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> Data do Evento</span>
                      <span className="font-medium">{new Date(selectedTimelineEvent.metadata.event_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.headline && (
                    <div className="space-y-1.5">
                      <span className="text-sm text-muted-foreground flex items-center gap-2"><Sparkles className="h-3.5 w-3.5" /> Headline</span>
                      <div className="p-3 bg-white rounded-lg border text-sm">{selectedTimelineEvent.metadata.headline}</div>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.landing_page && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> Landing Page</span>
                      <a href={selectedTimelineEvent.metadata.landing_page} target="_blank" rel="noopener" className="font-medium text-cyan-600 hover:underline truncate max-w-[200px]">
                        {selectedTimelineEvent.metadata.landing_page.replace('https://', '')}
                      </a>
                    </div>
                  )}
                  {selectedTimelineEvent.metadata.utm_source && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-2"><ExternalLink className="h-3.5 w-3.5" /> Origem</span>
                      <span className="font-medium">{selectedTimelineEvent.metadata.utm_source}{selectedTimelineEvent.metadata.utm_campaign ? ` / ${selectedTimelineEvent.metadata.utm_campaign}` : ''}</span>
                    </div>
                  )}
                </div>
              )}

              {selectedTimelineEvent.amount && (
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <span className="text-sm font-medium">Valor</span>
                  <span className="text-lg font-bold">
                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(selectedTimelineEvent.amount)}
                  </span>
                </div>
              )}

              {selectedTimelineEvent.metadata?.parcela && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Parcela</span>
                  <span className="font-medium">{selectedTimelineEvent.metadata.parcela}</span>
                </div>
              )}

              {selectedTimelineEvent.metadata?.vencimento && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Vencimento</span>
                  <span className="font-medium">{selectedTimelineEvent.metadata.vencimento}</span>
                </div>
              )}

              {selectedTimelineEvent.metadata?.produto && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Produto</span>
                  <span className="font-medium">{selectedTimelineEvent.metadata.produto}</span>
                </div>
              )}

              {selectedTimelineEvent.metadata?.nfse_number && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Numero NFSe</span>
                  <span className="font-medium">#{selectedTimelineEvent.metadata.nfse_number}</span>
                </div>
              )}

              {selectedTimelineEvent.metadata?.pdf_url && (
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => window.open(selectedTimelineEvent.metadata.pdf_url, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Ver PDF da NFSe
                </Button>
              )}

              {selectedTimelineEvent.metadata?.pix_sent && (
                <Badge variant="secondary" className="text-xs">
                  Botao PIX enviado junto
                </Badge>
              )}

              {selectedTimelineEvent.metadata?.message && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Mensagem enviada</span>
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200 text-sm whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {selectedTimelineEvent.metadata.message}
                  </div>
                </div>
              )}

              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(selectedTimelineEvent.date).toLocaleDateString('pt-BR', {
                  day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Note Detail Modal */}
      <Dialog open={isNoteDetailOpen} onOpenChange={(open) => {
        setIsNoteDetailOpen(open);
        if (!open) setSelectedNote(null);
      }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
                <StickyNote className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <span>Detalhes da Nota</span>
                {selectedNote?.note_type && (
                  <Badge variant="outline" className="ml-2 text-amber-600 border-amber-300">
                    {selectedNote.note_type === 'note' && '📝 Nota'}
                    {selectedNote.note_type === 'research' && '🔍 Pesquisa'}
                    {selectedNote.note_type === 'call_summary' && '📞 Resumo de Ligação'}
                    {selectedNote.note_type === 'objection' && '⚠️ Objeção'}
                    {selectedNote.note_type === 'follow_up' && '🔄 Follow-up'}
                    {selectedNote.note_type === 'meeting_notes' && '📋 Notas de Reunião'}
                  </Badge>
                )}
              </div>
            </DialogTitle>
          </DialogHeader>
          
          {selectedNote && (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                <p className="text-sm whitespace-pre-wrap">{selectedNote.content}</p>
              </div>
              
              <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-2">
                  {selectedNote.creator?.name && (
                    <>
                      <User className="h-3 w-3" />
                      <span>Por {selectedNote.creator.name}</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span>
                    {new Date(selectedNote.created_at).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Email Preview Modal */}
      <Dialog open={isEmailPreviewOpen} onOpenChange={(open) => {
        setIsEmailPreviewOpen(open);
        if (!open) { setSelectedEmailHtml(""); setSelectedEmailSubject(""); }
      }}>
        <DialogContent className="sm:max-w-[700px] max-h-[85vh] p-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                <Mail className="h-5 w-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <span className="block truncate">{selectedEmailSubject || "Email enviado"}</span>
                <span className="text-xs text-muted-foreground font-normal">Preview do email enviado ao lead</span>
              </div>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-auto" style={{ maxHeight: 'calc(85vh - 100px)' }}>
            <iframe
              srcDoc={selectedEmailHtml}
              title="Email Preview"
              className="w-full border-0"
              style={{ minHeight: '600px', height: '100%' }}
              sandbox="allow-same-origin"
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Deal Confirmation */}
      <AlertDialog
        open={!!deleteDealConfirm}
        onOpenChange={(open) => { if (!open) { setDeleteDealConfirm(null); document.body.style.pointerEvents = ''; setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Deal</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este deal? Esta acao nao pode ser desfeita.
              {deleteDealConfirm && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <p className="font-medium">{deleteDealConfirm.product?.name || "Deal"}</p>
                  <p className="text-sm">
                    Valor: {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(deleteDealConfirm.negotiated_price || 0)}
                  </p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!deleteDealConfirm) return;
                try {
                  await deleteDeal.mutateAsync(deleteDealConfirm.id);
                  toast({ title: "Deal excluido com sucesso" });
                  setDeleteDealConfirm(null);
                } catch {
                  toast({ title: "Erro ao excluir deal", variant: "destructive" });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Lead Confirmation */}
      <AlertDialog open={deleteLeadConfirm} onOpenChange={setDeleteLeadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Lead</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este lead? Todas as mensagens, tarefas e dados associados serão removidos. Esta ação não pode ser desfeita.
              {lead && (
                <div className="mt-2 p-3 bg-muted rounded-lg">
                  <p className="font-medium">{lead.name}</p>
                  <p className="text-sm text-muted-foreground">{lead.phone || lead.email || ''}</p>
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!id) return;
                try {
                  await deleteLead.mutateAsync(id);
                  toast({ title: "Lead excluído com sucesso" });
                  navigate('/comercial/leads');
                } catch {
                  toast({ title: "Erro ao excluir lead", variant: "destructive" });
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unlink Contact Confirmation */}
      <AlertDialog open={!!unlinkContactConfirm} onOpenChange={(open) => { if (!open) setUnlinkContactConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desvincular Contato</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desvincular "{unlinkContactConfirm?.name}" deste lead?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={async () => {
                if (!unlinkContactConfirm || !id) return;
                try {
                  await unlinkContact.mutateAsync({ ...unlinkContactConfirm, currentLeadId: id });
                  toast({ title: "Contato desvinculado" });
                  setUnlinkContactConfirm(null);
                } catch {
                  toast({ title: "Erro ao desvincular", variant: "destructive" });
                }
              }}
            >
              Desvincular
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Manage Deal Contacts Modal */}
      <Dialog open={!!managingContactsDealId} onOpenChange={(open) => { if (!open) { setManagingContactsDealId(null); document.body.style.pointerEvents = ''; setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Gerenciar Decisores / Contatos
            </DialogTitle>
            <DialogDescription>
              Adicione decisores, influenciadores e outros contatos a esta negociação.
            </DialogDescription>
          </DialogHeader>
          {managingContactsDealId && (
            <DealContactsTab dealId={managingContactsDealId} primaryLeadId={id} />
          )}
        </DialogContent>
      </Dialog>

      {/* Merge Lead Modal */}
      {lead && (
        <MergeLeadsModal
          open={isMergeLeadOpen}
          onOpenChange={setIsMergeLeadOpen}
          lead={lead}
        />
      )}

      {/* Edit Lead Modal */}
      <Dialog open={isEditLeadOpen} onOpenChange={setIsEditLeadOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Editar Lead
            </DialogTitle>
            <DialogDescription>
              Atualize as informações do lead abaixo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome</Label>
                <Input
                  id="edit-name"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email</Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Telefone</Label>
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="5511999999999"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-instagram">Instagram</Label>
                <Input
                  id="edit-instagram"
                  value={editForm.instagram}
                  onChange={(e) => setEditForm({ ...editForm, instagram: e.target.value })}
                  placeholder="@usuario"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-region">Região</Label>
              <Input
                id="edit-region"
                value={editForm.region}
                onChange={(e) => setEditForm({ ...editForm, region: e.target.value })}
                placeholder="Cidade - UF"
              />
            </div>
            {/* Campos B2B - Empresa */}
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Dados da Empresa (B2B)
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-company">Empresa</Label>
                  <Input
                    id="edit-company"
                    value={editForm.company_name}
                    onChange={(e) => setEditForm({ ...editForm, company_name: e.target.value })}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-job-title">Cargo</Label>
                  <Input
                    id="edit-job-title"
                    value={editForm.job_title}
                    onChange={(e) => setEditForm({ ...editForm, job_title: e.target.value })}
                    placeholder="CEO, Gerente, etc."
                  />
                </div>
              </div>
            </div>
            <div className="border-t pt-4 mt-2">
              <p className="text-sm font-medium text-muted-foreground mb-3">Origem (UTMs)</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="edit-utm-source" className="text-xs">Source</Label>
                  <Input
                    id="edit-utm-source"
                    value={editForm.utm_source}
                    onChange={(e) => setEditForm({ ...editForm, utm_source: e.target.value })}
                    placeholder="instagram"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-utm-campaign" className="text-xs">Campaign</Label>
                  <Input
                    id="edit-utm-campaign"
                    value={editForm.utm_campaign}
                    onChange={(e) => setEditForm({ ...editForm, utm_campaign: e.target.value })}
                    placeholder="linkbio"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-utm-content" className="text-xs">Content</Label>
                  <Input
                    id="edit-utm-content"
                    value={editForm.utm_content}
                    onChange={(e) => setEditForm({ ...editForm, utm_content: e.target.value })}
                    placeholder="banner1"
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditLeadOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveLeadInfo} disabled={updateLeadInfo.isPending}>
              {updateLeadInfo.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Page wrapper (keeps backward compatibility)
const SalesLeadDetail = () => {
  const { id } = useParams<{ id: string }>();
  return (
    <AppLayout>
      <SalesLeadDetailContent leadId={id!} />
    </AppLayout>
  );
};

export default SalesLeadDetail;
