import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Task, useUpdateTask, useCompleteTask } from "@/hooks/useTasks";
import { TaskDetailModal } from "./TaskDetailModal";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  Clock,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Play,
  GripVertical,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Target,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type TaskStatus = "not_started" | "scheduled" | "in_progress" | "completed";

interface KanbanColumn {
  status: TaskStatus;
  title: string;
  icon: React.ElementType;
  colorClass: string;
  iconColorClass: string;
}

const columns: KanbanColumn[] = [
  {
    status: "not_started",
    title: "Não Iniciadas",
    icon: AlertCircle,
    colorClass: "border-t-gray-400",
    iconColorClass: "bg-gray-100 text-gray-600",
  },
  {
    status: "scheduled",
    title: "Agendadas",
    icon: Calendar,
    colorClass: "border-t-blue-500",
    iconColorClass: "bg-blue-100 text-blue-600",
  },
  {
    status: "in_progress",
    title: "Em Andamento",
    icon: Play,
    colorClass: "border-t-yellow-500",
    iconColorClass: "bg-yellow-100 text-yellow-600",
  },
  {
    status: "completed",
    title: "Concluídas",
    icon: CheckCircle2,
    colorClass: "border-t-green-500",
    iconColorClass: "bg-green-100 text-green-600",
  },
];

const taskTypeIcons: Record<string, React.ElementType> = {
  call: Phone,
  whatsapp: MessageSquare,
  email: Mail,
  meeting: Video,
  onboarding: Target,
  follow_up: Clock,
  checkin: Users,
  support: MessageSquare,
  internal: Calendar,
};

const priorityColors: Record<string, string> = {
  high: "bg-red-500",
  medium: "bg-yellow-500",
  low: "bg-green-500",
};

interface TaskKanbanProps {
  tasks: Task[];
  onTaskUpdate?: () => void;
}

interface DraggableTaskCardProps {
  task: Task;
  onClick: () => void;
}

function DraggableTaskCard({ task, onClick }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: task.id,
      data: { task },
    });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  const Icon = taskTypeIcons[task.task_type] || Calendar;
  const isOverdue =
    task.due_datetime &&
    !task.completed &&
    new Date(task.due_datetime) < new Date();

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "hover:shadow-md transition-all cursor-pointer group",
        isDragging && "shadow-xl ring-2 ring-primary",
        isOverdue && "border-red-200 bg-red-50/30"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          {/* Drag handle */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted rounded flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>

          {/* Icon */}
          <div
            className={cn(
              "p-1.5 rounded-md flex-shrink-0",
              task.team === "sales"
                ? "bg-purple-100 text-purple-600"
                : task.team === "cs"
                ? "bg-blue-100 text-blue-600"
                : task.team === "marketing"
                ? "bg-pink-100 text-pink-600"
                : "bg-gray-100 text-gray-600"
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-medium text-sm line-clamp-1">
                {task.name}
              </span>
              <div
                className={cn(
                  "h-2 w-2 rounded-full flex-shrink-0",
                  priorityColors[task.priority]
                )}
              />
            </div>

            {/* Meta info */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {task.due_datetime && (
                <span
                  className={cn(
                    "flex items-center gap-1",
                    isOverdue && "text-red-500 font-medium"
                  )}
                >
                  <Clock className="h-3 w-3" />
                  {format(new Date(task.due_datetime), "dd/MM HH:mm", {
                    locale: ptBR,
                  })}
                </span>
              )}
            </div>

            {/* Linked entity */}
            {(task.organization?.name || task.lead?.name) && (
              <p className="text-xs text-muted-foreground mt-1 truncate">
                {task.organization?.name || task.lead?.name}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface DroppableColumnProps {
  column: KanbanColumn;
  children: React.ReactNode;
  count: number;
}

function DroppableColumn({ column, children, count }: DroppableColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.status,
  });

  return (
    <div className="flex flex-col h-full">
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3 px-1">
        <div className={cn("p-2 rounded-lg", column.iconColorClass)}>
          <column.icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-sm">{column.title}</h3>
        </div>
        <Badge variant="secondary" className="text-xs">
          {count}
        </Badge>
      </div>

      {/* Droppable area */}
      <div
        ref={setNodeRef}
        className={cn(
          "flex-1 space-y-2 p-2 rounded-lg transition-colors min-h-[200px]",
          isOver && "bg-primary/5 ring-2 ring-primary ring-dashed"
        )}
      >
        {children}
        {count === 0 && (
          <div className="flex items-center justify-center h-24 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
            Arraste tarefas aqui
          </div>
        )}
      </div>
    </div>
  );
}

export function TaskKanban({ tasks, onTaskUpdate }: TaskKanbanProps) {
  const { toast } = useToast();
  const updateTask = useUpdateTask();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const result: Record<TaskStatus, Task[]> = {
      not_started: [],
      scheduled: [],
      in_progress: [],
      completed: [],
    };

    tasks.forEach((task) => {
      // Map other statuses to our kanban columns
      let status = task.status as TaskStatus;
      if (status === "confirmed") status = "scheduled";
      if (status === "cancelled" || status === "no_show") status = "completed";
      if (status === "rescheduled") status = "scheduled";
      if (status === "monitoring_7d" || status === "ongoing")
        status = "in_progress";

      if (result[status]) {
        result[status].push(task);
      } else {
        result.not_started.push(task);
      }
    });

    return result;
  }, [tasks]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const task = active.data.current?.task as Task;
    const newStatus = over.id as TaskStatus;

    // Find current status
    let currentStatus: TaskStatus = "not_started";
    for (const [status, statusTasks] of Object.entries(tasksByStatus)) {
      if (statusTasks.find((t) => t.id === task.id)) {
        currentStatus = status as TaskStatus;
        break;
      }
    }

    if (currentStatus !== newStatus) {
      try {
        await updateTask.mutateAsync({
          id: task.id,
          status: newStatus,
          completed: newStatus === "completed",
          completed_at:
            newStatus === "completed" ? new Date().toISOString() : undefined,
        });
        toast({
          title: "Tarefa movida!",
          description: `"${task.name}" movida para "${columns.find((c) => c.status === newStatus)?.title}"`,
        });
        onTaskUpdate?.();
      } catch (error) {
        toast({
          title: "Erro ao mover tarefa",
          description: "Tente novamente",
          variant: "destructive",
        });
      }
    }
  };

  const activeTask = activeId ? tasks.find((t) => t.id === activeId) : null;

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full">
          {columns.map((column) => (
            <Card
              key={column.status}
              className={cn("border-t-4", column.colorClass)}
            >
              <CardContent className="p-3 h-full">
                <DroppableColumn
                  column={column}
                  count={tasksByStatus[column.status].length}
                >
                  {tasksByStatus[column.status].map((task) => (
                    <DraggableTaskCard
                      key={task.id}
                      task={task}
                      onClick={() => {
                        setSelectedTask(task);
                        setIsDetailOpen(true);
                      }}
                    />
                  ))}
                </DroppableColumn>
              </CardContent>
            </Card>
          ))}
        </div>

        <DragOverlay>
          {activeTask && (
            <Card className="shadow-2xl ring-2 ring-primary rotate-3 opacity-90 w-64">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-muted">
                    <Calendar className="h-3.5 w-3.5" />
                  </div>
                  <span className="font-medium text-sm truncate">
                    {activeTask.name}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal
        task={selectedTask}
        open={isDetailOpen}
        onOpenChange={setIsDetailOpen}
      />
    </>
  );
}
