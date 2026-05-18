import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  User,
  Phone,
  Mail,
  ExternalLink,
  DollarSign,
  Activity,
  MessageSquare,
  Clock,
  ListTodo,
  Plus,
  Instagram,
  Handshake,
  EyeOff,
  Eye,
  LinkIcon,
  UserPlus,
  Brain,
  RefreshCw,
  Loader2,
  Sparkles,
  Target,
  ArrowRight,
  Tag,
  Search,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadById } from "@/hooks/useWhatsAppInbox";
import { useClientLTV } from "@/hooks/useTransactions";
import { useLeadTasks } from "@/hooks/useTasks";
import { useLeadDeals } from "@/hooks/useDealContacts";
import { ConversationNotes } from "@/components/inbox/ConversationNotes";
import { TaskList } from "@/components/tasks/TaskList";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { CreateLeadOrDealModal } from "@/components/sales/CreateLeadOrDealModal";
import { CreateDealModal } from "@/components/sales/CreateDealModal";
import { SocialSellerStageBadge } from "./SocialSellerStageBadge";
import {
  useInstagramConversation,
  useInstagramMessages,
  useLinkConversationToLead,
  useUpdateConversationStage,
  useSocialSellerStages,
  type InstagramConversation,
} from "@/hooks/useInstagram";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

// Extrai telefone BR das mensagens da DM
function extractPhoneFromMessages(messages: { content: string | null }[]): string | null {
  const phoneRegex = /(?:\+?55\s?)?(?:\(?\d{2}\)?[\s\-]?)?\d{4,5}[\s\-]?\d{4}/g;

  for (const msg of messages) {
    if (!msg.content) continue;
    const matches = msg.content.match(phoneRegex);
    if (matches) {
      for (const match of matches) {
        const digits = match.replace(/\D/g, "");
        if (digits.length >= 10 && digits.length <= 13) {
          return digits;
        }
      }
    }
  }
  return null;
}

interface AIAnalysis {
  resumo: string;
  interesse: "alto" | "medio" | "baixo" | "nenhum";
  estagio_recomendado: string;
  deal_ready: boolean;
  telefone_detectado: string | null;
  whatsapp_mencionado: boolean;
  email_detectado: string | null;
  produtos_mencionados: string[];
  objecoes: string[];
  proxima_acao: string;
  keywords_detectadas: string[];
  contexto_deal: string;
}

interface InstagramClientInfoPanelProps {
  conversation: InstagramConversation | null;
  onToggleIgnore?: () => void;
  currentUserId?: string;
}

const interesseConfig = {
  alto: { color: "bg-green-100 text-green-700 border-green-200", label: "Alto" },
  medio: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Médio" },
  baixo: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Baixo" },
  nenhum: { color: "bg-gray-100 text-gray-500 border-gray-200", label: "Nenhum" },
};

export function InstagramClientInfoPanel({
  conversation,
  onToggleIgnore,
  currentUserId,
}: InstagramClientInfoPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch the full conversation with metadata (the list version may not have it)
  const { data: fullConversation } = useInstagramConversation(conversation?.id);
  const conv = fullConversation || conversation;

  const { data: lead } = useLeadById(conv?.lead_id || undefined);
  const { data: ltvData } = useClientLTV(conv?.lead_id || undefined);
  const { data: tasks = [] } = useLeadTasks(conv?.lead_id || undefined);
  const { data: dealParticipations } = useLeadDeals(conv?.lead_id || undefined);
  const { data: messages = [] } = useInstagramMessages(conv?.id, 100);
  const { data: stages = [] } = useSocialSellerStages();
  const linkToLead = useLinkConversationToLead();
  const updateStage = useUpdateConversationStage();

  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);
  const [isCreateDealOpen, setIsCreateDealOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSearchingLead, setIsSearchingLead] = useState(false);
  const [isCreatingLead, setIsCreatingLead] = useState(false);

  // Buscar mensagens para extrair telefone quando não há lead vinculado
  const shouldFetchMessages = !conversation?.lead_id && !!conversation?.id;
  const { data: extraMessages = [] } = useInstagramMessages(
    shouldFetchMessages ? conversation?.id : undefined
  );

  // Extrair telefone e computar valores de pré-preenchimento
  const detectedPhone = useMemo(() => {
    if (!shouldFetchMessages || extraMessages.length === 0) return null;
    return extractPhoneFromMessages(extraMessages);
  }, [shouldFetchMessages, extraMessages]);

  const prefillValues = useMemo(() => {
    if (!conversation) return undefined;
    return {
      name: conversation.participant_name || "",
      instagram: conversation.participant_username
        ? `@${conversation.participant_username}`
        : "",
      phone: detectedPhone || "",
      utm_source: "instagram",
    };
  }, [conversation, detectedPhone]);

  // Vincular conversa ao lead recém-criado
  const handleLeadCreated = async (leadId: string) => {
    if (!conversation?.id) return;
    try {
      const { error } = await supabase
        .from("instagram_conversations")
        .update({ lead_id: leadId })
        .eq("id", conversation.id);

      if (error) throw error;

      toast({
        title: "Lead vinculado!",
        description: "A conversa foi vinculada ao novo lead.",
      });

      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversation", conversation.id] });
    } catch (err: any) {
      toast({
        title: "Erro ao vincular",
        description: err.message,
        variant: "destructive",
      });
    }
  };

  const pendingTasks = tasks.filter((t) => !t.completed);

  // Get AI analysis from conversation metadata
  const metadata = conv?.metadata || null;
  const aiAnalysis: AIAnalysis | null = metadata?.ai_analysis || null;
  const aiAnalysisAt = metadata?.ai_analysis_at;

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

  // Manual re-analyze
  const handleAnalyze = async () => {
    if (!conv?.id) return;
    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-instagram-conversation", {
        body: { conversation_id: conv.id },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Invalidate to refetch updated metadata
      queryClient.invalidateQueries({ queryKey: ["instagram-conversation", conv.id] });
      queryClient.invalidateQueries({ queryKey: ["instagram-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-inbox"] });
      queryClient.invalidateQueries({ queryKey: ["instagram-funnel-stats"] });

      toast({ title: "Análise IA concluída" });
    } catch (error) {
      console.error("AI analysis error:", error);
      toast({
        title: "Erro na análise",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Auto-link lead by phone
  const handleSearchAndLinkLead = async (phone: string) => {
    if (!conv?.id) return;
    setIsSearchingLead(true);
    try {
      const { data: foundLead, error } = await supabase.rpc("find_lead_by_phone", {
        p_phone: phone,
      });

      if (error) throw error;

      if (foundLead && foundLead.length > 0) {
        await linkToLead.mutateAsync({
          conversationId: conv.id,
          leadId: foundLead[0].id,
        });
        toast({ title: `Lead vinculado: ${foundLead[0].name}` });
      } else {
        toast({
          title: "Lead não encontrado",
          description: `Nenhum lead com telefone ${phone}`,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Lead search error:", error);
      toast({
        title: "Erro ao buscar lead",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsSearchingLead(false);
    }
  };

  // Create lead from Instagram contact data
  const handleCreateLead = async () => {
    if (!conv) return;
    setIsCreatingLead(true);
    try {
      const utmData = getUtmData();
      const { data: newLead, error } = await supabase
        .from("leads")
        .insert({
          name: conv.participant_name || conv.participant_username || "Instagram",
          instagram: conv.participant_username || null,
          origin: "instagram",
          utm_source: utmData.utm_source || "instagram",
          utm_medium: utmData.utm_medium || null,
          utm_campaign: utmData.utm_campaign || null,
          utm_content: utmData.utm_content || null,
          sales_stage: "new",
          status: "new",
          context: aiAnalysis?.resumo || `Contato via Instagram (@${conv.participant_username || "desconhecido"})`,
        })
        .select()
        .single();

      if (error) throw error;

      // Link conversation to the new lead
      await linkToLead.mutateAsync({
        conversationId: conv.id,
        leadId: newLead.id,
      });

      queryClient.invalidateQueries({ queryKey: ["instagram-conversation", conv.id] });
      queryClient.invalidateQueries({ queryKey: ["instagram-inbox"] });

      toast({ title: `Lead criado: ${newLead.name}` });

      // Auto-open deal modal
      setIsCreateDealOpen(true);
    } catch (error) {
      console.error("Create lead error:", error);
      toast({
        title: "Erro ao criar lead",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    } finally {
      setIsCreatingLead(false);
    }
  };

  // Get UTM data from first message for deal creation
  const getUtmData = () => {
    if (!messages.length) return {};
    const firstMsg = messages[0];
    const msgMeta = firstMsg.metadata;
    const msgType = firstMsg.message_type;

    let utmMedium = "direct_message";
    if (msgType === "post_comment" || msgType === "comment_reply") utmMedium = "post_comment";
    else if (msgType === "story_reply" || msgType === "story_mention") utmMedium = "story_reply";

    return {
      utm_source: "instagram",
      utm_medium: utmMedium,
      utm_campaign: msgMeta?.permalink || firstMsg.reference_url || undefined,
      utm_content: msgMeta?.post_id || firstMsg.reference_id || undefined,
    };
  };

  // Handle deal creation with stage advance
  const handleDealCreated = async () => {
    if (!conv?.id) return;
    // Advance stage to "convertido"
    const convertedStage = stages.find((s) => s.slug === "convertido");
    if (convertedStage) {
      updateStage.mutate({
        conversationId: conv.id,
        stageId: convertedStage.id,
      });
    }
  };

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-muted-foreground bg-gray-50/50">
        <Instagram className="h-12 w-12 mb-3 opacity-30" />
        <p className="font-medium">Nenhuma conversa selecionada</p>
        <p className="text-sm">Selecione uma conversa para ver os detalhes</p>
      </div>
    );
  }

  const displayName =
    conv?.participant_name || conv?.participant_username || "Usuário";

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="p-4 border-b bg-gradient-to-b from-purple-50/50 to-white">
        <div className="flex items-center gap-3">
          <Avatar className="h-14 w-14 border-2 border-white shadow-md">
            <AvatarImage src={conv?.participant_profile_pic || undefined} />
            <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
              {displayName.substring(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-base truncate">{displayName}</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {conv?.participant_username && (
                <span className="text-xs text-muted-foreground">
                  @{conv.participant_username}
                </span>
              )}
              <SocialSellerStageBadge stage={conv?.social_seller_stage} size="sm" />
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="mt-3 p-3 rounded-xl border bg-white shadow-sm">
          {conv?.is_ignored ? (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-gray-100">
                <EyeOff className="h-5 w-5 text-gray-500" />
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-500">Contato ignorado</p>
                <p className="text-xs text-muted-foreground">
                  Métricas e regras desativadas
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="font-semibold text-sm text-purple-600">
                  {conv?.last_message_at
                    ? `Última msg ${formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: true, locale: ptBR })}`
                    : "Sem mensagens"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {conv?.total_messages} mensagens • {conv?.unread_count} não lidas
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Quick Info */}
        {lead && (
          <div className="mt-3 space-y-1.5">
            {lead.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.phone}</span>
              </div>
            )}
            {lead.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="truncate">{lead.email}</span>
              </div>
            )}
            {lead.instagram && (
              <div className="flex items-center gap-2 text-sm">
                <Instagram className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{lead.instagram}</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2 mt-3">
          {conv?.lead_id && (
            <Button variant="outline" size="sm" className="flex-1 h-8" asChild>
              <Link to={`/comercial/leads/${conv.lead_id}`}>
                <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                Ver Lead
              </Link>
            </Button>
          )}
          {onToggleIgnore && (
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={onToggleIgnore}
            >
              {conv?.is_ignored ? (
                <>
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Reativar
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5 mr-1.5" />
                  Ignorar
                </>
              )}
            </Button>
          )}
        </div>

        {/* No lead linked - Criar Lead + Deal */}
        {!conv?.lead_id && (
          <div className="mt-3 space-y-2">
            {aiAnalysis?.telefone_detectado ? (
              <div className="p-3 rounded-lg border border-blue-200 bg-blue-50">
                <div className="flex items-center gap-2 mb-1.5">
                  <Brain className="h-4 w-4 text-blue-600" />
                  <span className="text-xs font-semibold text-blue-700">
                    IA detectou telefone
                  </span>
                </div>
                <p className="text-sm font-mono text-blue-800 mb-2">
                  {aiAnalysis.telefone_detectado}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                  onClick={() => handleSearchAndLinkLead(aiAnalysis.telefone_detectado!)}
                  disabled={isSearchingLead}
                >
                  {isSearchingLead ? (
                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  ) : (
                    <Search className="h-3 w-3 mr-1.5" />
                  )}
                  Buscar e vincular lead
                </Button>
              </div>
            ) : (
              <div className="p-3 rounded-lg border border-dashed border-purple-300 bg-purple-50/50 space-y-2">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-purple-500" />
                  <p className="text-xs font-medium text-purple-700">Lead não vinculado</p>
                </div>
                {detectedPhone && (
                  <div className="flex items-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-md px-2 py-1">
                    <Sparkles className="h-3 w-3" />
                    <span>Tel detectado: {detectedPhone}</span>
                  </div>
                )}
                <Button
                  size="sm"
                  className="w-full h-8"
                  onClick={() => setIsCreateLeadOpen(true)}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                  Criar Lead + Deal
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Analysis Card */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Análise IA
          </h4>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs px-2"
            onClick={handleAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
          </Button>
        </div>

        {aiAnalysis ? (
          <div className="space-y-2.5">
            {/* Summary */}
            <p className="text-xs text-foreground leading-relaxed">
              {aiAnalysis.resumo}
            </p>

            {/* Interest + Stage */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={cn(
                  "text-[10px] h-5",
                  interesseConfig[aiAnalysis.interesse]?.color || interesseConfig.nenhum.color
                )}
              >
                <Target className="h-2.5 w-2.5 mr-1" />
                Interesse: {interesseConfig[aiAnalysis.interesse]?.label || aiAnalysis.interesse}
              </Badge>
              {aiAnalysis.whatsapp_mencionado && (
                <Badge variant="outline" className="text-[10px] h-5 bg-green-50 text-green-700 border-green-200">
                  <Phone className="h-2.5 w-2.5 mr-1" />
                  WhatsApp
                </Badge>
              )}
            </div>

            {/* Detected phone/email */}
            {(aiAnalysis.telefone_detectado || aiAnalysis.email_detectado) && conv?.lead_id && (
              <div className="space-y-1">
                {aiAnalysis.telefone_detectado && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Phone className="h-3 w-3 text-muted-foreground" />
                    <span className="font-mono">{aiAnalysis.telefone_detectado}</span>
                  </div>
                )}
                {aiAnalysis.email_detectado && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>{aiAnalysis.email_detectado}</span>
                  </div>
                )}
              </div>
            )}

            {/* Next action */}
            {aiAnalysis.proxima_acao && (
              <div className="p-2 rounded-lg bg-blue-50 border border-blue-100">
                <div className="flex items-start gap-1.5">
                  <ArrowRight className="h-3 w-3 text-blue-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-700">{aiAnalysis.proxima_acao}</p>
                </div>
              </div>
            )}

            {/* Keywords */}
            {aiAnalysis.keywords_detectadas && aiAnalysis.keywords_detectadas.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap">
                <Tag className="h-3 w-3 text-muted-foreground shrink-0" />
                {aiAnalysis.keywords_detectadas.slice(0, 6).map((kw) => (
                  <span
                    key={kw}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            )}

            {/* Analysis timestamp */}
            {aiAnalysisAt && (
              <p className="text-[10px] text-muted-foreground text-right">
                Analisado {formatDistanceToNow(new Date(aiAnalysisAt), { addSuffix: true, locale: ptBR })}
              </p>
            )}
          </div>
        ) : (
          <div className="text-center py-3">
            <Brain className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground mb-2">Sem análise IA</p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleAnalyze}
              disabled={isAnalyzing || (conv?.total_messages || 0) < 2}
            >
              {isAnalyzing ? (
                <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 mr-1.5" />
              )}
              Analisar Conversa
            </Button>
          </div>
        )}
      </div>

      {/* Action Buttons - Deal/Lead Creation */}
      <div className="p-3 border-b space-y-2">
        {conv?.lead_id ? (
          <Button
            size="sm"
            className="w-full h-9 bg-green-600 hover:bg-green-700"
            onClick={() => setIsCreateDealOpen(true)}
          >
            <Handshake className="h-4 w-4 mr-2" />
            Criar Oportunidade
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full h-9 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
            onClick={handleCreateLead}
            disabled={isCreatingLead}
          >
            {isCreatingLead ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Criar Lead e Oportunidade
          </Button>
        )}
      </div>

      {/* Tabs */}
      {conv?.lead_id ? (
        <Tabs defaultValue="tasks" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="w-full justify-start rounded-none border-b px-2 h-10 bg-gray-50/50">
            <TabsTrigger value="tasks" className="text-xs data-[state=active]:bg-white">
              <ListTodo className="h-3.5 w-3.5 mr-1.5" />
              Tarefas
              {pendingTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                  {pendingTasks.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="info" className="text-xs data-[state=active]:bg-white">
              <Activity className="h-3.5 w-3.5 mr-1.5" />
              Info
            </TabsTrigger>
            <TabsTrigger value="notes" className="text-xs data-[state=active]:bg-white">
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
              Notas
            </TabsTrigger>
          </TabsList>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="flex-1 m-0 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Tarefas Pendentes
                </h4>
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
              <TaskList
                tasks={pendingTasks}
                emptyMessage="Nenhuma tarefa pendente"
                clientName={displayName}
                clientPhone={lead?.phone || undefined}
                clientEmail={lead?.email}
              />
            </div>
          </TabsContent>

          {/* Info Tab */}
          <TabsContent value="info" className="flex-1 m-0 overflow-y-auto">
            <div className="p-4 space-y-4">
              {/* Deals */}
              {dealParticipations && dealParticipations.length > 0 && (
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
                        className="flex items-center justify-between p-2 rounded-lg border bg-purple-50/50 hover:bg-purple-100/50 transition-colors"
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
                          <span className="text-xs font-semibold text-purple-700 ml-2 whitespace-nowrap">
                            {formatCurrency(p.deal.negotiated_price)}
                          </span>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
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
                    <p className="text-[10px] text-green-600 font-semibold uppercase tracking-wide">
                      LTV
                    </p>
                    <p className="text-xl font-bold text-green-700">
                      {ltvData ? formatCurrency(ltvData.total_ltv) : "R$ 0"}
                    </p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl border border-purple-200">
                    <p className="text-[10px] text-purple-600 font-semibold uppercase tracking-wide">
                      Compras
                    </p>
                    <p className="text-xl font-bold text-purple-700">
                      {ltvData?.total_transactions || 0}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="flex-1 m-0 overflow-hidden">
            <ConversationNotes
              leadId={conv.lead_id || undefined}
              currentUserId={currentUserId}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex-1" />
      )}

      {/* Create Task Modal */}
      {conv?.lead_id && isCreateTaskOpen && (
        <CreateTaskModal
          open={isCreateTaskOpen}
          onOpenChange={setIsCreateTaskOpen}
          defaultValues={{
            lead_id: conv.lead_id,
            lead_name: displayName,
            team: "comercial",
          }}
          zClass="z-[95]"
        />
      )}

      {/* Create Lead + Deal Modal (Instagram) */}
      {!conversation.lead_id && (
        <CreateLeadOrDealModal
          open={isCreateLeadOpen}
          onOpenChange={setIsCreateLeadOpen}
          mode="deal"
          defaultValues={prefillValues}
          onLeadCreated={handleLeadCreated}
        />
      )}

      {/* Create Deal Modal */}
      <CreateDealModal
        open={isCreateDealOpen}
        onOpenChange={(open) => {
          setIsCreateDealOpen(open);
          if (!open && conv?.lead_id) {
            handleDealCreated();
          }
        }}
        leadId={conv?.lead_id || ""}
        leadName={displayName}
        defaultNotes={aiAnalysis?.contexto_deal || undefined}
      />
    </div>
  );
}
