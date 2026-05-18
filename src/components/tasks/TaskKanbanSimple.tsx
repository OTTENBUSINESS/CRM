import { useMemo, useState } from "react";
import { format, isPast, isToday } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  MessageSquare,
  Mail,
  Video,
  Users,
  Headphones,
  RefreshCw,
  CalendarDays,
  CalendarClock,
  AlertTriangle,
  Clock,
  User,
  Building2,
  GripVertical,
  CheckCircle2,
  PlayCircle,
  Circle,
} from "lucide-react";
import { Task, useUpdateTask } from "@/hooks/useTasks";
import { TaskDetailModal } from "./TaskDetailModal";
import { cn } from "@/lib/utils";

interface TaskKanbanSimpleProps {
  tasks: Task[];
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

type KanbanColumn = "todo" | "in_progress" | "done";

interface KanbanColumnConfig {
  id: KanbanColumn;
  title: string;
  icon: any;
  color: string;
  bgColor: string;
  borderColor: string;
}

const columns: KanbanColumnConfig[] = [
  {
    id: "todo",
    title: "A Fazer",
    icon: Circle,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
  },
  {
    id: "in_progress",
    title: "Em Andamento",
    icon: PlayCircle,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  {
    id: "done",
    title: "Concluído",
    icon: CheckCircle2,
    color: "text-green-600",
    bgColor: "bg-green-50",
    borderColor: "border-green-200",
  },
];

// Map task status to kanban column
function getKanbanColumn(task: Task): KanbanColumn {
  if (task.completed || task.status === "completed") return "done";
  if (task.status === "in_progress" || task.status === "ongoing" || task.status === "monitoring_7d") return "in_progress";
  return "todo";
}

// Map kanban column to task status
function getTaskStatus(column: KanbanColumn): { status: Task["status"]; completed: boolean } {
  switch (column) {
    case "done":
      return { status: "completed", completed: true };
    case "in_progress":
      return { status: "in_progress", completed: false };
    default:
      return { status: "not_started", completed: false };
  }
}

interface KanbanCardProps {
  task: Task;
  onClick: () => void;
  onDragStart: () => void;
}

function KanbanCard({ task, onClick, onDragStart }: KanbanCardProps) {
  const Icon = taskTypeIcons[task.task_type] || CalendarClock;
  const isOverdue = !task.completed && task.due_datetime && isPast(new Date(task.due_datetime)) && !isToday(new Date(task.due_datetime));

  const clientName = task.lead?.name || task.organization?.name;
  const clientType = task.lead ? "lead" : task.organization ? "cliente" : null;

  return (
    <div
      className={cn(
        "p-3 rounded-lg bg-white border shadow-sm cursor-pointer hover:shadow-md transition-all",
        isOverdue && "border-red-300 bg-red-50/50"
      )}
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", task.id);
        onDragStart();
      }}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <div className={cn(
          "p-1.5 rounded flex-shrink-0",
          task.completed ? "bg-gray-100" : "bg-primary/10"
        )}>
          <Icon className={cn(
            "h-3.5 w-3.5",
            task.completed ? "text-gray-400" : "text-primary"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium line-clamp-2",
            task.completed && "line-through text-muted-foreground"
          )}>
            {task.name}
          </p>
        </div>
        <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 cursor-grab" />
      </div>

      {/* Client info */}
      {clientName && (
        <div className="flex items-center gap-1.5 mt-2">
          {clientType === "lead" ? (
            <User className="h-3 w-3 text-blue-500" />
          ) : (
            <Building2 className="h-3 w-3 text-green-500" />
          )}
          <span className="text-xs text-muted-foreground truncate">
            {clientName}
          </span>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t">
        <Badge variant="outline" className="text-[10px] h-5">
          {taskTypeLabels[task.task_type] || task.task_type}
        </Badge>

        {task.due_datetime && (
          <div className={cn(
            "flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded",
            isOverdue ? "bg-red-100 text-red-700 font-medium" : "bg-gray-100 text-gray-600"
          )}>
            <Clock className="h-2.5 w-2.5" />
            {format(new Date(task.due_datetime), "dd/MM HH:mm")}
          </div>
        )}
      </div>

      {/* Priority indicator */}
      <div className={cn(
        "absolute top-0 left-0 w-1 h-full rounded-l",
        task.priority === "high" && "bg-red-500",
        task.priority === "medium" && "bg-amber-500",
        task.priority === "low" && "bg-blue-500"
      )} />
    </div>
  );
}

interface KanbanColumnComponentProps {
  config: KanbanColumnConfig;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onDrop: (taskId: string, column: KanbanColumn) => void;
}

function KanbanColumnComponent({ config, tasks, onTaskClick, onDrop }: KanbanColumnComponentProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const taskId = e.dataTransfer.getData("taskId");
    if (taskId) {
      onDrop(taskId, config.id);
    }
  };

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl border-2 transition-all min-h-[500px]",
        config.borderColor,
        config.bgColor,
        isDragOver && "ring-2 ring-primary ring-offset-2"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column Header */}
      <div className={cn("p-4 border-b", config.borderColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <config.icon className={cn("h-5 w-5", config.color)} />
            <h3 className={cn("font-semibold", config.color)}>{config.title}</h3>
          </div>
          <Badge variant="secondary" className="text-sm">
            {tasks.length}
          </Badge>
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 p-3 space-y-2 overflow-y-auto">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Arraste tarefas para cá
          </div>
        ) : (
          tasks.map((task) => (
            <div key={task.id} className="relative">
              <KanbanCard
                task={task}
                onClick={() => onTaskClick(task)}
                onDragStart={() => {}}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export function TaskKanbanSimple({ tasks, onTaskUpdate }: TaskKanbanSimpleProps) {
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const updateTask = useUpdateTask();

  // Group tasks by kanban column
  const tasksByColumn = useMemo(() => {
    const grouped: Record<KanbanColumn, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };

    tasks.forEach((task) => {
      const column = getKanbanColumn(task);
      grouped[column].push(task);
    });

    // Sort each column by due_datetime
    Object.values(grouped).forEach((columnTasks) => {
      columnTasks.sort((a, b) => {
        if (!a.due_datetime) return 1;
        if (!b.due_datetime) return -1;
        return new Date(a.due_datetime).getTime() - new Date(b.due_datetime).getTime();
      });
    });

    return grouped;
  }, [tasks]);

  const handleDrop = async (taskId: string, column: KanbanColumn) => {
    const task = tasks.find((t) => t.id === taskId);
    if (!task) return;

    const currentColumn = getKanbanColumn(task);
    if (currentColumn === column) return;

    const { status, completed } = getTaskStatus(column);

    await updateTask.mutateAsync({
      id: taskId,
      status,
      completed,
      completed_at: completed ? new Date().toISOString() : null,
    });

    onTaskUpdate?.();
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {columns.map((config) => (
          <KanbanColumnComponent
            key={config.id}
            config={config}
            tasks={tasksByColumn[config.id]}
            onTaskClick={setSelectedTask}
            onDrop={handleDrop}
          />
        ))}
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
