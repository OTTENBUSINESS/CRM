import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LeadCard, SalesStageBadge } from "@/components/sales";
import { SalesAIChat } from "@/components/sales/ai";
import { CreateLeadOrDealModal } from "@/components/sales/CreateLeadOrDealModal";
import { useSalesLeads, useLeadsCountByStage } from "@/hooks/useSalesLeads";
import { useAtivarLeadsEmMassa } from "@/hooks/useSalesWorkflow";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Users,
  Search,
  Filter,
  LayoutGrid,
  List,
  SortAsc,
  SortDesc,
  Flame,
  RefreshCw,
  UserPlus,
  Zap,
} from "lucide-react";
import { cn, navigateTo } from "@/lib/utils";
import type { SalesStage, SalesLead } from "@/types/sales.types";

const STAGES: { value: SalesStage | "all" | "new"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "new", label: "Novos" },
  { value: "captura", label: "Captura" },
  { value: "qualificacao", label: "Qualificação" },
  { value: "agendamento", label: "Agendamento" },
  { value: "negociacao", label: "Negociação" },
  { value: "fechado", label: "Fechado" },
  { value: "perdido", label: "Perdido" },
];

const SalesLeads = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<SalesStage | "all" | "new">(
    (searchParams.get("stage") as SalesStage | "new") || "all"
  );
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"score" | "recent">("score");
  const [showHotOnly, setShowHotOnly] = useState(searchParams.get("hot") === "true");
  const [page, setPage] = useState(0);
  const [isCreateLeadOpen, setIsCreateLeadOpen] = useState(false);

  const ativarEmMassa = useAtivarLeadsEmMassa();

  const filters = useMemo(() => ({
    sales_stage: selectedStage !== "all" ? selectedStage : undefined,
    search: search || undefined,
    min_score: showHotOnly ? 70 : undefined,
    page,
    pageSize: 50,
  }), [selectedStage, search, showHotOnly, page]);

  const { data: leadsData, isLoading, refetch } = useSalesLeads(filters);
  const leads = leadsData?.leads || [];
  const totalLeads = leadsData?.total || 0;
  const totalPages = leadsData?.totalPages || 0;
  const { data: countByStage } = useLeadsCountByStage();

  // Sort leads
  const sortedLeads = useMemo(() => {
    if (!leads || leads.length === 0) return [];
    const sorted = [...leads];
    if (sortBy === "score") {
      sorted.sort((a, b) => (b.sales_score || 0) - (a.sales_score || 0));
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return sorted;
  }, [leads, sortBy]);

  const handleStageChange = (stage: string) => {
    setSelectedStage(stage as SalesStage | "all" | "new");
    setPage(0); // Reset page when filter changes
    if (stage !== "all") {
      searchParams.set("stage", stage);
    } else {
      searchParams.delete("stage");
    }
    setSearchParams(searchParams);
  };

  const handleLeadClick = (lead: SalesLead, e?: React.MouseEvent) => {
    if (e) {
      navigateTo(e, `/comercial/leads/${lead.id}`, navigate);
    } else {
      navigate(`/comercial/leads/${lead.id}`);
    }
  };

  const handleWhatsApp = (lead: SalesLead) => {
    if (lead.phone) {
      window.open(`https://wa.me/${lead.phone.replace(/\D/g, "")}`);
    }
  };

  const handleCall = (lead: SalesLead) => {
    if (lead.phone) {
      window.open(`tel:${lead.phone}`);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Users className="h-7 w-7 text-primary" />
              Leads Comerciais
            </h1>
            <p className="text-muted-foreground">
              {leads?.length || 0} leads encontrados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={showHotOnly ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setShowHotOnly(!showHotOnly);
                if (!showHotOnly) {
                  searchParams.set("hot", "true");
                } else {
                  searchParams.delete("hot");
                }
                setSearchParams(searchParams);
              }}
              className={cn(showHotOnly && "bg-red-500 hover:bg-red-600")}
            >
              <Flame className="h-4 w-4 mr-1" />
              Quentes
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                // Pega os primeiros 20 leads em AGUARDAR para ativar
                const leadsParaAtivar = sortedLeads
                  .filter((l: any) => l.acao_de_hoje === 'AGUARDAR' || !l.acao_de_hoje)
                  .slice(0, 20)
                  .map((l: any) => l.id);

                if (leadsParaAtivar.length === 0) {
                  toast({ title: "Nenhum lead para ativar", description: "Todos os leads já estão ativos no playbook." });
                  return;
                }

                try {
                  await ativarEmMassa.mutateAsync(leadsParaAtivar);
                  toast({
                    title: `${leadsParaAtivar.length} leads ativados!`,
                    description: "Os leads agora aparecem no 'Meu Dia' para ação."
                  });
                  refetch();
                } catch (error) {
                  toast({ title: "Erro ao ativar leads", variant: "destructive" });
                }
              }}
              disabled={ativarEmMassa.isPending}
              className="bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100"
            >
              {ativarEmMassa.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-2" />
              )}
              Ativar no Playbook
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => setIsCreateLeadOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Lead
            </Button>
          </div>
        </div>

        {/* Stage Pills */}
        <div className="flex flex-wrap gap-2">
          {STAGES.map((stage) => {
            const count = stage.value === "all"
              ? leads?.length || 0
              : countByStage?.[stage.value] || 0;

            return (
              <Button
                key={stage.value}
                variant={selectedStage === stage.value ? "default" : "outline"}
                size="sm"
                onClick={() => handleStageChange(stage.value)}
                className="gap-2"
              >
                {stage.label}
                <Badge
                  variant="secondary"
                  className={cn(
                    "ml-1",
                    selectedStage === stage.value && "bg-primary-foreground/20 text-primary-foreground"
                  )}
                >
                  {count}
                </Badge>
              </Button>
            );
          })}
        </div>

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, email ou telefone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as "score" | "recent")}>
              <SelectTrigger className="w-[140px]">
                {sortBy === "score" ? (
                  <SortDesc className="h-4 w-4 mr-2" />
                ) : (
                  <SortAsc className="h-4 w-4 mr-2" />
                )}
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Maior Score</SelectItem>
                <SelectItem value="recent">Mais Recentes</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex border rounded-lg">
              <Button
                variant={viewMode === "grid" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("grid")}
                className="rounded-r-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "secondary" : "ghost"}
                size="icon"
                onClick={() => setViewMode("list")}
                className="rounded-l-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Leads Grid/List */}
        {isLoading ? (
          <div className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "space-y-3"
          )}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className={viewMode === "grid" ? "h-64" : "h-20"} />
            ))}
          </div>
        ) : sortedLeads.length > 0 ? (
          <div className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "space-y-3"
          )}>
            {sortedLeads.map((lead) => (
              <LeadCard
                key={lead.id}
                lead={lead}
                compact={viewMode === "list"}
                onView={() => handleLeadClick(lead)}
                onCall={() => handleCall(lead)}
                onWhatsApp={() => handleWhatsApp(lead)}
                showScore
                showBANT={viewMode === "grid"}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum lead encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {search
                  ? "Tente ajustar sua busca ou filtros"
                  : "Não há leads neste estágio no momento"}
              </p>
              {(search || selectedStage !== "all" || showHotOnly) && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearch("");
                    setSelectedStage("all");
                    setShowHotOnly(false);
                    setSearchParams({});
                  }}
                >
                  Limpar filtros
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <p className="text-sm text-muted-foreground">
              Mostrando {page * 50 + 1} - {Math.min((page + 1) * 50, totalLeads)} de {totalLeads.toLocaleString('pt-BR')} leads
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Sales AI Copilot - Floating Chat */}
      <SalesAIChat />

      {/* Create Lead Modal */}
      <CreateLeadOrDealModal
        open={isCreateLeadOpen}
        onOpenChange={setIsCreateLeadOpen}
        mode="lead"
      />
    </AppLayout>
  );
};

export default SalesLeads;
