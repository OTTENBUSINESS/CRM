import { useState, useEffect, useMemo, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeInput } from "@/components/ui/time-input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Task, useUpdateTask, useDeleteTask, useCompleteTask, useCompleteRecurringTask, useResolveRecurringTask } from "@/hooks/useTasks";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAnalysisTemplates } from "@/hooks/useAnalysisTemplates";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { checkCalendarAvailability, type AvailabilityResult } from "@/services/calendarAvailability";
import { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } from "@/services/googleCalendar";
import {
  Calendar as CalendarIcon, Clock, Phone, Video, MessageSquare, Mail, Users, Target,
  Loader2, Trash2, CheckCircle2, Edit2, X, ExternalLink, Building2, CalendarPlus, UserPlus,
  Sparkles, ChevronDown, ChevronUp, FileText, Plus, AlertTriangle, Bot, Repeat, RotateCcw
} from "lucide-react";

// Adiciona timezone de Brasília para evitar problemas de conversão UTC
function addBrasiliaTimezone(datetime: string | null | undefined): string | undefined {
  if (!datetime) return undefined;
  // Se já tem timezone ou é ISO completo, retorna como está
  if (datetime.includes('+') || datetime.includes('Z') || datetime.match(/-\d{2}:\d{2}$/)) return datetime;
  // Se é formato datetime-local (YYYY-MM-DDTHH:mm), adiciona segundos e timezone
  if (datetime.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)) {
    return `${datetime}:00-03:00`;
  }
  return datetime;
}
import { cn, ensureHttps } from "@/lib/utils";
import { useAIAgents } from "@/hooks/useAISalesAgent";
import { toast as sonnerToast } from "sonner";

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdate?: () => void;
  clientName?: string;
  clientPhone?: string;
  clientEmail?: string;
  productName?: string;
}

const taskTypes = [
  { value: 'call', label: 'Ligação', icon: Phone },
  { value: 'whatsapp', label: 'WhatsApp', icon: MessageSquare },
  { value: 'email', label: 'Email', icon: Mail },
  { value: 'meeting', label: 'Reunião', icon: Video },
  { value: 'onboarding', label: 'Onboarding', icon: Target },
  { value: 'follow_up', label: 'Follow-up', icon: Clock },
  { value: 'checkin', label: 'Check-in', icon: Users },
  { value: 'support', label: 'Suporte', icon: MessageSquare },
  { value: 'internal', label: 'Interna', icon: CalendarIcon },
];

const teams = [
  { value: 'sales', label: 'Comercial' },
  { value: 'cs', label: 'CS' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'internal', label: 'Interno' },
];

const priorities = [
  { value: 'high', label: 'Alta', color: 'bg-red-500' },
  { value: 'medium', label: 'Média', color: 'bg-yellow-500' },
  { value: 'low', label: 'Baixa', color: 'bg-green-500' },
];

const statuses = [
  { value: 'not_started', label: 'Não iniciada' },
  { value: 'scheduled', label: 'Agendada' },
  { value: 'confirmed', label: 'Confirmada' },
  { value: 'in_progress', label: 'Em andamento' },
  { value: 'completed', label: 'Concluída' },
  { value: 'cancelled', label: 'Cancelada' },
  { value: 'no_show', label: 'Não compareceu' },
  { value: 'rescheduled', label: 'Reagendada' },
];

const contactMethods = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'phone', label: 'Telefone' },
  { value: 'zoom', label: 'Zoom' },
  { value: 'meet', label: 'Google Meet' },
  { value: 'presencial', label: 'Presencial' },
];

function formatDateTimeLocal(dateString: string | null) {
  if (!dateString) return '';
  const date = new Date(dateString);
  // Usa o fuso horário local (navegador) ao invés de UTC
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function TaskDetailModal({ task, open, onOpenChange, onUpdate, clientName, clientPhone, clientEmail, productName }: TaskDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const completeTask = useCompleteTask();
  const completeRecurring = useCompleteRecurringTask();
  const resolveRecurring = useResolveRecurringTask();
  const { data: analysisTemplates = [] } = useAnalysisTemplates('call_analysis');
  const { data: aiAgents } = useAIAgents();

  // Mutation para disparar agente IA
  const dispatchAgent = useMutation({
    mutationFn: async (leadId: string) => {
      const activeAgent = aiAgents?.find(a => a.is_active);
      if (!activeAgent) throw new Error('Nenhum agente IA ativo configurado');

      // Verificar se já existe conversa
      const { data: existing } = await supabase
        .from('ai_agent_conversations')
        .select('id, status')
        .eq('lead_id', leadId)
        .eq('agent_id', activeAgent.id)
        .maybeSingle();

      if (existing) {
        // Reativar conversa existente
        await supabase
          .from('ai_agent_conversations')
          .update({ status: 'active', paused_by: null, paused_at: null, pause_reason: null })
          .eq('id', existing.id);
      } else {
        // Criar nova conversa
        const { error } = await supabase
          .from('ai_agent_conversations')
          .insert({
            lead_id: leadId,
            agent_id: activeAgent.id,
            status: 'active',
            messages_history: [],
          });
        if (error) throw error;
      }

      // Reativar cadence enrollment se existir pausado/cancelado
      const { data: reactivated } = await supabase
        .from('ai_agent_cadence_enrollments')
        .update({ status: 'active', next_action_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('agent_id', activeAgent.id)
        .in('status', ['paused', 'cancelled'])
        .select('id');

      // Se não reativou nenhum, verificar se precisa criar enrollment
      if (!reactivated || reactivated.length === 0) {
        const { data: existingEnroll } = await supabase
          .from('ai_agent_cadence_enrollments')
          .select('id')
          .eq('lead_id', leadId)
          .eq('agent_id', activeAgent.id)
          .in('status', ['active', 'replied'])
          .maybeSingle();

        if (!existingEnroll) {
          const { data: leadData } = await supabase
            .from('leads')
            .select('pipeline_stage_id')
            .eq('id', leadId)
            .single();

          if (leadData?.pipeline_stage_id) {
            const { data: stageData } = await supabase
              .from('sales_pipeline_stages')
              .select('name')
              .eq('id', leadData.pipeline_stage_id)
              .single();

            await supabase
              .from('ai_agent_cadence_enrollments')
              .insert({
                lead_id: leadId,
                agent_id: activeAgent.id,
                stage: stageData?.name || 'Novo',
                current_step: 0,
                status: 'active',
                next_action_at: new Date().toISOString(),
              });
          }
        }
      }

      // Liberar lock se existir
      await supabase.rpc('release_agent_lock', { p_lead_id: leadId });

      // Disparar cadência imediatamente
      const { error: fnError } = await supabase.functions.invoke('ai-sales-agent', {
        body: { action: 'process_cadence' },
      });
      if (fnError) throw fnError;
    },
    onSuccess: () => {
      sonnerToast.success('Agente disparado! O lead será contactado em breve.');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      onOpenChange(false);
    },
    onError: (error: any) => {
      sonnerToast.error(error.message || 'Erro ao disparar agente');
    },
  });

  // Buscar usuários do sistema (team_members) - igual ao modal de criação
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
        .select('id, name, organization:organizations(id, name), deals!inner(id)')
        .order('name');
      return data || [];
    },
  });


  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Partial<Task>>({});
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [noShowDialogOpen, setNoShowDialogOpen] = useState(false);
  const [noShowReason, setNoShowReason] = useState('');
  const [cancelledDialogOpen, setCancelledDialogOpen] = useState(false);
  const [cancelledReason, setCancelledReason] = useState('');
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [editParticipants, setEditParticipants] = useState<string[]>([]);
  const [editResponsavelId, setEditResponsavelId] = useState<string>('');
  const [showFullTranscription, setShowFullTranscription] = useState(false);
  const [isProcessingTranscription, setIsProcessingTranscription] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Estado para recorrência
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editRecurrenceIntervalDays, setEditRecurrenceIntervalDays] = useState(2);

  // Estado para vínculo com cliente
  const [editLeadId, setEditLeadId] = useState<string | null>(null);
  
  // Estados para verificação de disponibilidade
  const [availabilityResults, setAvailabilityResults] = useState<AvailabilityResult[]>([]);
  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [hasConflicts, setHasConflicts] = useState(false);

  // Estados para criação/atualização de evento no Calendar
  const [externalAttendees, setExternalAttendees] = useState<string[]>([]);
  const [newAttendeeEmail, setNewAttendeeEmail] = useState("");
  const [isCreatingCalendarEvent, setIsCreatingCalendarEvent] = useState(false);
  const [isUpdatingCalendarEvent, setIsUpdatingCalendarEvent] = useState(false);
  const [meetingDuration, setMeetingDuration] = useState(60);

  // Separar notas da transcrição
  const { notes: descriptionNotes, transcription, hasTranscription } = useMemo(() => {
    if (!task?.description) return { notes: '', transcription: '', hasTranscription: false };

    const parts = task.description.split('--- TRANSCRIÇÃO ---');
    if (parts.length > 1) {
      return {
        notes: parts[0].trim(),
        transcription: parts[1].trim(),
        hasTranscription: true,
      };
    }
    return { notes: task.description, transcription: '', hasTranscription: false };
  }, [task?.description]);

  // Verificar se transcrição pode ser processada
  const canProcessTranscription = hasTranscription && task?.lead_id && task?.status === 'completed';

  // Agora responsavel_id é diretamente o team_member_id
  const currentResponsavel = task?.responsavel_id || null;

  useEffect(() => {
    if (task) {
      setFormData({
        name: task.name,
        description: task.description,
        notes: task.notes,
        task_type: task.task_type,
        team: task.team,
        priority: task.priority,
        status: task.status,
        due_datetime: task.due_datetime,
        scheduled_at: task.scheduled_at, // Usar due_datetime se scheduled_at não existir
        client_contact_method: task.client_contact_method,
        meeting_link: task.meeting_link,
      });
      setEditParticipants(task.participants || []);
      setEditResponsavelId(task.responsavel_id || ''); // Inicializar responsável aqui
      setIsEditing(false);
      setShowFullTranscription(false);
      setAvailabilityResults([]);
      setHasConflicts(false);
      // Inicializar recorrência
      setEditIsRecurring(task.is_recurring || false);
      setEditRecurrenceIntervalDays(task.recurrence_interval_days || 2);
      // Inicializar vínculo cliente
      setEditLeadId(task.lead_id || null);
    }
  }, [task]);

  // Set default template when templates load
  useEffect(() => {
    if (analysisTemplates.length > 0 && !selectedTemplateId) {
      const defaultTemplate = analysisTemplates.find(t => t.is_default) || analysisTemplates[0];
      setSelectedTemplateId(defaultTemplate.id);
    }
  }, [analysisTemplates, selectedTemplateId]);

  const handleAddParticipant = (memberId: string) => {
    if (!editParticipants.includes(memberId)) {
      setEditParticipants([...editParticipants, memberId]);
    }
  };

  const handleRemoveParticipant = (memberId: string) => {
    setEditParticipants(editParticipants.filter(id => id !== memberId));
  };

  // Tipos que podem ter reunião
  const meetingTypes = ['call', 'meeting', 'onboarding', 'checkin'];
  // Tipos que bloqueiam agenda (ligações são curtas/flexíveis, não bloqueiam)
  const conflictCheckTypes = ['meeting', 'onboarding', 'checkin'];

  // Função para verificar disponibilidade
  const checkAvailability = useCallback(async () => {
    const dateTime = formData.scheduled_at ? formatDateTimeLocal(formData.scheduled_at) : '';
    const currentTaskType = formData.task_type || task?.task_type;
    if (!dateTime || !isEditing || (currentTaskType && !conflictCheckTypes.includes(currentTaskType))) return;
    
    // Coletar todos os team_member_ids para verificar
    const teamMemberIds: string[] = [];
    if (editResponsavelId) teamMemberIds.push(editResponsavelId);
    editParticipants.forEach(id => {
      if (!teamMemberIds.includes(id)) teamMemberIds.push(id);
    });

    if (teamMemberIds.length === 0) {
      setAvailabilityResults([]);
      setHasConflicts(false);
      return;
    }

    setIsCheckingAvailability(true);
    
    try {
      const result = await checkCalendarAvailability(teamMemberIds, dateTime, 60);
      
      if (result.success) {
        // Filtrar para não mostrar conflito com a própria tarefa
        const filteredResults = result.results.map(r => ({
          ...r,
          conflicting_tasks: r.conflicting_tasks.filter(t => t.id !== task?.id),
          status: r.conflicting_tasks.filter(t => t.id !== task?.id).length > 0 ? 'busy' as const : 'free' as const,
        }));
        
        setAvailabilityResults(filteredResults);
        setHasConflicts(filteredResults.some(r => r.status === 'busy'));
      }
    } catch (error) {
      console.error('Erro ao verificar disponibilidade:', error);
    } finally {
      setIsCheckingAvailability(false);
    }
  }, [formData.scheduled_at, editResponsavelId, editParticipants, isEditing, task?.id]);

  // Verificar disponibilidade quando mudar data/hora, responsável ou participantes
  useEffect(() => {
    if (isEditing && meetingTypes.includes(formData.task_type || '')) {
      const timer = setTimeout(() => {
        checkAvailability();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [formData.scheduled_at, editResponsavelId, editParticipants, isEditing, formData.task_type, checkAvailability]);

  if (!task) return null;

  const handleSave = async () => {
    try {
      // Agora responsavel_id é diretamente o team_member_id
      const responsavelId = editResponsavelId || task.responsavel_id;

      // Combinar participantes: responsável + participantes selecionados
      const allParticipants = [
        ...(editResponsavelId ? [editResponsavelId] : []),
        ...editParticipants.filter(id => id !== editResponsavelId),
      ];

      // Determinar lead_id e organization_id finais
      // IMPORTANTE: Preservar organization_id existente se não houver mudança no lead
      const finalLeadId = editLeadId || null;
      const selectedLead = editLeadId ? leads.find((l: any) => l.id === editLeadId) : null;
      // Se o lead mudou e tem organização, usar a organização do lead
      // Se o lead não mudou ou não tem organização, preservar o organization_id original
      const finalOrganizationId = selectedLead?.organization?.id || task.organization_id || null;

      const scheduledAtFinal = addBrasiliaTimezone(formData.scheduled_at);

      await updateTask.mutateAsync({
        id: task.id,
        ...formData,
        responsavel_id: responsavelId,
        due_datetime: addBrasiliaTimezone(formData.due_datetime),
        scheduled_at: scheduledAtFinal,
        participants: allParticipants.length > 0 ? allParticipants : null,
        lead_id: finalLeadId,
        organization_id: finalOrganizationId,
        is_recurring: editIsRecurring,
        recurrence_interval_days: editIsRecurring ? editRecurrenceIntervalDays : null,
        _previousScheduledAt: task.scheduled_at || null,
      });

      // Sync com Google Calendar
      const responsavelChanged = editResponsavelId && editResponsavelId !== task.responsavel_id;
      const newResponsavel = teamMembers.find((m: any) => m.id === responsavelId);
      const oldResponsavel = teamMembers.find((m: any) => m.id === task.responsavel_id);

      if (task.google_event_id && (dateChanged || responsavelChanged) && scheduledAtFinal) {
        try {
          let clientEmail = '';
          let clientName = 'Lead';
          if (finalLeadId) {
            const { data: leadData } = await supabase
              .from('leads')
              .select('email, name')
              .eq('id', finalLeadId)
              .single();
            clientEmail = leadData?.email || '';
            clientName = leadData?.name || clientName;
          }

          const internalEmails = allParticipants
            .map((id: string) => teamMembers.find((m: any) => m.id === id)?.email)
            .filter(Boolean) as string[];

          const eventInput = {
            title: `${formData.name || task.name} - ${clientName}`,
            description: `${formData.notes || task.notes || ''}`,
            startDateTime: scheduledAtFinal,
            durationMinutes: meetingDuration,
            attendees: [
              ...(clientEmail ? [clientEmail] : []),
              ...externalAttendees,
              ...internalEmails,
            ],
            organizerEmail: newResponsavel?.email || '',
          };

          if (responsavelChanged) {
            // Responsável mudou: deletar do antigo, criar no novo
            if (oldResponsavel?.google_calendar_connected) {
              try {
                await deleteCalendarEvent(task.google_event_id, task.responsavel_id!);
              } catch (e) {
                console.error('Erro ao deletar evento do Calendar antigo:', e);
              }
            }

            if (newResponsavel?.google_calendar_connected) {
              try {
                const calResult = await createCalendarEvent(eventInput, newResponsavel.id);
                // Atualizar google_event_id na task
                await supabase.from('company_activities').update({
                  google_event_id: calResult.eventId,
                  meeting_link: calResult.meetLink || task.meeting_link,
                  google_calendar_synced: true,
                }).eq('id', task.id);
                toast({ title: "Tarefa transferida!", description: "Evento movido no Google Calendar" });
              } catch (calError) {
                console.error('Erro ao criar evento no Calendar do novo responsável:', calError);
                toast({ title: "Tarefa salva, mas erro ao criar evento no Calendar", variant: "destructive" });
              }
            } else {
              // Novo responsável sem Calendar — limpar google_event_id
              await supabase.from('company_activities').update({
                google_event_id: null,
                google_calendar_synced: false,
              }).eq('id', task.id);
              toast({ title: "Tarefa transferida!", description: "Novo responsável sem Google Calendar conectado" });
            }
          } else if (dateChanged && newResponsavel?.google_calendar_connected) {
            // Mesma pessoa, só data mudou — update
            await updateCalendarEvent(task.google_event_id, eventInput, newResponsavel.id);
            toast({ title: "Tarefa e evento atualizados!", description: "Google Calendar sincronizado" });
          } else {
            toast({ title: "Tarefa atualizada!", description: "Calendar não atualizado (Google não conectado)" });
          }
        } catch (calError) {
          console.error('Erro ao atualizar Calendar:', calError);
          toast({ title: "Tarefa salva, mas erro ao atualizar Calendar", variant: "destructive" });
        }
      } else {
        toast({ title: "Tarefa atualizada!" });
      }

      setIsEditing(false);
      onUpdate?.();
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask.mutateAsync(task.id);
      toast({ title: "Tarefa excluída!" });
      // Delay closing the parent Dialog so AlertDialog can clean up first
      // (prevents pointer-events: none stuck on body)
      setTimeout(() => {
        onOpenChange(false);
        onUpdate?.();
      }, 100);
    } catch (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const handleComplete = async () => {
    try {
      // Se for onboarding, mover para o próximo estágio em vez de completar
      if (task.task_type === 'onboarding') {
        const onboardingFlow: Record<string, string> = {
          not_started: 'monitoring_7d',
          scheduled: 'monitoring_7d',
          confirmed: 'monitoring_7d',
          in_progress: 'monitoring_7d',
          monitoring_7d: 'ongoing',
        };
        const nextStage = onboardingFlow[task.status];
        if (nextStage) {
          const updatePayload: any = {
            id: task.id,
            status: nextStage,
            completed: false,
            completed_at: null,
          };
          // Salvar timestamp quando entra em monitoring_7d
          if (nextStage === 'monitoring_7d') {
            updatePayload.metadata = {
              ...((task as any).metadata || {}),
              monitoring_started_at: new Date().toISOString(),
            };
          }
          await updateTask.mutateAsync(updatePayload);

          // Sincronizar organization_products.journey_stage
          const STAGE_TO_JOURNEY: Record<string, string> = {
            monitoring_7d: 'monitoring_7d',
            ongoing: 'ongoing',
          };
          const journeyStage = STAGE_TO_JOURNEY[nextStage];
          if (journeyStage && task.organization_id && task.product_id) {
            await supabase
              .from('organization_products')
              .update({ journey_stage: journeyStage as any })
              .eq('organization_id', task.organization_id)
              .eq('product_id', task.product_id);
          }

          const stageNames: Record<string, string> = {
            monitoring_7d: 'Monitoramento 7 dias',
            ongoing: 'Acompanhamento 90 dias',
          };
          toast({ title: `Onboarding avançado para "${stageNames[nextStage] || nextStage}"` });
          onOpenChange(false);
          onUpdate?.();
          return;
        }
      }
      if (task.is_recurring) {
        const result = await completeRecurring.mutateAsync({ taskId: task.id, completedBy: task.responsavel?.name });
        const nextDate = new Date(result.nextDate);
        const formatted = nextDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' });
        toast({ title: "Feito!", description: `Próxima pendência em ${task.recurrence_interval_days}d (${formatted})` });
      } else {
        await completeTask.mutateAsync(task.id);
        toast({ title: "Tarefa concluída!" });
      }
      onOpenChange(false);
      onUpdate?.();
    } catch (error) {
      toast({ title: "Erro ao concluir", variant: "destructive" });
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleDate) {
      toast({ title: "Selecione a nova data/hora", variant: "destructive" });
      return;
    }
    try {
      const newScheduledAt = rescheduleDate.includes('+') || rescheduleDate.includes('Z')
        ? rescheduleDate
        : `${rescheduleDate}:00-03:00`;

      const newDateDisplay = new Date(rescheduleDate).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

      // 1) Deletar evento antigo do Google Calendar (se existir)
      if (task.google_event_id && task.responsavel_id) {
        const oldResponsavel = teamMembers.find((m: any) => m.id === task.responsavel_id);
        if (oldResponsavel?.google_calendar_connected) {
          try {
            await deleteCalendarEvent(task.google_event_id, task.responsavel_id);
            console.log('✅ Evento antigo deletado do Calendar');
          } catch (calError) {
            console.error('Erro ao deletar evento antigo do Calendar:', calError);
          }
        }
      }

      // 2) Marcar task atual como rescheduled
      await updateTask.mutateAsync({
        id: task.id,
        status: 'rescheduled',
        completed: true,
        completed_at: new Date().toISOString(),
        notes: `🔄 Reagendada para ${newDateDisplay}`,
      });

      // 3) Criar nova task com a nova data
      const newTaskData: any = {
        name: task.name,
        task_type: task.task_type,
        team: task.team,
        lead_id: task.lead_id,
        organization_id: task.organization_id,
        responsavel_id: task.responsavel_id,
        contact_method: task.contact_method,
        priority: task.priority,
        participants: task.participants,
        scheduled_at: newScheduledAt,
        status: 'scheduled',
        completed: false,
        notes: `🔄 Reagendamento de tarefa anterior`,
      };

      // 4) Criar novo evento no Google Calendar para o responsável
      const responsavel = teamMembers.find((m: any) => m.id === task.responsavel_id);
      if (responsavel?.google_calendar_connected) {
        try {
          let clientEmail = '';
          let clientName = 'Lead';
          if (task.lead_id) {
            const { data: leadData } = await supabase
              .from('leads')
              .select('email, name')
              .eq('id', task.lead_id)
              .single();
            clientEmail = leadData?.email || '';
            clientName = leadData?.name || clientName;
          }

          const internalEmails = (task.participants || [])
            .map((id: string) => teamMembers.find((m: any) => m.id === id)?.email)
            .filter(Boolean) as string[];

          const calResult = await createCalendarEvent(
            {
              title: task.name,
              description: `🔄 Reagendamento\n${task.notes || ''}`,
              startDateTime: newScheduledAt,
              durationMinutes: 60,
              attendees: [
                ...(clientEmail ? [clientEmail] : []),
                ...internalEmails,
              ],
              organizerEmail: responsavel.email || '',
            },
            responsavel.id
          );

          newTaskData.google_event_id = calResult.eventId;
          newTaskData.meeting_link = calResult.meetLink || task.meeting_link;
          newTaskData.google_calendar_synced = true;
        } catch (calError) {
          console.error('Erro ao criar novo evento no Calendar:', calError);
          // Manter meeting_link antigo mesmo sem novo evento
          newTaskData.meeting_link = task.meeting_link;
        }
      } else {
        // Responsável sem Google Calendar — manter meeting_link antigo
        newTaskData.meeting_link = task.meeting_link;
      }

      await supabase.from('company_activities').insert(newTaskData);

      toast({ title: "🔄 Reagendada!", description: `Nova data: ${newDateDisplay}` });
      setRescheduleDialogOpen(false);
      onOpenChange(false);
      onUpdate?.();
    } catch (error) {
      toast({ title: "Erro ao reagendar", variant: "destructive" });
    }
  };

  const handleResolveRecurring = async () => {
    try {
      await resolveRecurring.mutateAsync(task.id);
      toast({ title: "Tarefa resolvida 100%!", description: "Pendência encerrada definitivamente." });
      onOpenChange(false);
      onUpdate?.();
    } catch (error) {
      toast({ title: "Erro ao resolver", variant: "destructive" });
    }
  };

  // Criar evento no Google Calendar com Meet
  const handleCreateCalendarEvent = async () => {
    if (!task?.scheduled_at) {
      toast({ title: "Defina uma data antes de criar o evento", variant: "destructive" });
      return;
    }

    const responsavel = teamMembers.find((m: any) => m.id === (editResponsavelId || task.responsavel_id));
    if (!responsavel?.google_calendar_connected) {
      toast({ title: "O responsável não tem Google Calendar conectado", variant: "destructive" });
      return;
    }

    setIsCreatingCalendarEvent(true);
    try {
      // Buscar email do lead/cliente
      let clientEmail = '';
      let clientName = 'Lead';
      if (task.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('email, name')
          .eq('id', task.lead_id)
          .single();
        clientEmail = lead?.email || '';
        clientName = lead?.name || clientName;
      }

      // Coletar emails dos participantes internos
      const internalEmails = (task.participants || [])
        .map((id: string) => teamMembers.find((m: any) => m.id === id)?.email)
        .filter(Boolean) as string[];

      const allAttendees = [
        ...(clientEmail ? [clientEmail] : []),
        ...externalAttendees,
        ...internalEmails,
      ];

      const scheduledAt = addBrasiliaTimezone(task.scheduled_at) || task.scheduled_at;

      const calendarResult = await createCalendarEvent({
        title: `${task.name} - ${clientName}`,
        description: `${task.notes || task.description || ''}\n\nEvento criado pelo sistema.`,
        startDateTime: scheduledAt,
        durationMinutes: meetingDuration,
        attendees: allAttendees,
        organizerEmail: responsavel.email || '',
      }, responsavel.id);

      // Atualizar tarefa com link do Meet e event ID
      await supabase
        .from('company_activities')
        .update({
          meeting_link: calendarResult.meetLink,
          google_event_id: calendarResult.eventId,
          google_calendar_synced: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', task.id);

      toast({
        title: "Evento criado!",
        description: `Meet gerado com ${allAttendees.length} convidado(s)`,
      });
      setExternalAttendees([]);
      onUpdate?.();
    } catch (error) {
      console.error('Erro ao criar evento:', error);
      toast({ title: "Erro ao criar evento no Calendar", variant: "destructive" });
    } finally {
      setIsCreatingCalendarEvent(false);
    }
  };

  const handleAddExternalAttendee = () => {
    const email = newAttendeeEmail.trim();
    if (email && email.includes('@') && !externalAttendees.includes(email)) {
      setExternalAttendees([...externalAttendees, email]);
      setNewAttendeeEmail('');
    }
  };

  // Atualizar evento existente no Google Calendar (quando muda data/hora)
  const handleUpdateCalendarEvent = async () => {
    if (!task?.google_event_id || !formData.scheduled_at) return;

    const responsavel = teamMembers.find((m: any) => m.id === (editResponsavelId || task.responsavel_id));
    if (!responsavel?.google_calendar_connected) {
      toast({ title: "O responsável não tem Google Calendar conectado", variant: "destructive" });
      return;
    }

    setIsUpdatingCalendarEvent(true);
    try {
      let clientEmail = '';
      let clientName = 'Lead';
      if (task.lead_id) {
        const { data: lead } = await supabase
          .from('leads')
          .select('email, name')
          .eq('id', task.lead_id)
          .single();
        clientEmail = lead?.email || '';
        clientName = lead?.name || clientName;
      }

      const internalEmails = (editParticipants || [])
        .map((id: string) => teamMembers.find((m: any) => m.id === id)?.email)
        .filter(Boolean) as string[];

      const allAttendees = [
        ...(clientEmail ? [clientEmail] : []),
        ...externalAttendees,
        ...internalEmails,
      ];

      const scheduledAt = addBrasiliaTimezone(formData.scheduled_at) || formData.scheduled_at;

      await updateCalendarEvent(
        task.google_event_id,
        {
          title: `${formData.name || task.name} - ${clientName}`,
          description: `${formData.notes || task.notes || ''}\n\nEvento atualizado pelo sistema.`,
          startDateTime: scheduledAt,
          durationMinutes: meetingDuration,
          attendees: allAttendees,
          organizerEmail: responsavel.email || '',
        },
        responsavel.id
      );

      toast({ title: "Evento atualizado!", description: "Data/hora atualizados no Google Calendar" });
    } catch (error) {
      console.error('Erro ao atualizar evento:', error);
      toast({ title: "Erro ao atualizar evento no Calendar", variant: "destructive" });
    } finally {
      setIsUpdatingCalendarEvent(false);
    }
  };

  // Verificar se a data mudou em relação à original
  const dateChanged = task && formData.scheduled_at && task.scheduled_at
    && formData.scheduled_at !== formatDateTimeLocal(task.scheduled_at);

  const handleSchedule = async () => {
    if (!formData.scheduled_at) {
      toast({ title: "Preencha a data e hora", variant: "destructive" });
      return;
    }

    try {
      await updateTask.mutateAsync({
        id: task.id,
        scheduled_at: addBrasiliaTimezone(formData.scheduled_at),
        meeting_link: formData.meeting_link,
        client_contact_method: formData.client_contact_method || 'meet',
        status: 'scheduled',
      });
      toast({ title: "Onboarding agendado!", description: "Tarefa movida para 'Agendado'" });
      onOpenChange(false);
      onUpdate?.();
    } catch (error) {
      toast({ title: "Erro ao agendar", variant: "destructive" });
    }
  };

  const handleProcessTranscription = async () => {
    if (!task?.lead_id || !transcription) return;

    setIsProcessingTranscription(true);
    toast({ title: "Analisando...", description: "Processando transcrição com IA" });

    // Get selected template prompt
    const selectedTemplate = analysisTemplates.find(t => t.id === selectedTemplateId);

    try {
      const { data, error } = await supabase.functions.invoke('process-call-transcription', {
        body: {
          lead_id: task.lead_id,
          task_id: task.id,
          transcription,
          call_title: task.name,
          call_date: task.scheduled_at,
          custom_prompt: selectedTemplate?.prompt, // Pass custom template prompt
          template_name: selectedTemplate?.name,
        },
      });

      if (error) throw error;

      // Invalidar queries para recarregar dados
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['pending-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['client-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['lead-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['my-tasks'] });

      toast({
        title: "Análise concluída!",
        description: `Score ${data.score_change >= 0 ? '+' : ''}${data.score_change}`,
      });

      // Fechar e reabrir o modal para mostrar a análise
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao processar transcrição:', error);
      toast({
        title: "Erro ao processar",
        description: "Não foi possível analisar a transcrição",
        variant: "destructive"
      });
    } finally {
      setIsProcessingTranscription(false);
    }
  };

  const typeConfig = taskTypes.find(t => t.value === task.task_type);
  const TypeIcon = typeConfig?.icon || CalendarIcon;
  const priorityConfig = priorities.find(p => p.value === task.priority);
  const statusConfig = statuses.find(s => s.value === task.status);

  const isLoading = updateTask.isPending || deleteTask.isPending || completeTask.isPending || completeRecurring.isPending || resolveRecurring.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("sm:max-w-[550px]", isEditing && "sm:max-w-[680px]")}>
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-lg",
                task.task_type === 'onboarding' && "bg-orange-500/10 text-orange-500",
                task.task_type === 'call' && "bg-blue-500/10 text-blue-500",
                task.task_type === 'whatsapp' && "bg-green-500/10 text-green-500",
                task.task_type === 'meeting' && "bg-indigo-500/10 text-indigo-500",
                !['onboarding', 'call', 'whatsapp', 'meeting'].includes(task.task_type) && "bg-gray-500/10 text-gray-500"
              )}>
                <TypeIcon className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-left">{task.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="secondary" className="text-xs">
                    {typeConfig?.label || task.task_type}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {teams.find(t => t.value === task.team)?.label || task.team}
                  </Badge>
                </div>
              </div>
            </div>
            {!isEditing && (
              <Button variant="ghost" size="icon" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vinculação */}
          {(task.organization || task.lead) && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">
                {task.organization?.name || task.lead?.name}
              </span>
              {task.organization && (
                <Button variant="ghost" size="sm" className="ml-auto h-7 text-xs" asChild>
                  <a href={`/clientes/${task.organization_id}`}>
                    Ver cliente <ExternalLink className="h-3 w-3 ml-1" />
                  </a>
                </Button>
              )}
              {task.lead && !task.organization && (
                <div className="ml-auto flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                    <a href={`/comercial/leads/${task.lead_id}`}>
                      Ver Lead <ExternalLink className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
                    <a href={`/comercial/leads/${task.lead_id}?tab=mensagens`}>
                      Conversa <MessageSquare className="h-3 w-3 ml-1" />
                    </a>
                  </Button>
                </div>
              )}
            </div>
          )}

          {isEditing ? (
            /* Modo Edição - Layout em 2 colunas (igual ao modal de criação) */
            <div className="grid grid-cols-2 gap-4">
              {/* COLUNA ESQUERDA - Configurações */}
              <div className="space-y-3">
                {/* Tipo e Responsável */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select
                      value={formData.task_type}
                      onValueChange={(v) => setFormData({ ...formData, task_type: v as Task['task_type'] })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {taskTypes.map((t) => {
                          const Icon = t.icon;
                          return (
                            <SelectItem key={t.value} value={t.value}>
                              <div className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                {t.label}
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Responsável</Label>
                    <Select value={editResponsavelId} onValueChange={setEditResponsavelId}>
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

                {/* Vincular a Cliente */}
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
                    value={editLeadId}
                    onValueChange={(v) => setEditLeadId(v)}
                    placeholder="Buscar cliente..."
                    searchPlaceholder="Digite o nome do cliente..."
                    emptyMessage="Nenhum cliente encontrado."
                  />
                </div>

                {/* Data e Hora com DatePicker */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Data</Label>
                    <Popover modal>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          className={cn(
                            "h-9 w-full justify-start text-left font-normal",
                            !formData.scheduled_at && "text-muted-foreground"
                          )}
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.scheduled_at
                            ? format(new Date(formData.scheduled_at), "dd/MM/yyyy", { locale: ptBR })
                            : "Selecionar"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[200]" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                        <CalendarPicker
                          mode="single"
                          selected={formData.scheduled_at ? new Date(formData.scheduled_at) : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const currentTime = formData.scheduled_at
                                ? formatDateTimeLocal(formData.scheduled_at).split('T')[1] || '09:00'
                                : '09:00';
                              setFormData({ ...formData, scheduled_at: `${format(date, 'yyyy-MM-dd')}T${currentTime}` });
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
                      value={formData.scheduled_at ? formatDateTimeLocal(formData.scheduled_at).split('T')[1]?.substring(0, 5) || '09:00' : '09:00'}
                      onChange={(time) => {
                        const currentDate = formData.scheduled_at 
                          ? formatDateTimeLocal(formData.scheduled_at).split('T')[0] 
                          : format(new Date(), 'yyyy-MM-dd');
                        setFormData({ ...formData, scheduled_at: `${currentDate}T${time}` });
                      }}
                    />
                  </div>
                </div>

                {/* Participantes internos - igual ao modal de criação */}
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Participantes internos
                  </Label>
                  <div className="flex flex-wrap gap-1 min-h-[32px] items-center">
                    {editParticipants.map((participantId) => {
                      const member = teamMembers.find((m: any) => m.id === participantId);
                      return (
                        <Badge key={participantId} variant="secondary" className="text-[10px] h-6 flex items-center gap-1 pr-1">
                          {member?.name || 'Carregando...'}
                          <button 
                            type="button"
                            onClick={() => handleRemoveParticipant(participantId)} 
                            className="hover:text-red-500"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      );
                    })}
                    <Select value="" onValueChange={(value) => handleAddParticipant(value)}>
                      <SelectTrigger className="h-6 w-auto border-dashed text-xs px-2">
                        <Plus className="h-3 w-3 mr-1" />
                        Adicionar
                      </SelectTrigger>
                      <SelectContent>
                        {teamMembers
                          .filter((m: any) => !editParticipants.includes(m.id))
                          .map((member: any) => (
                            <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Disponibilidade de Agenda - DESTACADO */}
                {meetingTypes.includes(formData.task_type || '') && formData.scheduled_at && (editResponsavelId || editParticipants.length > 0) && (
                  <div className={cn(
                    "p-3 rounded-lg border-2",
                    hasConflicts ? "bg-red-50 border-red-300" : "bg-green-50 border-green-300"
                  )}>
                    <div className="flex items-center gap-2 mb-2">
                      {hasConflicts ? (
                        <AlertTriangle className="h-4 w-4 text-red-600" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                      <Label className={cn(
                        "text-sm font-semibold",
                        hasConflicts ? "text-red-700" : "text-green-700"
                      )}>
                        {isCheckingAvailability ? "Verificando..." : hasConflicts ? "⚠️ Conflito de Agenda" : "✅ Agenda Livre"}
                      </Label>
                      {isCheckingAvailability && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    </div>
                    {availabilityResults.length > 0 && (
                      <div className="space-y-1.5">
                        {availabilityResults.map((result) => (
                          <div 
                            key={result.team_member_id}
                            className={cn(
                              "text-xs px-2 py-1.5 rounded flex items-center gap-2",
                              result.status === "free" && "bg-white/70 text-green-800",
                              result.status === "busy" && "bg-white/70 text-red-800"
                            )}
                          >
                            {result.status === "free" ? (
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-red-600" />
                            )}
                            <span className="font-medium">{result.name}</span>
                            <span className="text-[10px] opacity-70">
                              {result.status === "free" ? "disponível" : "ocupado"}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    {hasConflicts && (
                      <p className="text-[10px] text-red-600 mt-2 italic">
                        Você pode salvar mesmo assim, mas há sobreposição de horário.
                      </p>
                    )}
                  </div>
                )}

                {/* Link da reunião + Criar evento no Calendar */}
                <div className="space-y-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Link da reunião</Label>
                    <Input
                      value={formData.meeting_link || ''}
                      onChange={(e) => setFormData({ ...formData, meeting_link: e.target.value })}
                      placeholder="https://meet.google.com/..."
                      className="h-9"
                    />
                  </div>

                  {/* Criar evento no Calendar - aparece se não tem google_event_id */}
                  {!task.google_event_id && formData.scheduled_at && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                      <div className="flex items-center gap-2">
                        <CalendarPlus className="h-4 w-4 text-blue-600" />
                        <span className="text-xs font-medium text-blue-800">Criar evento no Google Calendar</span>
                      </div>

                      {/* Duração */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-blue-700 whitespace-nowrap">Duração:</Label>
                        <div className="flex gap-1">
                          {[15, 30, 60, 90].map((min) => (
                            <button
                              key={min}
                              type="button"
                              onClick={() => setMeetingDuration(min)}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                meetingDuration === min
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                              )}
                            >
                              {min}min
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Convidados externos */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-blue-700">Convidados externos</Label>
                        {externalAttendees.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {externalAttendees.map((email) => (
                              <Badge key={email} variant="secondary" className="text-[10px] h-5 flex items-center gap-1 pr-1 bg-blue-100 text-blue-800">
                                {email}
                                <button type="button" onClick={() => setExternalAttendees(externalAttendees.filter(e => e !== email))} className="hover:text-red-500">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Input
                            placeholder="email@exemplo.com"
                            value={newAttendeeEmail}
                            onChange={(e) => setNewAttendeeEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddExternalAttendee())}
                            className="h-7 text-xs flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddExternalAttendee}
                            disabled={!newAttendeeEmail.includes('@')}
                            className="h-7 px-2 text-xs"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-[10px] text-blue-600">
                          Participantes internos já selecionados acima serão convidados automaticamente.
                        </p>
                      </div>

                      <Button
                        type="button"
                        onClick={handleCreateCalendarEvent}
                        disabled={isCreatingCalendarEvent}
                        className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700"
                      >
                        {isCreatingCalendarEvent ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Video className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Criar Meet + Enviar convites
                      </Button>
                    </div>
                  )}

                  {/* Se já tem evento criado - mostrar status e opção de atualizar */}
                  {task.google_event_id && (
                    <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 space-y-2">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-medium text-blue-800">Google Calendar</span>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                        <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-300 ml-auto">
                          Sincronizado
                        </Badge>
                      </div>

                      {/* Duração para update */}
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-blue-700 whitespace-nowrap">Duração:</Label>
                        <div className="flex gap-1">
                          {[15, 30, 60, 90].map((min) => (
                            <button
                              key={min}
                              type="button"
                              onClick={() => setMeetingDuration(min)}
                              className={cn(
                                "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                                meetingDuration === min
                                  ? "bg-blue-600 text-white border-blue-600"
                                  : "bg-white text-blue-700 border-blue-300 hover:bg-blue-50"
                              )}
                            >
                              {min}min
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Convidados extras para update */}
                      <div className="space-y-1.5">
                        <Label className="text-xs text-blue-700">Convidados extras</Label>
                        {externalAttendees.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {externalAttendees.map((email) => (
                              <Badge key={email} variant="secondary" className="text-[10px] h-5 flex items-center gap-1 pr-1 bg-blue-100 text-blue-800">
                                {email}
                                <button type="button" onClick={() => setExternalAttendees(externalAttendees.filter(e => e !== email))} className="hover:text-red-500">
                                  <X className="h-2.5 w-2.5" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-1">
                          <Input
                            placeholder="email@exemplo.com"
                            value={newAttendeeEmail}
                            onChange={(e) => setNewAttendeeEmail(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddExternalAttendee())}
                            className="h-7 text-xs flex-1"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleAddExternalAttendee}
                            disabled={!newAttendeeEmail.includes('@')}
                            className="h-7 px-2 text-xs"
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      <Button
                        type="button"
                        onClick={handleUpdateCalendarEvent}
                        disabled={isUpdatingCalendarEvent}
                        variant="outline"
                        className="w-full h-8 text-xs border-blue-300 text-blue-700 hover:bg-blue-100"
                      >
                        {isUpdatingCalendarEvent ? (
                          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <CalendarPlus className="h-3.5 w-3.5 mr-1.5" />
                        )}
                        Atualizar evento no Calendar
                        {dateChanged && (
                          <Badge className="ml-1.5 text-[9px] bg-amber-500 text-white px-1 py-0">data alterada</Badge>
                        )}
                      </Button>
                    </div>
                  )}
                </div>

                {/* Tarefa Recorrente */}
                <div className="space-y-2 p-2 bg-teal-50/50 rounded-lg border border-teal-200/50">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="edit-recurring-switch" className="text-xs flex items-center gap-1.5 cursor-pointer">
                      <Repeat className="h-3.5 w-3.5 text-teal-600" />
                      Tarefa recorrente
                    </Label>
                    <Switch
                      id="edit-recurring-switch"
                      checked={editIsRecurring}
                      onCheckedChange={setEditIsRecurring}
                    />
                  </div>
                  {editIsRecurring && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Renovar a cada</span>
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          value={editRecurrenceIntervalDays}
                          onChange={(e) => setEditRecurrenceIntervalDays(Math.max(1, parseInt(e.target.value) || 1))}
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
                            onClick={() => setEditRecurrenceIntervalDays(days)}
                            className={cn(
                              "text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                              editRecurrenceIntervalDays === days
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
              </div>

              {/* COLUNA DIREITA - Conteúdo */}
              <div className="space-y-3">
                {/* Título */}
                <div className="space-y-1">
                  <Label className="text-xs">Título *</Label>
                  <Input
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </div>

                {/* Notas */}
                <div className="space-y-1">
                  <Label className="text-xs">Notas</Label>
                  <Textarea
                    value={formData.notes || ''}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={6}
                    placeholder="Observações..."
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Modo Visualização */
            <div className="space-y-4">
              {/* Status e Prioridade */}
              <div className="flex items-center gap-3">
                <Badge className={cn(
                  "text-xs",
                  task.status === 'completed' && "bg-emerald-100 text-emerald-700",
                  task.status === 'not_started' && "bg-gray-100 text-gray-700",
                  task.status === 'scheduled' && "bg-blue-100 text-blue-700",
                  task.status === 'confirmed' && "bg-green-100 text-green-700",
                  task.status === 'in_progress' && "bg-yellow-100 text-yellow-700",
                  task.status === 'cancelled' && "bg-red-100 text-red-700",
                )}>
                  {statusConfig?.label || task.status}
                </Badge>
                <div className="flex items-center gap-1">
                  <div className={cn("h-2 w-2 rounded-full", priorityConfig?.color)} />
                  <span className="text-xs text-muted-foreground">
                    Prioridade {priorityConfig?.label?.toLowerCase()}
                  </span>
                </div>
              </div>

              {/* Tarefa Recorrente - Info */}
              {task.is_recurring && (
                <div className="p-3 bg-teal-50 rounded-lg border border-teal-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <Repeat className="h-4 w-4 text-teal-600" />
                    <span className="text-sm font-medium text-teal-800">Tarefa Recorrente</span>
                    <Badge variant="outline" className="text-[10px] border-teal-300 text-teal-700 ml-auto">
                      a cada {task.recurrence_interval_days}d
                    </Badge>
                  </div>
                  <div className="text-xs text-teal-700">
                    {task.recurrence_count} check-in{task.recurrence_count !== 1 ? 's' : ''} realizado{task.recurrence_count !== 1 ? 's' : ''}
                  </div>
                  {/* Mini-timeline do histórico */}
                  {task.metadata?.recurrence_history && task.metadata.recurrence_history.length > 0 && (
                    <div className="space-y-1 pt-1 border-t border-teal-200">
                      <span className="text-[10px] text-teal-600 font-medium">Histórico:</span>
                      <div className="max-h-24 overflow-y-auto space-y-0.5">
                        {task.metadata.recurrence_history.slice(-5).reverse().map((entry, i) => (
                          <div key={i} className="text-[10px] text-teal-700 flex items-center gap-1.5">
                            <CheckCircle2 className="h-2.5 w-2.5 text-teal-500 flex-shrink-0" />
                            <span>{new Date(entry.completed_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'America/Sao_Paulo' })}</span>
                            <span className="text-teal-500">
                              {new Date(entry.completed_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })}
                            </span>
                            {entry.completed_by && <span className="text-teal-500">• {entry.completed_by}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Descrição / Notas */}
              {descriptionNotes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notas</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap">{descriptionNotes}</p>
                </div>
              )}

              {/* Análise da Call (se processada) */}
              {task.metadata?.call_analysis && (
                <div className="space-y-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-emerald-600" />
                    <Label className="text-sm font-medium text-emerald-800">Análise da Call</Label>
                    <Badge variant="outline" className={cn(
                      "text-xs ml-auto",
                      task.metadata.call_analysis.sentimento === 'positivo' && "bg-green-100 text-green-700 border-green-200",
                      task.metadata.call_analysis.sentimento === 'neutro' && "bg-gray-100 text-gray-700 border-gray-200",
                      task.metadata.call_analysis.sentimento === 'negativo' && "bg-red-100 text-red-700 border-red-200",
                    )}>
                      {task.metadata.call_analysis.sentimento}
                    </Badge>
                    <Badge variant="outline" className={cn(
                      "text-xs",
                      task.metadata.call_analysis.interesse === 'alto' && "bg-emerald-100 text-emerald-700 border-emerald-200",
                      task.metadata.call_analysis.interesse === 'medio' && "bg-yellow-100 text-yellow-700 border-yellow-200",
                      task.metadata.call_analysis.interesse === 'baixo' && "bg-red-100 text-red-700 border-red-200",
                    )}>
                      Interesse {task.metadata.call_analysis.interesse}
                    </Badge>
                  </div>

                  {/* Resumo */}
                  <p className="text-sm text-emerald-900">{task.metadata.call_analysis.resumo}</p>

                  {/* Pontos principais */}
                  {task.metadata.call_analysis.pontos_principais?.length > 0 && (
                    <div>
                      <Label className="text-xs text-emerald-700">Pontos Principais</Label>
                      <ul className="mt-1 space-y-1">
                        {task.metadata.call_analysis.pontos_principais.map((ponto, i) => (
                          <li key={i} className="text-xs text-emerald-800 flex items-start gap-1.5">
                            <span className="text-emerald-500">•</span> {ponto}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Próximos passos */}
                  {task.metadata.call_analysis.proximos_passos?.length > 0 && (
                    <div>
                      <Label className="text-xs text-emerald-700">Próximos Passos</Label>
                      <ul className="mt-1 space-y-1">
                        {task.metadata.call_analysis.proximos_passos.map((passo, i) => (
                          <li key={i} className="text-xs text-emerald-800 flex items-start gap-1.5">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500 mt-0.5 flex-shrink-0" /> {passo}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Objeções */}
                  {task.metadata.call_analysis.objecoes?.length > 0 && (
                    <div>
                      <Label className="text-xs text-orange-700">Objeções Identificadas</Label>
                      <ul className="mt-1 space-y-1">
                        {task.metadata.call_analysis.objecoes.map((objecao, i) => (
                          <li key={i} className="text-xs text-orange-800 flex items-start gap-1.5">
                            <span className="text-orange-500">!</span> {objecao}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* BANT */}
                  {task.metadata.call_analysis.bant_updates && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-emerald-200">
                      {task.metadata.call_analysis.bant_updates.budget && (
                        <div className="text-xs">
                          <span className="text-emerald-600 font-medium">Budget:</span>{' '}
                          <span className="text-emerald-800">{task.metadata.call_analysis.bant_updates.budget}</span>
                        </div>
                      )}
                      {task.metadata.call_analysis.bant_updates.authority && (
                        <div className="text-xs">
                          <span className="text-emerald-600 font-medium">Authority:</span>{' '}
                          <span className="text-emerald-800">{task.metadata.call_analysis.bant_updates.authority}</span>
                        </div>
                      )}
                      {task.metadata.call_analysis.bant_updates.need && (
                        <div className="text-xs">
                          <span className="text-emerald-600 font-medium">Need:</span>{' '}
                          <span className="text-emerald-800">{task.metadata.call_analysis.bant_updates.need}</span>
                        </div>
                      )}
                      {task.metadata.call_analysis.bant_updates.timeline && (
                        <div className="text-xs">
                          <span className="text-emerald-600 font-medium">Timeline:</span>{' '}
                          <span className="text-emerald-800">{task.metadata.call_analysis.bant_updates.timeline}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Transcrição (colapsada se já processada) */}
              {hasTranscription && (
                <div className="space-y-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-blue-700 flex items-center gap-1.5">
                      <FileText className="h-3.5 w-3.5" />
                      Transcrição ({transcription.length.toLocaleString()} caracteres)
                      {task.metadata?.transcription_processed && (
                        <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-600 border-emerald-200 ml-2">
                          ✓ Processada
                        </Badge>
                      )}
                    </Label>
                    {canProcessTranscription && !task.metadata?.transcription_processed && (
                      <div className="flex items-center gap-2">
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                          <SelectTrigger className="h-7 w-[180px] text-xs">
                            <SelectValue placeholder="Template..." />
                          </SelectTrigger>
                          <SelectContent>
                            {analysisTemplates.map(t => (
                              <SelectItem key={t.id} value={t.id} className="text-xs">
                                {t.name} {t.is_default && '(Padrão)'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-blue-700 hover:text-blue-800 hover:bg-blue-100"
                          onClick={handleProcessTranscription}
                          disabled={isProcessingTranscription || !selectedTemplateId}
                        >
                          {isProcessingTranscription ? (
                            <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Processando...</>
                          ) : (
                            <><Sparkles className="h-3 w-3 mr-1" />Analisar com IA</>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>
                  {/* Mostrar transcrição colapsada por padrão se já processada */}
                  {(showFullTranscription || !task.metadata?.transcription_processed) && (
                    <div className="relative">
                      <p className={cn(
                        "text-xs text-blue-900/80 font-mono whitespace-pre-wrap bg-white p-2 rounded border border-blue-100",
                        !showFullTranscription && "max-h-32 overflow-hidden"
                      )}>
                        {showFullTranscription ? transcription : transcription.substring(0, 500)}
                        {!showFullTranscription && transcription.length > 500 && '...'}
                      </p>
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full h-7 text-xs text-blue-600"
                    onClick={() => setShowFullTranscription(!showFullTranscription)}
                  >
                    {showFullTranscription ? (
                      <><ChevronUp className="h-3 w-3 mr-1" />Ocultar transcrição</>
                    ) : (
                      <><ChevronDown className="h-3 w-3 mr-1" />Ver transcrição completa</>
                    )}
                  </Button>
                </div>
              )}

              {/* Datas */}
              <div className="grid grid-cols-2 gap-4">
                {task.due_datetime && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Prazo</Label>
                    <p className="text-sm mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(task.due_datetime).toLocaleString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
                      })}
                    </p>
                  </div>
                )}
                {task.scheduled_at && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Agendado para</Label>
                    <p className="text-sm mt-1 flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3" />
                      {new Date(task.scheduled_at).toLocaleString('pt-BR', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
                      })}
                    </p>
                  </div>
                )}
              </div>

              {/* Responsável */}
              {task.assignee && (
                <div>
                  <Label className="text-xs text-muted-foreground">Responsável</Label>
                  <p className="text-sm mt-1">{task.assignee}</p>
                </div>
              )}

              {/* Link da reunião + Status Calendar */}
              {(task.meeting_link || task.google_event_id) && (
                <div className={cn(
                  "p-3 rounded-lg border space-y-2",
                  task.google_event_id
                    ? "bg-blue-50/80 border-blue-200"
                    : "bg-muted/30 border-border"
                )}>
                  {task.google_event_id && (
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-white/80 px-2 py-1 rounded-md border border-blue-200">
                        <CalendarIcon className="h-3.5 w-3.5 text-blue-600" />
                        <span className="text-xs font-medium text-blue-700">Google Calendar</span>
                        <CheckCircle2 className="h-3 w-3 text-green-500" />
                      </div>
                      <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-300">
                        Sincronizado
                      </Badge>
                    </div>
                  )}
                  {task.meeting_link && (
                    <a
                      href={ensureHttps(task.meeting_link)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                        task.meeting_link.includes('meet.google')
                          ? "bg-blue-600 text-white hover:bg-blue-700"
                          : "bg-primary text-primary-foreground hover:opacity-90"
                      )}
                    >
                      <Video className="h-4 w-4" />
                      {task.meeting_link.includes('meet.google') ? 'Entrar no Google Meet' : 'Abrir reunião'}
                      <ExternalLink className="h-3 w-3 ml-auto" />
                    </a>
                  )}
                </div>
              )}

              {/* Notas */}
              {task.notes && (
                <div>
                  <Label className="text-xs text-muted-foreground">Notas</Label>
                  <p className="text-sm mt-1 text-muted-foreground">{task.notes}</p>
                </div>
              )}

              {/* Participantes - Visualização */}
              {task.participants && task.participants.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Participantes
                  </Label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {task.participants.map((participantId) => {
                      const member = teamMembers.find((m: any) => m.id === participantId);
                      return (
                        <Badge key={participantId} variant="secondary" className="text-xs">
                          {member?.name || 'Carregando...'}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isLoading}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </>
          ) : (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50">
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Excluir
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação não pode ser desfeita. A tarefa será permanentemente excluída.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                      Excluir
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {/* Botão Agendar para tarefas de onboarding não iniciadas */}
              {task.task_type === 'onboarding' && task.status === 'not_started' && (
                <Button
                  size="sm"
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="bg-orange-500 hover:bg-orange-600"
                  disabled={isLoading}
                >
                  <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                  Agendar Onboarding
                </Button>
              )}

              {/* Botão Agendar para tarefas de call/meeting realmente não agendadas */}
              {['call', 'meeting'].includes(task.task_type) &&
               !task.scheduled_at &&
               !task.completed && (
                <Button
                  size="sm"
                  onClick={() => setIsScheduleModalOpen(true)}
                  className="bg-blue-500 hover:bg-blue-600"
                  disabled={isLoading}
                >
                  <CalendarPlus className="h-3.5 w-3.5 mr-1" />
                  Agendar Reunião
                </Button>
              )}

              {/* Botão Cliente Desmarcou para tarefas de call/meeting agendadas */}
              {['call', 'meeting'].includes(task.task_type) &&
               task.scheduled_at &&
               !task.completed &&
               task.status !== 'cancelled' &&
               task.status !== 'no_show' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-950/30"
                    disabled={isLoading}
                    onClick={() => { setCancelledReason(''); setCancelledDialogOpen(true); }}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Cliente Desmarcou
                  </Button>
                  <Dialog open={cancelledDialogOpen} onOpenChange={setCancelledDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Cliente desmarcou a reunião?</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                          A tarefa será marcada como cancelada pelo cliente. O lead permanece no estágio atual para reagendamento.
                        </p>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Motivo do cancelamento</Label>
                          <Textarea
                            placeholder="Ex: Cliente pediu para remarcar, surgiu imprevisto, viagem..."
                            value={cancelledReason}
                            onChange={(e) => setCancelledReason(e.target.value)}
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setCancelledDialogOpen(false)}>
                          Voltar
                        </Button>
                        <Button
                          className="bg-orange-500 hover:bg-orange-600"
                          onClick={() => {
                            const notes = `⚠️ Cancelado pelo cliente em ${new Date().toLocaleDateString('pt-BR')}${cancelledReason ? ` — Motivo: ${cancelledReason}` : ''}`;
                            updateTask.mutate({
                              id: task.id,
                              status: 'cancelled',
                              completed: true,
                              completed_at: new Date().toISOString(),
                              notes,
                              metadata: {
                                ...(task.metadata || {}),
                                cancelled_reason: cancelledReason || undefined,
                                cancelled_at: new Date().toISOString(),
                                cancelled_by: 'client',
                              },
                            }, {
                              onSuccess: () => {
                                toast({ title: "Reunião cancelada", description: "Tarefa marcada como cancelada pelo cliente." });
                                setCancelledDialogOpen(false);
                                onOpenChange(false);
                              }
                            });
                          }}
                        >
                          Confirmar Cancelamento
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {/* Botão No-show para tarefas de call/meeting agendadas */}
              {['call', 'meeting'].includes(task.task_type) &&
               task.scheduled_at &&
               !task.completed &&
               task.status !== 'no_show' &&
               task.status !== 'cancelled' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30"
                    disabled={isLoading}
                    onClick={() => { setNoShowReason(''); setNoShowDialogOpen(true); }}
                  >
                    <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                    No-show
                  </Button>
                  <Dialog open={noShowDialogOpen} onOpenChange={setNoShowDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Marcar como No-show?</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                          Confirma que o cliente não compareceu à reunião? Esta ação marcará a tarefa como no-show.
                        </p>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Motivo do no-show</Label>
                          <Textarea
                            placeholder="Ex: Cliente não atendeu, desmarcou em cima da hora, não entrou no link..."
                            value={noShowReason}
                            onChange={(e) => setNoShowReason(e.target.value)}
                            rows={3}
                          />
                        </div>
                      </div>
                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setNoShowDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          className="bg-red-600 hover:bg-red-700"
                          onClick={() => {
                            const notes = `❌ No-show em ${new Date().toLocaleDateString('pt-BR')}${noShowReason ? ` — Motivo: ${noShowReason}` : ''}`;
                            updateTask.mutate({
                              id: task.id,
                              status: 'no_show',
                              completed: true,
                              completed_at: new Date().toISOString(),
                              notes,
                            }, {
                              onSuccess: () => {
                                toast({ title: "Marcado como no-show", description: "Reunião finalizada como não compareceu." });
                                setNoShowDialogOpen(false);
                                onOpenChange(false);
                              }
                            });
                          }}
                        >
                          Confirmar No-show
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {/* Botão Reagendar para tarefas de call/meeting */}
              {['call', 'meeting'].includes(task.task_type) &&
               task.scheduled_at &&
               !task.completed &&
               task.status !== 'rescheduled' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-purple-300 text-purple-600 hover:bg-purple-50 dark:border-purple-700 dark:text-purple-400 dark:hover:bg-purple-950/30"
                    disabled={isLoading}
                    onClick={() => { setRescheduleDate(''); setRescheduleDialogOpen(true); }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 mr-1" />
                    Reagendar
                  </Button>
                  <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Reagendar reunião</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-2">
                        <p className="text-sm text-muted-foreground">
                          O cliente reagendou? Selecione a nova data e hora. A tarefa atual será marcada como reagendada e uma nova será criada.
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Data</Label>
                            <Popover modal>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  className={cn(
                                    "h-9 w-full justify-start text-left font-normal",
                                    !rescheduleDate && "text-muted-foreground"
                                  )}
                                >
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {rescheduleDate ? format(new Date(rescheduleDate), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0 z-[60]" align="start">
                                <CalendarPicker
                                  mode="single"
                                  selected={rescheduleDate ? new Date(rescheduleDate) : undefined}
                                  onSelect={(date) => {
                                    if (date) {
                                      const currentTime = rescheduleDate ? rescheduleDate.split('T')[1]?.substring(0, 5) || '09:00' : '09:00';
                                      setRescheduleDate(`${format(date, 'yyyy-MM-dd')}T${currentTime}`);
                                    }
                                  }}
                                  disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                  locale={ptBR}
                                />
                              </PopoverContent>
                            </Popover>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-sm font-medium">Hora</Label>
                            <TimeInput
                              value={rescheduleDate ? rescheduleDate.split('T')[1]?.substring(0, 5) || '09:00' : '09:00'}
                              onChange={(time) => {
                                const currentDate = rescheduleDate ? rescheduleDate.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                                setRescheduleDate(`${currentDate}T${time}`);
                              }}
                            />
                          </div>
                        </div>
                      </div>
                      <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setRescheduleDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button
                          className="bg-purple-600 hover:bg-purple-700"
                          disabled={!rescheduleDate || updateTask.isPending}
                          onClick={handleReschedule}
                        >
                          {updateTask.isPending ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Reagendando...</>
                          ) : (
                            <><RotateCcw className="h-4 w-4 mr-2" />Confirmar Reagendamento</>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </>
              )}

              {/* Botão Disparar Agente IA - só se tarefa tem lead vinculado e não está concluída */}
              {task.lead_id && !task.completed && aiAgents?.some(a => a.is_active) && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-indigo-300 text-indigo-600 hover:bg-indigo-50 dark:border-indigo-700 dark:text-indigo-400 dark:hover:bg-indigo-950/30"
                      disabled={dispatchAgent.isPending}
                    >
                      <Bot className="h-3.5 w-3.5 mr-1" />
                      {dispatchAgent.isPending ? 'Disparando...' : 'Disparar Agente'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Disparar Agente IA?</AlertDialogTitle>
                      <AlertDialogDescription>
                        O agente IA vai entrar em contato com <strong>{clientName || 'o lead'}</strong> pelo WhatsApp no proximo horario disponivel.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => dispatchAgent.mutate(task.lead_id!)}
                      >
                        <Bot className="h-4 w-4 mr-2" />
                        Confirmar Disparo
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Botão Iniciar para tarefas de onboarding agendadas */}
              {task.task_type === 'onboarding' && task.status === 'scheduled' && task.meeting_link && (
                <Button
                  size="sm"
                  onClick={() => {
                    // Navegar para o Onboarding e iniciar a reunião
                    window.location.href = `/onboarding?start=${task.id}`;
                  }}
                  className="bg-red-500 hover:bg-red-600"
                  disabled={isLoading}
                >
                  <Video className="h-3.5 w-3.5 mr-1" />
                  Iniciar Reunião
                </Button>
              )}

              {/* Botão Iniciar para calls/meetings comerciais agendadas */}
              {['call', 'meeting'].includes(task.task_type) &&
               ['not_started', 'scheduled', 'confirmed'].includes(task.status) &&
               task.meeting_link && (
                <Button
                  size="sm"
                  onClick={() => {
                    // Abrir link da reunião em nova aba
                    window.open(ensureHttps(task.meeting_link), '_blank');
                    // Atualizar status para em andamento
                    updateTask.mutate({
                      id: task.id,
                      status: 'in_progress'
                    });
                  }}
                  className="bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  <Video className="h-3.5 w-3.5 mr-1" />
                  Iniciar Call
                </Button>
              )}

              {!task.completed && (task.is_recurring || task.status !== 'not_started') && (
                task.is_recurring ? (
                  <>
                    <Button size="sm" onClick={handleComplete} className="bg-teal-600 hover:bg-teal-700" disabled={isLoading}>
                      {isLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                      Feito hoje
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50" disabled={isLoading}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Resolver 100%
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Resolver 100%?</AlertDialogTitle>
                          <AlertDialogDescription>
                            A pendência será encerrada definitivamente e não se renovará mais.
                            {task.recurrence_count ? ` (${task.recurrence_count} check-ins realizados)` : ''}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={handleResolveRecurring} className="bg-emerald-600 hover:bg-emerald-700">
                            <CheckCircle2 className="h-4 w-4 mr-2" />
                            Resolver 100%
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                ) : (
                  <Button size="sm" onClick={handleComplete} className="bg-emerald-600 hover:bg-emerald-700" disabled={isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                    <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                    Concluir
                  </Button>
                )
              )}

              {/* Reabrir tarefa concluída */}
              {task.completed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="border-amber-300 text-amber-700 hover:bg-amber-50"
                  disabled={isLoading}
                  onClick={async () => {
                    try {
                      await updateTask.mutateAsync({
                        id: task.id,
                        completed: false,
                        completed_at: null,
                        status: 'not_started',
                      });
                      toast({ title: "Tarefa reaberta" });
                      onOpenChange(false);
                    } catch {
                      toast({ title: "Erro ao reabrir tarefa", variant: "destructive" });
                    }
                  }}
                >
                  {isLoading && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Reabrir
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>

    </Dialog>
  );
}
