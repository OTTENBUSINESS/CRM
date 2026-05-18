import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import {
  Filter,
  X,
  User,
  Users,
  Briefcase,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface TaskFiltersState {
  responsavel_id?: string;
  team?: string;
  task_type?: string;
  status?: string;
  dateRange?: { start: string; end: string };
  myTasksOnly: boolean;
}

interface TaskFiltersProps {
  filters: TaskFiltersState;
  onFiltersChange: (filters: TaskFiltersState) => void;
  showMyTasksToggle?: boolean;
}

const taskTypes = [
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "meeting", label: "Reunião" },
  { value: "onboarding", label: "Onboarding" },
  { value: "follow_up", label: "Follow-up" },
  { value: "checkin", label: "Check-in" },
  { value: "support", label: "Suporte" },
  { value: "internal", label: "Interna" },
  { value: "review", label: "Revisão" },
  { value: "renewal", label: "Renovação" },
  { value: "upsell", label: "Upsell" },
  { value: "rescue", label: "Resgate" },
  { value: "nps", label: "NPS" },
];

const teams = [
  { value: "sales", label: "Comercial" },
  { value: "cs", label: "CS" },
  { value: "marketing", label: "Marketing" },
  { value: "internal", label: "Interno" },
];

const statuses = [
  { value: "not_started", label: "Não iniciada" },
  { value: "scheduled", label: "Agendada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "in_progress", label: "Em andamento" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "Não compareceu" },
  { value: "rescheduled", label: "Reagendada" },
];

export function TaskFilters({
  filters,
  onFiltersChange,
  showMyTasksToggle = true,
}: TaskFiltersProps) {
  const { data: teamMembers = [] } = useTeamMembers();
  const { teamMember } = useAuth();

  const handleFilterChange = (key: keyof TaskFiltersState, value: any) => {
    onFiltersChange({
      ...filters,
      [key]: value === "all" ? undefined : value,
    });
  };

  const clearFilters = () => {
    onFiltersChange({
      myTasksOnly: false,
    });
  };

  const activeFiltersCount = [
    filters.responsavel_id,
    filters.team,
    filters.task_type,
    filters.status,
    filters.dateRange,
  ].filter(Boolean).length;

  const getFilterLabel = (key: string, value: string) => {
    switch (key) {
      case "responsavel_id":
        return teamMembers.find((m) => m.id === value)?.nome || value;
      case "team":
        return teams.find((t) => t.value === value)?.label || value;
      case "task_type":
        return taskTypes.find((t) => t.value === value)?.label || value;
      case "status":
        return statuses.find((s) => s.value === value)?.label || value;
      default:
        return value;
    }
  };

  return (
    <div className="space-y-3">
      {/* Filtros principais */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Toggle Minhas Tarefas */}
        {showMyTasksToggle && teamMember?.id && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
            <Switch
              id="my-tasks"
              checked={filters.myTasksOnly}
              onCheckedChange={(checked) =>
                handleFilterChange("myTasksOnly", checked)
              }
            />
            <Label
              htmlFor="my-tasks"
              className="text-sm font-medium cursor-pointer"
            >
              Minhas tarefas
            </Label>
          </div>
        )}

        {/* Responsável */}
        <Select
          value={filters.responsavel_id || "all"}
          onValueChange={(value) => handleFilterChange("responsavel_id", value)}
        >
          <SelectTrigger className="w-[180px]">
            <User className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Responsável" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {teamMembers.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Área/Time */}
        <Select
          value={filters.team || "all"}
          onValueChange={(value) => handleFilterChange("team", value)}
        >
          <SelectTrigger className="w-[150px]">
            <Users className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Área" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {teams.map((team) => (
              <SelectItem key={team.value} value={team.value}>
                {team.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Tipo */}
        <Select
          value={filters.task_type || "all"}
          onValueChange={(value) => handleFilterChange("task_type", value)}
        >
          <SelectTrigger className="w-[150px]">
            <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {taskTypes.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status */}
        <Select
          value={filters.status || "all"}
          onValueChange={(value) => handleFilterChange("status", value)}
        >
          <SelectTrigger className="w-[160px]">
            <CheckCircle className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status.value} value={status.value}>
                {status.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Limpar filtros */}
        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Limpar ({activeFiltersCount})
          </Button>
        )}
      </div>

      {/* Chips de filtros ativos */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.responsavel_id && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => handleFilterChange("responsavel_id", "all")}
            >
              <User className="h-3 w-3" />
              {getFilterLabel("responsavel_id", filters.responsavel_id)}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filters.team && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => handleFilterChange("team", "all")}
            >
              <Users className="h-3 w-3" />
              {getFilterLabel("team", filters.team)}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filters.task_type && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => handleFilterChange("task_type", "all")}
            >
              <Briefcase className="h-3 w-3" />
              {getFilterLabel("task_type", filters.task_type)}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
          {filters.status && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 cursor-pointer hover:bg-destructive/10"
              onClick={() => handleFilterChange("status", "all")}
            >
              <CheckCircle className="h-3 w-3" />
              {getFilterLabel("status", filters.status)}
              <X className="h-3 w-3 ml-1" />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
