import { useState } from "react";
import { Search, Filter, X, AlertCircle, Clock, CheckCircle, UserCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { InboxFilters } from "@/hooks/useCSInbox";

interface InboxFiltersBarProps {
  filters: InboxFilters;
  onFiltersChange: (filters: InboxFilters) => void;
  products: { id: string; name: string }[];
}

export function InboxFiltersBar({
  filters,
  onFiltersChange,
  products,
}: InboxFiltersBarProps) {
  const [searchValue, setSearchValue] = useState(filters.search || "");

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onFiltersChange({ ...filters, search: searchValue || undefined });
  };

  const handleClearSearch = () => {
    setSearchValue("");
    onFiltersChange({ ...filters, search: undefined });
  };

  const activeFiltersCount = [
    filters.productFilter,
    filters.healthFilter,
    filters.slaFilter,
    filters.onlyPending,
    filters.aiAgentFilter,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchValue("");
    onFiltersChange({
      instanceId: filters.instanceId,
    });
  };

  return (
    <div className="space-y-3">
      {/* Search + Quick Filters */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou telefone..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchValue && (
            <button
              type="button"
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </form>

        {/* Quick SLA Filters */}
        <div className="flex items-center gap-1 border rounded-lg p-1">
          <Button
            variant={filters.slaFilter === "critical" ? "destructive" : "ghost"}
            size="sm"
            className="h-8 gap-1"
            onClick={() =>
              onFiltersChange({
                ...filters,
                slaFilter: filters.slaFilter === "critical" ? undefined : "critical",
              })
            }
          >
            <AlertCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Críticos</span>
          </Button>
          <Button
            variant={filters.slaFilter === "warning" ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-8 gap-1",
              filters.slaFilter === "warning" && "bg-amber-500 hover:bg-amber-600"
            )}
            onClick={() =>
              onFiltersChange({
                ...filters,
                slaFilter: filters.slaFilter === "warning" ? undefined : "warning",
              })
            }
          >
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Atenção</span>
          </Button>
          <Button
            variant={filters.onlyPending ? "secondary" : "ghost"}
            size="sm"
            className="h-8 gap-1"
            onClick={() =>
              onFiltersChange({
                ...filters,
                onlyPending: !filters.onlyPending,
              })
            }
          >
            <CheckCircle className="h-4 w-4" />
            <span className="hidden sm:inline">Pendentes</span>
          </Button>
          <Button
            variant={filters.aiAgentFilter === "transferred" ? "default" : "ghost"}
            size="sm"
            className={cn(
              "h-8 gap-1",
              filters.aiAgentFilter === "transferred" && "bg-blue-500 hover:bg-blue-600 text-white"
            )}
            onClick={() =>
              onFiltersChange({
                ...filters,
                aiAgentFilter: filters.aiAgentFilter === "transferred" ? undefined : "transferred",
              })
            }
          >
            <UserCheck className="h-4 w-4" />
            <span className="hidden sm:inline">Transferidos</span>
          </Button>
        </div>

        {/* Advanced Filters */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-2">
              <Filter className="h-4 w-4" />
              Filtros
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 max-w-[calc(100vw-2rem)]" align="end">
            <div className="space-y-4">
              <div className="font-medium text-sm">Filtros Avançados</div>

              {/* Produto */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Produto</label>
                <Select
                  value={filters.productFilter || "all"}
                  onValueChange={(v) =>
                    onFiltersChange({
                      ...filters,
                      productFilter: v === "all" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos os produtos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os produtos</SelectItem>
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Health */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Saúde do Cliente</label>
                <Select
                  value={filters.healthFilter || "all"}
                  onValueChange={(v) =>
                    onFiltersChange({
                      ...filters,
                      healthFilter: v === "all" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="risk">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        Risco
                      </span>
                    </SelectItem>
                    <SelectItem value="alert">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        Alerta
                      </span>
                    </SelectItem>
                    <SelectItem value="healthy">
                      <span className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-green-500" />
                        Saudável
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* SLA */}
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Status SLA</label>
                <Select
                  value={filters.slaFilter || "all"}
                  onValueChange={(v) =>
                    onFiltersChange({
                      ...filters,
                      slaFilter: v === "all" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="critical">🔴 Crítico (&gt; 2h)</SelectItem>
                    <SelectItem value="warning">🟡 Atenção (&gt; 30m)</SelectItem>
                    <SelectItem value="ok">🟢 OK (&lt; 30m)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear All */}
              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={clearAllFilters}
                >
                  Limpar todos os filtros
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active Filters Tags */}
      {(filters.productFilter || filters.healthFilter || filters.search || filters.aiAgentFilter) && (
        <div className="flex flex-wrap gap-2">
          {filters.search && (
            <Badge variant="secondary" className="gap-1">
              Busca: "{filters.search}"
              <button
                onClick={handleClearSearch}
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.productFilter && (
            <Badge variant="secondary" className="gap-1">
              Produto: {products.find((p) => p.id === filters.productFilter)?.name}
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, productFilter: undefined })
                }
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.healthFilter && (
            <Badge variant="secondary" className="gap-1">
              Saúde: {filters.healthFilter}
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, healthFilter: undefined })
                }
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.aiAgentFilter && (
            <Badge variant="secondary" className="gap-1">
              {filters.aiAgentFilter === "transferred" ? "Transferidos p/ Humano" : filters.aiAgentFilter}
              <button
                onClick={() =>
                  onFiltersChange({ ...filters, aiAgentFilter: undefined })
                }
                className="ml-1 hover:text-destructive"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
