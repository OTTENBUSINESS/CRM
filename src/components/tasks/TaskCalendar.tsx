import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Task } from "@/hooks/useTasks";
import { TaskDetailModal } from "./TaskDetailModal";
import { QuickCreateTaskModal } from "./QuickCreateTaskModal";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Target,
  Users,
  Calendar,
  Coffee,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
  isSameDay,
  differenceInDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface TaskCalendarProps {
  tasks: Task[];
}

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

export function TaskCalendar({ tasks }: TaskCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // Quick create state
  const [isQuickCreateOpen, setIsQuickCreateOpen] = useState(false);
  const [quickCreateDate, setQuickCreateDate] = useState<Date | undefined>();

  // Calculate calendar days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calendarStart = startOfWeek(monthStart, { locale: ptBR });
    const calendarEnd = endOfWeek(monthEnd, { locale: ptBR });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentDate]);

  // Group tasks by date (para eventos de um dia só)
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};

    tasks.forEach((task) => {
      // Usar scheduled_at se existir, senão due_datetime
      const startDateKey = task.scheduled_at;
      if (!startDateKey) return;

      const startDate = new Date(startDateKey);
      const endDate = task.end_datetime ? new Date(task.end_datetime) : startDate;

      // Só adiciona eventos de um dia
      if (!task.end_datetime || isSameDay(startDate, endDate)) {
        const key = format(startDate, "yyyy-MM-dd");
        if (!map[key]) map[key] = [];
        map[key].push(task);
      }
    });

    return map;
  }, [tasks]);

  const goToPreviousMonth = () => setCurrentDate(subMonths(currentDate, 1));
  const goToNextMonth = () => setCurrentDate(addMonths(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getSingleDayTasks = (day: Date) => {
    const key = format(day, "yyyy-MM-dd");
    return tasksByDate[key] || [];
  };

  // Retorna eventos multi-dia para uma linha de semana
  const getMultiDayTasksForWeekRow = (weekStart: Date, weekEnd: Date) => {
    const multiDayTasks: Array<{
      task: Task;
      startCol: number;
      span: number;
      isStart: boolean;
      isEnd: boolean;
    }> = [];

    tasks.forEach((task) => {
      if (!task.end_datetime) return;

      // Usar scheduled_at se existir, senão due_datetime
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

  // Handle click on day - opens quick create
  const handleDayClick = (day: Date, e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-task]')) return;
    setQuickCreateDate(day);
    setIsQuickCreateOpen(true);
  };

  return (
    <>
      <Card>
        <CardContent className="p-4">
          {/* Calendar header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">
                {format(currentDate, "MMMM yyyy", { locale: ptBR })}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={goToToday}>
                Hoje
              </Button>
              <Button variant="ghost" size="icon" onClick={goToPreviousMonth}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={goToNextMonth}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Hint */}
          <p className="text-xs text-muted-foreground mb-4">
            Clique em um dia para criar uma nova tarefa
          </p>

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
            {Array.from({ length: Math.ceil(calendarDays.length / 7) }).map((_, weekIndex) => {
              const weekDaysSlice = calendarDays.slice(weekIndex * 7, weekIndex * 7 + 7);
              const weekStart = weekDaysSlice[0];
              const weekEnd = weekDaysSlice[weekDaysSlice.length - 1];
              const multiDayTasks = getMultiDayTasksForWeekRow(weekStart, weekEnd);

              return (
                <div key={weekIndex} className="relative">
                  {/* Multi-day event bars */}
                  {multiDayTasks.length > 0 && (
                    <div className="grid grid-cols-7 gap-1 mb-1">
                      {weekDaysSlice.map((_, colIndex) => {
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
                                        "flex items-center gap-1 text-[10px] px-2 py-1 text-white cursor-pointer transition-opacity hover:opacity-90 mb-0.5",
                                        config.bgColor,
                                        event.isStart ? "rounded-l-md" : "rounded-l-none",
                                        event.isEnd ? "rounded-r-md" : "rounded-r-none"
                                      )}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedTask(event.task);
                                        setIsDetailOpen(true);
                                      }}
                                    >
                                      <Icon className="h-3 w-3 flex-shrink-0" />
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

                  {/* Grid de dias */}
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
                            "min-h-[70px] p-1 border rounded-lg cursor-pointer transition-all group",
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
                            <Plus className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
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
                                    {task.responsavel?.name && (
                                      <p className="text-[9px] text-violet-600 font-medium truncate">
                                        👤 {task.responsavel.name}
                                      </p>
                                    )}
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
                                            <div className="flex items-center gap-2">
                                              {popoverTimeStr && (
                                                <span className="text-xs font-bold text-foreground">{popoverTimeStr}</span>
                                              )}
                                              {task.responsavel?.name && (
                                                <span className="text-xs text-violet-600 font-medium">
                                                  👤 {task.responsavel.name}
                                                </span>
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

          {/* Legend */}
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
            {Object.entries(taskTypeConfig)
              .slice(0, 6)
              .map(([type, config]) => (
                <div key={type} className="flex items-center gap-1.5 text-xs">
                  <div className={cn("w-3 h-3 rounded", config.bgColor)} />
                  <span className="text-muted-foreground capitalize">
                    {type === "follow_up"
                      ? "Tarefa"
                      : type === "internal"
                      ? "Bloqueio"
                      : type}
                  </span>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      <TaskDetailModal
        task={selectedTask}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />

      <QuickCreateTaskModal
        open={isQuickCreateOpen}
        onOpenChange={setIsQuickCreateOpen}
        defaultDate={quickCreateDate}
      />
    </>
  );
}
