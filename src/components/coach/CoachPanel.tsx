import { useState, useRef, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  Minimize2,
  Maximize2,
  X,
  ExternalLink,
  GripHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  AlertTriangle,
  AlertCircle,
  Info,
  Lightbulb,
  MessageSquare,
  HelpCircle,
  Target,
  Clock,
  History,
  User,
  Mic,
  FileText,
} from 'lucide-react';
import type { TranscriptionSegment } from '@/hooks/useCallTranscription';
import { cn } from '@/lib/utils';
import type {
  CoachPlaybook,
  CoachState,
  CoachSuggestion,
  CoachAlert,
  PlaybookPhase,
  AlertSeverity,
  SuggestionType,
} from '@/types/coach.types';

interface CoachPanelProps {
  playbook: CoachPlaybook | null;
  state: CoachState;
  leadName?: string;
  briefing?: string;
  transcriptions?: TranscriptionSegment[];
  isTranscribing?: boolean;
  onNextPhase: () => void;
  onPreviousPhase: () => void;
  onToggleChecklistItem: (itemId: string) => void;
  onDismissSuggestion: () => void;
  onDismissAlert: (alertId: string) => void;
  onClose: () => void;
  onPopOut?: () => void;
}

const alertSeverityStyles: Record<AlertSeverity, { bg: string; border: string; icon: React.ReactNode }> = {
  info: {
    bg: 'bg-blue-500/15',
    border: 'border-blue-500/40',
    icon: <Info className="h-5 w-5 text-blue-500" />,
  },
  warning: {
    bg: 'bg-yellow-500/20 animate-pulse',
    border: 'border-yellow-500/60 border-2',
    icon: <AlertTriangle className="h-5 w-5 text-yellow-500 animate-bounce" />,
  },
  error: {
    bg: 'bg-red-500/20 animate-pulse',
    border: 'border-red-500/60 border-2',
    icon: <AlertCircle className="h-5 w-5 text-red-500 animate-bounce" />,
  },
};

const suggestionTypeStyles: Record<SuggestionType, { bg: string; icon: React.ReactNode; label: string; badgeBg: string }> = {
  objection_handler: {
    bg: 'bg-red-500/10 border-red-500/30',
    icon: <MessageSquare className="h-4 w-4 text-red-500" />,
    label: '🛡️ Objeção',
    badgeBg: 'bg-red-100 text-red-700 border-red-300',
  },
  question: {
    bg: 'bg-purple-500/10 border-purple-500/30',
    icon: <HelpCircle className="h-4 w-4 text-purple-500" />,
    label: '❓ Pergunta',
    badgeBg: 'bg-purple-100 text-purple-700 border-purple-300',
  },
  closing: {
    bg: 'bg-green-500/10 border-green-500/30',
    icon: <Target className="h-4 w-4 text-green-500" />,
    label: '🎯 Fechamento',
    badgeBg: 'bg-green-100 text-green-700 border-green-300',
  },
  info: {
    bg: 'bg-blue-500/10 border-blue-500/30',
    icon: <Info className="h-4 w-4 text-blue-500" />,
    label: 'ℹ️ Info',
    badgeBg: 'bg-blue-100 text-blue-700 border-blue-300',
  },
  tip: {
    bg: 'bg-amber-500/10 border-amber-500/30',
    icon: <Lightbulb className="h-4 w-4 text-amber-500" />,
    label: '💡 Dica',
    badgeBg: 'bg-amber-100 text-amber-700 border-amber-300',
  },
};

export function CoachPanel({
  playbook,
  state,
  leadName,
  briefing,
  transcriptions = [],
  isTranscribing = false,
  onNextPhase,
  onPreviousPhase,
  onToggleChecklistItem,
  onDismissSuggestion,
  onDismissAlert,
  onClose,
  onPopOut,
}: CoachPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState({ x: Math.max(20, (window.innerWidth - 400) / 2), y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showTranscription, setShowTranscription] = useState(true);

  // Debug log removed to prevent render spam

  // Get last 5 final transcriptions + current partial for real-time feel
  const finalTranscriptions = transcriptions.filter(t => t.is_final).slice(-4);
  const currentPartial = transcriptions.filter(t => !t.is_final).slice(-1)[0];
  const recentTranscriptions = currentPartial
    ? [...finalTranscriptions, currentPartial]
    : finalTranscriptions;
  const dragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const currentPhase = playbook?.phases[state.currentPhaseIndex];
  const totalPhases = playbook?.phases.length || 0;
  const activeAlerts = state.activeAlerts.filter((a) => !a.dismissed);

  // Calculate checklist progress (handles both string and object formats)
  const checklistProgress = currentPhase
    ? {
        completed: currentPhase.checklist.filter((item, index) => {
          const itemId = typeof item === 'string' ? `item-${index}` : item.id;
          return state.checklistState[itemId] === 'completed';
        }).length,
        total: currentPhase.checklist.length,
      }
    : { completed: 0, total: 0 };

  const progressPercent = checklistProgress.total > 0
    ? (checklistProgress.completed / checklistProgress.total) * 100
    : 0;

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    setIsDragging(true);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startPosX: position.x,
      startPosY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !dragRef.current) return;
      const deltaX = e.clientX - dragRef.current.startX;
      const deltaY = e.clientY - dragRef.current.startY;
      setPosition({
        x: dragRef.current.startPosX + deltaX,
        y: dragRef.current.startPosY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragRef.current = null;
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (!state.isActive) {
    console.log('[CoachPanel] Not rendering - isActive:', state.isActive);
    return null;
  }

  // Minimized view
  if (isMinimized) {
    return (
      <div
        ref={panelRef}
        className="fixed z-[9999] cursor-move"
        style={{ left: position.x, top: position.y }}
        onMouseDown={handleMouseDown}
      >
        <Card className="p-2 shadow-lg bg-white dark:bg-slate-900 border-2">
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <Badge variant="outline" className="gap-1">
              <Lightbulb className="h-3 w-3" />
              Coach
            </Badge>
            {activeAlerts.length > 0 && (
              <Badge variant="destructive" className="h-5 w-5 p-0 flex items-center justify-center">
                {activeAlerts.length}
              </Badge>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(false)}>
              <Maximize2 className="h-3 w-3" />
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      className="fixed z-[9999]"
      style={{ left: position.x, top: position.y, width: 380 }}
    >
      <Card className="shadow-2xl bg-white dark:bg-slate-900 border-2 overflow-hidden">
        {/* Header - Draggable */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-slate-100 dark:bg-slate-800 border-b cursor-move"
          onMouseDown={handleMouseDown}
        >
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <Lightbulb className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Sales Coach</span>
            {leadName && (
              <Badge variant="secondary" className="text-xs gap-1">
                <User className="h-3 w-3" />
                {leadName}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => setShowHistory(!showHistory)}
              title="Histórico"
            >
              <History className="h-3 w-3" />
            </Button>
            {onPopOut && (
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onPopOut} title="Abrir em nova janela">
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(true)}>
              <Minimize2 className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 hover:text-destructive" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Alerts - Impactful visual */}
        {activeAlerts.length > 0 && (
          <div className="px-3 py-2 space-y-2">
            {activeAlerts.slice(0, 3).map((alert) => (
              <div
                key={alert.id}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-lg border shadow-lg transition-all',
                  alertSeverityStyles[alert.severity].bg,
                  alertSeverityStyles[alert.severity].border,
                  alert.severity === 'error' && 'ring-2 ring-red-500/30 shadow-red-500/20',
                  alert.severity === 'warning' && 'ring-2 ring-yellow-500/30 shadow-yellow-500/20',
                )}
              >
                <div className="shrink-0 mt-0.5">
                  {alertSeverityStyles[alert.severity].icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={cn(
                    "text-sm font-semibold",
                    alert.severity === 'error' && 'text-red-700 dark:text-red-300',
                    alert.severity === 'warning' && 'text-yellow-700 dark:text-yellow-300',
                  )}>
                    ⚠️ ALERTA
                  </p>
                  <p className="text-sm mt-0.5">{alert.message}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onDismissAlert(alert.id)}
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Current Suggestion */}
        {state.currentSuggestion && (
          <div className="px-3 py-2 border-b">
            <div
              className={cn(
                'p-3 rounded-md border',
                suggestionTypeStyles[state.currentSuggestion.type].bg
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                {suggestionTypeStyles[state.currentSuggestion.type].icon}
                <Badge variant="secondary" className="text-xs">
                  {suggestionTypeStyles[state.currentSuggestion.type].label}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 ml-auto"
                  onClick={onDismissSuggestion}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-sm">{state.currentSuggestion.text}</p>
            </div>
          </div>
        )}

        {/* Recent suggestions - always visible (last 3) */}
        {!showHistory && state.suggestionHistory.length > 0 && (
          <div className="px-3 space-y-1.5 max-h-[140px] overflow-y-auto">
            {state.suggestionHistory.slice(0, 3).map((s) => {
              const style = suggestionTypeStyles[s.type] || suggestionTypeStyles.tip;
              return (
                <div key={s.id} className={cn('p-1.5 rounded border text-xs', style.bg)}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={cn('text-[9px] font-bold', style.badgeBg, 'px-1.5 py-0 rounded-full border')}>{style.label}</span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(s.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-[10px] leading-snug line-clamp-2">{s.text}</p>
                </div>
              );
            })}
          </div>
        )}

        {showHistory ? (
          // Full History View
          <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-medium">Histórico de Sugestões</h4>
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(false)}>
                Voltar
              </Button>
            </div>
            <ScrollArea className="h-[250px]">
              {state.suggestionHistory.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhuma sugestão ainda
                </p>
              ) : (
                <div className="space-y-2">
                  {state.suggestionHistory.map((suggestion) => {
                    const style = suggestionTypeStyles[suggestion.type] || suggestionTypeStyles.tip;
                    return (
                      <div
                        key={suggestion.id}
                        className={cn('p-2.5 rounded-lg border text-sm', style.bg)}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border', style.badgeBg)}>
                            {style.label}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(suggestion.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed">{suggestion.text}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </div>
        ) : (
          // Main Content
          <div className="p-3 space-y-3">
            {/* Briefing (if available) */}
            {briefing && (
              <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-md">
                <p className="text-xs text-muted-foreground mb-1">Briefing</p>
                <p className="text-sm line-clamp-3">{briefing}</p>
              </div>
            )}

            {playbook && currentPhase && (
              <>
                {/* Phase Navigation */}
                <div className="flex items-center justify-between">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onPreviousPhase}
                    disabled={state.currentPhaseIndex === 0}
                    className="h-7 px-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">
                      Fase {state.currentPhaseIndex + 1} de {totalPhases}
                    </p>
                    <p className="font-medium text-sm">{currentPhase.name}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onNextPhase}
                    disabled={state.currentPhaseIndex === totalPhases - 1}
                    className="h-7 px-2"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Progresso da fase</span>
                    <span>
                      {checklistProgress.completed}/{checklistProgress.total}
                    </span>
                  </div>
                  <Progress value={progressPercent} className="h-1.5" />
                </div>

                <Separator />

                {/* Checklist */}
                <ScrollArea className="h-[180px]">
                  <div className="space-y-1.5">
                    {currentPhase.checklist.map((item, index) => {
                      // Handle both string array and object array formats
                      const isString = typeof item === 'string';
                      const itemId = isString ? `item-${index}` : item.id;
                      const itemText = isString ? item : (item.text || `Item ${index + 1}`);
                      const itemRequired = isString ? false : item.required;
                      const isCompleted = state.checklistState[itemId] === 'completed';

                      return (
                        <button
                          key={itemId}
                          onClick={(e) => {
                            e.stopPropagation();
                            console.log('[CoachPanel] Checklist item clicked:', itemId, itemText);
                            onToggleChecklistItem(itemId);
                          }}
                          className={cn(
                            'w-full flex items-start gap-2 p-2 rounded-md text-left transition-colors',
                            isCompleted
                              ? 'bg-green-100 dark:bg-green-900/50 hover:bg-green-200 dark:hover:bg-green-900/70'
                              : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                          ) : (
                            <Circle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                          )}
                          <span
                            className={cn(
                              'text-sm flex-1',
                              isCompleted && 'line-through text-muted-foreground'
                            )}
                          >
                            {itemText}
                            {itemRequired && !isCompleted && (
                              <span className="text-red-500 ml-1">*</span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>

                {/* Tips */}
                {currentPhase.tips && currentPhase.tips.length > 0 && (
                  <div className="pt-2 border-t">
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <Lightbulb className="h-3 w-3" />
                      Dicas
                    </p>
                    <div className="space-y-1">
                      {currentPhase.tips.slice(0, 2).map((tip, i) => (
                        <p key={i} className="text-xs text-muted-foreground">
                          • {tip}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {!playbook && (
              <div className="text-center py-4">
                <p className="text-sm text-muted-foreground">
                  Modo transcrição ativo
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhum playbook selecionado
                </p>
              </div>
            )}
          </div>
        )}

        {/* Transcription Preview */}
        <div className="border-t">
          <button
            onClick={() => setShowTranscription(!showTranscription)}
            className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          >
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Transcrição</span>
              {isTranscribing && (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                  Ativa
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {showTranscription ? '▲' : '▼'}
            </span>
          </button>

          {showTranscription && (
            <div className="px-3 py-2 max-h-[120px] overflow-y-auto bg-white dark:bg-slate-900">
              {recentTranscriptions.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">
                  {isTranscribing ? 'Aguardando fala...' : 'Sem transcrições'}
                </p>
              ) : (
                <div className="space-y-1.5">
                  {recentTranscriptions.map((t, i) => (
                    <div key={`${t.id}-${i}-${t.speakerType}`} className={cn(
                      "flex gap-2 text-xs",
                      !t.is_final && "opacity-70"
                    )}>
                      <span
                        className={cn(
                          'flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center',
                          t.speakerType === 'local'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-blue-500/10 text-blue-500'
                        )}
                      >
                        {t.speakerType === 'local' ? (
                          <Mic className="h-3 w-3" />
                        ) : (
                          <User className="h-3 w-3" />
                        )}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span
                          className={cn(
                            'font-medium',
                            t.speakerType === 'local' ? 'text-primary' : 'text-blue-500'
                          )}
                        >
                          {t.speaker}:
                        </span>{' '}
                        <span className="text-foreground">
                          {t.text}
                          {!t.is_final && (
                            <span className="inline-block w-1.5 h-3 ml-0.5 bg-current animate-pulse" />
                          )}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Stats */}
        <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {state.startedAt
              ? new Date(state.startedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
              : '--:--'}
          </span>
          <span>{state.suggestionsShown} sugestões</span>
          <span>{state.alertsTriggered} alertas</span>
        </div>
      </Card>
    </div>
  );
}
