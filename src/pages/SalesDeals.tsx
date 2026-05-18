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
import { DealCard } from "@/components/sales/DealCard";
import { ViewDealModal } from "@/components/sales/ViewDealModal";
import { useSalesDeals, useDealsSummary } from "@/hooks/useSalesDeals";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import {
  Briefcase,
  Search,
  Plus,
  RefreshCw,
  LayoutGrid,
  List,
  SortAsc,
  SortDesc,
  DollarSign,
  Trophy,
  XCircle,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deal, DealStatus } from "@/types/sales.types";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

const STATUS_OPTIONS: { value: DealStatus | "all" | "active"; label: string; icon?: React.ElementType }[] = [
  { value: "all", label: "Todos" },
  { value: "active", label: "Em Andamento" },
  { value: "negotiation", label: "Negociação" },
  { value: "proposal_sent", label: "Proposta Enviada" },
  { value: "won", label: "Ganhos", icon: Trophy },
  { value: "lost", label: "Perdidos", icon: XCircle },
];

const SalesDeals = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<DealStatus | "all" | "active">("active");
  const [selectedStage, setSelectedStage] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [sortBy, setSortBy] = useState<"value" | "recent" | "probability">("value");
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showDealModal, setShowDealModal] = useState(false);

  const { data: stages } = usePipelineStages();
  const { data: summary, isLoading: summaryLoading } = useDealsSummary();

  const filters = useMemo(() => {
    const f: any = {};
    if (selectedStatus !== "all" && selectedStatus !== "active") {
      f.status = selectedStatus;
    }
    if (selectedStage !== "all") {
      f.pipeline_stage_id = selectedStage;
    }
    return f;
  }, [selectedStatus, selectedStage]);

  const { data: deals, isLoading, refetch } = useSalesDeals(filters);

  // Filter and sort deals
  const filteredDeals = useMemo(() => {
    if (!deals) return [];

    let filtered = deals;

    // Filter by active (not won or lost)
    if (selectedStatus === "active") {
      filtered = filtered.filter((d) => d.status !== "won" && d.status !== "lost");
    }

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (d) =>
          d.lead?.name?.toLowerCase().includes(searchLower) ||
          d.contact?.name?.toLowerCase().includes(searchLower) ||
          d.product?.name?.toLowerCase().includes(searchLower)
      );
    }

    // Sort
    const sorted = [...filtered];
    switch (sortBy) {
      case "value":
        sorted.sort((a, b) => (b.negotiated_price || 0) - (a.negotiated_price || 0));
        break;
      case "recent":
        sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        break;
      case "probability":
        sorted.sort((a, b) => (b.ai_win_probability || 0) - (a.ai_win_probability || 0));
        break;
    }

    return sorted;
  }, [deals, search, sortBy, selectedStatus]);

  const handleDealClick = (deal: Deal) => {
    setSelectedDeal(deal);
    setShowDealModal(true);
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Briefcase className="h-7 w-7 text-primary" />
              Deals / Oportunidades
            </h1>
            <p className="text-muted-foreground">
              {filteredDeals.length} deals encontrados
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
            <Button onClick={() => navigate("/comercial/deals/new")}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Deal
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              selectedStatus === "active" && "ring-2 ring-primary"
            )}
            onClick={() => setSelectedStatus("active")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Em Andamento</p>
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{summary?.active || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(summary?.active_value || 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              selectedStatus === "won" && "ring-2 ring-emerald-500"
            )}
            onClick={() => setSelectedStatus("won")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ganhos</p>
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-emerald-600">{summary?.won || 0}</p>
                  )}
                  <p className="text-xs text-emerald-600">
                    {formatCurrency(summary?.won_value || 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Trophy className="h-5 w-5 text-emerald-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              selectedStatus === "lost" && "ring-2 ring-red-500"
            )}
            onClick={() => setSelectedStatus("lost")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Perdidos</p>
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-red-600">{summary?.lost || 0}</p>
                  )}
                </div>
                <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              selectedStatus === "all" && "ring-2 ring-primary"
            )}
            onClick={() => setSelectedStatus("all")}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  {summaryLoading ? (
                    <Skeleton className="h-8 w-16 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{summary?.total || 0}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {formatCurrency(summary?.total_value || 0)}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                  <DollarSign className="h-5 w-5 text-slate-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por contato ou produto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedStage} onValueChange={setSelectedStage}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Estágio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos estágios</SelectItem>
                {stages?.filter((s) => !s.is_won && !s.is_lost).map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    {stage.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(v) => setSortBy(v as typeof sortBy)}>
              <SelectTrigger className="w-[150px]">
                <SortDesc className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="value">Maior Valor</SelectItem>
                <SelectItem value="recent">Mais Recentes</SelectItem>
                <SelectItem value="probability">Probabilidade</SelectItem>
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

        {/* Deals Grid/List */}
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
        ) : filteredDeals.length > 0 ? (
          <div className={cn(
            "gap-4",
            viewMode === "grid"
              ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
              : "space-y-3"
          )}>
            {filteredDeals.map((deal) => (
              <DealCard
                key={deal.id}
                deal={deal}
                compact={viewMode === "list"}
                onView={() => handleDealClick(deal)}
              />
            ))}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Briefcase className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">Nenhum deal encontrado</h3>
              <p className="text-muted-foreground mb-4">
                {search
                  ? "Tente ajustar sua busca ou filtros"
                  : "Não há deals com os filtros selecionados"}
              </p>
              <div className="flex justify-center gap-2">
                {(search || selectedStage !== "all" || selectedStatus !== "active") && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch("");
                      setSelectedStage("all");
                      setSelectedStatus("active");
                    }}
                  >
                    Limpar filtros
                  </Button>
                )}
                <Button onClick={() => navigate("/comercial/deals/new")}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar deal
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Modal de visualização do Deal */}
      <ViewDealModal
        open={showDealModal}
        onOpenChange={setShowDealModal}
        deal={selectedDeal}
      />
    </AppLayout>
  );
};

export default SalesDeals;
