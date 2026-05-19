import { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useCreateTask, useUpdateTask, CreateTaskInput } from "@/hooks/useTasks";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { createCalendarEvent } from "@/services/googleCalendar";
import { checkCalendarAvailability, getDaySchedule, type AvailabilityResult, type DayScheduleItem } from "@/services/calendarAvailability";
import { TaskDetailModal } from "@/components/tasks/TaskDetailModal";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, parse } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Clock,
  Phone,
  Video,
  MessageSquare,
  Mail,
  Users,
  Target,
  Loader2,
  Sparkles,
  Link as LinkIcon,
  MoreHorizontal,
  Plus,
  X,
  AlertTriangle,
  CheckCircle2,
  Repeat,
} from "lucide-react";
import { cn, ensureHttps } from "@/lib/utils";

function addBrasiliaTimezone(datetime: string | undefined): string | undefined {
  if (!datetime) return undefined;
  if (datetime.includes('+') || datetime.includes('-', 10)) return datetime;
  return `${datetime}:00-03:00`;
}

interface CreateTaskModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void; // Callback chamado quando tarefa é criada com sucesso
  /** Extra z-index class for overlay + content (e.g. "z-[90]" when inside focus mode) */
  zClass?: string;
  defaultValues?: {
    organization_id?: string;
    organization_name?: string;
    lead_id?: string;
    lead_name?: string;
    team?: 'sales' | 'cs' | 'marketing' | 'internal';
    task_type?: CreateTaskInput['task_type'];
    event_id?: string;
    // Campos adicionais para pré-preencher
    title?: string;
    description?: string;
    due_datetime?: string;
    priority?: 'high' | 'medium' | 'low';
  };
}

const taskTypes = [
  { value: 'call', label: 'Ligação', icon: Phone },
  { value: 'meeting', label: 'Reunião', icon: Video },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'follow_up', label: 'Follow-up', icon: Clock },
  { value: 'onboarding', label: 'Onboarding', icon: Target },
  { value: 'checkin', label: 'Check-in', icon: Users },
  { value: 'internal', label: 'Interna', icon: CalendarIcon },
  { value: 'other', label: 'Outro...', icon: MoreHorizontal },
];

const defaultTitleByType: Record<string, string> = {
  call: 'Ligação',
  meeting: 'Reunião IA na Prática',
  whatsapp: 'Mensagem WhatsApp',
  email: 'Email',
  follow_up: 'Follow-up',
  onboarding: 'Onboarding',
  checkin: 'Check-in',
  internal: 'Tarefa interna',
  other: '',
};

function getFirstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0];
}

// Tipos que podem ter transcrição
const transcriptionTypes = ['call', 'meeting', 'onboarding'];

// Tipos que podem ter link de reunião
const meetingTypes = ['call', 'meeting', 'onboarding'];

// Tipos que bloqueiam agenda (reuniões e onboarding ocupam horário; calls só com Meet)
const conflictCheckTypes = ['meeting', 'onboarding'];

// Durações disponíveis
const durations = [
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 45, label: "45 minutos" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2 horas" },
];

export function CreateTaskModal({ open, onOpenChange, onSuccess, defaultValues, zClass }: CreateTaskModalProps) {
  const { toast } = useToast();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { teamMember: currentUser } = useAuth();

  // Buscar usuários do sistema (team_members)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, email, role, team, google_calendar_connected')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  // Buscar leads que têm deals criados
  const { data: leads = [] } = useQuery({
    queryKey: ['leads-with-deals'],
    queryFn: async () => {
      const { data } = await supabase
        .from('leads')
        .select('id, name, organization:organizations(id, name)')
        .order('name');
      return data || [];
    },
  });


  const [taskType, setTaskType] = useState(defaultValues?.task_type || 'call');
  const [selectedTeam, setSelectedTeam] = useState<string>(defaultValues?.team || currentUser?.team || 'sales');
  const [customType, setCustomType] = useState('');
  const [title, setTitle] = useState('');
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [dateTime, setDateTime] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [notes, setNotes] = useState('');
  const [transcription, setTranscription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Estado para recorrência
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceIntervalDays, setRecurrenceIntervalDays] = useState(2);
  const [isCritical, setIsCritical] = useState(false);

  // Estado para vínculo com cliente (lead)
  const [selectedLeadId, setSelectedLeadId] = useState<string | undefined>(defaultValues?.lead_id);

  // Novos estados para Google Calendar
  const [meetingType, setMeetingType] = useState<'auto' | 'external' | 'none'>('none');
  const [duration, setDuration] = useState(60);
  const [additionalAttendees, setAdditionalAttendees] = useState<string[]>([]);
  const [newAttendee, setNewAttendee] = useState('');
  
  // Estado para participantes internos (membros do time)
  const [selectedInternalParticipants, setSelectedInternalParticipants] = useState<string[]>([]);

  // Estados para checagem de disponibilidade
  const [availabilityResults, setAvailabilityResults] = useState<AvailabilityResult[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [hasConflicts, setHasConflicts] = useState(false);
  
  // Mini agenda do dia
  const [daySchedule, setDaySchedule] = useState<DayScheduleItem[]>([]);

  // Estado para ver detalhes de tarefa conflitante
  const [conflictTask, setConflictTask] = useState<any>(null);
  
  // Buscar tarefa conflitante quando clicar
  const handleViewConflictTask = async (taskId: string) => {
    console.log("[CreateTaskModal] Clicou na tarefa conflitante:", taskId);
    
    const { data, error } = await supabase
      .from("company_activities")
      .select(`
        *,
        lead:leads!company_activities_lead_id_fkey(id, name),
        organization:organizations!company_activities_organization_id_fkey(id, name),
        responsavel:team_members!company_activities_responsavel_id_fkey(id, name)
      `)
      .eq("id", taskId)
      .single();
    
    console.log("[CreateTaskModal] Tarefa buscada:", data, error);
    
    if (data) {
      setConflictTask(data);
    }
  };

  // Detecta se data é passada
  const isPastDate = useMemo(() => {
    if (!dateTime) return false;
    return new Date(dateTime) < new Date();
  }, [dateTime]);

  // Pode ter transcrição?
  const canHaveTranscription = transcriptionTypes.includes(taskType);

  // Pode criar Meet automático? Verifica se o RESPONSÁVEL tem Google Calendar conectado
  const assignee = teamMembers.find((m: any) => m.id === assigneeId);
  const currentUserMember = teamMembers.find((m: any) => m.id === currentUser?.id);
  // Allow creating Meet if assignee OR creator has Google Calendar connected
  const calendarOwner = assignee?.google_calendar_connected ? assignee : (currentUserMember?.google_calendar_connected ? currentUserMember : null);
  const canCreateMeet = !!calendarOwner && meetingTypes.includes(taskType);

  // Reset form ao abrir (NÃO depende de currentUser para evitar resetar form inteiro)
  useEffect(() => {
    if (open) {
      setTaskType(defaultValues?.task_type || 'call');
      setCustomType('');
      setTitleManuallyEdited(!!defaultValues?.title);
      setTitle(defaultValues?.title || '');
      setNotes(defaultValues?.description || '');
      if (defaultValues?.due_datetime) {
        const date = new Date(defaultValues.due_datetime);
        if (!isNaN(date.getTime())) {
          const localDateTime = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
          setDateTime(localDateTime);
        } else {
          setDateTime('');
        }
      } else {
        const now = new Date();
        const mins = now.getMinutes();
        const nextSlot = mins < 30 ? 30 : 60;
        const rounded = new Date(now);
        rounded.setMinutes(nextSlot, 0, 0);
        if (nextSlot === 60) rounded.setHours(rounded.getHours());
        const todayDefault = `${rounded.getFullYear()}-${String(rounded.getMonth() + 1).padStart(2, '0')}-${String(rounded.getDate()).padStart(2, '0')}T${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`;
        setDateTime(todayDefault);
      }
      setMeetingLink('');
      setTranscription('');
      setDuration(60);
      setAdditionalAttendees([]);
      setNewAttendee('');
      setSelectedInternalParticipants([]);
      setAvailabilityResults([]);
      setHasConflicts(false);
      setIsRecurring(false);
      setRecurrenceIntervalDays(2);
      setSelectedLeadId(defaultValues?.lead_id);
      setSelectedTeam(defaultValues?.team || currentUser?.team || 'sales');
    }
  }, [open, defaultValues?.task_type, defaultValues?.title, defaultValues?.description, defaultValues?.due_datetime, defaultValues?.lead_id, defaultValues?.team, currentUser?.team]);

  // Auto-gera título baseado no tipo + lead selecionado
  useEffect(() => {
    if (!open || titleManuallyEdited) return;
    const leadName = leads.find((l: any) => l.id === selectedLeadId)?.name || defaultValues?.lead_name;
    const base = defaultTitleByType[taskType] || '';
    if (leadName) {
      const firstName = getFirstName(leadName);
      // Meetings use "&", other types use "com"
      const separator = taskType === 'meeting' ? '&' : 'com';
      setTitle(`${base} ${separator} ${firstName}`);
    } else {
      setTitle(base);
    }
  }, [open, taskType, selectedLeadId, titleManuallyEdited, leads, defaultValues?.lead_name]);

  // Pré-seleciona responsável = usuário logado (separado para não resetar form inteiro)
  useEffect(() => {
    if (open && currentUser?.id) {
      setAssigneeId(currentUser.id);
      // Calls default to 'none' (Meet is optional), meetings default to 'auto'
      setMeetingType(taskType === 'call' ? 'none' : 'auto');
    }
  }, [open, currentUser?.id, taskType]);

  // Função para verificar disponibilidade
  const checkAvailability = useCallback(async () => {
    // Só verifica conflito para reuniões/onboarding e calls com Meet vinculado
    const shouldCheckConflict = conflictCheckTypes.includes(taskType) || (taskType === 'call' && meetingType !== 'none');
    if (!shouldCheckConflict || !dateTime || isPastDate || !assigneeId) {
      setAvailabilityResults([]);
      setHasConflicts(false);
      return;
    }

    // Coletar IDs: responsável + participantes internos
    const teamMemberIds = [assigneeId, ...selectedInternalParticipants].filter(Boolean);
    
    if (teamMemberIds.length === 0) {
      setAvailabilityResults([]);
      setHasConflicts(false);
      return;
    }

    setIsCheckingAvailability(true);
    
    try {
      const result = await checkCalendarAvailability(teamMemberIds, dateTime, duration);
      
      if (result.success) {
        setAvailabilityResults(result.results);
        setHasConflicts(result.has_conflicts);
      } else {
        console.error("Erro ao verificar disponibilidade:", result.error);
        setAvailabilityResults([]);
        setHasConflicts(false);
      }
    } catch (error) {
      console.error("Erro ao verificar disponibilidade:", error);
      setAvailabilityResults([]);
      setHasConflicts(false);
    } finally {
      setIsCheckingAvailability(false);
    }
  }, [taskType, dateTime, isPastDate, assigneeId, selectedInternalParticipants, duration]);

  // Verificar disponibilidade quando mudar data/hora, duração, responsável ou participantes
  useEffect(() => {
    // Debounce de 800ms
    const timeoutId = setTimeout(() => {
      checkAvailability();
    }, 800);

    return () => clearTimeout(timeoutId);
  }, [checkAvailability]);

  // Buscar agenda do dia quando mudar data ou responsável
  const selectedDateStr = dateTime ? dateTime.split("T")[0] : "";
  useEffect(() => {
    if (!assigneeId || !selectedDateStr) {
      setDaySchedule([]);
      return;
    }
    const timeoutId = setTimeout(() => {
      getDaySchedule(assigneeId, selectedDateStr).then(setDaySchedule);
    }, 500);
    return () => clearTimeout(timeoutId);
  }, [assigneeId, selectedDateStr]);

  // Handlers para participantes adicionais
  const handleAddAttendee = () => {
    if (newAttendee && newAttendee.includes("@") && !additionalAttendees.includes(newAttendee)) {
      setAdditionalAttendees([...additionalAttendees, newAttendee]);
      setNewAttendee("");
    }
  };

  const handleAddTeamMember = (email: string) => {
    if (email && !additionalAttendees.includes(email)) {
      setAdditionalAttendees([...additionalAttendees, email]);
    }
  };

  const handleRemoveAttendee = (email: string) => {
    setAdditionalAttendees(additionalAttendees.filter((a) => a !== email));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      toast({ title: "Erro", description: "Título é obrigatório", variant: "destructive" });
      return;
    }

    setIsProcessing(true);

    try {
      const finalTaskType = taskType === 'other' ? 'internal' : taskType;
      const finalTitle = taskType === 'other' && customType
        ? `[${customType}] ${title}`
        : title;

      // Normalizar meeting link: trim + ensureHttps + validar que é URL (não email)
      let finalMeetingLink = meetingLink.trim();
      if (finalMeetingLink && (finalMeetingLink.includes('@') || !finalMeetingLink.includes('.'))) {
        finalMeetingLink = ''; // Ignorar emails e strings inválidas
      } else if (finalMeetingLink) {
        finalMeetingLink = ensureHttps(finalMeetingLink);
      }

      // Variável para armazenar o eventId do Google Calendar
      let googleEventId: string | undefined;

      // Determinar lead_id e organization_id finais
      const finalLeadId = selectedLeadId || undefined;
      const selectedLead = selectedLeadId ? leads.find((l: any) => l.id === selectedLeadId) : null;
      // Prioridade: organization do lead selecionado > defaultValues.organization_id
      const finalOrganizationId = selectedLead?.organization?.id || defaultValues?.organization_id || undefined;

      // Se é um tipo que suporta reunião e usuário escolheu criar Meet automático
      if (meetingTypes.includes(taskType) && !isPastDate && meetingType === 'auto' && dateTime && assigneeId && canCreateMeet) {
        toast({ title: "Criando evento...", description: "Aguarde, criando evento no Google Calendar" });

        try {
          // Buscar email do lead/cliente
          let clientEmail = '';
          let clientName = defaultValues?.lead_name || 'Lead';

          if (finalLeadId) {
            const { data: lead } = await supabase
              .from('leads')
              .select('email, name')
              .eq('id', finalLeadId)
              .single();
            clientEmail = lead?.email || '';
            clientName = lead?.name || clientName;
          }

          // Coletar emails dos participantes internos selecionados
          const internalParticipantEmails = selectedInternalParticipants
            .map(id => teamMembers.find((m: any) => m.id === id)?.email)
            .filter(Boolean) as string[];

          // Use calendar of assignee if connected, otherwise fall back to creator's calendar
          const calendarMemberId = assignee?.google_calendar_connected ? assigneeId : currentUser?.id || assigneeId;
          const calendarMember = teamMembers.find((m: any) => m.id === calendarMemberId);

          // If using creator's calendar, add assignee as attendee
          const assigneeAsAttendee = calendarMemberId !== assigneeId && assignee?.email ? [assignee.email] : [];

          const calendarResult = await createCalendarEvent({
            title: finalTitle,
            description: `${notes || ''}\n\nTarefa criada pelo sistema.`,
            startDateTime: addBrasiliaTimezone(dateTime) || dateTime,
            durationMinutes: duration,
            attendees: [
              ...(clientEmail ? [clientEmail] : []),
              ...additionalAttendees,
              ...internalParticipantEmails,
              ...assigneeAsAttendee,
            ],
            organizerEmail: calendarMember?.email || currentUser?.email || '',
          }, calendarMemberId);

          finalMeetingLink = calendarResult.meetLink;
          googleEventId = calendarResult.eventId;
          toast({ title: "Evento criado!", description: "Link do Meet gerado automaticamente" });
        } catch (calError) {
          console.error('Erro ao criar evento no Calendar:', calError);
          toast({
            title: "Aviso",
            description: "Não foi possível criar o evento no Calendar. A tarefa será criada sem o link do Meet.",
            variant: "destructive"
          });
        }
      }

      // Agora responsavel_id é diretamente o team_member_id
      const responsavelId = assigneeId;

      // Combinar participantes: responsável + criador (se diferente) + participantes internos
      const allParticipants = [
        ...(assigneeId ? [assigneeId] : []),
        // Auto-add creator as participant when different from assignee (SDR gets notified)
        ...(currentUser?.id && currentUser.id !== assigneeId ? [currentUser.id] : []),
        ...selectedInternalParticipants.filter(id => id !== assigneeId && id !== currentUser?.id),
      ];

      const createdTask = await createTask.mutateAsync({
        name: finalTitle,
        description: transcription
          ? `${notes}\n\n--- TRANSCRIÇÃO ---\n${transcription}`.trim()
          : notes || undefined,
        task_type: finalTaskType as CreateTaskInput['task_type'],
        team: selectedTeam || defaultValues?.team || 'sales',
        priority: 'medium',
        organization_id: finalOrganizationId,
        lead_id: finalLeadId,
        marketing_event_id: defaultValues?.event_id || undefined,
        scheduled_at: dateTime ? addBrasiliaTimezone(dateTime) : undefined,
        due_datetime: dateTime ? addBrasiliaTimezone(dateTime) : undefined,
        meeting_link: finalMeetingLink || undefined,
        responsavel_id: responsavelId,
        created_by_id: currentUser?.id || undefined,
        participants: allParticipants.length > 0 ? allParticipants : undefined,
        status: isPastDate && canHaveTranscription ? 'completed' : (dateTime ? 'scheduled' : 'not_started'),
        is_recurring: isRecurring,
        recurrence_interval_days: isRecurring ? recurrenceIntervalDays : undefined,
        is_critical: isCritical || undefined,
      } as any);

      // Se criou evento no Google Calendar, atualizar a tarefa com o google_event_id
      // Isso evita duplicação quando o sync do Google Calendar rodar
      if (googleEventId && createdTask?.id) {
        await supabase
          .from('company_activities')
          .update({ 
            google_event_id: googleEventId,
            google_calendar_synced: true 
          })
          .eq('id', createdTask.id);
      }

      // NOTA: Auto-move para "Call Agendada" foi removido por segurança (trigger do AI agent)

      // Enviar email de agendamento se é reunião futura com lead vinculado
      if (meetingTypes.includes(taskType) && !isPastDate && finalLeadId && dateTime) {
        try {
          // Buscar deal ativo do lead para contexto
          let dealId: string | undefined;
          const { data: activeDeal } = await supabase
            .from('deals')
            .select('id')
            .eq('lead_id', finalLeadId)
            .in('status', ['open', 'negotiation'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (activeDeal) dealId = activeDeal.id;

          await supabase.functions.invoke('send-meeting-email', {
            body: {
              lead_id: finalLeadId,
              email_type: 'scheduled',
              meeting_date: addBrasiliaTimezone(dateTime) || dateTime,
              meeting_duration_minutes: duration,
              specialist_id: assigneeId,
              meet_link: finalMeetingLink || undefined,
              deal_id: dealId,
            },
          });
          console.log('📧 Email de agendamento enviado');
        } catch (emailErr) {
          console.error('Erro ao enviar email de agendamento:', emailErr);
          // Não bloqueia a criação da tarefa
        }
      }

      // Processar transcrição com IA se tiver
      if (isPastDate && transcription && finalLeadId) {
        toast({ title: "Analisando...", description: "Processando transcrição com IA" });

        try {
          const { data, error } = await supabase.functions.invoke('process-call-transcription', {
            body: {
              lead_id: finalLeadId,
              task_id: createdTask?.id,
              transcription,
              call_title: title,
              call_date: dateTime,
            },
          });

          if (error) throw error;

          toast({
            title: "Registrado!",
            description: `Análise concluída. Score ${data.score_change >= 0 ? '+' : ''}${data.score_change}`,
          });
        } catch {
          toast({ title: "Registrado", description: "Transcrição salva (análise IA falhou)", variant: "destructive" });
        }
      } else {
        toast({ title: "Criado!", description: "Tarefa criada com sucesso" });
      }

      // Chamar callback de sucesso se fornecido
      onSuccess?.();
      onOpenChange(false);
    } catch {
      toast({ title: "Erro", description: "Erro ao criar tarefa", variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  // Determinar nome do cliente vinculado
  const linkedToName = useMemo(() => {
    if (selectedLeadId) {
      const lead = leads.find((l: any) => l.id === selectedLeadId);
      return lead?.name || defaultValues?.lead_name;
    }
    // Se não tem lead mas tem organization, mostrar nome da organização
    if (defaultValues?.organization_id && defaultValues?.organization_name) {
      return defaultValues.organization_name;
    }
    return null;
  }, [selectedLeadId, leads, defaultValues?.lead_name, defaultValues?.organization_id, defaultValues?.organization_name]);

  const typeConfig = taskTypes.find(t => t.value === taskType);
  const TypeIcon = typeConfig?.icon || CalendarIcon;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[680px] max-h-[90vh] flex flex-col", zClass)} overlayClassName={zClass}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-5 w-5 text-muted-foreground" />
            Nova Tarefa
            {linkedToName && (
              <span className="font-normal text-muted-foreground text-sm">• {linkedToName}</span>
            )}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Criar nova tarefa com tipo, responsável, data e horário
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 min-h-0 pr-1">
          {/* Layout em 2 colunas */}
          <div className="grid grid-cols-2 gap-4">
            {/* COLUNA ESQUERDA - Configurações */}
            <div className="space-y-3">
              {/* Tipo e Respons\u00e1vel */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={taskType} onValueChange={setTaskType}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {taskTypes.map((type) => {
                        const Icon = type.icon;
                        return (
                          <SelectItem key={type.value} value={type.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              {type.label}
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Respons\u00e1vel</Label>
                  <Select value={assigneeId} onValueChange={setAssigneeId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecionar..." />
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers.map((m: any) => (
                        <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Campo customizado para "Outro" */}
              {taskType === 'other' && (
                <div className="space-y-1">
                  <Label className="text-xs">Qual tipo?</Label>
                  <Input
                    placeholder="Ex: Pesquisa"
                    value={customType}
                    onChange={(e) => setCustomType(e.target.value)}
                    className="h-9"
                  />
                </div>
              )}

              {/* Vincular a Cliente - só mostra se não veio pré-definido */}
              {!defaultValues?.lead_id && !defaultValues?.organization_id && (
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    Cliente
                  </Label>
                  <SearchableSelect
                    options={leads.map((lead: any) => ({
                      value: lead.id,
                      label: lead.name,
                      sublabel: lead.organization?.name,
                    }))}
                    value={selectedLeadId}
                    onValueChange={(v) => setSelectedLeadId(v || undefined)}
                    placeholder="Buscar cliente..."
                    searchPlaceholder="Digite o nome do cliente..."
                    emptyMessage="Nenhum cliente encontrado."
                  />
                </div>
              )}

              {/* Data/Hora e Duração */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data</Label>
                  <Popover modal>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-9 w-full justify-start text-left font-normal",
                          !dateTime && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateTime && !isNaN(new Date(dateTime).getTime()) ? format(new Date(dateTime), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0 z-[60]" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={dateTime ? new Date(dateTime) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const currentTime = dateTime ? dateTime.split('T')[1] || '09:00' : '09:00';
                            setDateTime(`${format(date, 'yyyy-MM-dd')}T${currentTime}`);
                          }
                        }}
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hora</Label>
                  <TimeInput
                    value={dateTime ? dateTime.split('T')[1]?.substring(0, 5) || '09:00' : '09:00'}
                    onChange={(time) => {
                      const currentDate = dateTime ? dateTime.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                      setDateTime(`${currentDate}T${time}`);
                    }}
                  />
                </div>
              </div>
              
              {/* Duração - só aparece quando relevante */}
              {meetingTypes.includes(taskType) && !isPastDate && dateTime && meetingType === 'auto' && canCreateMeet && (
                <div className="space-y-1">
                  <Label className="text-xs">Duração</Label>
                  <Select value={duration.toString()} onValueChange={(v) => setDuration(parseInt(v))}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {durations.map((d) => (
                        <SelectItem key={d.value} value={d.value.toString()}>{d.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Tarefa Recorrente (Pendência) */}
              {!['meeting', 'onboarding'].includes(taskType) && !isPastDate && (
                <div className="space-y-2 p-2 bg-teal-50/50 rounded-lg border border-teal-200/50">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="recurring-switch" className="text-xs flex items-center gap-1.5 cursor-pointer">
                      <Repeat className="h-3.5 w-3.5 text-teal-600" />
                      Tarefa recorrente
                    </Label>
                    <Switch
                      id="recurring-switch"
                      checked={isRecurring}
                      onCheckedChange={setIsRecurring}
                    />
                  </div>
                  {isRecurring && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Renovar a cada</span>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={recurrenceIntervalDays}
                          onChange={(e) => setRecurrenceIntervalDays(Math.max(1, parseInt(e.target.value) || 1))}
                          className="h-7 w-16 text-xs text-center"
                        />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {[
                          { label: 'Diário', days: 1 },
                          { label: '2 dias', days: 2 },
                          { label: 'Semanal', days: 7 },
                          { label: 'Quinzenal', days: 15 },
                          { label: 'Mensal', days: 30 },
                        ].map(({ label, days }) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => setRecurrenceIntervalDays(days)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                              recurrenceIntervalDays === days
                                ? "bg-teal-600 text-white border-teal-600"
                                : "bg-white text-teal-700 border-teal-300 hover:bg-teal-50"
                            )}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tarefa Crucial */}
              <div className="flex items-center justify-between p-2 bg-red-50/50 rounded-lg border border-red-200/50">
                <Label htmlFor="critical-switch" className="text-xs flex items-center gap-1.5 cursor-pointer">
                  <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                  <span className="text-red-700 font-medium">Tarefa Crucial</span>
                  <span className="text-[10px] text-red-500 font-normal">(cobrada a cada 2h)</span>
                </Label>
                <Switch
                  id="critical-switch"
                  checked={isCritical}
                  onCheckedChange={setIsCritical}
                />
              </div>

              {/* Participantes Internos - compacto */}
              {meetingTypes.includes(taskType) && (
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Participantes internos
                  </Label>
                  <div className="flex flex-wrap gap-1 min-h-[32px] items-center">
                    {selectedInternalParticipants.map((participantId) => {
                      const member = teamMembers.find((m: any) => m.id === participantId);
                      if (!member) return null;
                      return (
                        <Badge key={participantId} variant="secondary" className="text-[10px] h-6 flex items-center gap-1 pr-1">
                          {member.name}
                          <button 
                            type="button"
                            onClick={() => setSelectedInternalParticipants(prev => prev.filter(id => id !== participantId))} 
                            className="hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    <Select 
                      value="" 
                      onValueChange={(id) => {
                        if (id && !selectedInternalParticipants.includes(id) && id !== assigneeId) {
                          setSelectedInternalParticipants(prev => [...prev, id]);
                        }
                      }}
                    >
                      <SelectTrigger className="h-6 w-auto border-dashed text-xs px-2">
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers
                          .filter((m: any) => m.id !== assigneeId && !selectedInternalParticipants.includes(m.id))
                          .map((m: any) => (
                            <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {/* Mini Agenda do Dia + Disponibilidade */}
              {(conflictCheckTypes.includes(taskType) || (taskType === 'call' && meetingType !== 'none')) && dateTime && !isPastDate && (assigneeId || selectedInternalParticipants.length > 0) && (
                <div className={cn(
                  "p-3 rounded-lg border-2",
                  hasConflicts ? "bg-red-950/50 border-red-500/40" : "bg-green-950/30 border-green-500/30"
                )}>
                  <div className="flex items-center gap-2 mb-2">
                    {hasConflicts ? (
                      <AlertTriangle className="h-4 w-4 text-red-400" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-green-400" />
                    )}
                    <Label className={cn(
                      "text-sm font-semibold",
                      hasConflicts ? "text-red-300" : "text-green-300"
                    )}>
                      {isCheckingAvailability ? "Verificando..." : hasConflicts ? "Conflito de Agenda" : "Agenda Livre"}
                    </Label>
                    {isCheckingAvailability && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  </div>

                  {/* Mini timeline do dia */}
                  {dateTime && (daySchedule.length > 0 || hasConflicts) && (() => {
                    const selectedDate = dateTime.split("T")[0];
                    const timePart = dateTime.split("T")[1] || "08:00";
                    const [selH, selM] = timePart.split(":").map(Number);
                    const proposedStartMin = selH * 60 + selM;
                    const proposedEndMin = proposedStartMin + duration;

                    // Calculate visible window: 1h before first item to 1h after last, or around proposed time
                    const allStartMins = daySchedule.map(item => {
                      const d = new Date(item.start);
                      return d.getHours() * 60 + d.getMinutes();
                    });
                    allStartMins.push(proposedStartMin);
                    const windowStart = Math.max(0, Math.min(...allStartMins) - 60);
                    const windowEnd = Math.min(24 * 60, Math.max(proposedEndMin, ...allStartMins.map((_, i) => {
                      const item = daySchedule[i];
                      if (!item) return proposedEndMin;
                      const d = new Date(item.end);
                      return d.getHours() * 60 + d.getMinutes();
                    })) + 60);
                    const totalMinutes = windowEnd - windowStart;

                    // Generate hour labels
                    const hourLabels: number[] = [];
                    for (let h = Math.ceil(windowStart / 60); h * 60 <= windowEnd; h++) {
                      hourLabels.push(h);
                    }

                    return (
                      <div className="mt-2 mb-2">
                        <p className="text-[10px] text-muted-foreground mb-1.5">
                          Agenda de {format(new Date(`${selectedDate}T12:00:00`), "EEEE, dd/MM", { locale: ptBR })}
                        </p>
                        <div className="relative bg-background/50 rounded border border-border/50 overflow-y-auto" style={{ maxHeight: '140px', minHeight: '60px' }}>
                          {/* Hour markers */}
                          <div className="relative" style={{ height: `${Math.max(totalMinutes * 0.7, 60)}px` }}>
                            {hourLabels.map(h => {
                              const top = ((h * 60 - windowStart) / totalMinutes) * 100;
                              return (
                                <div key={h} className="absolute left-0 right-0 flex items-start" style={{ top: `${top}%` }}>
                                  <span className="text-[9px] text-muted-foreground w-8 text-right pr-1 -mt-1.5 shrink-0">
                                    {String(h).padStart(2, '0')}h
                                  </span>
                                  <div className="flex-1 border-t border-border/30" />
                                </div>
                              );
                            })}

                            {/* Existing items */}
                            {daySchedule.map(item => {
                              const iStart = new Date(item.start);
                              const iEnd = new Date(item.end);
                              const startMin = iStart.getHours() * 60 + iStart.getMinutes();
                              const endMin = iEnd.getHours() * 60 + iEnd.getMinutes();
                              const top = ((startMin - windowStart) / totalMinutes) * 100;
                              const height = ((endMin - startMin) / totalMinutes) * 100;

                              const isConflict = proposedStartMin < endMin && proposedEndMin > startMin;

                              return (
                                <div
                                  key={item.id}
                                  className={cn(
                                    "absolute left-9 right-1 rounded px-1.5 py-0.5 text-[10px] truncate border-l-2",
                                    item.type === "block" && "bg-zinc-800 border-l-zinc-500 text-zinc-300",
                                    item.type === "google" && "bg-blue-950/60 border-l-blue-400 text-blue-200",
                                    item.type === "task" && item.taskType === "meeting" && "bg-indigo-950/60 border-l-indigo-400 text-indigo-200",
                                    item.type === "task" && item.taskType === "call" && "bg-blue-950/60 border-l-blue-400 text-blue-200",
                                    item.type === "task" && item.taskType === "onboarding" && "bg-orange-950/60 border-l-orange-400 text-orange-200",
                                    isConflict && "ring-1 ring-red-500/50"
                                  )}
                                  style={{
                                    top: `${top}%`,
                                    height: `${Math.max(height, 2.5)}%`,
                                    minHeight: '16px',
                                  }}
                                  title={`${format(iStart, "HH:mm")} - ${format(iEnd, "HH:mm")}: ${item.name}`}
                                >
                                  <span className="font-medium">{format(iStart, "HH:mm")}</span>{' '}
                                  {item.name}
                                </div>
                              );
                            })}

                            {/* Proposed new task */}
                            {(() => {
                              const top = ((proposedStartMin - windowStart) / totalMinutes) * 100;
                              const height = ((duration) / totalMinutes) * 100;
                              return (
                                <div
                                  className="absolute left-9 right-1 rounded px-1.5 py-0.5 text-[10px] truncate border-l-2 bg-green-950/60 border-l-green-400 text-green-200 border border-dashed border-green-500/40"
                                  style={{
                                    top: `${top}%`,
                                    height: `${Math.max(height, 2.5)}%`,
                                    minHeight: '16px',
                                  }}
                                >
                                  <span className="font-medium">{String(selH).padStart(2, '0')}:{String(selM).padStart(2, '0')}</span>{' '}
                                  {title || "Nova tarefa"} (novo)
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Conflict details */}
                  {availabilityResults.length > 0 && hasConflicts && (
                    <div className="space-y-1.5">
                      {availabilityResults.filter(r => r.status === "busy").map((result) => (
                        <div
                          key={result.team_member_id}
                          className="text-xs px-2 py-1.5 rounded flex items-center gap-2 bg-red-950/30 text-red-300"
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                          <span className="font-medium">{result.name}</span>
                          <span className="text-[10px] opacity-70">ocupado</span>
                          {result.conflicting_tasks?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => handleViewConflictTask(result.conflicting_tasks[0].id)}
                              className="ml-auto text-red-300 font-semibold hover:underline flex items-center gap-1 text-[10px]"
                            >
                              Ver tarefa
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  {hasConflicts && (
                    <p className="text-[10px] text-red-400 mt-2 italic">
                      Você pode criar mesmo assim, mas há sobreposição de horário.
                    </p>
                  )}
                </div>
              )}

              {/* Link da Reunião - compacto */}
              {meetingTypes.includes(taskType) && !isPastDate && dateTime && (
                <div className="space-y-2 p-2 bg-muted/50 rounded-lg border">
                  <RadioGroup
                    value={meetingType}
                    onValueChange={(v) => setMeetingType(v as 'auto' | 'external' | 'none')}
                    className="flex gap-3"
                  >
                    <Label
                      htmlFor="meeting-auto"
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs",
                        meetingType === "auto" ? "border-blue-500 bg-blue-50" : "border-transparent",
                        !canCreateMeet && "opacity-50"
                      )}
                    >
                      <RadioGroupItem value="auto" id="meeting-auto" disabled={!canCreateMeet} className="h-3 w-3" />
                      <Sparkles className="h-3 w-3 text-blue-500" />
                      Criar Meet
                    </Label>
                    <Label
                      htmlFor="meeting-external"
                      className={cn(
                        "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs",
                        meetingType === "external" ? "border-blue-500 bg-blue-50" : "border-transparent"
                      )}
                    >
                      <RadioGroupItem value="external" id="meeting-external" className="h-3 w-3" />
                      <LinkIcon className="h-3 w-3" />
                      Link externo
                    </Label>
                  </RadioGroup>

                  {meetingType === 'external' && (
                    <div className="space-y-1">
                      <Input
                        placeholder="https://meet.google.com/..."
                        value={meetingLink}
                        onChange={(e) => setMeetingLink(e.target.value)}
                        className={cn("h-8 text-xs", meetingLink.trim() && meetingLink.includes('@') && "border-red-500")}
                      />
                      {meetingLink.trim() && meetingLink.includes('@') && (
                        <p className="text-[10px] text-red-500">Insira um link de reunião, não um email</p>
                      )}
                    </div>
                  )}

                  {meetingType === 'auto' && canCreateMeet && (
                    <div className="text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
                      {calendarOwner?.id === assigneeId
                        ? '✅ Evento será criado no Google Calendar com Meet'
                        : `✅ Meet será criado via calendar de ${calendarOwner?.name?.split(' ')[0]} (${assignee?.name?.split(' ')[0]} será convidado)`
                      }
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* COLUNA DIREITA - Conteúdo */}
            <div className="space-y-3">
              {/* Título */}
              <div className="space-y-1">
                <Label className="text-xs">Título *</Label>
                <Input
                  placeholder="Ex: Apresentar proposta comercial"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleManuallyEdited(true);
                  }}
                  autoFocus
                />
              </div>

              {/* Notas */}
              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <Textarea
                  placeholder="Observações..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                />
              </div>

              {/* Participantes adicionais (emails externos) */}
              {meetingTypes.includes(taskType) && !isPastDate && dateTime && meetingType === 'auto' && canCreateMeet && (
                <div className="space-y-1">
                  <Label className="text-xs">Convidar emails externos</Label>
                  <div className="flex gap-1">
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={newAttendee}
                      onChange={(e) => setNewAttendee(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddAttendee())}
                      className="h-8 text-xs"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={handleAddAttendee} disabled={!newAttendee.includes("@")} className="h-8 px-2">
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {additionalAttendees.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {additionalAttendees.map((email) => (
                        <Badge key={email} variant="secondary" className="text-[10px] h-5">
                          {email}
                          <button onClick={() => handleRemoveAttendee(email)} className="ml-1 hover:text-red-500">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Transcrição - aparece quando data é passada E tipo permite */}
              {isPastDate && canHaveTranscription && (
                <div className="space-y-1 p-2 bg-blue-50 rounded-lg border border-blue-200">
                  <Label className="flex items-center gap-1 text-xs text-blue-800">
                    <Sparkles className="h-3 w-3" />
                    Transcrição (opcional)
                  </Label>
                  <Textarea
                    placeholder="Cole a transcrição da call para análise com IA..."
                    value={transcription}
                    onChange={(e) => setTranscription(e.target.value)}
                    rows={4}
                    className="bg-white font-mono text-xs"
                  />
                </div>
              )}
            </div>
          </div>
        </form>

        <DialogFooter className="border-t pt-3 mt-3 shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isProcessing}
            className={cn(isPastDate && transcription && "bg-blue-600 hover:bg-blue-700")}
          >
            {isProcessing ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processando...</>
            ) : isPastDate && transcription ? (
              <><Sparkles className="mr-2 h-4 w-4" />Registrar e Analisar</>
            ) : (
              "Criar"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Modal de detalhes da tarefa conflitante - usando Portal para sair da hierarquia do Dialog */}
    {conflictTask && createPortal(
      <TaskDetailModal
        task={conflictTask}
        open={!!conflictTask}
        onOpenChange={(open) => !open && setConflictTask(null)}
      />,
      document.body
    )}
  </>
  );
}
