import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useTasks, useMyTasks, Task } from "@/hooks/useTasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { QuickCreateTaskModal } from "@/components/tasks/QuickCreateTaskModal";
import { motion } from "framer-motion";
import { pageVariants } from "@/lib/animations";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  User,
  Clock,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Target,
  Users,
  Calendar,
  CalendarDays,
  Coffee,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  isToday,
  addWeeks,
  subWeeks,
  isSameDay,
  parseISO,
  differenceInDays,
  addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

type ViewMode = "month" | "week";

const taskTypeConfig: Record<
  string,
  { icon: React.ElementType; color: string; bgColor: string }
> = {
  call: { icon: Phone, color: "text-blue-600", bgColor: "bg-blue-500" },
  whatsapp: {
    icon: MessageSquare,
    color: "text-green-600",
    bgColor: "bg-green-500",
  },
  email: { icon: Mail, color: "text-purple-600", bgColor: "bg-purple-500" },
  meeting: { icon: Video, color: "text-indigo-600", bgColor: "bg-indigo-500" },
  onboarding: {
    icon: Target,
    color: "text-orange-600",
    bgColor: "bg-orange-500",
  },
  follow_up: { icon: Clock, color: "text-yellow-600", bgColor: "bg-yellow-500" },
  checkin: { icon: Users, color: "text-cyan-600", bgColor: "bg-cyan-500" },
  support: {
    icon: MessageSquare,
    color: "text-red-600",
    bgColor: "bg-red-500",
  },
  internal: { icon: Coffee, color: "text-gray-600", bgColor: "bg-gray-500" },
};

const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const weekDaysFull = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

const TeamCalendar = () => {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const { data: teamMembers = [] } = useTeamMembers();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem("calendar-view-mode");
    return (saved === "week" || saved === "month") ? saved : "month";
  });
  const [selectedMember, setSelectedMember] = useState<string>(() => {
    return localStorage.getItem("calendar-selected-member") || "all";
  });
  const [myTasksOnly, setMyTasksOnly] = useState(() => {
    return localStorage.getItem("calendar-my-tasks-only") === "true";
  });
  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem("calendar-view-mode", mode);
  };
  const handleSelectedMemberChange = (member: string) => {
    setSelectedMember(member);
    localStorage.setItem("calendar-selected-member", member);
  };
  const handleMyTasksOnlyChange = (value: boolean) => {
    setMyTasksOnly(value);
    localStorage.setItem("calendar-my-tasks-only", String(value));
  };

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Quick create modal state
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState<Date | undefined>();
  const [quickCreateHour, setQuickCreateHour] = useState<number | undefined>();
  const [quickCreateEndDate, setQuickCreateEndDate] = useState<Date | undefined>();

  // Fetch tasks
  const { data: allTasks = [] } = useTasks({
    responsavel_id: selectedMember !== "all" ? selectedMember : undefined,
  });

  const { data: myTasks = [] } = useMyTasks(
    myTasksOnly ? teamMember?.id : undefined
  );

  const baseTasks = myTasksOnly ? myTasks : allTasks;

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
          title: "Sincronização concluída! ✅",
          description: result.message,
        });
        window.location.reload();
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

  // Calculate calendar days for month view
  const monthDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { locale: ptBR });
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Calculate week days for week view
  const weekDaysInterval = useMemo(() => {
    const weekStart = startOfWeek(currentDate, { locale: ptBR });
    const weekEnd = endOfWeek(currentDate, { locale: ptBR });
    return eachDayOfInterval({ start: weekStart, end: weekEnd });
  }, [currentDate]);

  // Working hours for week view
  const workingHours = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => i + 8); // 8am to 7pm
  }, []);

  // Group tasks by date (com suporte a eventos multi-dia)
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};

    baseTasks.forEach((task) => {
      const startDateKey = task.scheduled_at || task.due_datetime;
      if (!startDateKey) return;

      const startDate = new Date(startDateKey);
      const endDate = task.end_datetime ? new Date(task.end_datetime) : startDate;

      // Se é evento multi-dia, adiciona em todos os dias
      if (task.end_datetime && endDate > startDate) {
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        daysInRange.forEach((day) => {
          const key = format(day, "yyyy-MM-dd");
          if (!map[key]) map[key] = [];
          // Evita duplicatas
          if (!map[key].find((t) => t.id === task.id)) {
            map[key].push(task);
          }
        });
      } else {
        // Evento de um dia só
        const key = format(startDate, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(task);
      }
    });

    return map;
  }, [baseTasks]);

  // Navigation
  const goToPrevious = () => {
    if (viewMode === "month") {
      setCurrentDate(subMonths(currentDate, 1));
    } else {
      setCurrentDate(subWeeks(currentDate, 1));
    }
  };

  const goToNext = () => {
    if (viewMode === "month") {
      setCurrentDate(addMonths(currentDate, 1));
    } else {
      setCurrentDate(addWeeks(currentDate, 1));
    }
  };

  const goToToday = () => setCurrentDate(new Date());

  const getTasksForDay = (day: Date) => {
    const key = format(day, "yyyy-MM-dd");
    return tasksByDate[key] || [];
  };

  // Separa eventos multi-dia dos eventos de um dia só
  const getSingleDayTasks = (day: Date) => {
    return getTasksForDay(day).filter((task) => {
      if (!task.end_datetime) return true;
      const start = new Date(task.scheduled_at!);
      const end = new Date(task.end_datetime);
      return isSameDay(start, end);
    });
  };

  // Retorna eventos multi-dia que começam ou continuam neste dia
  const getMultiDayTasksForWeekRow = (weekStart: Date, weekEnd: Date) => {
    const multiDayTasks: Array<{
      task: Task;
      startCol: number; // 0-6 (coluna no grid da semana)
      span: number; // quantas colunas ocupa
      isStart: boolean; // se é o início do evento
      isEnd: boolean; // se é o fim do evento
    }> = [];

    baseTasks.forEach((task) => {
      if (!task.end_datetime) return;

      const taskStart = new Date(task.scheduled_at!);
      const taskEnd = new Date(task.end_datetime);

      // Pula se é evento de um dia só
      if (isSameDay(taskStart, taskEnd)) return;

      // Verifica se o evento intersecta com esta semana
      if (taskEnd < weekStart || taskStart > weekEnd) return;

      // Calcula onde o evento começa nesta semana
      const effectiveStart = taskStart < weekStart ? weekStart : taskStart;
      const effectiveEnd = taskEnd > weekEnd ? weekEnd : taskEnd;

      const startCol = differenceInDays(effectiveStart, weekStart);
      const endCol = differenceInDays(effectiveEnd, weekStart);
      const span = endCol - startCol + 1;

      multiDayTasks.push({
        task,
        startCol: Math.max(0, startCol),
        span: Math.min(7, span),
        isStart: taskStart >= weekStart,
        isEnd: taskEnd <= weekEnd,
      });
    });

    return multiDayTasks;
  };

  const getTasksForHour = (day: Date, hour: number) => {
    return getTasksForDay(day).filter((task) => {
      const taskDate = task.scheduled_at;
      if (!taskDate) return false;
      const taskHour = new Date(taskDate).getHours();
      return taskHour === hour;
    });
  };

  // Handle click on day (month view) - opens quick create
  const handleDayClick = (day: Date, e: React.MouseEvent) => {
    // Só abre se clicou no espaço vazio (não em uma tarefa)
    if ((e.target as HTMLElement).closest('[data-task]')) return;

    setQuickCreateDate(day);
    setQuickCreateHour(undefined); // Dia inteiro
    setQuickCreateEndDate(undefined);
    setIsQuickCreateOpen(true);
  };

  // Handle click on hour (week view) - opens quick create with hour
  const handleHourClick = (day: Date, hour: number, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-task]')) return;

    setQuickCreateDate(day);
    setQuickCreateHour(hour);
    setQuickCreateEndDate(undefined);
    setIsQuickCreateOpen(true);
  };

  // Handle new task button
  const handleNewTask = () => {
    setQuickCreateDate(new Date());
    setQuickCreateHour(undefined);
    setQuickCreateEndDate(undefined);
    setIsQuickCreateOpen(true);
  };

  return (
    <AppLayout>
      <motion.div
        className="space-y-6"
        variants={pageVariants}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              Calendário do Time
            </h1>
            <p className="text-muted-foreground">
              Clique em um dia ou horário para criar uma tarefa
            </p>
          </div>
          <div className="flex gap-2">
            {teamMember?.google_calendar_connected && (
              <Button 
                variant="outline" 
                onClick={handleSyncGoogleCalendar} 
                disabled={isSyncing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Sincronizando...' : 'Sync Google'}
              </Button>
            )}
            <Button onClick={handleNewTask} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Tarefa
            </Button>
          </div>
        </div>

        {/* Controls */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              {/* Left side - Navigation */}
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={goToToday}>
                  Hoje
                </Button>
                <div className="flex items-center">
                  <Button variant="ghost" size="icon" onClick={goToPrevious}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={goToNext}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <h2 className="text-lg font-semibold min-w-[200px]">
                  {viewMode === "month"
                    ? format(currentDate, "MMMM yyyy", { locale: ptBR })
                    : `Semana de ${format(
                        startOfWeek(currentDate, { locale: ptBR }),
                        "d MMM",
                        { locale: ptBR }
                      )}`}
                </h2>
              </div>

              {/* Right side - Filters */}
              <div className="flex items-center gap-4">
                {/* View mode toggle */}
                <div className="flex items-center border rounded-lg p-1">
                  <Button
                    variant={viewMode === "month" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleViewModeChange("month")}
                    className="gap-1"
                  >
                    <CalendarDays className="h-4 w-4" />
                    Mês
                  </Button>
                  <Button
                    variant={viewMode === "week" ? "default" : "ghost"}
                    size="sm"
                    onClick={() => handleViewModeChange("week")}
                    className="gap-1"
                  >
                    <Calendar className="h-4 w-4" />
                    Semana
                  </Button>
                </div>

                {/* My tasks toggle */}
                {teamMember?.id && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-lg">
                    <Switch
                      id="my-tasks-calendar"
                      checked={myTasksOnly}
                      onCheckedChange={handleMyTasksOnlyChange}
                    />
                    <Label
                      htmlFor="my-tasks-calendar"
                      className="text-sm cursor-pointer"
                    >
                      Minhas tarefas
                    </Label>
                  </div>
                )}

                {/* Member filter */}
                {!myTasksOnly && (
                  <Select
                    value={selectedMember}
                    onValueChange={handleSelectedMemberChange}
                  >
                    <SelectTrigger className="w-[180px]">
                      <User className="h-4 w-4 mr-2 text-muted-foreground" />
                      <SelectValue placeholder="Membro do time" />
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
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Calendar Views */}
        {viewMode === "month" ? (
          /* Month View */
          <Card>
            <CardContent className="p-4">
              {/* Week days header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {weekDays.map((day) => (
                  <div
                    key={day}
                    className="text-center text-sm font-medium text-muted-foreground py-2"
                  >
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar grid - agrupado por semanas */}
              <div className="space-y-1">
                {/* Dividir monthDays em semanas de 7 dias */}
                {Array.from({ length: Math.ceil(monthDays.length / 7) }).map((_, weekIndex) => {
                  const weekDaysSlice = monthDays.slice(weekIndex * 7, weekIndex * 7 + 7);
                  const weekStart = weekDaysSlice[0];
                  const weekEnd = weekDaysSlice[weekDaysSlice.length - 1];
                  const multiDayTasks = getMultiDayTasksForWeekRow(weekStart, weekEnd);

                  return (
                    <div key={weekIndex} className="relative">
                      {/* Multi-day event bars - posicionadas acima do grid */}
                      {multiDayTasks.length > 0 && (
                        <div className="grid grid-cols-7 gap-1 mb-1">
                          {weekDaysSlice.map((_, colIndex) => {
                            // Encontra eventos que começam nesta coluna
                            const eventsStartingHere = multiDayTasks.filter(
                              (e) => e.startCol === colIndex
                            );

                            if (eventsStartingHere.length === 0) {
                              return <div key={colIndex} className="h-0" />;
                            }

                            return (
                              <div
                                key={colIndex}
                                className="relative"
                                style={{
                                  gridColumn: `span ${eventsStartingHere[0]?.span || 1}`,
                                }}
                              >
                                {eventsStartingHere.map((event) => {
                                  const config =
                                    taskTypeConfig[event.task.task_type] ||
                                    taskTypeConfig.internal;
                                  const Icon = config.icon;

                                  return (
                                    <Tooltip key={event.task.id}>
                                      <TooltipTrigger asChild>
                                        <div
                                          data-task
                                          className={cn(
                                            "flex items-center gap-1 text-[11px] px-2 py-1 text-white cursor-pointer transition-opacity hover:opacity-90 mb-0.5",
                                            config.bgColor,
                                            event.isStart ? "rounded-l-md" : "rounded-l-none border-l-0",
                                            event.isEnd ? "rounded-r-md" : "rounded-r-none"
                                          )}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTask(event.task);
                                            setIsDetailOpen(true);
                                          }}
                                        >
                                          <Icon className="h-3.5 w-3.5 flex-shrink-0" />
                                          <span className="truncate font-medium">
                                            {event.task.name.replace("🔒 ", "").replace(/\s*\(\d{2}\/\d{2}\s*-\s*\d{2}\/\d{2}\)/, "")}
                                          </span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <div className="space-y-1">
                                          <p className="font-medium">{event.task.name}</p>
                                          <p className="text-xs">
                                            {format(new Date(event.task.due_datetime!), "dd/MM")} - {format(new Date(event.task.end_datetime!), "dd/MM")}
                                          </p>
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Grid de dias da semana */}
                      <div className="grid grid-cols-7 gap-1">
                        {weekDaysSlice.map((day) => {
                          const singleDayTasks = getSingleDayTasks(day);
                          const isCurrentMonth = isSameMonth(day, currentDate);
                          const isCurrentDay = isToday(day);

                          return (
                            <div
                              key={day.toISOString()}
                              onClick={(e) => handleDayClick(day, e)}
                              className={cn(
                                "min-h-[80px] p-1.5 border rounded-lg cursor-pointer transition-all group",
                                !isCurrentMonth && "bg-muted/30 text-muted-foreground",
                                isCurrentDay && "ring-2 ring-primary",
                                "hover:bg-primary/5 hover:border-primary/30"
                              )}
                            >
                              {/* Day number */}
                              <div className="flex items-center justify-between mb-1">
                                <span
                                  className={cn(
                                    "text-sm font-medium",
                                    isCurrentDay &&
                                      "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center"
                                  )}
                                >
                                  {format(day, "d")}
                                </span>
                                <Plus className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>

                              {/* Single day task indicators - com horário visível */}
                              <div className="space-y-1">
                                {singleDayTasks.slice(0, 3).map((task) => {
                                  const config =
                                    taskTypeConfig[task.task_type] ||
                                    taskTypeConfig.internal;
                                  const Icon = config.icon;
                                  const taskTime = task.scheduled_at;
                                  const timeStr = taskTime ? format(new Date(taskTime), "HH:mm") : null;
                                  const showTime = timeStr && timeStr !== "09:00" && timeStr !== "12:00";

                                  return (
                                    <div
                                      key={task.id}
                                      data-task
                                      className="rounded cursor-pointer transition-all hover:ring-1 hover:ring-primary/50 bg-muted/50 hover:bg-muted"
                                      style={{
                                        borderLeft: '3px solid',
                                        borderLeftColor: config.bgColor.includes('blue') ? '#3b82f6' :
                                          config.bgColor.includes('green') ? '#22c55e' :
                                          config.bgColor.includes('indigo') ? '#6366f1' :
                                          config.bgColor.includes('orange') ? '#f97316' :
                                          config.bgColor.includes('yellow') ? '#eab308' :
                                          config.bgColor.includes('cyan') ? '#06b6d4' :
                                          config.bgColor.includes('red') ? '#ef4444' :
                                          config.bgColor.includes('purple') ? '#a855f7' : '#6b7280'
                                      }}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTask(task);
                                        setIsDetailOpen(true);
                                      }}
                                    >
                                      <div className="px-1.5 py-1">
                                        <div className="flex items-center gap-1.5">
                                          <Icon className={cn("h-3 w-3 flex-shrink-0", config.color)} />
                                          {showTime && (
                                            <span className="text-[10px] font-bold text-foreground">
                                              {timeStr}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-[10px] text-foreground/80 truncate leading-tight mt-0.5">
                                          {task.name.replace("🔒 ", "")}
                                        </p>
                                      </div>
                                    </div>
                                  );
                                })}
                                {singleDayTasks.length > 3 && (
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <div
                                        data-task
                                        className="text-[10px] text-primary font-semibold px-1.5 py-0.5 cursor-pointer hover:bg-primary/10 rounded"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        +{singleDayTasks.length - 3} mais
                                      </div>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-80 p-0" align="start">
                                      <div className="p-3 border-b bg-muted/30">
                                        <p className="font-semibold">
                                          {format(day, "EEEE, d 'de' MMMM", { locale: ptBR })}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{singleDayTasks.length} tarefas</p>
                                      </div>
                                      <div className="p-2 space-y-1.5 max-h-64 overflow-y-auto">
                                        {singleDayTasks.map((task) => {
                                          const taskConfig =
                                            taskTypeConfig[task.task_type] ||
                                            taskTypeConfig.internal;
                                          const TaskIcon = taskConfig.icon;
                                          const popoverTime = task.scheduled_at;
                                          const popoverTimeStr = popoverTime ? format(new Date(popoverTime), "HH:mm") : null;
                                          return (
                                            <div
                                              key={task.id}
                                              className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer border"
                                              onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailOpen(true);
                                              }}
                                            >
                                              <div className={cn("p-1.5 rounded-lg text-white flex-shrink-0", taskConfig.bgColor)}>
                                                <TaskIcon className="h-4 w-4" />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium truncate">{task.name}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                  {popoverTimeStr && (
                                                    <span className="text-xs font-bold text-foreground">{popoverTimeStr}</span>
                                                  )}
                                                  {task.organization?.name && (
                                                    <span className="text-xs text-muted-foreground truncate">• {task.organization.name}</span>
                                                  )}
                                                </div>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </PopoverContent>
                                  </Popover>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ) : (
          /* Week View */
          <Card>
            <CardContent className="p-4">
              {/* Week header */}
              <div className="grid grid-cols-8 gap-1 mb-2">
                <div className="w-16" /> {/* Time column spacer */}
                {weekDaysInterval.map((day, index) => (
                  <div
                    key={day.toISOString()}
                    className={cn(
                      "text-center p-2 rounded-lg cursor-pointer transition-colors hover:bg-muted/50",
                      isToday(day) && "bg-primary/10"
                    )}
                    onClick={(e) => handleDayClick(day, e)}
                  >
                    <p className="text-xs text-muted-foreground">
                      {weekDaysFull[index]}
                    </p>
                    <p
                      className={cn(
                        "text-lg font-semibold",
                        isToday(day) && "text-primary"
                      )}
                    >
                      {format(day, "d")}
                    </p>
                  </div>
                ))}
              </div>

              {/* Time grid */}
              <div className="border-t">
                {workingHours.map((hour) => (
                  <div
                    key={hour}
                    className="grid grid-cols-8 gap-1 border-b min-h-[60px]"
                  >
                    {/* Time label */}
                    <div className="w-16 pr-2 py-1 text-right text-xs text-muted-foreground">
                      {hour}:00
                    </div>

                    {/* Day cells */}
                    {weekDaysInterval.map((day) => {
                      const hourTasks = getTasksForHour(day, hour);

                      return (
                        <div
                          key={`${day.toISOString()}-${hour}`}
                          className={cn(
                            "border-l p-1 min-h-[60px] cursor-pointer transition-colors group",
                            isToday(day) && "bg-primary/5",
                            "hover:bg-primary/10"
                          )}
                          onClick={(e) => handleHourClick(day, hour, e)}
                        >
                          {/* Plus on hover */}
                          {hourTasks.length === 0 && (
                            <div className="h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Plus className="h-4 w-4 text-muted-foreground" />
                            </div>
                          )}

                          {hourTasks.map((task) => {
                            const config =
                              taskTypeConfig[task.task_type] ||
                              taskTypeConfig.internal;
                            const Icon = config.icon;
                            return (
                              <div
                                key={task.id}
                                data-task
                                className={cn(
                                  "flex items-center gap-1 p-1.5 rounded text-xs cursor-pointer hover:opacity-80 transition-opacity mb-1 text-white",
                                  config.bgColor
                                )}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedTask(task);
                                  setIsDetailOpen(true);
                                }}
                              >
                                <Icon className="h-3 w-3 flex-shrink-0" />
                                <span className="truncate font-medium">
                                  {task.name.replace("🔒 ", "")}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Legend */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-4">
              {Object.entries(taskTypeConfig).map(([type, config]) => {
                const Icon = config.icon;
                return (
                  <div
                    key={type}
                    className="flex items-center gap-2 text-sm"
                  >
                    <div className={cn("p-1 rounded text-white", config.bgColor)}>
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="text-muted-foreground capitalize">
                      {type === "follow_up"
                        ? "Tarefa"
                        : type === "checkin"
                        ? "Check-in"
                        : type === "internal"
                        ? "Bloqueio"
                        : type}
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Task Detail Modal */}
      <TaskDetailModal
        task={selectedTask}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />

      {/* Quick Create Modal */}
      <QuickCreateTaskModal
        open={isQuickCreateOpen}
        onOpenChange={setIsQuickCreateOpen}
        defaultDate={quickCreateDate}
        defaultHour={quickCreateHour}
        defaultEndDate={quickCreateEndDate}
      />
    </AppLayout>
  );
};

export default TeamCalendar;
