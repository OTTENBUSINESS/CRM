import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { useSignedUrl } from "@/hooks/useSignedUrl";
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Clock,
  Sparkles,
  ListTodo,
  Loader2,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Mic,
  User,
  Plus,
  Check,
  RefreshCw,
  Settings2,
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  AlertTriangle,
  ExternalLink,
  Calendar,
  Copy,
  ClipboardCheck,
  Pencil,
  Save,
  X,
  FileDown,
  BookOpen,
  NotebookPen,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAnalyzeSalesCall, SuggestedTask, SalesCallAnalysis, AnalysisDepth } from "@/hooks/useAnalyzeSalesCall";
import { CallAnalysisView } from "./CallAnalysisView";
import { CallRating } from "./CallRating";
import { useAnalysisTemplates } from "@/hooks/useAnalysisTemplates";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRateCall } from "@/hooks/useWavoip";
import { Textarea } from "@/components/ui/textarea";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import type { MeetingPDFData } from "@/components/meeting/MeetingPDF";
import { cn } from "@/lib/utils";
import { SaveToTrainingModal } from "@/components/sales/training/SaveToTrainingModal";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface CallDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  call: any;
  hideLeadLink?: boolean;
}

// Helper para inferir task_type
function inferTaskType(titulo: string, descricao?: string): 'call' | 'meeting' | 'whatsapp' | 'email' | 'follow_up' {
  const text = `${titulo} ${descricao || ''}`.toLowerCase();
  if (text.includes('ligar') || text.includes('ligação') || text.includes('telefonar') || text.includes('call')) return 'call';
  if (text.includes('reunião') || text.includes('reuniao') || text.includes('meeting') || text.includes('demo')) return 'meeting';
  if (text.includes('whatsapp') || text.includes('mensagem') || text.includes('zap')) return 'whatsapp';
  if (text.includes('email') || text.includes('e-mail') || text.includes('enviar')) return 'email';
  return 'follow_up';
}

// Helper para calcular prazo
function getPrazoDueDate(prazo: string): string {
  const now = new Date();
  const dueDate = new Date();

  switch (prazo) {
    case "hoje":
      dueDate.setHours(18, 0, 0, 0);
      break;
    case "amanha":
      dueDate.setDate(now.getDate() + 1);
      dueDate.setHours(10, 0, 0, 0);
      break;
    case "esta_semana":
      const daysUntilFriday = 5 - now.getDay();
      dueDate.setDate(now.getDate() + (daysUntilFriday > 0 ? daysUntilFriday : 7));
      dueDate.setHours(10, 0, 0, 0);
      break;
    case "proxima_semana":
      dueDate.setDate(now.getDate() + 7 + (1 - now.getDay()));
      dueDate.setHours(10, 0, 0, 0);
      break;
    default:
      dueDate.setDate(now.getDate() + 1);
      dueDate.setHours(10, 0, 0, 0);
  }

  return dueDate.toISOString();
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatAudioTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const SPEED_OPTIONS = [0.75, 1, 1.25, 1.5, 2] as const;

function AudioPlayer({ src, onSeek, onTimeChange }: { src: string; onSeek?: (ref: React.RefObject<HTMLAudioElement | null>) => void; onTimeChange?: (time: number) => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  // Expose ref for external seek (transcription timestamps)
  useEffect(() => {
    onSeek?.(audioRef);
  }, [onSeek]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(audio.currentTime);
        onTimeChange?.(audio.currentTime);
      }
    };
    const onLoadedMetadata = () => setDuration(audio.duration || 0);
    const onEnded = () => setIsPlaying(false);
    const onDurationChange = () => setDuration(audio.duration || 0);

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('durationchange', onDurationChange);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('durationchange', onDurationChange);
      audio.removeEventListener('ended', onEnded);
    };
  }, [isDragging, onTimeChange]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, audio.currentTime + delta));
  };

  const cycleSpeed = () => {
    const idx = SPEED_OPTIONS.indexOf(speed as any);
    const next = SPEED_OPTIONS[(idx + 1) % SPEED_OPTIONS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const seekFromEvent = (e: { clientX: number }) => {
    const bar = progressRef.current;
    const audio = audioRef.current;
    if (!bar || !audio || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = pct * duration;
    setCurrentTime(pct * duration);
    onTimeChange?.(pct * duration);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seekFromEvent(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    seekFromEvent(e);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="space-y-3">
      <audio ref={audioRef} src={src} preload="metadata" />

      {/* Progress bar */}
      <div
        ref={progressRef}
        className="relative h-8 w-full cursor-pointer group select-none"
        style={{ touchAction: 'none' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-2 rounded-full bg-muted" />
        {/* Filled track */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-2 rounded-full bg-primary transition-[width] duration-75"
          style={{ width: `${progress}%` }}
        />
        {/* Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary shadow-md border-2 border-background pointer-events-none transition-all ${isDragging ? 'w-5 h-5' : 'w-3.5 h-3.5 group-hover:w-5 group-hover:h-5'}`}
          style={{ left: `${progress}%` }}
        />
      </div>

      {/* Controls row */}
      <div className="flex items-center justify-between gap-2">
        {/* Time */}
        <span className="text-xs font-mono text-muted-foreground w-24 shrink-0">
          {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
        </span>

        {/* Central controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => skip(-15)}
            className="relative p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Voltar 15s"
          >
            <RotateCcw className="h-5 w-5" />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">15</span>
          </button>

          <button
            onClick={togglePlay}
            className="p-2.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>

          <button
            onClick={() => skip(15)}
            className="relative p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            title="Avançar 15s"
          >
            <RotateCw className="h-5 w-5" />
            <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold mt-[1px]">15</span>
          </button>
        </div>

        {/* Speed control */}
        <button
          onClick={cycleSpeed}
          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors text-foreground w-14 text-center shrink-0"
          title="Velocidade de reprodução"
        >
          {speed}x
        </button>
      </div>
    </div>
  );
}

export function CallDetailModal({ open, onOpenChange, call, hideLeadLink = false }: CallDetailModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // UI State
  const [showTranscription, setShowTranscription] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("default");
  const [copiedTranscription, setCopiedTranscription] = useState(false);
  const [copiedAnalysis, setCopiedAnalysis] = useState(false);
  const [playerAudioRef, setPlayerAudioRef] = useState<React.RefObject<HTMLAudioElement | null> | null>(null);
  const [playerCurrentTime, setPlayerCurrentTime] = useState(0);
  const activeSegmentRef = useRef<HTMLDivElement | null>(null);

  // Transcription editing state
  const [isEditingTranscription, setIsEditingTranscription] = useState(false);
  const [editTranscriptionText, setEditTranscriptionText] = useState("");
  const [isSavingTranscription, setIsSavingTranscription] = useState(false);

  // Training
  const [showTrainingModal, setShowTrainingModal] = useState(false);
  const [showTrainingNotes, setShowTrainingNotes] = useState(!!call?.training_notes);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [trainingNotesText, setTrainingNotesText] = useState(call?.training_notes || '');
  const rateCall = useRateCall();

  // PDF State
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // Task State
  const [tasks, setTasks] = useState<(SuggestedTask & { created: boolean })[]>([]);
  const [showCreateTaskModal, setShowCreateTaskModal] = useState(false);
  const [taskToCreate, setTaskToCreate] = useState<{
    name: string;
    description?: string;
    task_type: 'call' | 'meeting' | 'whatsapp' | 'email' | 'follow_up';
    due_datetime?: string;
  } | null>(null);

  // Hooks - MUST be called before any early return
  const { analyze, isAnalyzing, analysis, error: analyzeError, reset: resetAnalysis } = useAnalyzeSalesCall();
  const { data: templates = [] } = useAnalysisTemplates('call_analysis');

  // Derived values - handle null call safely
  const isIncoming = call?.direction === "INCOMING";
  const isMissed = call ? ["REJECTED", "NOT_ANSWERED", "FAILED"].includes(call.status) : false;
  const signedRecordUrl = useSignedUrl(call?.record_url);
  const hasRecording = (call?.record_status === "READY" || call?.record_status === "completed") && call?.record_url;
  const transcriptions = call?.transcriptions || [];
  const finalTranscriptions = transcriptions.filter((t: any) => t.is_final !== false);

  // Auto-scroll removed: let user scroll freely through transcription

  // Normalizar análise
  const rawAnalysis =
    analysis ||
    call?.metadata?.ai_analysis ||
    (call?.ai_summary ? {
      diagnostico: call.ai_summary,
      sentimento: call.ai_sentiment,
      pontos_chave: call.ai_key_points || [],
      riscos: [],
      proximo_passo: '',
      tarefas_sugeridas: call.ai_suggested_tasks || [],
      dados_extraidos: {},
      score_adjustment: 0,
    } : null);

  const buildTarefasFromLegacy = (raw: any): SuggestedTask[] => {
    if (raw.tarefas_sugeridas?.length > 0) return raw.tarefas_sugeridas;
    const tarefas: SuggestedTask[] = [];
    if (raw.proximos_passos?.length > 0) {
      raw.proximos_passos.forEach((passo: string) => {
        tarefas.push({
          titulo: passo.length > 60 ? passo.substring(0, 60) + '...' : passo,
          descricao: passo,
          prioridade: 'high',
          prazo_sugerido: 'amanha',
        });
      });
    }
    if (raw.compromissos?.length > 0) {
      raw.compromissos.forEach((compromisso: string) => {
        tarefas.push({
          titulo: compromisso.length > 60 ? compromisso.substring(0, 60) + '...' : compromisso,
          descricao: compromisso,
          prioridade: 'medium',
          prazo_sugerido: 'esta_semana',
        });
      });
    }
    return tarefas;
  };

  const currentAnalysis: SalesCallAnalysis | null = rawAnalysis ? {
    diagnostico: rawAnalysis.diagnostico || rawAnalysis.resumo || '',
    pontos_chave: rawAnalysis.pontos_chave || rawAnalysis.pontos_principais || [],
    riscos: rawAnalysis.riscos || rawAnalysis.objecoes || [],
    proximo_passo: rawAnalysis.proximo_passo || (rawAnalysis.proximos_passos?.[0]) || '',
    sentimento: rawAnalysis.sentimento === 'positivo' ? 'positive' :
                rawAnalysis.sentimento === 'negativo' ? 'negative' :
                rawAnalysis.sentimento || 'neutral',
    tarefas_sugeridas: buildTarefasFromLegacy(rawAnalysis),
    dados_extraidos: rawAnalysis.dados_extraidos || rawAnalysis.bant_updates || {},
    score_adjustment: rawAnalysis.score_adjustment || 0,
    // Deep fields (opcionais)
    perfil_lead: rawAnalysis.perfil_lead,
    negociacao: rawAnalysis.negociacao,
    pontos_fortes_vendedor: rawAnalysis.pontos_fortes_vendedor,
    veredicto: rawAnalysis.veredicto,
    recomendacao_estrategica: rawAnalysis.recomendacao_estrategica,
    analysis_depth: rawAnalysis.analysis_depth,
  } : null;

  const hasAnalysis = !!currentAnalysis && (currentAnalysis.diagnostico || currentAnalysis.pontos_chave?.length > 0);

  // Carregar tarefas já criadas do metadata
  const createdSuggestedTasks: string[] = call?.metadata?.created_suggested_tasks || [];

  // Inicializar tasks quando modal abre ou quando análise muda
  useEffect(() => {
    if (open && call && currentAnalysis?.tarefas_sugeridas?.length > 0) {
      setTasks(currentAnalysis.tarefas_sugeridas.map(t => ({
        ...t,
        // Marcar como criada se o título está na lista de tarefas já criadas
        created: createdSuggestedTasks.includes(t.titulo)
      })));
    }
  }, [open, currentAnalysis?.tarefas_sugeridas, call?.id, createdSuggestedTasks]);

  // Função para salvar tarefa criada no metadata do call_history
  const markTaskAsCreated = useCallback(async (taskTitle: string) => {
    if (!call?.id) return;

    try {
      const currentMetadata = call.metadata || {};
      const currentCreatedTasks = currentMetadata.created_suggested_tasks || [];

      // Evitar duplicatas
      if (currentCreatedTasks.includes(taskTitle)) return;

      const updatedCreatedTasks = [...currentCreatedTasks, taskTitle];

      await supabase
        .from('call_history')
        .update({
          metadata: {
            ...currentMetadata,
            created_suggested_tasks: updatedCreatedTasks
          }
        })
        .eq('id', call.id);

      // Atualizar estado local
      setTasks(prev => prev.map(t =>
        t.titulo === taskTitle ? { ...t, created: true } : t
      ));

      // Invalidar cache para atualizar em outros lugares
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record', call.id] });
    } catch (error) {
      console.error('[CallDetailModal] Erro ao marcar tarefa como criada:', error);
    }
  }, [call?.id, call?.metadata, queryClient]);

  // Abrir modal de criação com tarefa sugerida
  const handleCreateFromSuggestion = useCallback((task: SuggestedTask) => {
    // Usar data/hora específica se a IA extraiu da conversa, senão usar prazo genérico
    const dueDateTime = task.data_hora_especifica || getPrazoDueDate(task.prazo_sugerido);

    console.log('[CallDetailModal] Criando tarefa:', {
      titulo: task.titulo,
      data_hora_especifica: task.data_hora_especifica,
      prazo_sugerido: task.prazo_sugerido,
      due_datetime_final: dueDateTime,
    });

    setTaskToCreate({
      name: task.titulo,
      description: task.descricao,
      task_type: inferTaskType(task.titulo, task.descricao),
      due_datetime: dueDateTime,
    });
    setShowCreateTaskModal(true);
  }, []);

  // Abrir modal para criar tarefa manual
  const handleCreateManualTask = useCallback(() => {
    setTaskToCreate({
      name: '',
      task_type: 'follow_up',
    });
    setShowCreateTaskModal(true);
  }, []);

  // Reprocessar análise
  const handleReprocess = useCallback(async () => {
    if (!call) return;

    if (finalTranscriptions.length === 0) {
      toast({
        title: "Sem transcrição",
        description: "Não há transcrição disponível para analisar",
        variant: "destructive",
      });
      return;
    }

    resetAnalysis();
    setTasks([]);

    const result = await analyze({
      callId: call.id,
      transcription: finalTranscriptions,
      leadId: call.lead_id,
      leadName: call.peer_name,
    });

    if (result) {
      setTasks(result.tarefas_sugeridas?.map(t => ({ ...t, created: false })) || []);
      toast({
        title: "Análise reprocessada!",
        description: "A chamada foi analisada novamente",
      });
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record', call.id] });
    }
  }, [call, finalTranscriptions, analyze, resetAnalysis, queryClient, toast]);

  // Start editing transcription
  const handleStartEditTranscription = useCallback(() => {
    const text = finalTranscriptions
      .map((s: any) => `${s.speaker}: ${s.text}`)
      .join('\n');
    setEditTranscriptionText(text);
    setIsEditingTranscription(true);
  }, [finalTranscriptions]);

  // Parse text back into transcription format
  // Supports:
  // 1. "Speaker: text" format
  // 2. Google Meet format with speakers + timestamps + >> for other speaker:
  //    Sol.
  //    3:04
  //    Opa,
  //    3:05
  //    >> fala Diego. Boa tarde.
  //    3:08
  //    >> Certo por aí.
  const parseTranscriptionText = useCallback((text: string) => {
    const lines = text.split('\n');
    const timestampRegex = /^(\d{1,2}:)?\d{1,2}:\d{2}$/;

    // Detect if this is Google Meet timestamp format
    const hasTimestamps = lines.some(line => timestampRegex.test(line.trim()));

    if (hasTimestamps) {
      // Google Meet format with speaker names and >> markers
      // First pass: detect speaker names (lines before timestamps that aren't >> and aren't timestamps)
      const speakers: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed) continue;
        // A speaker name line: not a timestamp, not starting with >>, short (< 40 chars),
        // and the next non-empty line is a timestamp
        if (!timestampRegex.test(trimmed) && !trimmed.startsWith('>>') && trimmed.length < 40) {
          // Look ahead for a timestamp
          for (let j = i + 1; j < lines.length; j++) {
            const next = lines[j].trim();
            if (!next) continue;
            if (timestampRegex.test(next) && !speakers.includes(trimmed.replace(/[.\s]+$/, ''))) {
              speakers.push(trimmed.replace(/[.\s]+$/, '')); // Remove trailing dots/spaces
            }
            break;
          }
        }
      }

      // Default speakers: first detected = "local", >> = "remote"
      const localSpeaker = speakers[0] || 'Vendedor';
      const remoteSpeaker = speakers[1] || 'Cliente';

      const entries: any[] = [];
      let currentTimestamp = "0:00";
      let currentSpeaker = localSpeaker;
      let currentSpeakerType: 'local' | 'remote' = 'local';
      let currentLines: string[] = [];

      // Parse timestamp to seconds for proper ordering
      const parseTimestampToMs = (ts: string): number => {
        const parts = ts.split(':').map(Number);
        if (parts.length === 3) return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
        if (parts.length === 2) return (parts[0] * 60 + parts[1]) * 1000;
        return 0;
      };

      const baseTime = Date.now();

      const flushEntry = () => {
        const content = currentLines.join(' ').trim();
        if (content) {
          entries.push({
            id: baseTime + entries.length,
            speaker: currentSpeaker,
            speakerType: currentSpeakerType,
            text: content,
            is_final: true,
            timestamp: baseTime + parseTimestampToMs(currentTimestamp),
            timestampLabel: currentTimestamp,
            confidence: 1,
          });
        }
        currentLines = [];
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (timestampRegex.test(trimmed)) {
          // Flush previous entry before starting new timestamp block
          flushEntry();
          currentTimestamp = trimmed;
        } else if (speakers.includes(trimmed.replace(/[.\s]+$/, ''))) {
          // Speaker name line — switch to this speaker
          flushEntry();
          const name = trimmed.replace(/[.\s]+$/, '');
          currentSpeaker = name;
          currentSpeakerType = name === localSpeaker ? 'local' : 'remote';
        } else {
          // Content line — check for >> marker (other speaker)
          let lineText = trimmed;
          if (lineText.startsWith('>>')) {
            // >> indicates the remote/other speaker
            lineText = lineText.replace(/^>>\s*/, '').trim();
            if (currentLines.length === 0) {
              // First line in this timestamp block with >> — switch speaker
              currentSpeaker = remoteSpeaker;
              currentSpeakerType = 'remote';
            } else if (currentSpeakerType !== 'remote') {
              // Mid-block speaker switch — flush and switch
              flushEntry();
              currentSpeaker = remoteSpeaker;
              currentSpeakerType = 'remote';
            }
          } else if (currentLines.length === 0) {
            // First line without >> — use local speaker
            currentSpeaker = localSpeaker;
            currentSpeakerType = 'local';
          }
          if (lineText) {
            currentLines.push(lineText);
          }
        }
      }
      // Flush last entry
      flushEntry();

      return entries;
    }

    // Standard "Speaker: text" format
    const filteredLines = lines.filter(line => line.trim());
    return filteredLines.map((line, index) => {
      const match = line.match(/^(.+?):\s*(.+)$/);
      if (match) {
        return {
          id: Date.now() + index,
          speaker: match[1].trim(),
          text: match[2].trim(),
          is_final: true,
          timestamp: Date.now() + index,
          confidence: 1,
        };
      }
      return {
        id: Date.now() + index,
        speaker: "Participante",
        text: line.trim(),
        is_final: true,
        timestamp: Date.now() + index,
        confidence: 1,
      };
    });
  }, []);

  // Save edited transcription + auto-trigger AI analysis
  const handleSaveTranscription = useCallback(async () => {
    if (!call?.id) return;
    setIsSavingTranscription(true);

    try {
      const parsed = parseTranscriptionText(editTranscriptionText);
      const table = call.is_meeting ? 'meetings' : 'call_history';

      const { error } = await supabase
        .from(table)
        .update({ transcriptions: parsed })
        .eq('id', call.id);

      if (error) throw error;

      setIsEditingTranscription(false);
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record', call.id] });
      queryClient.invalidateQueries({ queryKey: ['meetings'] });

      // Auto-trigger AI analysis with the new transcription
      if (parsed.length > 0) {
        toast({ title: "Transcrição salva! Rodando análise IA..." });
        resetAnalysis();
        setTasks([]);

        const result = await analyze({
          callId: call.id,
          transcription: parsed,
          leadId: call.lead_id,
          leadName: call.peer_name,
          ...(call.is_meeting ? { meetingId: call.id } : {}),
        });

        if (result) {
          setTasks(result.tarefas_sugeridas?.map(t => ({ ...t, created: false })) || []);
          toast({ title: "Análise concluída!", description: "Transcrição salva e análise atualizada" });
          queryClient.invalidateQueries({ queryKey: ['call-history'] });
          queryClient.invalidateQueries({ queryKey: ['call-record', call.id] });
        }
      } else {
        toast({ title: "Transcrição atualizada!" });
      }
    } catch (error: any) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } finally {
      setIsSavingTranscription(false);
    }
  }, [call?.id, call?.is_meeting, call?.lead_id, call?.peer_name, editTranscriptionText, parseTranscriptionText, queryClient, toast, analyze, resetAnalysis]);

  // Early return AFTER all hooks
  if (!call) return null;

  // Handler para aprofundar análise
  const handleDeepAnalyze = useCallback(async () => {
    if (!call || finalTranscriptions.length === 0) return;

    resetAnalysis();
    setTasks([]);

    const result = await analyze({
      callId: call.id,
      transcription: finalTranscriptions,
      leadId: call.lead_id,
      leadName: call.peer_name,
      depth: 'deep',
    });

    if (result) {
      setTasks(result.tarefas_sugeridas?.map(t => ({ ...t, created: false })) || []);
      toast({
        title: "Análise aprofundada concluída!",
        description: "Análise completa com IA Pro disponível",
      });
      queryClient.invalidateQueries({ queryKey: ['call-history'] });
      queryClient.invalidateQueries({ queryKey: ['call-record', call.id] });
    }
  }, [call, finalTranscriptions, analyze, resetAnalysis, queryClient, toast]);

  const getDirectionConfig = () => {
    if (isMissed) return { icon: PhoneMissed, color: "text-red-500", bg: "bg-red-100 dark:bg-red-900/40", label: "Perdida" };
    if (isIncoming) return { icon: PhoneIncoming, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40", label: "Recebida" };
    return { icon: PhoneOutgoing, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-900/40", label: "Realizada" };
  };

  const directionConfig = getDirectionConfig();
  const DirectionIcon = directionConfig.icon;
  const createdTaskCount = tasks.filter(t => t.created).length;
  const pendingTaskCount = tasks.filter(t => !t.created).length;

  const sentimentLabel = currentAnalysis?.sentimento === 'positive' ? 'Positivo' :
                         currentAnalysis?.sentimento === 'negative' ? 'Negativo' : 'Neutro';

  // Gerar PDF da reunião
  const handleGeneratePDF = useCallback(async () => {
    if (!currentAnalysis || !call) return;
    setIsGeneratingPDF(true);
    try {
      const durationSecs = call.duration_seconds || 0;
      const mins = Math.floor(durationSecs / 60);
      const secs = durationSecs % 60;
      const durationStr = `${mins}min${secs > 0 ? ` ${secs}s` : ''}`;

      const startDate = call.started_at ? new Date(call.started_at) : new Date();
      const endDate = call.ended_at ? new Date(call.ended_at) : null;

      const dateStr = startDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = startDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        + (endDate ? ` - ${endDate.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}` : '');

      const pdfData: MeetingPDFData = {
        clientName: call.peer_name || 'Cliente',
        date: dateStr,
        time: timeStr,
        duration: durationStr,
        responsavel: call.agent_name || call.metadata?.responsavel || 'Equipe',
        sentiment: currentAnalysis.sentimento || 'neutral',
        diagnostico: currentAnalysis.diagnostico || '',
        pontosChave: currentAnalysis.pontos_chave || [],
        proximosPassos: (currentAnalysis.tarefas_sugeridas || []).map(t => ({
          titulo: t.titulo,
          descricao: t.descricao || '',
          prioridade: t.prioridade || 'medium',
          prazo: t.prazo_sugerido,
        })),
        riscos: currentAnalysis.riscos || [],
        proximoPasso: currentAnalysis.proximo_passo,
      };

      const { generateMeetingPDF, downloadMeetingPDF } = await import('@/components/meeting/MeetingPDF');
      const blob = await generateMeetingPDF(pdfData);
      downloadMeetingPDF(blob, call.peer_name || 'Cliente');

      toast({ title: 'PDF gerado com sucesso!' });
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      toast({ title: 'Erro ao gerar PDF', variant: 'destructive' });
    } finally {
      setIsGeneratingPDF(false);
    }
  }, [currentAnalysis, call, toast]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] p-0 overflow-hidden flex flex-col">
          {/* Header fixo */}
          <DialogHeader className={cn(
            "px-6 py-4 border-b",
            isMissed ? "bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/40" :
            isIncoming ? "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40" :
            "bg-gradient-to-r from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/40"
          )}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2.5 rounded-full", directionConfig.bg)}>
                  <DirectionIcon className={cn("h-5 w-5", directionConfig.color)} />
                </div>
                <div>
                  <DialogTitle className="text-lg font-semibold">
                    {call.peer_name || call.peer_phone}
                  </DialogTitle>
                  <DialogDescription className="text-sm text-muted-foreground flex items-center gap-2">
                    {call.peer_name && <span>{call.peer_phone}</span>}
                    <span>•</span>
                    <span>{formatDistanceToNow(new Date(call.started_at), { addSuffix: true, locale: ptBR })}</span>
                  </DialogDescription>
                </div>
              </div>
              <div className="text-right space-y-1">
                <div className="flex items-center gap-1.5 text-xl font-mono font-semibold text-slate-700 dark:text-slate-200">
                  <Clock className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                  {formatDuration(call.duration_seconds || 0)}
                </div>
                <p className={cn("text-xs", directionConfig.color)}>
                  {directionConfig.label}
                </p>
                <CallRating callId={call.id} currentRating={call.rating ?? null} size="sm" showLabel={false} />
              </div>
            </div>
          </DialogHeader>

          {/* Player sticky */}
          {hasRecording && (
            <div className="px-6 py-3 border-b bg-muted/50">
              <AudioPlayer
                src={signedRecordUrl || call.record_url}
                onSeek={(ref) => setPlayerAudioRef(ref)}
                onTimeChange={setPlayerCurrentTime}
              />
              {/* Subtitle bar - shows active segment + surrounding context */}
              {finalTranscriptions.length > 0 && playerCurrentTime > 0 && (() => {
                const firstTs = finalTranscriptions[0]?.timestamp || 0;
                let activeIdx = -1;
                for (let i = finalTranscriptions.length - 1; i >= 0; i--) {
                  const seg = finalTranscriptions[i] as any;
                  const rs = seg.timestamp && firstTs
                    ? Math.max(0, (seg.timestamp - firstTs) / 1000)
                    : null;
                  if (rs != null && rs <= playerCurrentTime) {
                    activeIdx = i;
                    break;
                  }
                }
                if (activeIdx < 0) return null;
                // Show 2 before + active + 1 after for context
                const startIdx = Math.max(0, activeIdx - 2);
                const endIdx = Math.min(finalTranscriptions.length - 1, activeIdx + 1);
                const contextSegments = finalTranscriptions.slice(startIdx, endIdx + 1);
                return (
                  <div className="mt-2 px-3 py-2 bg-black/80 rounded-lg space-y-1 max-h-32 overflow-y-auto">
                    {contextSegments.map((seg: any, i: number) => {
                      const isActive = startIdx + i === activeIdx;
                      return (
                        <div key={seg.id || startIdx + i} className={cn("transition-opacity", isActive ? "opacity-100" : "opacity-40")}>
                          <span className="text-[10px] font-semibold text-white/60 mr-1.5">{seg.speaker}:</span>
                          <span className={cn("text-sm leading-snug", isActive ? "text-white font-medium" : "text-white/70")}>{seg.text}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Conteúdo com scroll */}
          <div className="overflow-y-auto flex-1 min-h-0 px-6">
            <div className="py-4 space-y-4">

              {/* Status de processamento */}
              {isAnalyzing && (
                <div className="flex items-center gap-3 p-4 bg-violet-50 dark:bg-violet-950/40 rounded-xl border border-violet-200 dark:border-violet-800">
                  <div className="relative">
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                      <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <Loader2 className="h-4 w-4 text-violet-600 dark:text-violet-400 animate-spin absolute -bottom-1 -right-1 bg-white dark:bg-background rounded-full" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-violet-800 dark:text-violet-200">Analisando chamada com IA</p>
                    <p className="text-sm text-violet-600 dark:text-violet-400">Processando transcrição e gerando insights...</p>
                  </div>
                </div>
              )}

              {/* Erro */}
              {analyzeError && (
                <div className="flex items-center justify-between gap-3 p-4 bg-red-50 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-red-800 dark:text-red-200">Erro na análise</p>
                      <p className="text-sm text-red-600 dark:text-red-400">{analyzeError}</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleReprocess} disabled={isAnalyzing}>
                    <RefreshCw className="h-4 w-4 mr-1.5" />
                    Tentar novamente
                  </Button>
                </div>
              )}

              {/* Análise da IA */}
              {hasAnalysis && currentAnalysis && (
                <div className="space-y-4">
                  {/* Action buttons */}
                  <div className="flex items-center justify-end gap-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            onClick={() => {
                              const parts: string[] = [];
                              parts.push(`ANÁLISE DA CHAMADA — ${call.peer_name || call.peer_phone}`);
                              parts.push(`Sentimento: ${sentimentLabel}`);
                              parts.push('');
                              if (currentAnalysis.diagnostico) {
                                parts.push(`DIAGNÓSTICO:\n${currentAnalysis.diagnostico}`);
                                parts.push('');
                              }
                              if (currentAnalysis.perfil_lead) {
                                parts.push(`PERFIL DO LEAD:\n${currentAnalysis.perfil_lead}`);
                                parts.push('');
                              }
                              if (currentAnalysis.pontos_chave?.length > 0) {
                                parts.push(`PONTOS-CHAVE:`);
                                currentAnalysis.pontos_chave.forEach(p => parts.push(`• ${p}`));
                                parts.push('');
                              }
                              if (currentAnalysis.riscos?.length > 0) {
                                parts.push(`RISCOS / OBJEÇÕES:`);
                                currentAnalysis.riscos.forEach(r => parts.push(`• ${r}`));
                                parts.push('');
                              }
                              if (currentAnalysis.veredicto) {
                                parts.push(`VEREDICTO: ${currentAnalysis.veredicto.probabilidade}%`);
                                parts.push(currentAnalysis.veredicto.justificativa);
                                parts.push('');
                              }
                              if (currentAnalysis.recomendacao_estrategica) {
                                parts.push(`RECOMENDAÇÃO ESTRATÉGICA:\n${currentAnalysis.recomendacao_estrategica}`);
                                parts.push('');
                              }
                              if (currentAnalysis.proximo_passo) {
                                parts.push(`PRÓXIMO PASSO:\n${currentAnalysis.proximo_passo}`);
                                parts.push('');
                              }
                              if (currentAnalysis.dados_extraidos) {
                                const d = currentAnalysis.dados_extraidos;
                                const campos = [
                                  d.empresa && `Empresa: ${d.empresa}`,
                                  d.cargo && `Cargo: ${d.cargo}`,
                                  d.necessidade && `Necessidade: ${d.necessidade}`,
                                  d.orcamento && `Orçamento: ${d.orcamento}`,
                                  d.timeline && `Timeline: ${d.timeline}`,
                                ].filter(Boolean);
                                if (campos.length > 0) {
                                  parts.push(`DADOS EXTRAÍDOS (BANT):`);
                                  campos.forEach(c => parts.push(`• ${c}`));
                                  parts.push('');
                                }
                              }
                              if (tasks.length > 0) {
                                parts.push(`TAREFAS SUGERIDAS:`);
                                tasks.forEach(t => {
                                  const status = t.created ? '[CRIADA]' : '[PENDENTE]';
                                  parts.push(`${status} ${t.titulo}${t.descricao && t.descricao !== t.titulo ? ` — ${t.descricao}` : ''}`);
                                });
                              }
                              navigator.clipboard.writeText(parts.join('\n'));
                              setCopiedAnalysis(true);
                              setTimeout(() => setCopiedAnalysis(false), 2000);
                              toast({ title: "Análise copiada!" });
                            }}
                          >
                            {copiedAnalysis ? (
                              <ClipboardCheck className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Copiar análise completa</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleReprocess}
                            disabled={isAnalyzing || finalTranscriptions.length === 0}
                            className="h-8 px-2"
                          >
                            <RefreshCw className={cn("h-4 w-4", isAnalyzing && "animate-spin")} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Reprocessar análise</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>

                  <CallAnalysisView
                    analysis={currentAnalysis}
                    onDeepAnalyze={handleDeepAnalyze}
                    isAnalyzing={isAnalyzing}
                    showDeepButton={finalTranscriptions.length > 0}
                  />

                  {/* Tarefas Sugeridas */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                        <ListTodo className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        Tarefas Sugeridas
                        {tasks.length > 0 && (
                          <Badge variant="secondary" className="ml-1 font-normal">
                            {pendingTaskCount} pendente{pendingTaskCount !== 1 ? 's' : ''}
                          </Badge>
                        )}
                      </p>
                      {createdTaskCount > 0 && (
                        <Badge className="bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700">
                          <Check className="h-3 w-3 mr-1" />
                          {createdTaskCount} criada{createdTaskCount > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>

                    {tasks.length > 0 && (
                      <div className="space-y-2">
                        {tasks.map((task, index) => (
                          <div
                            key={index}
                            className={cn(
                              "p-3 rounded-xl border transition-all",
                              task.created
                                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800"
                                : "bg-white dark:bg-muted/30 border-slate-200 dark:border-border hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-sm"
                            )}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-3 flex-1 min-w-0">
                                {task.created ? (
                                  <div className="w-5 h-5 mt-0.5 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                                    <Check className="h-3 w-3 text-white" />
                                  </div>
                                ) : (
                                  <div className="w-5 h-5 mt-0.5 rounded-full border-2 border-slate-300 dark:border-slate-600 flex-shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <p className={cn(
                                    "font-medium text-sm",
                                    task.created ? "text-emerald-800 dark:text-emerald-200" : "text-foreground"
                                  )}>
                                    {task.titulo}
                                  </p>
                                  {task.descricao && task.descricao !== task.titulo && (
                                    <p className={cn(
                                      "text-xs mt-0.5 line-clamp-2",
                                      task.created ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                                    )}>
                                      {task.descricao}
                                    </p>
                                  )}
                                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-[10px] h-5",
                                        task.prioridade === "high" ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300" :
                                        task.prioridade === "medium" ? "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300" :
                                        "border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30 text-slate-600 dark:text-muted-foreground"
                                      )}
                                    >
                                      {task.prioridade === "high" ? "Alta" : task.prioridade === "medium" ? "Média" : "Baixa"}
                                    </Badge>
                                    {task.data_hora_especifica ? (
                                      <Badge variant="outline" className="text-[10px] h-5 border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300">
                                        <Calendar className="h-2.5 w-2.5 mr-1" />
                                        {new Date(task.data_hora_especifica).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        })}
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-[10px] h-5 border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/30">
                                        <Calendar className="h-2.5 w-2.5 mr-1" />
                                        {task.prazo_sugerido === 'hoje' ? 'Hoje' :
                                         task.prazo_sugerido === 'amanha' ? 'Amanhã' :
                                         task.prazo_sugerido === 'esta_semana' ? 'Esta semana' : 'Próx. semana'}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {!task.created && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleCreateFromSuggestion(task)}
                                  className="h-8 px-3 text-xs shrink-0"
                                >
                                  <Plus className="h-3.5 w-3.5 mr-1" />
                                  Criar
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Botão adicionar tarefa */}
                    <Button
                      variant="outline"
                      onClick={handleCreateManualTask}
                      className="w-full h-10 border-dashed border-slate-300 dark:border-border hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Adicionar tarefa manualmente
                    </Button>
                  </div>
                </div>
              )}

              {/* Sem análise - botão para processar */}
              {!hasAnalysis && !isAnalyzing && finalTranscriptions.length > 0 && (
                <div className="p-4 bg-violet-50 dark:bg-violet-950/40 rounded-xl border border-violet-200 dark:border-violet-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-violet-100 dark:bg-violet-900/50 rounded-lg">
                      <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div>
                      <p className="font-medium text-violet-800 dark:text-violet-200">Análise disponível</p>
                      <p className="text-sm text-violet-600 dark:text-violet-400">
                        {finalTranscriptions.length} mensagens transcritas
                      </p>
                    </div>
                  </div>
                  <Button onClick={handleReprocess} disabled={isAnalyzing}>
                    {isAnalyzing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Analisar com IA
                  </Button>
                </div>
              )}

              {/* Opções avançadas */}
              {finalTranscriptions.length > 0 && (
                <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-lg transition-colors">
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-4 w-4" />
                        Opções avançadas
                      </span>
                      <ChevronDown className={cn("h-4 w-4 transition-transform", showAdvanced && "rotate-180")} />
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    <div className="p-4 bg-slate-50 dark:bg-muted/30 rounded-xl border border-slate-200 dark:border-border space-y-3">
                      <div className="space-y-1.5">
                        <label className="text-xs font-medium text-muted-foreground">Template de Análise</label>
                        <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                          <SelectTrigger className="h-9 bg-white dark:bg-background">
                            <SelectValue placeholder="Selecione um template" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="default">Padrão (Análise de Vendas)</SelectItem>
                            {templates.map((template) => (
                              <SelectItem key={template.id} value={template.id}>
                                {template.name} {template.is_default && "(Padrão)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReprocess}
                        disabled={isAnalyzing}
                        className="w-full"
                      >
                        <RefreshCw className={cn("h-4 w-4 mr-2", isAnalyzing && "animate-spin")} />
                        {isAnalyzing ? "Processando..." : "Reprocessar análise"}
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Notas de Estudo */}
              <Collapsible open={showTrainingNotes} onOpenChange={setShowTrainingNotes}>
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-3 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-xl transition-colors">
                    <span className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                      <NotebookPen className="h-4 w-4" />
                      Notas de Estudo
                      {call?.training_notes && (
                        <Badge variant="secondary" className="ml-1 font-normal text-[10px] bg-amber-200/60 dark:bg-amber-900/40">
                          Com anotações
                        </Badge>
                      )}
                    </span>
                    {showTrainingNotes ? (
                      <ChevronUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-2 p-3 border border-amber-200 dark:border-amber-800/50 rounded-xl space-y-2">
                    {isEditingNotes || !call?.training_notes ? (
                      <>
                        <Textarea
                          placeholder="Ex: Falei demais na hora de construir a lógica do advisor. Preciso ser mais objetivo na qualificação..."
                          value={trainingNotesText}
                          onChange={e => setTrainingNotesText(e.target.value)}
                          className="min-h-[80px] text-sm resize-none"
                        />
                        <div className="flex items-center gap-2 justify-end">
                          {call?.training_notes && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setTrainingNotesText(call.training_notes || '');
                                setIsEditingNotes(false);
                              }}
                            >
                              Cancelar
                            </Button>
                          )}
                          <Button
                            size="sm"
                            disabled={rateCall.isPending || !trainingNotesText.trim()}
                            onClick={() => {
                              rateCall.mutate(
                                { callId: call.id, rating: call.rating ?? null, training_notes: trainingNotesText.trim() },
                                {
                                  onSuccess: () => {
                                    toast({ title: "Notas salvas!" });
                                    call.training_notes = trainingNotesText.trim();
                                    setIsEditingNotes(false);
                                  },
                                  onError: () => toast({ title: "Erro ao salvar notas", variant: "destructive" }),
                                }
                              );
                            }}
                          >
                            <Save className="h-3.5 w-3.5 mr-1.5" />
                            Salvar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-sm whitespace-pre-wrap text-muted-foreground">{call.training_notes}</p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setIsEditingNotes(true)}
                        >
                          <Pencil className="h-3.5 w-3.5 mr-1.5" />
                          Editar
                        </Button>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Transcrição */}
              {(finalTranscriptions.length > 0 || isEditingTranscription) && (
                <Collapsible open={showTranscription} onOpenChange={setShowTranscription}>
                  <CollapsibleTrigger asChild>
                    <button className="w-full flex items-center justify-between p-3 bg-slate-100 dark:bg-muted/50 hover:bg-slate-200 dark:hover:bg-muted rounded-xl transition-colors">
                      <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-foreground">
                        <MessageSquare className="h-4 w-4 text-slate-500 dark:text-muted-foreground" />
                        Transcrição da chamada
                        <Badge variant="secondary" className="ml-1 font-normal">
                          {finalTranscriptions.length} mensagens
                        </Badge>
                      </span>
                      {showTranscription ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 border border-slate-200 dark:border-border rounded-xl overflow-hidden">
                      {/* Toolbar */}
                      <div className="flex justify-end gap-1 px-3 pt-2">
                        {isEditingTranscription ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => setIsEditingTranscription(false)}
                              disabled={isSavingTranscription}
                            >
                              <X className="h-3.5 w-3.5" /> Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-7 text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700"
                              onClick={handleSaveTranscription}
                              disabled={isSavingTranscription}
                            >
                              {isSavingTranscription ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Save className="h-3.5 w-3.5" />
                              )}
                              Salvar e analisar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={handleStartEditTranscription}
                            >
                              <Pencil className="h-3.5 w-3.5" /> Editar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1.5"
                              onClick={() => {
                                const text = finalTranscriptions
                                  .map((s: any) => `${s.speaker}: ${s.text}`)
                                  .join('\n');
                                navigator.clipboard.writeText(text);
                                setCopiedTranscription(true);
                                setTimeout(() => setCopiedTranscription(false), 2000);
                                toast({ title: "Transcrição copiada!" });
                              }}
                            >
                              {copiedTranscription ? (
                                <><ClipboardCheck className="h-3.5 w-3.5 text-emerald-500" /> Copiado</>
                              ) : (
                                <><Copy className="h-3.5 w-3.5" /> Copiar</>
                              )}
                            </Button>
                          </>
                        )}
                      </div>

                      {isEditingTranscription ? (
                        /* Edit mode */
                        <div className="p-3">
                          <p className="text-xs text-muted-foreground mb-2">
                            Cole direto do Google Meet (detecta speakers e timestamps) ou use formato <code className="bg-muted px-1 rounded">Nome: texto</code>
                          </p>
                          <textarea
                            value={editTranscriptionText}
                            onChange={(e) => setEditTranscriptionText(e.target.value)}
                            className="w-full h-72 p-3 text-sm rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-background font-mono resize-none focus:outline-none focus:ring-2 focus:ring-primary/50"
                            placeholder={"Samuel: Olá, tudo bem?\nCliente: Tudo sim, obrigado.\n\nOu cole direto do Google Meet:\nSol.\n3:04\nOpa,\n3:05\n>> fala Diego. Boa tarde."}
                          />
                        </div>
                      ) : (
                        /* View mode */
                        <ScrollArea className="h-64">
                          <div className="p-4 pt-2 space-y-3">
                            {(() => {
                              const firstTs = finalTranscriptions[0]?.timestamp || 0;

                              // Pre-compute relative seconds for all segments to find active one
                              const segmentsWithTime = finalTranscriptions.map((segment: any, index: number) => {
                                const relativeSeconds = segment.timestamp && firstTs
                                  ? Math.max(0, Math.floor((segment.timestamp - firstTs) / 1000))
                                  : null;
                                return { segment, index, relativeSeconds };
                              });

                              // Find active segment: last segment whose timestamp <= playerCurrentTime
                              let activeIndex = -1;
                              if (hasRecording && playerCurrentTime > 0) {
                                for (let i = segmentsWithTime.length - 1; i >= 0; i--) {
                                  const rs = segmentsWithTime[i].relativeSeconds;
                                  if (rs != null && rs <= playerCurrentTime) {
                                    activeIndex = i;
                                    break;
                                  }
                                }
                              }

                              return segmentsWithTime.map(({ segment, index, relativeSeconds }) => {
                                const isActive = index === activeIndex;

                                const handleTimestampClick = () => {
                                  if (relativeSeconds == null || !playerAudioRef?.current) return;
                                  const audio = playerAudioRef.current;
                                  audio.currentTime = relativeSeconds;
                                  if (audio.paused) audio.play();
                                };

                                return (
                                  <div
                                    key={segment.id || index}
                                    ref={isActive ? activeSegmentRef : undefined}
                                    className={cn(
                                      "flex gap-3 group rounded-lg px-2 py-1 -mx-2 transition-colors",
                                      isActive && "bg-primary/10 ring-1 ring-primary/20"
                                    )}
                                  >
                                    <div
                                      className={cn(
                                        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
                                        segment.speakerType === "local"
                                          ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                                          : "bg-muted text-muted-foreground"
                                      )}
                                    >
                                      {segment.speakerType === "local" ? (
                                        <Mic className="h-4 w-4" />
                                      ) : (
                                        <User className="h-4 w-4" />
                                      )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-0.5">
                                        <p className={cn(
                                          "text-xs font-semibold",
                                          segment.speakerType === "local"
                                            ? "text-blue-600 dark:text-blue-400"
                                            : "text-muted-foreground"
                                        )}>
                                          {segment.speaker}
                                        </p>
                                        {relativeSeconds != null && hasRecording && (
                                          <button
                                            onClick={handleTimestampClick}
                                            className="text-[10px] font-mono text-primary/60 hover:text-primary hover:underline transition-colors"
                                            title="Ir para este momento"
                                          >
                                            {formatAudioTime(relativeSeconds)}
                                          </button>
                                        )}
                                      </div>
                                      <p className={cn("text-sm leading-relaxed", isActive ? "text-foreground font-medium" : "text-foreground/80")}>{segment.text}</p>
                                    </div>
                                  </div>
                                );
                              });
                            })()}
                          </div>
                        </ScrollArea>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {/* Sem transcrição - opção de adicionar manualmente */}
              {finalTranscriptions.length === 0 && !isEditingTranscription && (
                <div className="p-4 bg-slate-50 dark:bg-muted/30 rounded-xl border border-slate-200 dark:border-border border-dashed flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 dark:bg-muted rounded-lg">
                      <MessageSquare className="h-5 w-5 text-slate-400 dark:text-muted-foreground" />
                    </div>
                    <div>
                      <p className="font-medium text-slate-600 dark:text-muted-foreground">Sem transcrição</p>
                      <p className="text-sm text-slate-500 dark:text-muted-foreground/70">Cole a transcrição do Meet ou digite manualmente</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditTranscriptionText("");
                    setIsEditingTranscription(true);
                    setShowTranscription(true);
                  }}>
                    <Pencil className="h-4 w-4 mr-1.5" />
                    Adicionar transcrição
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Footer fixo */}
          <div className="px-6 py-4 border-t bg-slate-50 dark:bg-muted/30 flex items-center justify-between gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTrainingModal(true)}
              >
                <BookOpen className="h-4 w-4 mr-2" />
                Treinamento
              </Button>
              {hasAnalysis && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGeneratePDF}
                  disabled={isGeneratingPDF}
                >
                  {isGeneratingPDF ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4 mr-2" />
                  )}
                  Gerar PDF
                </Button>
              )}
              {call.lead_id && !hideLeadLink && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    onOpenChange(false);
                    window.location.href = `/comercial/leads/${call.lead_id}`;
                  }}
                >
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Ver Lead
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showTrainingModal && (
        <SaveToTrainingModal
          open={showTrainingModal}
          onOpenChange={setShowTrainingModal}
          defaultData={{
            title: `Call: ${call.peer_name || 'Sem nome'}`,
            source_type: 'call',
            call_history_id: call.id,
            transcription: call.transcriptions,
            ai_analysis: rawAnalysis,
            record_url: call.record_url || undefined,
            lead_id: call.lead_id || undefined,
            sales_rep_id: undefined,
          }}
        />
      )}

      {/* Modal de criação de tarefa */}
      <CreateTaskModal
        open={showCreateTaskModal}
        onOpenChange={(open) => {
          if (!open) {
            setTaskToCreate(null);
            queryClient.invalidateQueries({ queryKey: ['tasks'] });
          }
          setShowCreateTaskModal(open);
        }}
        onSuccess={() => {
          // Marcar a tarefa como criada e persistir no banco
          if (taskToCreate?.name) {
            markTaskAsCreated(taskToCreate.name);
          }
        }}
        defaultValues={{
          lead_id: call?.lead_id,
          lead_name: call?.peer_name,
          team: 'sales',
          task_type: taskToCreate?.task_type,
          // Pré-preencher com dados da tarefa sugerida
          title: taskToCreate?.name,
          description: taskToCreate?.description,
          due_datetime: taskToCreate?.due_datetime,
        }}
        zClass="z-[95]"
      />
    </>
  );
}
