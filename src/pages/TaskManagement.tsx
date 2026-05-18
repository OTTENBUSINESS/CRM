import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTasks, useMyTasks, Task } from "@/hooks/useTasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { TaskListGrouped } from "@/components/tasks/TaskListGrouped";
import { TaskKanbanSimple } from "@/components/tasks/TaskKanbanSimple";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import {
  Plus,
  List,
  Kanban,
  Calendar,
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  RefreshCw,
  User,
  Users,
  X,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

type QuickFilter = "all" | "overdue" | "today" | "week" | "completed";
type ViewMode = "my" | "team";

const TaskManagement = () => {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const { data: teamMembers = [] } = useTeamMembers();

  const [activeTab, setActiveTab] = useState("list");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Simplified filters
  const [viewMode, setViewMode] = useState<ViewMode>("my");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [responsavelFilter, setResponsavelFilter] = useState<string>("all");

  // Fetch all tasks (when viewing team)
  const { data: allTasks = [], refetch: refetchAllTasks } = useTasks({
    responsavel_id: responsavelFilter !== "all" ? responsavelFilter : undefined,
  });

  // Fetch my tasks
  const { data: myTasks = [], refetch: refetchMyTasks } = useMyTasks(
    viewMode === "my" ? teamMember?.id : undefined
  );

  // Choose which tasks to display
  const baseTasks = viewMode === "my" ? myTasks : allTasks;

  // Calculate stats from base tasks (before quick filter)
  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Usar scheduled_at se existir, senão due_datetime
    const getEffectiveDate = (t: Task) => t.scheduled_at;

    const overdue = baseTasks.filter(
      (t) => !t.completed && getEffectiveDate(t) && new Date(getEffectiveDate(t)!) < todayStart
    ).length;

    const today = baseTasks.filter(
      (t) =>
        !t.completed &&
        getEffectiveDate(t) &&
        new Date(getEffectiveDate(t)!) >= todayStart &&
        new Date(getEffectiveDate(t)!) < todayEnd
    ).length;

    const week = baseTasks.filter(
      (t) =>
        !t.completed &&
        getEffectiveDate(t) &&
        new Date(getEffectiveDate(t)!) >= todayEnd &&
        new Date(getEffectiveDate(t)!) < weekEnd
    ).length;

    const completed = baseTasks.filter((t) => t.completed).length;
    const pending = baseTasks.filter((t) => !t.completed).length;

    return { overdue, today, week, completed, pending, total: baseTasks.length };
  }, [baseTasks]);

  // Apply quick filter
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Usar scheduled_at se existir, senão due_datetime
    const getEffectiveDate = (t: Task) => t.scheduled_at;

    switch (quickFilter) {
      case "overdue":
        return baseTasks.filter(
          (t) => !t.completed && getEffectiveDate(t) && new Date(getEffectiveDate(t)!) < todayStart
        );
      case "today":
        return baseTasks.filter(
          (t) =>
            !t.completed &&
            getEffectiveDate(t) &&
            new Date(getEffectiveDate(t)!) >= todayStart &&
            new Date(getEffectiveDate(t)!) < todayEnd
        );
      case "week":
        return baseTasks.filter(
          (t) =>
            !t.completed &&
            getEffectiveDate(t) &&
            new Date(getEffectiveDate(t)!) >= todayStart &&
            new Date(getEffectiveDate(t)!) < weekEnd
        );
      case "completed":
        return baseTasks.filter((t) => t.completed);
      default:
        return baseTasks;
    }
  }, [baseTasks, quickFilter]);

  const handleTaskUpdate = () => {
    if (viewMode === "my") {
      refetchMyTasks();
    } else {
      refetchAllTasks();
    }
  };

  const clearFilters = () => {
    setQuickFilter("all");
    setResponsavelFilter("all");
  };

  const hasActiveFilters = quickFilter !== "all" || responsavelFilter !== "all";

  // Sync Google Calendar
  const handleSyncGoogleCalendar = async () => {
    if (!teamMember) return;

    if (!teamMember.google_calendar_connected) {
      toast({
        title: "Google Calendar não conectado",
        description: "Conecte seu Google Calendar em Configurações primeiro.",
        variant: "destructive",
      });
      return;
    }

    setIsSyncing(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('sync-google-calendar', {
        body: {
          team_member_id: teamMember.id,
          full_sync: false,
        },
      });
      if (invokeError) throw invokeError;

      if (result.success) {
        toast({
          title: "Sincronizado!",
          description: result.message,
        });
        handleTaskUpdate();
      } else {
        toast({
          title: "Erro na sincronização",
          description: result.error,
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Erro na sincronização",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Gestão de Tarefas
            </h1>
            <p className="text-muted-foreground">
              {viewMode === "my" ? "Suas tarefas pendentes e concluídas" : "Todas as tarefas do time"}
            </p>
          </div>
          <div className="flex gap-2">
            {teamMember?.google_calendar_connected && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncGoogleCalendar}
                disabled={isSyncing}
              >
                <RefreshCw className={cn("h-4 w-4 mr-2", isSyncing && "animate-spin")} />
                {isSyncing ? "Sincronizando..." : "Sync"}
              </Button>
            )}
            <Button onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Tarefa
            </Button>
          </div>
        </div>

        {/* Stats Cards - Clicáveis */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              quickFilter === "overdue" ? "border-red-500 bg-red-50" : "border-transparent hover:border-red-200",
              stats.overdue > 0 && "ring-2 ring-red-200"
            )}
            onClick={() => setQuickFilter(quickFilter === "overdue" ? "all" : "overdue")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2.5 rounded-xl",
                  stats.overdue > 0 ? "bg-red-100" : "bg-gray-100"
                )}>
                  <AlertTriangle className={cn(
                    "h-5 w-5",
                    stats.overdue > 0 ? "text-red-600" : "text-gray-400"
                  )} />
                </div>
                <div>
                  <p className={cn(
                    "text-2xl font-bold",
                    stats.overdue > 0 ? "text-red-600" : "text-gray-400"
                  )}>
                    {stats.overdue}
                  </p>
                  <p className="text-xs text-muted-foreground font-medium">Atrasadas</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              quickFilter === "today" ? "border-blue-500 bg-blue-50" : "border-transparent hover:border-blue-200"
            )}
            onClick={() => setQuickFilter(quickFilter === "today" ? "all" : "today")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-blue-100">
                  <CalendarDays className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-blue-600">{stats.today}</p>
                  <p className="text-xs text-muted-foreground font-medium">Hoje</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              quickFilter === "week" ? "border-violet-500 bg-violet-50" : "border-transparent hover:border-violet-200"
            )}
            onClick={() => setQuickFilter(quickFilter === "week" ? "all" : "week")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-violet-100">
                  <CalendarRange className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-violet-600">{stats.week}</p>
                  <p className="text-xs text-muted-foreground font-medium">Esta Semana</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card
            className={cn(
              "cursor-pointer transition-all hover:shadow-md border-2",
              quickFilter === "completed" ? "border-green-500 bg-green-50" : "border-transparent hover:border-green-200"
            )}
            onClick={() => setQuickFilter(quickFilter === "completed" ? "all" : "completed")}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-green-100">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">{stats.completed}</p>
                  <p className="text-xs text-muted-foreground font-medium">Concluídas</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters Bar */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* View Mode Toggle - Destaque */}
              <div className="flex rounded-lg border-2 border-primary/20 p-1 bg-muted/30">
                <Button
                  variant={viewMode === "my" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("my")}
                  className={cn(
                    "gap-2",
                    viewMode === "my" && "shadow-sm"
                  )}
                >
                  <User className="h-4 w-4" />
                  Minhas Tarefas
                </Button>
                <Button
                  variant={viewMode === "team" ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("team")}
                  className={cn(
                    "gap-2",
                    viewMode === "team" && "shadow-sm"
                  )}
                >
                  <Users className="h-4 w-4" />
                  Todo o Time
                </Button>
              </div>

              <div className="h-6 w-px bg-border" />

              {/* Responsável - só aparece no modo "team" */}
              {viewMode === "team" && (
                <Select
                  value={responsavelFilter}
                  onValueChange={setResponsavelFilter}
                >
                  <SelectTrigger className="w-[180px] h-9">
                    <User className="h-4 w-4 mr-2 text-muted-foreground" />
                    <SelectValue placeholder="Responsável" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Limpar Filtros */}
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="text-muted-foreground hover:text-foreground h-9"
                >
                  <X className="h-4 w-4 mr-1" />
                  Limpar
                </Button>
              )}

              {/* Badge com total */}
              <div className="ml-auto">
                <Badge variant="secondary" className="text-sm">
                  {filteredTasks.length} {filteredTasks.length === 1 ? "tarefa" : "tarefas"}
                </Badge>
              </div>
            </div>

            {/* Active filter chips */}
            {quickFilter !== "all" && (
              <div className="flex gap-2 mt-3 pt-3 border-t">
                <Badge
                  variant="outline"
                  className={cn(
                    "cursor-pointer",
                    quickFilter === "overdue" && "border-red-300 bg-red-50 text-red-700",
                    quickFilter === "today" && "border-blue-300 bg-blue-50 text-blue-700",
                    quickFilter === "week" && "border-violet-300 bg-violet-50 text-violet-700",
                    quickFilter === "completed" && "border-green-300 bg-green-50 text-green-700"
                  )}
                  onClick={() => setQuickFilter("all")}
                >
                  {quickFilter === "overdue" && "Atrasadas"}
                  {quickFilter === "today" && "Hoje"}
                  {quickFilter === "week" && "Esta Semana"}
                  {quickFilter === "completed" && "Concluídas"}
                  <X className="h-3 w-3 ml-1" />
                </Badge>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tabs with Views */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="list" className="gap-2">
              <List className="h-4 w-4" />
              Lista
            </TabsTrigger>
            <TabsTrigger value="kanban" className="gap-2">
              <Kanban className="h-4 w-4" />
              Kanban
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-2">
              <Calendar className="h-4 w-4" />
              Calendário
            </TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <TaskListGrouped
              tasks={filteredTasks}
              showGrouped={quickFilter === "all"}
              onTaskUpdate={handleTaskUpdate}
            />
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            <TaskKanbanSimple tasks={filteredTasks} onTaskUpdate={handleTaskUpdate} />
          </TabsContent>

          <TabsContent value="calendar" className="mt-4">
            <TaskCalendar tasks={filteredTasks} />
          </TabsContent>
        </Tabs>
      </div>

      <CreateTaskModal
        open={isCreateModalOpen}
        onOpenChange={setIsCreateModalOpen}
        defaultValues={{
          team: "internal",
        }}
      />
    </AppLayout>
  );
};

export default TaskManagement;
