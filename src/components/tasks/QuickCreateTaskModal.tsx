import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCreateTask, CreateTaskInput } from "@/hooks/useTasks";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Clock,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Target,
  Users,
  Loader2,
  ChevronDown,
  Plane,
  Coffee,
  X,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// Função para converter string "YYYY-MM-DD" para Date local (evita problema de timezone)
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0); // Usa meio-dia para evitar problemas
}

interface QuickCreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
  defaultHour?: number;
  defaultEndDate?: Date;
}

// Tipos rápidos de eventos (inspirado no Google Calendar)
const quickTypes = [
  { value: "meeting", label: "Reunião", icon: Video, color: "bg-indigo-500" },
  { value: "call", label: "Ligação", icon: Phone, color: "bg-blue-500" },
  { value: "internal", label: "Bloqueio", icon: Coffee, color: "bg-gray-500" },
  { value: "follow_up", label: "Tarefa", icon: Clock, color: "bg-yellow-500" },
];

const taskTypes = [
  { value: "call", label: "Ligação", icon: Phone },
  { value: "whatsapp", label: "WhatsApp", icon: MessageSquare },
  { value: "email", label: "Email", icon: Mail },
  { value: "meeting", label: "Reunião", icon: Video },
  { value: "onboarding", label: "Onboarding", icon: Target },
  { value: "follow_up", label: "Follow-up", icon: Clock },
  { value: "checkin", label: "Check-in", icon: Users },
  { value: "support", label: "Suporte", icon: MessageSquare },
  { value: "internal", label: "Bloqueio/Interna", icon: Coffee },
];

const teams = [
  { value: "sales", label: "Comercial" },
  { value: "cs", label: "CS" },
  { value: "marketing", label: "Marketing" },
  { value: "internal", label: "Interno" },
];

const priorities = [
  { value: "high", label: "Alta", color: "text-red-500" },
  { value: "medium", label: "Média", color: "text-yellow-500" },
  { value: "low", label: "Baixa", color: "text-green-500" },
];

export function QuickCreateTaskModal({
  open,
  onOpenChange,
  defaultDate,
  defaultHour,
  defaultEndDate,
}: QuickCreateTaskModalProps) {
  const { toast } = useToast();
  const createTask = useCreateTask();
  const { data: teamMembers = [] } = useTeamMembers();
  const { teamMember: currentUser } = useAuth();

  const [title, setTitle] = useState("");
  const [selectedType, setSelectedType] = useState("meeting");
  const [isAllDay, setIsAllDay] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [description, setDescription] = useState("");
  const [team, setTeam] = useState<string>("internal");
  const [priority, setPriority] = useState<string>("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);

  // Reset form quando abre
  useEffect(() => {
    if (open) {
      setTitle("");
      setSelectedType("meeting");
      setDescription("");
      setShowMoreOptions(false);
      setAssigneeId(currentUser?.id || "");
      setParticipants([]);

      // Se tem data padrão, usa ela
      if (defaultDate) {
        setStartDate(format(defaultDate, "yyyy-MM-dd"));
        setEndDate(format(defaultEndDate || defaultDate, "yyyy-MM-dd"));

        // Se tem hora padrão, preenche
        if (defaultHour !== undefined) {
          setStartTime(`${String(defaultHour).padStart(2, "0")}:00`);
          setEndTime(`${String(defaultHour + 1).padStart(2, "0")}:00`);
          setIsAllDay(false);
        } else {
          // Se clicou no dia (não na hora), assume dia inteiro
          setIsAllDay(true);
          setStartTime("09:00");
          setEndTime("18:00");
        }

        // Se tem data fim diferente, é multi-dia
        if (defaultEndDate && defaultEndDate > defaultDate) {
          setIsAllDay(true);
        }
      } else {
        // Hoje como padrão
        const today = new Date();
        setStartDate(format(today, "yyyy-MM-dd"));
        setEndDate(format(today, "yyyy-MM-dd"));
        setIsAllDay(false);
        setStartTime("09:00");
        setEndTime("10:00");
      }
    }
  }, [open, defaultDate, defaultHour, defaultEndDate, currentUser?.id]);

  const handleAddParticipant = (memberId: string) => {
    if (!participants.includes(memberId)) {
      setParticipants([...participants, memberId]);
    }
  };

  const handleRemoveParticipant = (memberId: string) => {
    setParticipants(participants.filter((id) => id !== memberId));
  };

  const getParticipantName = (memberId: string) => {
    return teamMembers.find((m) => m.id === memberId)?.name || "Desconhecido";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({
        title: "Título obrigatório",
        description: "Digite um título para a tarefa",
        variant: "destructive",
      });
      return;
    }

    try {
      // Monta datetime com timezone de Brasília (-03:00)
      // Isso evita problemas de conversão UTC que mudam o dia
      let dueDateTime: string | undefined;
      let endDateTime: string | undefined;
      let scheduledAt: string | undefined;

      if (isAllDay) {
        // Para dia inteiro, usa 09:00 do dia (horário comercial) com timezone Brasília
        dueDateTime = `${startDate}T09:00:00-03:00`;
        // Se tem data fim diferente, salva end_datetime
        if (endDate && endDate !== startDate) {
          endDateTime = `${endDate}T18:00:00-03:00`;
        }
      } else {
        // Com horário específico, usa timezone Brasília
        dueDateTime = `${startDate}T${startTime}:00-03:00`;
        scheduledAt = `${startDate}T${startTime}:00-03:00`;
        // Calcula end_datetime baseado no horário fim
        if (endTime) {
          endDateTime = `${startDate}T${endTime}:00-03:00`;
        }
      }

      // Determina o nome baseado no tipo
      let taskName = title;
      if (selectedType === "internal" && !title.toLowerCase().includes("bloqueio")) {
        taskName = `🔒 ${title}`; // Indica bloqueio
      }

      // Combinar participantes: responsável + participantes selecionados
      const allParticipants = [
        ...(assigneeId ? [assigneeId] : []),
        ...participants.filter(id => id !== assigneeId),
      ];

      await createTask.mutateAsync({
        name: taskName,
        description: description || undefined,
        task_type: selectedType as CreateTaskInput["task_type"],
        team: team as CreateTaskInput["team"],
        priority: priority as "high" | "medium" | "low",
        due_datetime: dueDateTime,
        end_datetime: endDateTime,
        is_all_day: isAllDay,
        scheduled_at: scheduledAt,
        responsavel_id: assigneeId || undefined,
        participants: allParticipants.length > 0 ? allParticipants : undefined,
        status: scheduledAt ? "scheduled" : "not_started",
      });

      toast({
        title: "Tarefa criada!",
        description: isAllDay
          ? `${format(parseLocalDate(startDate), "dd MMM", { locale: ptBR })}${endDate !== startDate ? ` - ${format(parseLocalDate(endDate), "dd MMM", { locale: ptBR })}` : ""}`
          : `${format(parseLocalDate(startDate), "dd MMM", { locale: ptBR })} às ${startTime}`,
      });

      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro ao criar tarefa",
        variant: "destructive",
      });
    }
  };

  const selectedQuickType = quickTypes.find((t) => t.value === selectedType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] p-0 gap-0">
        {/* Header colorido baseado no tipo */}
        <div
          className={cn(
            "p-4 text-white rounded-t-lg",
            selectedQuickType?.color || "bg-indigo-500"
          )}
        >
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              {selectedQuickType && (
                <selectedQuickType.icon className="h-5 w-5" />
              )}
              Nova {selectedQuickType?.label || "Tarefa"}
            </DialogTitle>
          </DialogHeader>

          {/* Input do título - estilo Google Calendar */}
          <Input
            autoFocus
            placeholder="Adicionar título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-3 bg-white/20 border-0 text-white placeholder:text-white/70 text-lg font-medium focus-visible:ring-white/50"
          />
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Seletor de tipo rápido */}
          <div className="flex gap-2">
            {quickTypes.map((type) => {
              const Icon = type.icon;
              const isSelected = selectedType === type.value;
              return (
                <button
                  key={type.value}
                  type="button"
                  onClick={() => setSelectedType(type.value)}
                  className={cn(
                    "flex-1 flex flex-col items-center gap-1 p-2 rounded-lg border-2 transition-all",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-transparent bg-muted/50 hover:bg-muted"
                  )}
                >
                  <div
                    className={cn(
                      "p-1.5 rounded-full",
                      isSelected ? type.color + " text-white" : "bg-muted"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span className="text-xs font-medium">{type.label}</span>
                </button>
              );
            })}
          </div>

          {/* Toggle Dia Inteiro */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Dia inteiro</span>
            </div>
            <Switch checked={isAllDay} onCheckedChange={setIsAllDay} />
          </div>

          {/* Datas */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {/* Data início */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Início</Label>
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    // Se data fim é menor, atualiza
                    if (e.target.value > endDate) {
                      setEndDate(e.target.value);
                    }
                  }}
                  className="h-9"
                />
              </div>

              {/* Data fim */}
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fim</Label>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  className="h-9"
                />
              </div>
            </div>

            {/* Horários (só mostra se não é dia inteiro) */}
            {!isAllDay && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Hora início
                  </Label>
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">
                    Hora fim
                  </Label>
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Preview do período */}
          {startDate && (
            <div className="text-sm text-center text-muted-foreground">
              {isAllDay ? (
                startDate === endDate ? (
                  <span>
                    {format(parseLocalDate(startDate), "EEEE, d 'de' MMMM", {
                      locale: ptBR,
                    })}{" "}
                    - Dia inteiro
                  </span>
                ) : (
                  <span>
                    {format(parseLocalDate(startDate), "d MMM", { locale: ptBR })} até{" "}
                    {format(parseLocalDate(endDate), "d MMM yyyy", { locale: ptBR })}
                  </span>
                )
              ) : (
                <span>
                  {format(parseLocalDate(startDate), "EEE, d MMM", { locale: ptBR })}{" "}
                  das {startTime} às {endTime}
                </span>
              )}
            </div>
          )}

          {/* Mais opções (colapsável) */}
          <Collapsible open={showMoreOptions} onOpenChange={setShowMoreOptions}>
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between text-muted-foreground"
              >
                Mais opções
                <ChevronDown
                  className={cn(
                    "h-4 w-4 transition-transform",
                    showMoreOptions && "rotate-180"
                  )}
                />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-4 pt-2">
              {/* Responsável */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Responsável
                </Label>
                <Select value={assigneeId} onValueChange={setAssigneeId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Selecionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tipo completo */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          <div className="flex items-center gap-2">
                            <type.icon className="h-4 w-4" />
                            {type.label}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Área</Label>
                  <Select value={team} onValueChange={setTeam}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Prioridade */}
              <div className="space-y-1">
                <Label className="text-xs">Prioridade</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {priorities.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        <span className={p.color}>{p.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Participantes */}
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1">
                  <UserPlus className="h-3 w-3" />
                  Participantes
                </Label>
                <Select value="" onValueChange={handleAddParticipant}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Adicionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamMembers
                      .filter((m) => !participants.includes(m.id))
                      .map((member) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {participants.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {participants.map((id) => (
                      <Badge
                        key={id}
                        variant="secondary"
                        className="text-xs pr-1"
                      >
                        {getParticipantName(id)}
                        <button
                          type="button"
                          onClick={() => handleRemoveParticipant(id)}
                          className="ml-1 hover:bg-muted rounded-full"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Descrição */}
              <div className="space-y-1">
                <Label className="text-xs">Descrição</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detalhes adicionais..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Botões */}
          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createTask.isPending}
              className={cn("flex-1", selectedQuickType?.color)}
            >
              {createTask.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
