import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useResumoAcoes,
  useFilaDeTrabalho,
  useResumoFunil,
  useMetricasVendas,
  useMoverNoFunil,
  useRegistrarResposta,
  useExecutarAcao,
  type LeadComAcao,
  type AcaoDeHoje,
  type EtapaFunil,
} from "@/hooks/useSalesWorkflow";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare,
  Phone,
  Calendar,
  CheckCircle,
  CheckCircle2,
  RotateCcw,
  ArrowRight,
  TrendingUp,
  Users,
  DollarSign,
  Target,
  ChevronRight,
  ExternalLink,
  Flame,
  Clock,
  Zap,
  Instagram,
  Mail,
  PlayCircle,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { cn, navigateTo } from "@/lib/utils";

// Formatadores
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: value >= 10000 ? "compact" : "standard",
    maximumFractionDigits: 0,
  }).format(value);

const formatNumber = (value: number) =>
  new Intl.NumberFormat("pt-BR").format(value);

const formatPhone = (phone: string) => {
  if (phone.startsWith('insta_')) return phone.replace('insta_', '@');
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 13) {
    return `+${cleaned.slice(0, 2)} (${cleaned.slice(2, 4)}) ${cleaned.slice(4, 9)}-${cleaned.slice(9)}`;
  }
  return phone;
};

// Configuração das etapas do funil
const ETAPAS_CONFIG: Record<EtapaFunil, { label: string; color: string; bgColor: string }> = {
  novo: { label: "Novo", color: "text-slate-600", bgColor: "bg-slate-100" },
  em_contato: { label: "Em Contato", color: "text-blue-600", bgColor: "bg-blue-100" },
  qualificado: { label: "Qualificado", color: "text-violet-600", bgColor: "bg-violet-100" },
  call_agendada: { label: "Call Agendada", color: "text-amber-600", bgColor: "bg-amber-100" },
  no_show: { label: "No-show", color: "text-red-600", bgColor: "bg-red-100" },
  call_realizada: { label: "Call Realizada", color: "text-emerald-600", bgColor: "bg-emerald-100" },
  em_fechamento: { label: "Fechamento", color: "text-orange-600", bgColor: "bg-orange-100" },
  ganho: { label: "Ganho", color: "text-green-600", bgColor: "bg-green-100" },
  perdido: { label: "Perdido", color: "text-zinc-500", bgColor: "bg-zinc-100" },
};

// Configuração das ações
const ACOES_CONFIG: Record<AcaoDeHoje, {
  label: string;
  labelLong: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
  description: string;
}> = {
  ENVIAR_MENSAGEM: {
    label: "Mensagens",
    labelLong: "Enviar Mensagem",
    icon: MessageSquare,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    description: "Leads aguardando contato inicial ou follow-up"
  },
  LIGAR: {
    label: "Ligações",
    labelLong: "Fazer Ligação",
    icon: Phone,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
    description: "Leads que responderam e precisam de qualificação"
  },
  CONFIRMAR_CALL: {
    label: "Confirmar Call",
    labelLong: "Confirmar Reunião",
    icon: Calendar,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    description: "Reuniões agendadas que precisam de confirmação"
  },
  RESGATAR_NO_SHOW: {
    label: "Resgatar",
    labelLong: "Resgatar No-show",
    icon: RotateCcw,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
    description: "Leads que não compareceram na reunião"
  },
  AGUARDAR: {
    label: "Aguardar",
    labelLong: "Aguardando",
    icon: Clock,
    color: "text-slate-400",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    description: ""
  },
  ENCERRAR: {
    label: "Encerrar",
    labelLong: "Encerrado",
    icon: CheckCircle,
    color: "text-slate-400",
    bgColor: "bg-slate-50",
    borderColor: "border-slate-200",
    description: ""
  },
};

// Hero Card - Resumo do Dia
function HeroCard({
  totalAcoes,
  loading
}: {
  totalAcoes: number;
  loading: boolean;
}) {
  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <Card className="bg-gradient-to-br from-slate-900 to-slate-800 text-white border-0 overflow-hidden">
      <CardContent className="p-6 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />

        <div className="relative">
          <p className="text-slate-400 text-sm">{saudacao}!</p>
          <h1 className="text-2xl font-bold mt-1">
            {new Date().toLocaleDateString('pt-BR', {
              weekday: 'long',
              day: 'numeric',
              month: 'long'
            })}
          </h1>

          <div className="mt-6 flex items-end gap-6">
            <div>
              <p className="text-slate-400 text-sm">Ações pendentes</p>
              {loading ? (
                <Skeleton className="h-12 w-20 bg-slate-700 mt-1" />
              ) : (
                <p className="text-5xl font-bold">{totalAcoes}</p>
              )}
            </div>

            {!loading && totalAcoes === 0 && (
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 className="w-5 h-5" />
                <span className="text-sm font-medium">Tudo em dia!</span>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Card de Ação Grande
function AcaoCardLarge({
  tipo,
  count,
  leads,
  onLeadClick,
  onLeadAction,
}: {
  tipo: AcaoDeHoje;
  count: number;
  leads: LeadComAcao[];
  onLeadClick: (lead: LeadComAcao) => void;
  onLeadAction: (lead: LeadComAcao) => void;
}) {
  const config = ACOES_CONFIG[tipo];
  const Icon = config.icon;
  const leadsDesteTipo = leads.filter(l => l.acao_de_hoje === tipo).slice(0, 3);

  if (count === 0) return null;

  return (
    <Card className={cn("border-2 transition-all hover:shadow-md", config.borderColor)}>
      <CardHeader className={cn("pb-3", config.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center bg-white shadow-sm")}>
              <Icon className={cn("w-5 h-5", config.color)} />
            </div>
            <div>
              <CardTitle className="text-base">{config.label}</CardTitle>
              <p className="text-xs text-muted-foreground">{config.description}</p>
            </div>
          </div>
          <Badge className={cn("text-lg font-bold px-3 py-1", config.bgColor, config.color)}>
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="space-y-2">
          {leadsDesteTipo.map((lead) => (
            <LeadMiniCard
              key={lead.id}
              lead={lead}
              onClick={() => onLeadClick(lead)}
              onAction={() => onLeadAction(lead)}
            />
          ))}
          {count > 3 && (
            <p className="text-xs text-center text-muted-foreground pt-2">
              + {count - 3} leads
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Mini Card de Lead
function LeadMiniCard({
  lead,
  onClick,
  onAction,
}: {
  lead: LeadComAcao;
  onClick: () => void;
  onAction: () => void;
}) {
  const config = ACOES_CONFIG[lead.acao_de_hoje];
  const etapaConfig = ETAPAS_CONFIG[lead.etapa_funil];
  const Icon = config.icon;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const isInstagram = lead.phone?.startsWith('insta_');

  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 transition-colors group">
      <Avatar className="w-8 h-8">
        <AvatarFallback className={cn("text-xs font-medium", etapaConfig.bgColor, etapaConfig.color)}>
          {getInitials(lead.name)}
        </AvatarFallback>
      </Avatar>

      <div className="flex-1 min-w-0">
        <button onClick={onClick} className="font-medium text-sm text-slate-800 hover:text-blue-600 truncate block">
          {lead.name}
        </button>
        <div className="flex items-center gap-1 text-xs text-slate-500">
          {isInstagram ? (
            <Instagram className="w-3 h-3" />
          ) : (
            <Phone className="w-3 h-3" />
          )}
          <span className="truncate">{formatPhone(lead.phone || '')}</span>
        </div>
      </div>

      {lead.sales_score && lead.sales_score >= 70 && (
        <Flame className="w-4 h-4 text-orange-500" />
      )}

      <Button
        size="sm"
        variant="ghost"
        onClick={onAction}
        className={cn("h-7 px-2 opacity-0 group-hover:opacity-100 transition-opacity", config.color)}
      >
        <Icon className="w-3.5 h-3.5 mr-1" />
        <span className="text-xs">{config.label}</span>
      </Button>
    </div>
  );
}

// Item da Fila de Trabalho (mais detalhado)
function FilaItemDetalhado({
  lead,
  onAction,
  onView,
  onMarcarResposta,
}: {
  lead: LeadComAcao;
  onAction: () => void;
  onView: () => void;
  onMarcarResposta: () => void;
}) {
  const config = ACOES_CONFIG[lead.acao_de_hoje];
  const etapaConfig = ETAPAS_CONFIG[lead.etapa_funil];
  const Icon = config.icon;

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const isInstagram = lead.phone?.startsWith('insta_');

  return (
    <Card className={cn(
      "group transition-all duration-200 hover:shadow-md border-l-4",
      config.borderColor
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <Avatar className="w-12 h-12 ring-2 ring-white shadow">
            <AvatarFallback className={cn(
              "text-sm font-semibold",
              lead.sales_score && lead.sales_score >= 70
                ? "bg-gradient-to-br from-orange-400 to-red-500 text-white"
                : cn(etapaConfig.bgColor, etapaConfig.color)
            )}>
              {getInitials(lead.name)}
            </AvatarFallback>
          </Avatar>

          {/* Info Principal */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <button
                onClick={onView}
                className="font-semibold text-slate-900 hover:text-blue-600 transition-colors truncate"
              >
                {lead.name}
              </button>

              {lead.sales_score && lead.sales_score >= 70 && (
                <Badge className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-xs px-1.5">
                  <Flame className="w-3 h-3 mr-0.5" />
                  HOT
                </Badge>
              )}

              <Badge variant="secondary" className={cn("text-xs", etapaConfig.bgColor, etapaConfig.color)}>
                {etapaConfig.label}
              </Badge>
            </div>

            <div className="flex items-center gap-4 text-sm text-slate-500">
              <span className="flex items-center gap-1">
                {isInstagram ? <Instagram className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {formatPhone(lead.phone || '')}
              </span>

              {lead.email && (
                <span className="flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5" />
                  {lead.email}
                </span>
              )}
            </div>

            {/* Contexto do Playbook */}
            <div className="flex items-center gap-4 mt-2">
              {lead.dia_do_playbook > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <PlayCircle className="w-3.5 h-3.5" />
                  <span>Dia {lead.dia_do_playbook} do playbook</span>
                  <Progress value={(lead.dia_do_playbook / 9) * 100} className="w-16 h-1.5" />
                </div>
              )}

              {lead.tentativas_de_contato > 0 && (
                <span className="text-xs text-slate-500">
                  {lead.tentativas_de_contato} tentativa{lead.tentativas_de_contato > 1 ? 's' : ''}
                </span>
              )}

              {lead.status_de_resposta === 'RESPONDEU' && (
                <Badge variant="outline" className="text-xs text-green-600 border-green-200">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Respondeu
                </Badge>
              )}
            </div>
          </div>

          {/* Score */}
          {lead.sales_score !== undefined && lead.sales_score > 0 && (
            <div className="hidden sm:flex flex-col items-center px-3 py-1 rounded-lg bg-slate-50">
              <span className={cn(
                "text-xl font-bold",
                lead.sales_score >= 70 ? "text-orange-500" :
                lead.sales_score >= 40 ? "text-amber-500" : "text-slate-400"
              )}>
                {lead.sales_score}
              </span>
              <span className="text-[10px] text-slate-400 uppercase">Score</span>
            </div>
          )}

          {/* Ações */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={onAction}
              size="sm"
              className={cn("gap-2", config.bgColor, config.color, "hover:opacity-90")}
              variant="ghost"
            >
              <Icon className="w-4 h-4" />
              {config.labelLong}
              <ChevronRight className="w-4 h-4" />
            </Button>

            {lead.status_de_resposta !== 'RESPONDEU' && lead.acao_de_hoje === 'ENVIAR_MENSAGEM' && (
              <Button
                onClick={onMarcarResposta}
                size="sm"
                variant="outline"
                className="text-xs"
              >
                <CheckCircle2 className="w-3 h-3 mr-1" />
                Lead respondeu
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Funil Horizontal - Grid fixo
function FunilHorizontal({ resumo, loading }: { resumo: any; loading: boolean }) {
  const etapas: { key: EtapaFunil; isTerminal?: boolean }[] = [
    { key: 'novo' },
    { key: 'em_contato' },
    { key: 'qualificado' },
    { key: 'call_agendada' },
    { key: 'no_show' },
    { key: 'call_realizada' },
    { key: 'em_fechamento' },
    { key: 'ganho', isTerminal: true },
  ];

  if (loading) {
    return <Skeleton className="h-24" />;
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid grid-cols-8 gap-2 min-w-[600px]">
        {etapas.map((etapa) => {
          const value = resumo?.[etapa.key] || 0;
          const config = ETAPAS_CONFIG[etapa.key];

          return (
            <div key={etapa.key} className="flex flex-col items-center">
              {/* Card da etapa */}
              <div
                className={cn(
                  "w-full h-16 rounded-lg flex flex-col items-center justify-center transition-all cursor-pointer",
                  config.bgColor,
                  "hover:ring-2 hover:ring-offset-1 hover:ring-slate-300",
                  etapa.isTerminal && "hover:ring-green-400"
                )}
              >
                <span className={cn("font-bold text-xl", config.color)}>
                  {value > 999 ? `${(value / 1000).toFixed(1)}k` : value}
                </span>
              </div>
              {/* Label */}
              <span className="text-xs text-slate-500 mt-1.5 text-center">
                {config.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Página Principal
export default function SalesWorkspace() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>("todos");

  const { data: resumoAcoes, isLoading: loadingAcoes, refetch: refetchAcoes } = useResumoAcoes();
  const { data: filaTrabalho, isLoading: loadingFila, refetch: refetchFila } = useFilaDeTrabalho();
  const { data: resumoFunil, isLoading: loadingFunil } = useResumoFunil();
  const { data: metricas, isLoading: loadingMetricas } = useMetricasVendas();

  const executarAcao = useExecutarAcao();
  const registrarResposta = useRegistrarResposta();

  const handleRefresh = () => {
    refetchAcoes();
    refetchFila();
  };

  const handleAction = (lead: LeadComAcao, e?: React.MouseEvent) => {
    if (lead.acao_de_hoje === 'ENVIAR_MENSAGEM' && lead.phone && !lead.phone.startsWith('insta_')) {
      window.open(`https://wa.me/${lead.phone.replace(/\D/g, '')}`, '_blank');
      toast({
        title: "WhatsApp aberto",
        description: "Após enviar, clique em 'Lead respondeu' quando ele responder.",
      });
    } else if (lead.acao_de_hoje === 'LIGAR' && lead.phone && !lead.phone.startsWith('insta_')) {
      window.open(`tel:${lead.phone}`, '_blank');
    } else if (lead.phone?.startsWith('insta_')) {
      const username = lead.phone.replace('insta_', '');
      window.open(`https://instagram.com/${username}`, '_blank');
    } else {
      if (e) {
        navigateTo(e, `/comercial/leads/${lead.id}`, navigate);
      } else {
        navigate(`/comercial/leads/${lead.id}`);
      }
    }
  };

  const handleView = (lead: LeadComAcao, e?: React.MouseEvent) => {
    if (e) {
      navigateTo(e, `/comercial/leads/${lead.id}`, navigate);
    } else {
      navigate(`/comercial/leads/${lead.id}`);
    }
  };

  const handleMarcarResposta = async (lead: LeadComAcao) => {
    try {
      await registrarResposta.mutateAsync(lead.id);
      toast({
        title: "Lead atualizado!",
        description: `${lead.name} foi marcado como respondeu. Próxima ação: Ligar.`,
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Não foi possível atualizar o lead.",
        variant: "destructive",
      });
    }
  };

  // Filtrar leads por tipo de ação
  const leadsFiltrados = filaTrabalho?.filter(lead => {
    if (activeTab === "todos") return true;
    return lead.acao_de_hoje === activeTab;
  }) || [];

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto space-y-6 animate-fade-in">
        {/* Header com Hero Card */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <HeroCard
              totalAcoes={resumoAcoes?.total_acoes || 0}
              loading={loadingAcoes}
            />
          </div>

          {/* Quick Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Performance</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total de Leads</span>
                <span className="font-bold text-lg">{loadingMetricas ? "..." : formatNumber(metricas?.total_leads || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Ganhos este mês</span>
                <span className="font-bold text-lg text-green-600">{loadingMetricas ? "..." : metricas?.ganhos || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Taxa de conversão</span>
                <span className="font-bold text-lg">{loadingMetricas ? "..." : `${Math.round(metricas?.taxa_conversao || 0)}%`}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Ticket médio</span>
                <span className="font-bold text-lg">{loadingMetricas ? "..." : formatCurrency(metricas?.ticket_medio || 0)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cards de Ações por Tipo */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">Ações do Dia</h2>
            <Button variant="ghost" size="sm" onClick={handleRefresh}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>

          {loadingAcoes ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-48" />)}
            </div>
          ) : resumoAcoes?.total_acoes === 0 ? (
            <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
              <CardContent className="p-8 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-green-800 mb-2">Parabéns! Dia limpo!</h3>
                <p className="text-green-700">
                  Todas as suas ações do dia foram concluídas. Aproveite para revisar o pipeline ou prospectar novos leads.
                </p>
                <Button className="mt-4" onClick={() => navigate('/comercial/leads')}>
                  Ver todos os leads
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <AcaoCardLarge
                tipo="ENVIAR_MENSAGEM"
                count={resumoAcoes?.enviar_mensagem || 0}
                leads={filaTrabalho || []}
                onLeadClick={handleView}
                onLeadAction={handleAction}
              />
              <AcaoCardLarge
                tipo="LIGAR"
                count={resumoAcoes?.ligar || 0}
                leads={filaTrabalho || []}
                onLeadClick={handleView}
                onLeadAction={handleAction}
              />
              <AcaoCardLarge
                tipo="CONFIRMAR_CALL"
                count={resumoAcoes?.confirmar_call || 0}
                leads={filaTrabalho || []}
                onLeadClick={handleView}
                onLeadAction={handleAction}
              />
              <AcaoCardLarge
                tipo="RESGATAR_NO_SHOW"
                count={resumoAcoes?.resgatar_no_show || 0}
                leads={filaTrabalho || []}
                onLeadClick={handleView}
                onLeadAction={handleAction}
              />
            </div>
          )}
        </div>

        {/* Funil de Vendas */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-base font-medium">Funil de Vendas</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => navigate('/comercial/pipeline')}>
              Ver Pipeline <ExternalLink className="w-4 h-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            <FunilHorizontal resumo={resumoFunil} loading={loadingFunil} />
          </CardContent>
        </Card>

        {/* Fila de Trabalho Detalhada */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">Fila de Trabalho</CardTitle>
              <Badge variant="secondary">{filaTrabalho?.length || 0} leads</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="todos">
                  Todos
                  <Badge variant="secondary" className="ml-2">{filaTrabalho?.length || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="ENVIAR_MENSAGEM" className="gap-1">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Mensagens
                  <Badge variant="secondary" className="ml-1">{resumoAcoes?.enviar_mensagem || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="LIGAR" className="gap-1">
                  <Phone className="w-3.5 h-3.5" />
                  Ligar
                  <Badge variant="secondary" className="ml-1">{resumoAcoes?.ligar || 0}</Badge>
                </TabsTrigger>
                <TabsTrigger value="CONFIRMAR_CALL" className="gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Confirmar
                  <Badge variant="secondary" className="ml-1">{resumoAcoes?.confirmar_call || 0}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                {loadingFila ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
                  </div>
                ) : leadsFiltrados.length > 0 ? (
                  <div className="space-y-3">
                    {leadsFiltrados.slice(0, 10).map((lead) => (
                      <FilaItemDetalhado
                        key={lead.id}
                        lead={lead}
                        onAction={() => handleAction(lead)}
                        onView={() => handleView(lead)}
                        onMarcarResposta={() => handleMarcarResposta(lead)}
                      />
                    ))}
                    {leadsFiltrados.length > 10 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => navigate('/comercial/leads')}
                      >
                        Ver todos os {leadsFiltrados.length} leads
                        <ArrowRight className="w-4 h-4 ml-2" />
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">Nenhum lead nesta categoria</p>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
