import { useMemo, useState } from "react";
import { format, formatDistanceToNow, isToday, isPast, isThisWeek, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Phone,
  MessageSquare,
  Mail,
  Video,
  Users,
  Headphones,
  RefreshCw,
  User,
  Building2,
  ExternalLink,
  Clock,
} from "lucide-react";
import { Task, useCompleteTask } from "@/hooks/useTasks";
import { TaskDetailModal } from "./TaskDetailModal";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";

interface TaskListGroupedProps {
  tasks: Task[];
  showGrouped?: boolean;
  onTaskUpdate?: () => void;
}

const taskTypeIcons: Record<string, any> = {
  call: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  meeting: Video,
  onboarding: Users,
  follow_up: RefreshCw,
  support: Headphones,
  checkin: CalendarDays,
  internal: CalendarClock,
  review: CalendarClock,
  renewal: RefreshCw,
  upsell: CalendarClock,
  rescue: AlertTriangle,
  nps: MessageSquare,
};

const taskTypeLabels: Record<string, string> = {
  call: "Ligação",
  whatsapp: "WhatsApp",
  email: "Email",
  meeting: "Reunião",
  onboarding: "Onboarding",
  follow_up: "Follow-up",
  support: "Suporte",
  checkin: "Check-in",
  internal: "Interna",
  review: "Revisão",
  renewal: "Renovação",
  upsell: "Upsell",
  rescue: "Resgate",
  nps: "NPS",
};

const priorityColors: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-blue-500",
};

interface TaskRowProps {
  task: Task;
  onComplete: (id: string) => void;
  onSelect: (task: Task) => void;
  showOverdueWarning?: boolean;
  isNextTask?: boolean;
}

function TaskRow({ task, onComplete, onSelect, showOverdueWarning, isNextTask }: TaskRowProps) {
  const Icon = taskTypeIcons[task.task_type] || CalendarClock;

  // Usar scheduled_at se existir, senão due_datetime
  const effectiveDate = task.scheduled_at;
  const isOverdue = !task.completed && effectiveDate && isPast(new Date(effectiveDate)) && !isToday(new Date(effectiveDate));

  // Verifica se está acontecendo agora (dentro de 15 minutos)
  const isHappeningNow = useMemo(() => {
    if (!effectiveDate || task.completed) return false;
    const taskDate = new Date(effectiveDate);
    const now = new Date();
    const diffMinutes = (taskDate.getTime() - now.getTime()) / (1000 * 60);
    return diffMinutes >= -30 && diffMinutes <= 15; // 30 min antes até 15 min depois
  }, [effectiveDate, task.completed]);

  const getTimeDisplay = () => {
    if (!effectiveDate) return null;
    const date = new Date(effectiveDate);

    if (isToday(date)) {
      return format(date, "HH:mm");
    }
    if (isTomorrow(date)) {
      return `Amanhã ${format(date, "HH:mm")}`;
    }
    if (isOverdue) {
      return formatDistanceToNow(date, { addSuffix: true, locale: ptBR });
    }
    return format(date, "dd/MM HH:mm");
  };

  const clientName = task.lead?.name || task.organization?.name;
  const clientType = task.lead ? "lead" : task.organization ? "cliente" : null;
  const clientLink = task.lead_id
    ? `/comercial/leads/${task.lead_id}`
    : task.organization_id
    ? `/clientes/${task.organization_id}`
    : null;

  return (
    <div
      className={cn(
        "group flex items-center gap-3 p-3 rounded-lg border-l-4 bg-white border hover:shadow-sm transition-all cursor-pointer",
        priorityColors[task.priority] || "border-l-gray-300",
        // Destaque para próxima tarefa
        isNextTask && !task.completed && "ring-2 ring-primary ring-offset-2 bg-primary/5 border-primary/30",
        // Destaque extra se está acontecendo agora
        isHappeningNow && "ring-2 ring-red-500 ring-offset-2 bg-red-50 border-red-300 animate-pulse",
        task.completed && "opacity-60 bg-gray-50",
        isOverdue && showOverdueWarning && "bg-red-50/50"
      )}
      onClick={() => onSelect(task)}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={task.completed}
          onCheckedChange={() => !task.completed && onComplete(task.id)}
          disabled={task.completed}
          className="h-5 w-5"
        />
      </div>

      {/* Icon */}
      <div className={cn(
        "p-2 rounded-lg flex-shrink-0 relative",
        task.completed ? "bg-gray-100" :
          isHappeningNow ? "bg-red-500" :
          isNextTask ? "bg-primary" : "bg-primary/10"
      )}>
        <Icon className={cn(
          "h-4 w-4",
          task.completed ? "text-gray-400" :
            (isHappeningNow || isNextTask) ? "text-white" : "text-primary"
        )} />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {/* Badge AGORA ou PRÓXIMA */}
          {isHappeningNow && !task.completed && (
            <Badge className="bg-red-500 text-white text-[10px] h-5 px-2 animate-pulse flex-shrink-0">
              🔴 AGORA
            </Badge>
          )}
          {isNextTask && !isHappeningNow && !task.completed && (
            <Badge className="bg-primary text-white text-[10px] h-5 px-2 flex-shrink-0">
              ▶ PRÓXIMA
            </Badge>
          )}
          <span className={cn(
            "font-medium text-sm truncate",
            task.completed && "line-through text-muted-foreground",
            isHappeningNow && !task.completed && "font-bold text-red-700",
            isNextTask && !isHappeningNow && !task.completed && "font-semibold text-primary"
          )}>
            {task.name}
          </span>
          <Badge variant="outline" className="text-[10px] h-5 flex-shrink-0">
            {taskTypeLabels[task.task_type] || task.task_type}
          </Badge>
        </div>

        {/* Client/Lead info */}
        {clientName && (
          <div className="flex items-center gap-1.5 mt-1">
            {clientType === "lead" ? (
              <User className="h-3 w-3 text-blue-500" />
            ) : (
              <Building2 className="h-3 w-3 text-green-500" />
            )}
            <span className="text-xs text-muted-foreground truncate">
              {clientName}
            </span>
            {clientLink && (
              <Link
                to={clientLink}
                onClick={(e) => e.stopPropagation()}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-primary" />
              </Link>
            )}
          </div>
        )}

        {/* Responsável */}
        {task.responsavel?.name && (
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-violet-600 font-medium">
              👤 {task.responsavel.name}
            </span>
          </div>
        )}
      </div>

      {/* Time */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {getTimeDisplay() && (
          <div className={cn(
            "flex items-center gap-1 text-xs px-2 py-1 rounded",
            isOverdue ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600"
          )}>
            <Clock className="h-3 w-3" />
            {getTimeDisplay()}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskGroupProps {
  title: string;
  icon: any;
  tasks: Task[];
  color: string;
  defaultExpanded?: boolean;
  onComplete: (id: string) => void;
  onSelect: (task: Task) => void;
  showOverdueWarning?: boolean;
  nextTaskId?: string;
}

function TaskGroup({
  title,
  icon: Icon,
  tasks,
  color,
  defaultExpanded = true,
  onComplete,
  onSelect,
  showOverdueWarning,
  nextTaskId
}: TaskGroupProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (tasks.length === 0) return null;

  // Verifica se este grupo contém a próxima tarefa
  const hasNextTask = nextTaskId && tasks.some(t => t.id === nextTaskId);

  return (
    <Card className={cn("border-l-4", color, hasNextTask && "ring-2 ring-primary/30")}>
      <CardHeader
        className="py-3 cursor-pointer hover:bg-gray-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <CardTitle className="text-sm font-semibold flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            {title}
            <Badge variant="secondary" className="ml-1">
              {tasks.length}
            </Badge>
            {hasNextTask && (
              <Badge className="bg-primary text-white text-[10px] ml-1">
                Próxima aqui
              </Badge>
            )}
          </div>
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onComplete={onComplete}
              onSelect={onSelect}
              showOverdueWarning={showOverdueWarning}
              isNextTask={task.id === nextTaskId}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export function TaskListGrouped({ tasks, showGrouped = true, onTaskUpdate }: TaskListGroupedProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const completeTask = useCompleteTask();

  const handleComplete = async (taskId: string) => {
    await completeTask.mutateAsync(taskId);
    onTaskUpdate?.();
  };

  // Group tasks
  const groupedTasks = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const weekEnd = new Date(todayStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const overdue: Task[] = [];
    const today: Task[] = [];
    const tomorrow: Task[] = [];
    const thisWeek: Task[] = [];
    const later: Task[] = [];
    const noDate: Task[] = [];
    const completed: Task[] = [];

    tasks.forEach((task) => {
      if (task.completed) {
        completed.push(task);
        return;
      }

      // Usar scheduled_at se existir, senão due_datetime
      const effectiveDate = task.scheduled_at;

      if (!effectiveDate) {
        noDate.push(task);
        return;
      }

      const dueDate = new Date(effectiveDate);

      if (dueDate < todayStart) {
        overdue.push(task);
      } else if (dueDate < todayEnd) {
        today.push(task);
      } else if (isTomorrow(dueDate)) {
        tomorrow.push(task);
      } else if (dueDate < weekEnd) {
        thisWeek.push(task);
      } else {
        later.push(task);
      }
    });

    // Sort each group by scheduled_at
    const sortByDate = (a: Task, b: Task) => {
      const dateA = a.scheduled_at;
      const dateB = b.scheduled_at;
      if (!dateA) return 1;
      if (!dateB) return -1;
      return new Date(dateA).getTime() - new Date(dateB).getTime();
    };

    overdue.sort(sortByDate);
    today.sort(sortByDate);
    tomorrow.sort(sortByDate);
    thisWeek.sort(sortByDate);
    later.sort(sortByDate);

    return { overdue, today, tomorrow, thisWeek, later, noDate, completed };
  }, [tasks]);

  // Calcular próxima tarefa (primeira não concluída mais próxima de agora)
  const nextTaskId = useMemo(() => {
    const now = new Date();

    // Tarefas pendentes ordenadas por data
    const pendingTasks = tasks
      .filter(t => !t.completed)
      .map(t => ({
        ...t,
        effectiveDate: t.scheduled_at
      }))
      .filter(t => t.effectiveDate)
      .sort((a, b) => {
        const dateA = new Date(a.effectiveDate!);
        const dateB = new Date(b.effectiveDate!);
        return dateA.getTime() - dateB.getTime();
      });

    // A próxima tarefa é a primeira que ainda não passou, ou se todas passaram, a mais recente atrasada
    const upcomingTask = pendingTasks.find(t => new Date(t.effectiveDate!) >= now);
    if (upcomingTask) return upcomingTask.id;

    // Se não tem nenhuma futura, pega a atrasada mais recente (última do array de atrasadas)
    const overdueTask = pendingTasks.filter(t => new Date(t.effectiveDate!) < now).pop();
    return overdueTask?.id;
  }, [tasks]);

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CalendarDays className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground font-medium">Nenhuma tarefa encontrada</p>
          <p className="text-sm text-muted-foreground">
            As tarefas aparecerão aqui quando forem criadas
          </p>
        </CardContent>
      </Card>
    );
  }

  // If not grouped, show all tasks in a single list
  if (!showGrouped) {
    return (
      <>
        <Card>
          <CardContent className="pt-4 space-y-2">
            {tasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                onComplete={handleComplete}
                onSelect={setSelectedTask}
                showOverdueWarning
                isNextTask={task.id === nextTaskId}
              />
            ))}
          </CardContent>
        </Card>

        {selectedTask && (
          <TaskDetailModal
            task={selectedTask}
            open={!!selectedTask}
            onOpenChange={(open) => !open && setSelectedTask(null)}
            onUpdate={onTaskUpdate}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Atrasadas - Sempre visível primeiro */}
        <TaskGroup
          title="ATRASADAS"
          icon={AlertTriangle}
          tasks={groupedTasks.overdue}
          color="border-l-red-500"
          defaultExpanded={true}
          onComplete={handleComplete}
          onSelect={setSelectedTask}
          showOverdueWarning
          nextTaskId={nextTaskId}
        />

        {/* Hoje */}
        <TaskGroup
          title="HOJE"
          icon={CalendarDays}
          tasks={groupedTasks.today}
          color="border-l-blue-500"
          defaultExpanded={true}
          onComplete={handleComplete}
          onSelect={setSelectedTask}
          nextTaskId={nextTaskId}
        />

        {/* Amanhã */}
        <TaskGroup
          title="AMANHÃ"
          icon={CalendarDays}
          tasks={groupedTasks.tomorrow}
          color="border-l-indigo-500"
          defaultExpanded={true}
          onComplete={handleComplete}
          onSelect={setSelectedTask}
          nextTaskId={nextTaskId}
        />

        {/* Esta Semana */}
        <TaskGroup
          title="ESTA SEMANA"
          icon={CalendarRange}
          tasks={groupedTasks.thisWeek}
          color="border-l-violet-500"
          defaultExpanded={groupedTasks.overdue.length === 0 && groupedTasks.today.length === 0}
          onComplete={handleComplete}
          onSelect={setSelectedTask}
          nextTaskId={nextTaskId}
        />

        {/* Próximas */}
        <TaskGroup
          title="PRÓXIMAS"
          icon={CalendarClock}
          tasks={groupedTasks.later}
          color="border-l-gray-400"
          defaultExpanded={false}
          onComplete={handleComplete}
          onSelect={setSelectedTask}
          nextTaskId={nextTaskId}
        />

        {/* Sem Data */}
        {groupedTasks.noDate.length > 0 && (
          <TaskGroup
            title="SEM DATA"
            icon={CalendarClock}
            tasks={groupedTasks.noDate}
            color="border-l-gray-300"
            defaultExpanded={false}
            onComplete={handleComplete}
            onSelect={setSelectedTask}
            nextTaskId={nextTaskId}
          />
        )}

        {/* Concluídas */}
        {groupedTasks.completed.length > 0 && (
          <TaskGroup
            title="CONCLUÍDAS"
            icon={CalendarDays}
            tasks={groupedTasks.completed}
            color="border-l-green-500"
            defaultExpanded={false}
            onComplete={handleComplete}
            onSelect={setSelectedTask}
          />
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          open={!!selectedTask}
          onOpenChange={(open) => !open && setSelectedTask(null)}
          onUpdate={onTaskUpdate}
        />
      )}
    </>
  );
}
