import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Building2,
  Phone,
  Mail,
  ExternalLink,
  Package,
  DollarSign,
  Heart,
  Activity,
  MessageSquare,
  CheckCircle,
  AlertCircle,
  Clock,
  CheckCircle2,
  ListTodo,
  Plus,
  Instagram,
  Handshake,
  Target,
  Users,
  GitBranch,
  Megaphone,
  Link2,
  Crown,
  UserPlus,
  Zap,
  Loader2,
  CheckCheck,
  ChevronDown,
} from "lucide-react";
import { format, formatDistanceToNow, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadById } from "@/hooks/useWhatsAppInbox";
import { useClientLTV } from "@/hooks/useTransactions";
import { useLeadTasks, useCreateTask } from "@/hooks/useTasks";
import { useAuth } from "@/contexts/AuthContext";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLeadDeals, useLinkedContacts, useAddDealContact, CONTACT_ROLES } from "@/hooks/useDealContacts";
import { useContactDeals, useMoveDealStage } from "@/hooks/useSalesDeals";
import { useContactPhoto } from "@/hooks/useContactPhoto";
import { ConversationNotes } from "./ConversationNotes";
import { TaskList } from "@/components/tasks/TaskList";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { InboxConversation } from "@/hooks/useCSInbox";
import { useMarkAsHandled, useUnmarkAsHandled } from "@/hooks/useCSInbox";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useUpdateLeadPipelineStage } from "@/hooks/useSalesLeads";

interface ClientInfoPanelProps {
  conversation: InboxConversation | null;
  currentUserId?: string;
  instanceId?: string;
}

export function ClientInfoPanel({ conversation, currentUserId, instanceId }: ClientInfoPanelProps) {
  const { data: lead } = useLeadById(conversation?.lead_id || undefined);
  const { data: ltvData } = useClientLTV(conversation?.lead_id || undefined);
  const { data: tasks = [] } = useLeadTasks(conversation?.lead_id || undefined);
  const { data: dealParticipations } = useLeadDeals(conversation?.lead_id || undefined);
  const { data: linkedData } = useLinkedContacts(conversation?.lead_id || undefined);
  const addDealContact = useAddDealContact();
  const createTask = useCreateTask();
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [showQuickFollowUp, setShowQuickFollowUp] = useState(false);
  const [quickFollowUpTitle, setQuickFollowUpTitle] = useState("");
  const [quickFollowUpWhen, setQuickFollowUpWhen] = useState<"today" | "tomorrow" | "2days">("tomorrow");
  const quickFollowUpInputRef = useRef<HTMLInputElement>(null);
  const [showAddContactModal, setShowAddContactModal] = useState(false);
  const [contactPhone, setContactPhone] = useState("");
  const [foundLead, setFoundLead] = useState<{ id: string; name: string; phone: string; email: string | null; company_name: string | null } | null>(null);
  const [searchStatus, setSearchStatus] = useState<"idle" | "searching" | "found" | "not_found">("idle");
  const [newContact, setNewContact] = useState({ name: "", email: "", role: "" });
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [showStageSelector, setShowStageSelector] = useState(false);

  // Mark as handled
  const markAsHandled = useMarkAsHandled();
  const unmarkAsHandled = useUnmarkAsHandled();

  // Pipeline stages — usa deals para mostrar etapa por pipeline (não global do lead)
  const { data: contactDeals = [] } = useContactDeals(conversation?.lead_id || undefined);
  const moveDealStage = useMoveDealStage();
  // Deals ativos (não won/lost) com stage info
  const activeDeals = contactDeals.filter((d: any) => d.status !== 'won' && d.status !== 'lost' && d.pipeline_stage);
  // Fallback: usa lead global se não tem deals
  const leadPipelineId = activeDeals.length > 0 ? activeDeals[0]?.pipeline_stage?.pipeline_id : lead?.pipeline_stage?.pipeline_id;
  const { data: pipelineStages = [] } = usePipelineStages(leadPipelineId);
  const updatePipelineStage = useUpdateLeadPipelineStage();
  // State para carregar stages de um deal selecionado no mover
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const expandedDeal = activeDeals.find((d: any) => d.id === expandedDealId);
  const expandedDealPipelineId = expandedDeal?.pipeline_stage?.pipeline_id;
  const { data: expandedDealStages = [] } = usePipelineStages(expandedDealPipelineId);

  // Lazy fetch photo from UAZAPI if no photo exists
  const { data: contactDetails } = useContactPhoto(
    conversation?.contact_phone,
    conversation?.lead_id,
    instanceId,
    conversation?.lead_photo_url,
  );
  const photoUrl = conversation?.lead_photo_url || (conversation as any)?.photo_url || contactDetails?.photo_url;

  const pendingTasks = tasks.filter(t => !t.completed);

  const handleQuickFollowUp = async () => {
    if (!quickFollowUpTitle.trim()) return;
    const daysOffset = quickFollowUpWhen === "today" ? 0 : quickFollowUpWhen === "tomorrow" ? 1 : 2;
    const dueDate = addDays(new Date(), daysOffset);
    dueDate.setHours(9, 0, 0, 0);

    try {
      await createTask.mutateAsync({
        name: quickFollowUpTitle.trim(),
        task_type: "follow_up",
        team: "sales",
        priority: "medium",
        lead_id: conversation.lead_id || undefined,
        responsavel_id: teamMember?.id,
        scheduled_at: dueDate.toISOString(),
      });
      toast({ title: "Follow-up criado!", description: `${quickFollowUpTitle} - ${quickFollowUpWhen === "today" ? "hoje" : quickFollowUpWhen === "tomorrow" ? "amanhã" : "em 2 dias"}` });
      setShowQuickFollowUp(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  // Deal ID para vincular novos contatos
  const currentDealId = dealParticipations?.[0]?.deal_id || linkedData?.deals?.[0]?.id || null;

  // Buscar lead por telefone
  const handleSearchPhone = async (phone: string) => {
    setContactPhone(phone);
    setFoundLead(null);
    setSearchStatus("idle");

    const clean = phone.replace(/\D/g, "");
    if (clean.length < 8) return;

    setSearchStatus("searching");
    try {
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone, email, company_name")
        .or(`phone.ilike.%${clean}%,phone.ilike.%${clean.slice(-9)}%`)
        .limit(1);

      if (data && data.length > 0) {
        setFoundLead(data[0]);
        setSearchStatus("found");
      } else {
        setFoundLead(null);
        setSearchStatus("not_found");
      }
    } catch {
      setSearchStatus("not_found");
    }
  };

  // Vincular lead existente ao deal
  const handleLinkExistingLead = async () => {
    if (!foundLead || !currentDealId) return;
    setIsAddingContact(true);
    try {
      // Garantir lead atual como primário no deal_contacts
      const { data: existing } = await (supabase
        .from("deal_contacts" as any)
        .select("id")
        .eq("deal_id", currentDealId)
        .eq("lead_id", conversation?.lead_id) as any);

      if (!existing || existing.length === 0) {
        await addDealContact.mutateAsync({
          dealId: currentDealId,
          leadId: conversation!.lead_id!,
          role: "decisor",
          isPrimary: true,
        });
      }

      // Vincular lead encontrado
      await addDealContact.mutateAsync({
        dealId: currentDealId,
        leadId: foundLead.id,
        role: newContact.role || "outro",
      });

      toast({ title: `${foundLead.name} vinculado com sucesso!` });
      resetAddContactModal();
    } catch (err: any) {
      toast({ title: "Erro ao vincular", description: err?.message, variant: "destructive" });
    } finally {
      setIsAddingContact(false);
    }
  };

  // Criar novo lead e vincular
  const handleCreateAndLink = async () => {
    if (!newContact.name.trim() || !contactPhone.trim()) {
      toast({ title: "Nome e telefone são obrigatórios", variant: "destructive" });
      return;
    }

    setIsAddingContact(true);
    try {
      const cleanPhone = contactPhone.replace(/\D/g, "");
      const { data: newLead, error: createErr } = await supabase
        .from("leads")
        .insert({
          name: newContact.name.trim(),
          phone: cleanPhone,
          email: newContact.email.trim() || null,
          company_name: lead?.company_name || null,
          sales_stage: lead?.sales_stage || "new",
          utm_source: lead?.utm_source || null,
          utm_medium: lead?.utm_medium || null,
          utm_campaign: lead?.utm_campaign || null,
        })
        .select("id")
        .single();

      if (createErr || !newLead) throw createErr;

      if (currentDealId) {
        const { data: existing } = await (supabase
          .from("deal_contacts" as any)
          .select("id")
          .eq("deal_id", currentDealId)
          .eq("lead_id", conversation?.lead_id) as any);

        if (!existing || existing.length === 0) {
          await addDealContact.mutateAsync({
            dealId: currentDealId,
            leadId: conversation!.lead_id!,
            role: "decisor",
            isPrimary: true,
          });
        }

        await addDealContact.mutateAsync({
          dealId: currentDealId,
          leadId: newLead.id,
          role: newContact.role || "outro",
        });
      }

      toast({ title: `${newContact.name} criado e vinculado!` });
      resetAddContactModal();
    } catch (err: any) {
      toast({ title: "Erro ao criar contato", description: err?.message, variant: "destructive" });
    } finally {
      setIsAddingContact(false);
    }
  };

  const resetAddContactModal = () => {
    setShowAddContactModal(false);
    setContactPhone("");
    setFoundLead(null);
    setSearchStatus("idle");
    setNewContact({ name: "", email: "", role: "" });
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground bg-gray-50/50">
        <User className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">Nenhuma conversa selecionada</p>
        <p className="text-sm">Selecione uma conversa para ver os detalhes</p>
      </div>
    );
  }

  const isClient = !!conversation.organization_id;
  const healthColor =
    conversation.health_status === "risk"
      ? "text-red-500"
      : conversation.health_status === "alert"
      ? "text-amber-500"
      : conversation.health_status === "healthy"
      ? "text-green-500"
      : "text-gray-400";

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header Compacto */}
      <div className="p-4 border-b bg-gradient-to-b from-gray-50 to-white">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 border-2 border-white shadow-md">
            <AvatarImage src={photoUrl || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
              <User className="h-6 w-6" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate" data-sensitive="name">{conversation.conversation_name}</h3>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {isClient ? (
                <Badge className="h-5 text-[10px] bg-blue-600">
                  <Building2 className="h-3 w-3 mr-1" />
                  Cliente
                </Badge>
              ) : (
                <Badge variant="secondary" className="h-5 text-[10px]">
                  Lead
                </Badge>
              )}
              {activeDeals.length > 0 ? (
                activeDeals.map((deal: any) => (
                  <Badge
                    key={deal.id}
                    variant="outline"
                    className="h-5 text-[10px] gap-1"
                    style={deal.pipeline_stage?.color ? {
                      borderColor: deal.pipeline_stage.color,
                      color: deal.pipeline_stage.color,
                      backgroundColor: `${deal.pipeline_stage.color}15`,
                    } : undefined}
                  >
                    <GitBranch className="h-3 w-3" />
                    {deal.pipeline_stage?.name}
                  </Badge>
                ))
              ) : lead?.pipeline_stage?.name ? (
                <Badge
                  variant="outline"
                  className="h-5 text-[10px] gap-1"
                  style={lead.pipeline_stage.color ? {
                    borderColor: lead.pipeline_stage.color,
                    color: lead.pipeline_stage.color,
                    backgroundColor: `${lead.pipeline_stage.color}15`,
                  } : undefined}
                >
                  <GitBranch className="h-3 w-3" />
                  {lead.pipeline_stage.name}
                </Badge>
              ) : null}
              {conversation.health_score && (
                <Badge variant="outline" className={cn("h-5 text-[10px] gap-1", healthColor)}>
                  <Heart className="h-3 w-3" />
                  {conversation.health_score}
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Faturamento / Funcionários destaque — herda do lead principal se necessário */}
        {(() => {
          const pl = linkedData?.primaryLead;
          const hasVal = (v: any) => v != null && String(v).trim() !== "" && !/^n[aã]o\s*informad/i.test(String(v));
          const revenue = hasVal(lead?.monthly_revenue) ? lead?.monthly_revenue : hasVal(pl?.monthly_revenue) ? pl?.monthly_revenue : null;
          const employees = lead?.employee_count || pl?.employee_count || null;
          if (!revenue && !employees) return null;
          return (
            <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl border bg-gradient-to-r from-emerald-50 to-emerald-100/50 border-emerald-200/60">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                {revenue ? (
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Users className="h-4 w-4 text-emerald-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] text-emerald-600 font-medium leading-none">
                  {revenue ? "Faturamento" : "Funcionários"}
                </p>
                <p className="text-sm font-bold text-emerald-800 mt-0.5 line-clamp-2">
                  {revenue
                    ? (isNaN(Number(revenue))
                      ? String(revenue)
                      : formatCurrency(Number(revenue)))
                    : `${employees} funcionários`}
                </p>
              </div>
              {revenue && employees ? (
                <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 shrink-0">
                  <Users className="h-3 w-3 mr-1" />
                  {employees}
                </Badge>
              ) : null}
            </div>
          );
        })()}

        {/* Status Card */}
        <div className="mt-3 p-3 rounded-xl border bg-white shadow-sm">
          {/* Aguardando resposta */}
          {conversation.pending_reply && !conversation.is_handled && (
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                conversation.sla_status === "critical" ? "bg-red-100" :
                conversation.sla_status === "warning" ? "bg-amber-100" : "bg-blue-100"
              )}>
                <Clock className={cn(
                  "h-5 w-5",
                  conversation.sla_status === "critical" ? "text-red-600" :
                  conversation.sla_status === "warning" ? "text-amber-600" : "text-blue-600"
                )} />
              </div>
              <div>
                <p className={cn(
                  "font-semibold text-sm",
                  conversation.sla_status === "critical" ? "text-red-600" :
                  conversation.sla_status === "warning" ? "text-amber-600" : "text-blue-600"
                )}>
                  Aguardando há {conversation.wait_minutes != null && conversation.wait_minutes > 0 ? (
                    conversation.wait_minutes < 60
                      ? `${Math.floor(conversation.wait_minutes)}min`
                      : conversation.wait_minutes < 1440
                      ? `${Math.floor(conversation.wait_minutes / 60)}h ${Math.floor(conversation.wait_minutes % 60)}m`
                      : `${Math.floor(conversation.wait_minutes / 1440)} dias`
                  ) : "agora"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Última msg: {conversation.last_message_at && formatDistanceToNow(new Date(conversation.last_message_at), { addSuffix: true, locale: ptBR })}
                </p>
              </div>
            </div>
          )}

          {/* Resolvida */}
          {conversation.is_handled && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-green-600">Conversa resolvida</p>
                <p className="text-xs text-muted-foreground">
                  {conversation.handled_at && format(new Date(conversation.handled_at), "dd/MM 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            </div>
          )}

          {/* Respondido */}
          {!conversation.pending_reply && !conversation.is_handled && (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-green-600">Respondido</p>
                <p className="text-xs text-muted-foreground">Cliente não respondeu ainda</p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Info */}
        <div className="mt-3 space-y-1.5">
          {conversation.contact_phone && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-3.5 w-3.5 text-muted-foreground" />
              <span data-sensitive="phone">{conversation.contact_phone}</span>
            </div>
          )}
          {lead?.email && (
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="truncate" data-sensitive="email">{lead.email}</span>
            </div>
          )}
          {lead?.instagram && (
            <div className="flex items-center gap-2 text-sm">
              <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
              <span>@{lead.instagram}</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {conversation.lead_id && (
            <Button variant="outline" size="sm" className="flex-1 h-8" asChild>
              <Link to={`/comercial/leads/${conversation.lead_id}?from=inbox`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver Lead
              </Link>
            </Button>
          )}
          {conversation.organization_id && (
            <Button variant="outline" size="sm" className="flex-1 h-8" asChild>
              <Link to={`/clientes/${conversation.organization_id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver Cliente
              </Link>
            </Button>
          )}
        </div>

        {/* Quick Actions */}
        {conversation.lead_id && (
          <div className="flex gap-1.5 mt-2">
            <Popover open={showQuickFollowUp} onOpenChange={(open) => {
              setShowQuickFollowUp(open);
              if (open) {
                setQuickFollowUpTitle(`Follow-up ${conversation.conversation_name?.split(" ")[0] || "Lead"}`);
                setQuickFollowUpWhen("tomorrow");
                setTimeout(() => quickFollowUpInputRef.current?.select(), 100);
              }
            }}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-[11px] bg-yellow-50 dark:bg-yellow-950/30 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-950/50">
                  <Zap className="h-3 w-3 mr-1" />
                  Follow-up
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-2">
                  <Input
                    ref={quickFollowUpInputRef}
                    value={quickFollowUpTitle}
                    onChange={(e) => setQuickFollowUpTitle(e.target.value)}
                    placeholder="Título do follow-up"
                    className="h-8 text-sm"
                    onKeyDown={(e) => e.key === "Enter" && handleQuickFollowUp()}
                  />
                  <div className="flex gap-1">
                    {([["Hoje", "today"], ["Amanhã", "tomorrow"], ["2 dias", "2days"]] as const).map(([label, val]) => (
                      <button
                        key={val}
                        onClick={() => setQuickFollowUpWhen(val)}
                        className={cn(
                          "flex-1 text-xs py-1 px-2 rounded border transition-colors",
                          quickFollowUpWhen === val
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
                    Criar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-7 text-[11px] bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/50"
              onClick={() => setIsCreateTaskOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Tarefa
            </Button>
          </div>
        )}

        {/* Concluir conversa + Mover etapa */}
        {conversation && (
          <div className="mt-2 space-y-1.5">
            {/* Concluir / Reabrir conversa */}
            {conversation.is_handled ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs bg-gray-100 text-gray-600 hover:bg-gray-200"
                onClick={() => {
                  unmarkAsHandled.mutate(
                    { leadId: conversation.lead_id, groupJid: conversation.group_jid },
                    {
                      onSuccess: () => toast({ title: "Conversa reaberta" }),
                      onError: () => toast({ title: "Erro ao reabrir", variant: "destructive" }),
                    }
                  );
                }}
                disabled={unmarkAsHandled.isPending}
              >
                {unmarkAsHandled.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MessageSquare className="h-3.5 w-3.5 mr-1" />}
                Reabrir conversa
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-8 text-xs bg-green-50 text-green-700 hover:bg-green-100 border border-green-200"
                onClick={() => {
                  markAsHandled.mutate(
                    {
                      leadId: conversation.lead_id,
                      groupJid: conversation.group_jid,
                      handledBy: teamMember?.id,
                    },
                    {
                      onSuccess: () => toast({ title: "Conversa concluída" }),
                      onError: () => toast({ title: "Erro ao concluir", variant: "destructive" }),
                    }
                  );
                }}
                disabled={markAsHandled.isPending}
              >
                {markAsHandled.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <CheckCheck className="h-3.5 w-3.5 mr-1" />}
                Concluir conversa
              </Button>
            )}

            {/* Mover etapa do pipeline — um botão por deal ativo */}
            {activeDeals.length > 0 ? (
              activeDeals.map((deal: any) => (
                <Popover
                  key={deal.id}
                  open={expandedDealId === deal.id}
                  onOpenChange={(open) => setExpandedDealId(open ? deal.id : null)}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full h-8 text-xs justify-between border"
                      style={deal.pipeline_stage?.color ? {
                        borderColor: deal.pipeline_stage.color + '40',
                        backgroundColor: deal.pipeline_stage.color + '10',
                        color: deal.pipeline_stage.color,
                      } : undefined}
                    >
                      <span className="flex items-center gap-1.5 truncate">
                        <GitBranch className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{deal.pipeline_stage?.name}</span>
                        {activeDeals.length > 1 && deal.product?.name && (
                          <span className="text-[9px] opacity-60 truncate">({deal.product.name})</span>
                        )}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56 p-1.5">
                    <div className="space-y-0.5 max-h-60 overflow-y-auto">
                      {(expandedDealId === deal.id ? expandedDealStages : []).map((stage: any) => (
                        <button
                          key={stage.id}
                          className={cn(
                            "w-full text-left text-xs px-2.5 py-1.5 rounded flex items-center gap-2 transition-colors",
                            stage.id === deal.pipeline_stage_id
                              ? "bg-gray-100 font-medium"
                              : "hover:bg-gray-50"
                          )}
                          onClick={() => {
                            if (stage.id === deal.pipeline_stage_id) return;
                            moveDealStage.mutate(
                              { dealId: deal.id, stageId: stage.id },
                              {
                                onSuccess: () => {
                                  toast({ title: `Movido para "${stage.name}"` });
                                  setExpandedDealId(null);
                                },
                                onError: () => toast({ title: "Erro ao mover", variant: "destructive" }),
                              }
                            );
                          }}
                          disabled={moveDealStage.isPending}
                        >
                          <div
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: stage.color || '#94a3b8' }}
                          />
                          <span className="truncate">{stage.name}</span>
                          {stage.id === deal.pipeline_stage_id && (
                            <CheckCircle2 className="h-3 w-3 ml-auto text-green-600 shrink-0" />
                          )}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              ))
            ) : lead?.pipeline_stage && pipelineStages.length > 0 ? (
              <Popover open={showStageSelector} onOpenChange={setShowStageSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-8 text-xs justify-between border"
                    style={lead.pipeline_stage.color ? {
                      borderColor: lead.pipeline_stage.color + '40',
                      backgroundColor: lead.pipeline_stage.color + '10',
                      color: lead.pipeline_stage.color,
                    } : undefined}
                  >
                    <span className="flex items-center gap-1.5">
                      <GitBranch className="h-3.5 w-3.5" />
                      {lead.pipeline_stage.name}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-56 p-1.5">
                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                    {pipelineStages.map((stage: any) => (
                      <button
                        key={stage.id}
                        className={cn(
                          "w-full text-left text-xs px-2.5 py-1.5 rounded flex items-center gap-2 transition-colors",
                          stage.id === lead.pipeline_stage_id
                            ? "bg-gray-100 font-medium"
                            : "hover:bg-gray-50"
                        )}
                        onClick={() => {
                          if (stage.id === lead.pipeline_stage_id) return;
                          updatePipelineStage.mutate(
                            { leadId: lead.id, stageId: stage.id },
                            {
                              onSuccess: () => {
                                toast({ title: `Movido para "${stage.name}"` });
                                setShowStageSelector(false);
                              },
                              onError: () => toast({ title: "Erro ao mover", variant: "destructive" }),
                            }
                          );
                        }}
                        disabled={updatePipelineStage.isPending}
                      >
                        <div
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: stage.color || '#94a3b8' }}
                        />
                        <span className="truncate">{stage.name}</span>
                        {stage.id === lead.pipeline_stage_id && (
                          <CheckCircle2 className="h-3 w-3 ml-auto text-green-600 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        )}
      </div>

      {/* Contatos Vinculados + Botão de adicionar */}
      {conversation.lead_id && (currentDealId || (linkedData && linkedData.linkedContacts.length > 0)) && (
        <div className="mx-4 mb-2 p-3 rounded-xl border border-indigo-200/60 bg-gradient-to-r from-indigo-50/50 to-violet-50/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5">
              <Link2 className="h-3.5 w-3.5 text-indigo-600" />
              <span className="text-xs font-semibold text-indigo-700 uppercase tracking-wide">
                Contatos da negociação
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-[10px] text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100"
              onClick={() => setShowAddContactModal(true)}
            >
              <UserPlus className="h-3 w-3 mr-1" />
              Adicionar
            </Button>
          </div>

          {/* Lead principal (se este lead não for o principal) */}
          {linkedData?.primaryLead && (
            <Link
              to={`/comercial/leads/${linkedData.primaryLead.id}?from=inbox`}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-white/70 border border-indigo-100 hover:bg-white transition-colors mb-1.5"
            >
              <div className="relative">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-indigo-100 text-indigo-700 text-xs font-bold">
                    {linkedData.primaryLead.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <Crown className="h-3 w-3 text-amber-500 absolute -top-0.5 -right-0.5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{linkedData.primaryLead.name}</p>
                  <Badge className="h-4 text-[9px] px-1.5 bg-amber-100 text-amber-700 border-0">Decisor</Badge>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {linkedData.primaryLead.company_name || linkedData.primaryLead.phone || ""}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            </Link>
          )}

          {/* Outros contatos vinculados */}
          {linkedData?.linkedContacts
            ?.filter(c => c.lead_id !== linkedData.primaryLead?.id)
            .map((contact) => (
            <Link
              key={contact.lead_id}
              to={`/comercial/leads/${contact.lead_id}?from=inbox`}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-white/70 border border-indigo-100 hover:bg-white transition-colors mb-1.5"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="bg-violet-100 text-violet-700 text-xs font-bold">
                  {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  {contact.role && (
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                      {CONTACT_ROLES.find(r => r.value === contact.role)?.label || contact.role}
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground truncate">
                  {contact.phone || contact.email || contact.deal_title}
                </p>
              </div>
              <ExternalLink className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            </Link>
          ))}

          {/* Sem contatos ainda */}
          {(!linkedData?.linkedContacts || linkedData.linkedContacts.length === 0) && !linkedData?.primaryLead && (
            <p className="text-[11px] text-indigo-500 italic px-1">
              Nenhum contato vinculado ainda
            </p>
          )}

          {/* Empresa compartilhada */}
          {(linkedData?.primaryLead?.company_name || lead?.company_name) && linkedData?.linkedContacts && linkedData.linkedContacts.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1 px-1">
              <Building2 className="h-3 w-3 text-indigo-500" />
              <span className="text-[10px] text-indigo-600 font-medium">
                Mesma empresa: {linkedData.primaryLead?.company_name || lead?.company_name}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue="info" className="flex-1 flex flex-col overflow-hidden">
        <TabsList className="w-full justify-start rounded-none border-b px-2 h-10 bg-gray-50/50">
          <TabsTrigger value="info" className="text-xs data-[state=active]:bg-white">
            <Activity className="h-3.5 w-3.5 mr-1.5" />
            Info
          </TabsTrigger>
          <TabsTrigger value="tasks" className="text-xs data-[state=active]:bg-white">
            <ListTodo className="h-3.5 w-3.5 mr-1.5" />
            Tarefas
            {pendingTasks.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                {pendingTasks.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-white">
            <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
            Notas
          </TabsTrigger>
        </TabsList>

        {/* Info Tab */}
        <TabsContent value="info" className="flex-1 m-0 overflow-y-auto">
          <div className="p-4 space-y-4">
            {/* Qualificação — usa dados do lead principal se este lead não tiver */}
            {(lead || linkedData?.primaryLead) && (() => {
              const pl = linkedData?.primaryLead;
              // Tratar "não informado", "N/A", strings vazias como null
              const hasValue = (v: any) => v != null && String(v).trim() !== "" && !/^n[aã]o\s*informad/i.test(String(v)) && String(v).toLowerCase() !== "n/a";
              const pick = (own: any, fallback: any) => hasValue(own) ? own : hasValue(fallback) ? fallback : null;
              const effectiveLead = {
                company_name: pick(lead?.company_name, pl?.company_name),
                employee_count: pick(lead?.employee_count, pl?.employee_count),
                monthly_revenue: pick(lead?.monthly_revenue, pl?.monthly_revenue),
                challenges: pick(lead?.challenges, pl?.challenges),
              };
              const isFromPrimary = !hasValue(lead?.company_name) && hasValue(pl?.company_name);
              return (
              <div>
                <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                  <Target className="h-3.5 w-3.5" />
                  Qualificação
                  {isFromPrimary && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-indigo-200 text-indigo-600 bg-indigo-50 ml-1">
                      <Link2 className="h-2.5 w-2.5 mr-0.5" />
                      via {pl?.name?.split(" ")[0]}
                    </Badge>
                  )}
                </h4>
                <div className="space-y-1.5">
                  {[
                    { icon: Building2, label: 'Empresa', value: effectiveLead.company_name, color: 'blue' },
                    { icon: Users, label: 'Funcionários', value: effectiveLead.employee_count ? `${effectiveLead.employee_count} funcionários` : null, color: 'purple' },
                    { icon: DollarSign, label: 'Faturamento', value: effectiveLead.monthly_revenue, color: 'emerald' },
                    { icon: Target, label: 'Desafios', value: effectiveLead.challenges, color: 'amber' },
                  ].map(({ icon: Icon, label, value, color }) => (
                    <div
                      key={label}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-sm",
                        value
                          ? `bg-${color}-50/50 border-${color}-200/60`
                          : "bg-muted/30 border-muted-foreground/10"
                      )}
                    >
                      <div className={cn(
                        "w-6 h-6 rounded-full flex items-center justify-center shrink-0",
                        value ? `bg-${color}-100 text-${color}-600` : "bg-muted text-muted-foreground/40"
                      )}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] text-muted-foreground leading-none">{label}</p>
                        <p className={cn(
                          "text-xs truncate mt-0.5",
                          value ? "text-foreground font-medium" : "text-muted-foreground/50 italic"
                        )}>
                          {value || "Não informado"}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Mini progress */}
                {(() => {
                  const filled = [effectiveLead.company_name, effectiveLead.employee_count, effectiveLead.monthly_revenue, effectiveLead.challenges].filter(Boolean).length;
                  return (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            filled >= 3 ? "bg-emerald-500" : filled >= 2 ? "bg-amber-500" : "bg-slate-400"
                          )}
                          style={{ width: `${(filled / 4) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">{filled}/4</span>
                    </div>
                  );
                })()}
              </div>
              );
            })()}

            {/* UTMs — usa dados do lead principal se este não tiver */}
            {(() => {
              const pl = linkedData?.primaryLead;
              const utmSource = lead?.utm_source || pl?.utm_source;
              const utmMedium = lead?.utm_medium || pl?.utm_medium;
              const utmCampaign = lead?.utm_campaign || pl?.utm_campaign;
              const utmContent = (lead as any)?.utm_content;
              const utmTerm = (lead as any)?.utm_term;
              const hasUtm = utmSource || utmMedium || utmCampaign;
              const isFromPrimary = !lead?.utm_source && !!pl?.utm_source;

              if (!hasUtm) return null;
              return (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                      <Megaphone className="h-3.5 w-3.5" />
                      Origem (UTM)
                      {isFromPrimary && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-indigo-200 text-indigo-600 bg-indigo-50 ml-1">
                          <Link2 className="h-2.5 w-2.5 mr-0.5" />
                          via {pl?.name?.split(" ")[0]}
                        </Badge>
                      )}
                    </h4>
                    <div className="space-y-1">
                      {[
                        { label: "Source", value: utmSource },
                        { label: "Medium", value: utmMedium },
                        { label: "Campaign", value: utmCampaign },
                        { label: "Content", value: utmContent },
                        { label: "Term", value: utmTerm },
                      ].filter(item => item.value).map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-md bg-orange-50/50 border border-orange-200/40">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-medium text-orange-800 truncate ml-2 max-w-[120px]">{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}

            {/* Instagram */}
            {lead?.instagram_profile && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <Instagram className="h-3.5 w-3.5" />
                    Instagram
                  </h4>
                  <div className="space-y-2">
                    {/* Bio */}
                    {lead.instagram_profile.biography && (
                      <p className="text-xs text-muted-foreground leading-relaxed bg-muted/30 p-2.5 rounded-lg border border-muted-foreground/10 italic">
                        "{lead.instagram_profile.biography}"
                      </p>
                    )}
                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-2">
                      {lead.instagram_profile.follower_count != null && (
                        <div className="p-2 bg-pink-50/50 rounded-lg border border-pink-200/60 text-center">
                          <p className="text-sm font-bold text-pink-700">
                            {lead.instagram_profile.follower_count >= 1000
                              ? `${(lead.instagram_profile.follower_count / 1000).toFixed(1)}k`
                              : lead.instagram_profile.follower_count}
                          </p>
                          <p className="text-[10px] text-pink-600">Seguidores</p>
                        </div>
                      )}
                      {lead.instagram_profile.following_count != null && (
                        <div className="p-2 bg-purple-50/50 rounded-lg border border-purple-200/60 text-center">
                          <p className="text-sm font-bold text-purple-700">
                            {lead.instagram_profile.following_count >= 1000
                              ? `${(lead.instagram_profile.following_count / 1000).toFixed(1)}k`
                              : lead.instagram_profile.following_count}
                          </p>
                          <p className="text-[10px] text-purple-600">Seguindo</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Products */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                <Package className="h-3.5 w-3.5" />
                Produtos
              </h4>
              {conversation.lead_products && conversation.lead_products.length > 0 ? (
                <div className="space-y-1.5">
                  {conversation.lead_products.map((product, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 bg-green-50 rounded-lg text-sm border border-green-100">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-green-800">{product}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground italic">Nenhum produto</p>
              )}
            </div>

            {/* Deals / Participações */}
            {dealParticipations && dealParticipations.length > 0 && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <Handshake className="h-3.5 w-3.5" />
                    Negociações
                  </h4>
                  <div className="space-y-1.5">
                    {dealParticipations.map((p: any) => (
                      <Link
                        key={p.id}
                        to={`/comercial/deals/${p.deal_id}`}
                        className="flex items-center justify-between p-2 rounded-lg border bg-blue-50/50 hover:bg-blue-100/50 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {p.deal?.title || "Deal"}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {p.role && (
                              <Badge variant="secondary" className="h-4 text-[9px] px-1.5">
                                {p.role}
                              </Badge>
                            )}
                            {p.deal?.pipeline_stage?.name && (
                              <span className="text-[10px] text-muted-foreground">
                                {p.deal.pipeline_stage.name}
                              </span>
                            )}
                          </div>
                        </div>
                        {p.deal?.negotiated_price > 0 && (
                          <span className="text-xs font-semibold text-blue-700 ml-2 whitespace-nowrap">
                            {formatCurrency(p.deal.negotiated_price)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Financial */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                <DollarSign className="h-3.5 w-3.5" />
                Financeiro
              </h4>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-3 bg-gradient-to-br from-green-50 to-green-100/50 rounded-xl border border-green-200">
                  <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">LTV</p>
                  <p className="text-xl font-bold text-green-700">
                    {ltvData ? formatCurrency(ltvData.total_ltv) : "R$ 0"}
                  </p>
                </div>
                <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-200">
                  <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wide">Compras</p>
                  <p className="text-xl font-bold text-blue-700">
                    {ltvData?.total_transactions || 0}
                  </p>
                </div>
              </div>
            </div>

            {/* Health */}
            {isClient && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <Heart className="h-3.5 w-3.5" />
                    Saúde do Cliente
                  </h4>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border">
                    <span className="text-sm font-medium">Status</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize font-semibold",
                        conversation.health_status === "risk" && "border-red-200 text-red-600 bg-red-50",
                        conversation.health_status === "alert" && "border-amber-200 text-amber-600 bg-amber-50",
                        conversation.health_status === "healthy" && "border-green-200 text-green-600 bg-green-50"
                      )}
                    >
                      {conversation.health_status === "risk" && <AlertCircle className="h-3 w-3 mr-1" />}
                      {conversation.health_status === "healthy" && <CheckCircle className="h-3 w-3 mr-1" />}
                      {conversation.health_status || "Desconhecido"}
                    </Badge>
                  </div>
                </div>
              </>
            )}

            {/* Organization */}
            {conversation.organization_name && (
              <>
                <Separator />
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5 uppercase tracking-wide">
                    <Building2 className="h-3.5 w-3.5" />
                    Organização
                  </h4>
                  <p className="text-sm font-medium">{conversation.organization_name}</p>
                </div>
              </>
            )}
          </div>
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="flex-1 m-0 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Tarefas Pendentes
              </h4>
              <div className="flex items-center gap-1">
                <Popover open={showQuickFollowUp} onOpenChange={(open) => {
                  setShowQuickFollowUp(open);
                  if (open) {
                    const name = conversation.conversation_name?.split(" ")[0] || "Lead";
                    setQuickFollowUpTitle(`Follow-up ${name}`);
                    setQuickFollowUpWhen("tomorrow");
                    setTimeout(() => quickFollowUpInputRef.current?.select(), 50);
                  }
                }}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-7 text-xs gap-1 bg-yellow-500 hover:bg-yellow-600 text-white"
                    >
                      <Zap className="h-3 w-3" />
                      Follow-up
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-3 z-[100]" align="end">
                    <div className="space-y-2">
                      <input
                        ref={quickFollowUpInputRef}
                        className="w-full h-8 text-sm border rounded-md px-2 bg-background"
                        value={quickFollowUpTitle}
                        onChange={(e) => setQuickFollowUpTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && quickFollowUpTitle.trim()) {
                            handleQuickFollowUp();
                          }
                        }}
                        placeholder="Titulo do follow-up"
                      />
                      <div className="flex gap-1">
                        {([
                          { key: "today", label: "Hoje" },
                          { key: "tomorrow", label: "Amanhã" },
                          { key: "2days", label: "2 dias" },
                        ] as const).map(opt => (
                          <button
                            key={opt.key}
                            onClick={() => setQuickFollowUpWhen(opt.key)}
                            className={cn(
                              "flex-1 px-2 py-1 text-xs font-medium rounded-md border transition-colors",
                              quickFollowUpWhen === opt.key
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background hover:bg-accent border-border",
                            )}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <Button
                        size="sm"
                        className="w-full h-8 text-xs"
                        disabled={!quickFollowUpTitle.trim() || createTask.isPending}
                        onClick={handleQuickFollowUp}
                      >
                        {createTask.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Plus className="h-3 w-3 mr-1" />
                        )}
                        Criar Follow-up
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setIsCreateTaskOpen(true)}
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Nova
                </Button>
              </div>
            </div>
            <TaskList
              tasks={pendingTasks}
              emptyMessage="Nenhuma tarefa pendente"
              clientName={conversation.conversation_name}
              clientPhone={conversation.contact_phone || undefined}
              clientEmail={lead?.email}
            />
          </div>
        </TabsContent>

        {/* Notes Tab */}
        <TabsContent value="notes" className="flex-1 m-0 overflow-hidden">
          <ConversationNotes
            leadId={conversation.lead_id || undefined}
            groupId={conversation.group_id || undefined}
            currentUserId={currentUserId}
          />
        </TabsContent>
      </Tabs>

      {/* Create Task Modal */}
      <CreateTaskModal
        open={isCreateTaskOpen}
        onOpenChange={setIsCreateTaskOpen}
        defaultValues={{
          lead_id: conversation.lead_id || undefined,
          lead_name: conversation.conversation_name,
          organization_id: conversation.organization_id || undefined,
          organization_name: conversation.organization_name || undefined,
          team: 'sales',
        }}
        zClass="z-[95]"
      />

      {/* Modal Adicionar Contato Vinculado */}
      <Dialog open={showAddContactModal} onOpenChange={(open) => { if (!open) resetAddContactModal(); else setShowAddContactModal(true); }}>
        <DialogContent className="w-[420px] max-w-[90vw] max-h-[85vh] overflow-y-auto z-[200]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <UserPlus className="h-4 w-4 text-indigo-600" />
              Vincular contato
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Digite o WhatsApp para buscar ou criar um novo contato
            </p>
          </DialogHeader>

          <div className="space-y-3">
            {/* Campo de telefone com busca */}
            <div>
              <Label className="text-xs font-medium">WhatsApp *</Label>
              <div className="relative mt-1">
                <Phone className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="5511999999999"
                  value={contactPhone}
                  onChange={(e) => handleSearchPhone(e.target.value)}
                  className="pl-9"
                  autoFocus
                />
                {searchStatus === "searching" && (
                  <div className="absolute right-3 top-2.5">
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </div>
            </div>

            {/* Resultado: Lead encontrado */}
            {searchStatus === "found" && foundLead && (
              <div className="p-3 rounded-lg border border-green-200 bg-green-50/50 space-y-3">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                  <span className="text-xs font-semibold text-green-700">Lead encontrado!</span>
                </div>
                <div className="flex items-center gap-3 p-2 bg-white rounded-md border">
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-green-100 text-green-700 text-xs font-bold">
                      {foundLead.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{foundLead.name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {[foundLead.phone, foundLead.company_name].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs">Papel na negociação</Label>
                  <Select value={newContact.role} onValueChange={(v) => setNewContact(f => ({ ...f, role: v }))}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[250]">
                      {CONTACT_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleLinkExistingLead}
                  disabled={isAddingContact}
                >
                  {isAddingContact ? "Vinculando..." : `Vincular ${foundLead.name.split(" ")[0]} ao deal`}
                </Button>
              </div>
            )}

            {/* Resultado: Não encontrado → form de criação */}
            {searchStatus === "not_found" && (
              <div className="p-3 rounded-lg border border-orange-200 bg-orange-50/50 space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 text-orange-600" />
                  <span className="text-xs font-semibold text-orange-700">Não encontrado — criar novo</span>
                </div>

                <div>
                  <Label className="text-xs">Nome *</Label>
                  <Input
                    placeholder="Nome do contato"
                    value={newContact.name}
                    onChange={(e) => setNewContact(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Email (opcional)</Label>
                  <Input
                    placeholder="email@empresa.com"
                    value={newContact.email}
                    onChange={(e) => setNewContact(f => ({ ...f, email: e.target.value }))}
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <Label className="text-xs">Papel na negociação</Label>
                  <Select value={newContact.role} onValueChange={(v) => setNewContact(f => ({ ...f, role: v }))}>
                    <SelectTrigger className="mt-1 h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="z-[250]">
                      {CONTACT_ROLES.map((role) => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Info dos dados herdados */}
                <div className="p-2 rounded-md bg-indigo-50/80 border border-indigo-100 text-[11px] text-indigo-600">
                  <span className="font-medium">Herda: </span>
                  {[lead?.company_name, lead?.utm_source && `UTM: ${lead.utm_source}`]
                    .filter(Boolean).join(" · ") || "dados da negociação"}
                </div>

                <Button
                  className="w-full"
                  size="sm"
                  onClick={handleCreateAndLink}
                  disabled={!newContact.name.trim() || isAddingContact}
                >
                  {isAddingContact ? "Criando..." : "Criar e Vincular"}
                </Button>
              </div>
            )}
          </div>

          {searchStatus === "idle" && (
            <p className="text-xs text-muted-foreground text-center py-2">
              Digite pelo menos 8 dígitos para buscar
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
