import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { TimeInput } from '@/components/ui/time-input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import {
  useTeamMeetings,
  useCreateMeeting,
  useStartMeeting,
  useProcessMeetingTranscription,
  useDeleteMeeting,
  useMeeting,
  Meeting,
} from '@/hooks/useMeetings';
import { TranscriptionPanel } from '@/components/meeting/TranscriptionPanel';
import { MeetingSummaryModal } from '@/components/meeting/MeetingSummaryModal';
import { createCalendarEvent } from '@/services/googleCalendar';
import { motion } from 'framer-motion';
import { pageVariants } from '@/lib/animations';
import {
  Plus,
  Video,
  Mic,
  Clock,
  Users,
  FileText,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Sparkles,
  Eye,
  Trash2,
  MoreVertical,
  Calendar as CalendarIcon,
  Link as LinkIcon,
  X,
  Mail,
  Copy,
  ClipboardCheck,
} from 'lucide-react';
import { cn, ensureHttps } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function addBrasiliaTimezone(datetime: string | undefined): string | undefined {
  if (!datetime) return undefined;
  if (datetime.includes('+') || datetime.includes('-', 10)) return datetime;
  return `${datetime}:00-03:00`;
}

const durations = [
  { value: 15, label: "15 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hora" },
  { value: 90, label: "1h30" },
  { value: 120, label: "2 horas" },
];

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  active: { label: 'Ativa', color: 'bg-green-100 text-green-700', icon: Mic },
  completed: { label: 'Finalizada', color: 'bg-gray-100 text-gray-700', icon: CheckCircle2 },
  processed: { label: 'Processada', color: 'bg-purple-100 text-purple-700', icon: Sparkles },
  no_show: { label: 'No-show', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Cancelada', color: 'bg-orange-100 text-orange-700', icon: AlertCircle },
};

const TeamMeetings = () => {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const { data: meetings = [], isLoading } = useTeamMeetings();
  const createMeeting = useCreateMeeting();
  const startMeeting = useStartMeeting();
  const processMeeting = useProcessMeetingTranscription();
  const deleteMeeting = useDeleteMeeting();

  // Buscar membros do time
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members-active'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, email, role, team')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  // State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [meetingToDelete, setMeetingToDelete] = useState<Meeting | null>(null);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newDateTime, setNewDateTime] = useState('');
  const [newDuration, setNewDuration] = useState(60);
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([]);
  const [externalAttendees, setExternalAttendees] = useState<string[]>([]);
  const [newAttendee, setNewAttendee] = useState('');
  const [meetingLinkType, setMeetingLinkType] = useState<'auto' | 'external' | 'none'>('auto');
  const [externalLink, setExternalLink] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [showTranscription, setShowTranscription] = useState(false);

  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [showSummary, setShowSummary] = useState(false);

  const [processingMeetingId, setProcessingMeetingId] = useState<string | null>(null);
  const [pasteTranscriptionOpen, setPasteTranscriptionOpen] = useState(false);
  const [pastedTranscription, setPastedTranscription] = useState('');
  const [meetingToProcess, setMeetingToProcess] = useState<Meeting | null>(null);

  // Transcription viewer
  const [viewTranscriptionMeeting, setViewTranscriptionMeeting] = useState<Meeting | null>(null);
  const [copiedTranscription, setCopiedTranscription] = useState(false);

  // Buscar meeting ativa
  const { data: activeMeeting } = useMeeting(activeMeetingId || undefined);

  const canCreateMeet = !!teamMember?.google_calendar_connected;

  // Reset form ao abrir
  useEffect(() => {
    if (isCreateOpen) {
      setNewTitle('');
      setNewNotes('');
      setNewDuration(60);
      setSelectedParticipants([]);
      setExternalAttendees([]);
      setNewAttendee('');
      setMeetingLinkType(canCreateMeet ? 'auto' : 'external');
      setExternalLink('');
      // Data padrão: próximo slot de 30min
      const now = new Date();
      const mins = now.getMinutes();
      const nextSlot = mins < 30 ? 30 : 60;
      const rounded = new Date(now);
      rounded.setMinutes(nextSlot, 0, 0);
      if (nextSlot === 60) rounded.setHours(rounded.getHours());
      setNewDateTime(`${rounded.getFullYear()}-${String(rounded.getMonth() + 1).padStart(2, '0')}-${String(rounded.getDate()).padStart(2, '0')}T${String(rounded.getHours()).padStart(2, '0')}:${String(rounded.getMinutes()).padStart(2, '0')}`);
    }
  }, [isCreateOpen, canCreateMeet]);

  const handleAddExternalAttendee = () => {
    if (newAttendee && newAttendee.includes('@') && !externalAttendees.includes(newAttendee)) {
      setExternalAttendees([...externalAttendees, newAttendee]);
      setNewAttendee('');
    }
  };

  const handleCreateMeeting = async () => {
    if (!newTitle.trim()) {
      toast({ title: 'Digite um título', variant: 'destructive' });
      return;
    }

    setIsCreating(true);

    try {
      let finalMeetingLink = '';

      // Construir lista de participantes com nome e email
      const participants = selectedParticipants.map((id) => {
        const member = teamMembers.find((m: any) => m.id === id);
        return { name: member?.name || '', email: member?.email || '', role: member?.role || '' };
      });

      // Adicionar convidados externos como participantes
      externalAttendees.forEach((email) => {
        participants.push({ name: email.split('@')[0], email, role: 'externo' });
      });

      // Criar Google Meet automaticamente
      if (meetingLinkType === 'auto' && canCreateMeet && newDateTime && teamMember?.id) {
        toast({ title: 'Criando evento...', description: 'Gerando link do Google Meet' });
        try {
          const internalEmails = selectedParticipants
            .map((id) => teamMembers.find((m: any) => m.id === id)?.email)
            .filter(Boolean) as string[];

          const calendarResult = await createCalendarEvent({
            title: newTitle,
            description: newNotes || 'Reunião do time',
            startDateTime: addBrasiliaTimezone(newDateTime) || newDateTime,
            durationMinutes: newDuration,
            attendees: [...internalEmails, ...externalAttendees],
            organizerEmail: teamMember.email,
          }, teamMember.id);

          finalMeetingLink = calendarResult.meetLink;
          toast({ title: 'Meet criado!', description: 'Link gerado automaticamente' });
        } catch (calError) {
          console.error('Erro ao criar evento:', calError);
          toast({ title: 'Aviso', description: 'Não foi possível criar o Meet. Reunião será criada sem link.', variant: 'destructive' });
        }
      } else if (meetingLinkType === 'external' && externalLink.trim()) {
        finalMeetingLink = ensureHttps(externalLink.trim());
      }

      const meeting = await createMeeting.mutateAsync({
        title: newTitle,
        meeting_type: 'team',
        team: 'internal',
        meeting_link: finalMeetingLink || undefined,
        participants: participants.length > 0 ? participants : undefined,
        created_by: teamMember?.id,
      });

      toast({ title: 'Reunião criada!' });
      setIsCreateOpen(false);

      // Perguntar se quer iniciar agora
      if (confirm('Deseja iniciar a reunião agora com transcrição?')) {
        await handleStartMeeting(meeting.id);
      }
    } catch (error) {
      toast({ title: 'Erro ao criar reunião', variant: 'destructive' });
    } finally {
      setIsCreating(false);
    }
  };

  const handleStartMeeting = async (meetingId: string) => {
    try {
      await startMeeting.mutateAsync(meetingId);
      setActiveMeetingId(meetingId);
      setShowTranscription(true);
    } catch (error) {
      toast({ title: 'Erro ao iniciar reunião', variant: 'destructive' });
    }
  };

  const handleFinishTranscription = async (transcriptions: any[]) => {
    setShowTranscription(false);
    const meetingId = activeMeetingId;
    setActiveMeetingId(null);

    if (!meetingId || transcriptions.length === 0) return;

    const transcriptionText = transcriptions
      .filter((t) => t.is_final)
      .map((t) => `${t.speaker}: ${t.text}`)
      .join('\n');

    if (!transcriptionText) return;

    try {
      setProcessingMeetingId(meetingId);

      await processMeeting.mutateAsync({
        meetingId,
        transcription: transcriptionText,
        meetingTitle: activeMeeting?.title,
        participants: activeMeeting?.participants?.map((p) => p.name),
      });

      toast({
        title: 'Reunião processada!',
        description: 'Veja o resumo e as tarefas sugeridas',
      });

      // Buscar meeting atualizado diretamente do banco (cache pode estar stale)
      const { data: freshMeeting } = await supabase
        .from('meetings')
        .select('*, organization:organizations(id, name), lead:leads(id, name)')
        .eq('id', meetingId)
        .single();

      if (freshMeeting) {
        setSelectedMeeting(freshMeeting as Meeting);
        setShowSummary(true);
      }
    } catch (error) {
      toast({ title: 'Erro ao processar reunião', variant: 'destructive' });
    } finally {
      setProcessingMeetingId(null);
    }
  };

  const handleOpenPasteTranscription = (meeting: Meeting) => {
    setMeetingToProcess(meeting);
    setPastedTranscription('');
    setPasteTranscriptionOpen(true);
  };

  const handleProcessPastedTranscription = async () => {
    if (!meetingToProcess || !pastedTranscription.trim()) {
      toast({ title: 'Cole a transcrição', variant: 'destructive' });
      return;
    }

    try {
      setProcessingMeetingId(meetingToProcess.id);
      setPasteTranscriptionOpen(false);

      await processMeeting.mutateAsync({
        meetingId: meetingToProcess.id,
        transcription: pastedTranscription,
        meetingTitle: meetingToProcess.title,
        participants: meetingToProcess.participants?.map((p) => p.name),
      });

      toast({
        title: 'Reunião processada!',
        description: 'Veja o resumo e as tarefas sugeridas',
      });

      // Atualizar e abrir modal
      setSelectedMeeting({ ...meetingToProcess, status: 'processed' } as Meeting);
      setShowSummary(true);
    } catch (error) {
      toast({ title: 'Erro ao processar', variant: 'destructive' });
    } finally {
      setProcessingMeetingId(null);
      setMeetingToProcess(null);
    }
  };

  const handleViewSummary = (meeting: Meeting) => {
    setSelectedMeeting(meeting);
    setShowSummary(true);
  };

  const getTranscriptionText = (meeting: Meeting): string => {
    if (!meeting.transcriptions?.length) return '';
    return meeting.transcriptions
      .filter((t: any) => t.is_final !== false)
      .map((t: any) => `${t.speaker || 'Speaker'}: ${t.text}`)
      .join('\n');
  };

  const handleCopyTranscription = (meeting: Meeting) => {
    const text = getTranscriptionText(meeting);
    navigator.clipboard.writeText(text);
    setCopiedTranscription(true);
    setTimeout(() => setCopiedTranscription(false), 2000);
    toast({ title: 'Transcrição copiada!' });
  };

  const handleDeleteMeeting = async () => {
    if (!meetingToDelete) return;

    try {
      await deleteMeeting.mutateAsync(meetingToDelete.id);
      toast({ title: 'Reunião excluída!' });
      setMeetingToDelete(null);
    } catch (error) {
      toast({ title: 'Erro ao excluir', variant: 'destructive' });
    }
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
            <h1 className="text-2xl font-bold">Reuniões do Time</h1>
            <p className="text-muted-foreground">
              Grave, transcreva e extraia tarefas das reuniões
            </p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova Reunião
          </Button>
        </div>

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <Video className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{meetings.length}</p>
                  <p className="text-xs text-muted-foreground">Total de reuniões</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {meetings.filter((m) => m.status === 'processed').length}
                  </p>
                  <p className="text-xs text-muted-foreground">Processadas com IA</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {meetings.filter((m) => m.ai_analysis?.tarefas_sugeridas?.length).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Com tarefas extraídas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Clock className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {meetings.filter((m) => m.status === 'completed' && !m.ai_analysis).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Aguardando processamento</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Lista de Reuniões */}
        <Card>
          <CardHeader>
            <CardTitle>Reuniões Recentes</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : meetings.length === 0 ? (
              <div className="text-center py-12">
                <Video className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
                <p className="text-muted-foreground">Nenhuma reunião ainda</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => setIsCreateOpen(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Criar primeira reunião
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {meetings.map((meeting) => {
                  const status = statusConfig[meeting.status] || statusConfig.completed;
                  const StatusIcon = status.icon;
                  const isProcessing = processingMeetingId === meeting.id;

                  return (
                    <div
                      key={meeting.id}
                      className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={cn(
                            'p-2 rounded-lg',
                            meeting.status === 'processed'
                              ? 'bg-purple-100'
                              : 'bg-muted'
                          )}
                        >
                          {isProcessing ? (
                            <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                          ) : (
                            <StatusIcon
                              className={cn(
                                'h-5 w-5',
                                meeting.status === 'processed'
                                  ? 'text-purple-600'
                                  : 'text-muted-foreground'
                              )}
                            />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{meeting.title}</p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {meeting.created_at && (
                              <span>
                                {format(new Date(meeting.created_at), "dd/MM/yyyy 'às' HH:mm", {
                                  locale: ptBR,
                                })}
                              </span>
                            )}
                            {meeting.participants && meeting.participants.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Users className="h-3 w-3" />
                                {meeting.participants.length}
                              </span>
                            )}
                            {meeting.ai_analysis?.tarefas_sugeridas && (
                              <span className="flex items-center gap-1 text-purple-600">
                                <FileText className="h-3 w-3" />
                                {meeting.ai_analysis.tarefas_sugeridas.length} tarefas
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge className={status.color}>{status.label}</Badge>

                        {/* Ações baseadas no status */}
                        {meeting.status === 'active' && !meeting.transcriptions?.length && (
                          <Button
                            size="sm"
                            onClick={() => {
                              setActiveMeetingId(meeting.id);
                              setShowTranscription(true);
                            }}
                          >
                            <Mic className="h-4 w-4 mr-1" />
                            Transcrever
                          </Button>
                        )}

                        {!meeting.ai_analysis && (meeting.status === 'completed' || (meeting.status === 'active' && meeting.transcriptions?.length)) && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenPasteTranscription(meeting)}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-1" />
                            )}
                            Processar
                          </Button>
                        )}

                        {/* Ver Transcrição - aparece quando tem transcrições salvas */}
                        {meeting.transcriptions && meeting.transcriptions.length > 0 && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setViewTranscriptionMeeting(meeting)}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Transcrição
                          </Button>
                        )}

                        {meeting.ai_analysis && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleViewSummary(meeting)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            Ver Resumo
                          </Button>
                        )}

                        {/* Menu de ações */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {meeting.status === 'active' && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => {
                                    setActiveMeetingId(meeting.id);
                                    setShowTranscription(true);
                                  }}
                                >
                                  <Mic className="h-4 w-4 mr-2" />
                                  Iniciar Transcrição
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleOpenPasteTranscription(meeting)}
                                >
                                  <FileText className="h-4 w-4 mr-2" />
                                  Colar Transcrição
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {!meeting.ai_analysis && (meeting.status === 'completed' || (meeting.status === 'active' && meeting.transcriptions?.length)) && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleOpenPasteTranscription(meeting)}
                                >
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Processar com IA
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {meeting.transcriptions && meeting.transcriptions.length > 0 && (
                              <>
                                <DropdownMenuItem onClick={() => setViewTranscriptionMeeting(meeting)}>
                                  <FileText className="h-4 w-4 mr-2" />
                                  Ver Transcrição
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyTranscription(meeting)}>
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copiar Transcrição
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            {meeting.ai_analysis && (
                              <>
                                <DropdownMenuItem onClick={() => handleViewSummary(meeting)}>
                                  <Eye className="h-4 w-4 mr-2" />
                                  Ver Resumo
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setMeetingToDelete(meeting)}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Excluir Reunião
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Modal Criar Reunião */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Video className="h-5 w-5 text-muted-foreground" />
              Nova Reunião do Time
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            {/* COLUNA ESQUERDA */}
            <div className="space-y-3">
              {/* Título */}
              <div className="space-y-1">
                <Label className="text-xs">Título *</Label>
                <Input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ex: Daily, Planning Sprint..."
                  autoFocus
                />
              </div>

              {/* Data/Hora */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Data</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn("h-9 w-full justify-start text-left font-normal", !newDateTime && "text-muted-foreground")}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {newDateTime ? format(new Date(newDateTime), "dd/MM/yyyy", { locale: ptBR }) : "Selecionar"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <CalendarPicker
                        mode="single"
                        selected={newDateTime ? new Date(newDateTime) : undefined}
                        onSelect={(date) => {
                          if (date) {
                            const currentTime = newDateTime ? newDateTime.split('T')[1] || '09:00' : '09:00';
                            setNewDateTime(`${format(date, 'yyyy-MM-dd')}T${currentTime}`);
                          }
                        }}
                        locale={ptBR}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Hora</Label>
                  <TimeInput
                    value={newDateTime ? newDateTime.split('T')[1]?.substring(0, 5) || '09:00' : '09:00'}
                    onChange={(time) => {
                      const currentDate = newDateTime ? newDateTime.split('T')[0] : format(new Date(), 'yyyy-MM-dd');
                      setNewDateTime(`${currentDate}T${time}`);
                    }}
                  />
                </div>
              </div>

              {/* Duração */}
              <div className="space-y-1">
                <Label className="text-xs">Duração</Label>
                <Select value={newDuration.toString()} onValueChange={(v) => setNewDuration(parseInt(v))}>
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

              {/* Link da Reunião */}
              <div className="space-y-2 p-2 bg-muted/50 rounded-lg border">
                <Label className="text-xs font-medium">Link da Reunião</Label>
                <RadioGroup
                  value={meetingLinkType}
                  onValueChange={(v) => setMeetingLinkType(v as 'auto' | 'external' | 'none')}
                  className="flex gap-3"
                >
                  <Label
                    htmlFor="mt-auto"
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs",
                      meetingLinkType === 'auto' ? "border-blue-500 bg-blue-50" : "border-transparent",
                      !canCreateMeet && "opacity-50"
                    )}
                  >
                    <RadioGroupItem value="auto" id="mt-auto" disabled={!canCreateMeet} className="h-3 w-3" />
                    <Sparkles className="h-3 w-3 text-blue-500" />
                    Criar Meet
                  </Label>
                  <Label
                    htmlFor="mt-external"
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs",
                      meetingLinkType === 'external' ? "border-blue-500 bg-blue-50" : "border-transparent"
                    )}
                  >
                    <RadioGroupItem value="external" id="mt-external" className="h-3 w-3" />
                    <LinkIcon className="h-3 w-3" />
                    Link externo
                  </Label>
                  <Label
                    htmlFor="mt-none"
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs",
                      meetingLinkType === 'none' ? "border-blue-500 bg-blue-50" : "border-transparent"
                    )}
                  >
                    <RadioGroupItem value="none" id="mt-none" className="h-3 w-3" />
                    Nenhum
                  </Label>
                </RadioGroup>

                {meetingLinkType === 'external' && (
                  <Input
                    placeholder="https://meet.google.com/..."
                    value={externalLink}
                    onChange={(e) => setExternalLink(e.target.value)}
                    className="h-8 text-xs"
                  />
                )}

                {meetingLinkType === 'auto' && canCreateMeet && (
                  <div className="text-[10px] text-green-700 bg-green-50 px-2 py-1 rounded">
                    Evento será criado no Google Calendar com Meet
                  </div>
                )}
                {meetingLinkType === 'auto' && !canCreateMeet && (
                  <div className="text-[10px] text-orange-700 bg-orange-50 px-2 py-1 rounded">
                    Conecte o Google Calendar nas configurações para criar Meet automaticamente
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA DIREITA */}
            <div className="space-y-3">
              {/* Participantes internos (membros do time) */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  Membros do Time
                </Label>
                <div className="flex flex-wrap gap-1 min-h-[32px] items-center">
                  {selectedParticipants.map((participantId) => {
                    const member = teamMembers.find((m: any) => m.id === participantId);
                    if (!member) return null;
                    return (
                      <Badge key={participantId} variant="secondary" className="text-[10px] h-6 flex items-center gap-1 pr-1">
                        {member.name}
                        <button
                          type="button"
                          onClick={() => setSelectedParticipants((prev) => prev.filter((id) => id !== participantId))}
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
                      if (id && !selectedParticipants.includes(id)) {
                        setSelectedParticipants((prev) => [...prev, id]);
                      }
                    }}
                  >
                    <SelectTrigger className="h-6 w-auto border-dashed text-xs px-2">
                      <Plus className="h-3 w-3 mr-1" />
                      Adicionar
                    </SelectTrigger>
                    <SelectContent>
                      {teamMembers
                        .filter((m: any) => !selectedParticipants.includes(m.id))
                        .map((m: any) => (
                          <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Convidados externos (emails) */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Convidados Externos
                </Label>
                <div className="flex gap-1">
                  <Input
                    type="email"
                    placeholder="email@exemplo.com"
                    value={newAttendee}
                    onChange={(e) => setNewAttendee(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddExternalAttendee())}
                    className="h-8 text-xs"
                  />
                  <Button type="button" variant="outline" size="sm" onClick={handleAddExternalAttendee} disabled={!newAttendee.includes('@')} className="h-8 px-2">
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {externalAttendees.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {externalAttendees.map((email) => (
                      <Badge key={email} variant="secondary" className="text-[10px] h-5">
                        {email}
                        <button onClick={() => setExternalAttendees((prev) => prev.filter((e) => e !== email))} className="ml-1 hover:text-red-500">
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Notas */}
              <div className="space-y-1">
                <Label className="text-xs">Notas / Pauta</Label>
                <Textarea
                  placeholder="Tópicos da reunião, pauta..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={5}
                  className="text-sm"
                />
              </div>
            </div>
          </div>
          <DialogFooter className="border-t pt-3 mt-2">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreateMeeting} disabled={isCreating || createMeeting.isPending}>
              {(isCreating || createMeeting.isPending) && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Reunião
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Colar Transcrição */}
      <Dialog open={pasteTranscriptionOpen} onOpenChange={setPasteTranscriptionOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Processar Transcrição</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Cole a transcrição da reunião (do Zoom, Meet, etc.) para a IA processar e
              extrair resumo, decisões e tarefas.
            </p>
            <Textarea
              value={pastedTranscription}
              onChange={(e) => setPastedTranscription(e.target.value)}
              placeholder="Cole a transcrição aqui..."
              rows={12}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {pastedTranscription.length} caracteres •{' '}
              {pastedTranscription.split(/\s+/).filter(Boolean).length} palavras
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasteTranscriptionOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleProcessPastedTranscription}
              disabled={!pastedTranscription.trim() || processMeeting.isPending}
            >
              {processMeeting.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Sparkles className="h-4 w-4 mr-2" />
              Processar com IA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transcription Panel */}
      {showTranscription && activeMeetingId && (
        <TranscriptionPanel
          meetingId={activeMeetingId}
          organizationName="Time"
          speakerName={teamMember?.nome || 'Você'}
          meetingLink={activeMeeting?.meeting_link || undefined}
          onClose={() => {
            setShowTranscription(false);
            setActiveMeetingId(null);
          }}
          onFinish={handleFinishTranscription}
        />
      )}

      {/* Meeting Summary Modal */}
      <MeetingSummaryModal
        meeting={selectedMeeting}
        open={showSummary}
        onOpenChange={setShowSummary}
        onTasksCreated={() => {
          toast({ title: 'Tarefas criadas com sucesso!' });
        }}
      />

      {/* Transcription Viewer Dialog */}
      <Dialog open={!!viewTranscriptionMeeting} onOpenChange={(open) => !open && setViewTranscriptionMeeting(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-muted-foreground" />
                Transcrição — {viewTranscriptionMeeting?.title}
              </DialogTitle>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {viewTranscriptionMeeting?.transcriptions?.filter((t: any) => t.is_final !== false).length || 0} segmentos
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => viewTranscriptionMeeting && handleCopyTranscription(viewTranscriptionMeeting)}
                  className="gap-1"
                >
                  {copiedTranscription ? (
                    <>
                      <ClipboardCheck className="h-4 w-4 text-green-600" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copiar tudo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogHeader>
          <ScrollArea className="h-[60vh] border rounded-lg p-4">
            <div className="space-y-2 font-mono text-sm">
              {viewTranscriptionMeeting?.transcriptions
                ?.filter((t: any) => t.is_final !== false)
                .map((t: any, i: number) => (
                  <div key={t.id || i} className="flex gap-3">
                    <span className={cn(
                      'font-semibold shrink-0 min-w-[80px]',
                      t.speakerType === 'local' || t.speaker?.toLowerCase() === 'você'
                        ? 'text-blue-600'
                        : 'text-gray-500'
                    )}>
                      {t.speaker || 'Speaker'}:
                    </span>
                    <span className="text-foreground">{t.text}</span>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!meetingToDelete} onOpenChange={(open) => !open && setMeetingToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir reunião?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a reunião "{meetingToDelete?.title}"?
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMeeting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMeeting.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
};

export default TeamMeetings;
