import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Meeting, MeetingAIAnalysis, SuggestedTask, useCreateTasksFromSuggestions } from '@/hooks/useMeetings';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import {
  FileText,
  CheckSquare,
  Lightbulb,
  AlertTriangle,
  ArrowRight,
  Users,
  Clock,
  Loader2,
  Plus,
  Trash2,
  ThumbsUp,
  ThumbsDown,
  Minus,
  BookOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SaveToTrainingModal } from '@/components/sales/training/SaveToTrainingModal';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface MeetingSummaryModalProps {
  meeting: Meeting | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTasksCreated?: () => void;
}

const priorityConfig = {
  high: { label: 'Alta', color: 'text-red-500 bg-red-50 border-red-200' },
  medium: { label: 'Média', color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
  low: { label: 'Baixa', color: 'text-green-500 bg-green-50 border-green-200' },
};

const sentimentConfig = {
  positivo: { icon: ThumbsUp, color: 'text-green-500', label: 'Positivo' },
  neutro: { icon: Minus, color: 'text-gray-500', label: 'Neutro' },
  negativo: { icon: ThumbsDown, color: 'text-red-500', label: 'Negativo' },
  misto: { icon: Minus, color: 'text-yellow-500', label: 'Misto' },
};

export function MeetingSummaryModal({
  meeting,
  open,
  onOpenChange,
  onTasksCreated,
}: MeetingSummaryModalProps) {
  const { toast } = useToast();
  const { data: teamMembers = [] } = useTeamMembers();
  const createTasks = useCreateTasksFromSuggestions();

  const analysis = meeting?.ai_analysis as MeetingAIAnalysis | null;
  const [showTrainingModal, setShowTrainingModal] = useState(false);

  // Estado para tarefas selecionadas e editáveis
  const [selectedTasks, setSelectedTasks] = useState<Record<number, boolean>>({});
  const [editedTasks, setEditedTasks] = useState<SuggestedTask[]>([]);
  const [newTask, setNewTask] = useState<Partial<SuggestedTask> | null>(null);

  // Inicializar tarefas editáveis quando o modal abre
  useState(() => {
    if (analysis?.tarefas_sugeridas) {
      setEditedTasks(analysis.tarefas_sugeridas);
      // Selecionar todas por padrão
      const initialSelected: Record<number, boolean> = {};
      analysis.tarefas_sugeridas.forEach((_, idx) => {
        initialSelected[idx] = true;
      });
      setSelectedTasks(initialSelected);
    }
  });

  const toggleTask = (index: number) => {
    setSelectedTasks((prev) => ({
      ...prev,
      [index]: !prev[index],
    }));
  };

  const updateTask = (index: number, field: keyof SuggestedTask, value: any) => {
    setEditedTasks((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const addNewTask = () => {
    setNewTask({
      titulo: '',
      descricao: '',
      responsavel_sugerido: null,
      prioridade: 'medium',
      prazo_sugerido: '',
      tipo_sugerido: 'follow_up',
    });
  };

  const saveNewTask = () => {
    if (newTask?.titulo) {
      setEditedTasks((prev) => [...prev, newTask as SuggestedTask]);
      setSelectedTasks((prev) => ({ ...prev, [editedTasks.length]: true }));
      setNewTask(null);
    }
  };

  const removeTask = (index: number) => {
    setEditedTasks((prev) => prev.filter((_, i) => i !== index));
    setSelectedTasks((prev) => {
      const updated = { ...prev };
      delete updated[index];
      return updated;
    });
  };

  const handleCreateTasks = async () => {
    const tasksToCreate = editedTasks.filter((_, idx) => selectedTasks[idx]);

    if (tasksToCreate.length === 0) {
      toast({
        title: 'Nenhuma tarefa selecionada',
        description: 'Selecione pelo menos uma tarefa para criar',
        variant: 'destructive',
      });
      return;
    }

    try {
      await createTasks.mutateAsync({
        meetingId: meeting!.id,
        tasks: tasksToCreate,
      });

      toast({
        title: 'Tarefas criadas!',
        description: `${tasksToCreate.length} tarefa(s) criada(s) com sucesso`,
      });

      onTasksCreated?.();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: 'Erro ao criar tarefas',
        variant: 'destructive',
      });
    }
  };

  if (!meeting) return null;

  const sentiment = analysis?.sentimento_geral
    ? sentimentConfig[analysis.sentimento_geral]
    : null;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-start justify-between">
            <div>
              <DialogTitle className="text-xl">{meeting.title}</DialogTitle>
              <div className="flex items-center gap-3 mt-2 text-sm text-muted-foreground">
                {meeting.started_at && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {format(new Date(meeting.started_at), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                )}
                {analysis?.duracao_estimada && (
                  <Badge variant="outline">{analysis.duracao_estimada}</Badge>
                )}
                {sentiment && (
                  <Badge
                    variant="outline"
                    className={cn('flex items-center gap-1', sentiment.color)}
                  >
                    <sentiment.icon className="h-3 w-3" />
                    {sentiment.label}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="resumo" className="flex-1">
          <div className="px-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="resumo" className="gap-2">
                <FileText className="h-4 w-4" />
                Resumo
              </TabsTrigger>
              <TabsTrigger value="tarefas" className="gap-2">
                <CheckSquare className="h-4 w-4" />
                Tarefas ({editedTasks.length})
              </TabsTrigger>
              <TabsTrigger value="decisoes" className="gap-2">
                <Lightbulb className="h-4 w-4" />
                Decisões
              </TabsTrigger>
              <TabsTrigger value="proximos" className="gap-2">
                <ArrowRight className="h-4 w-4" />
                Próximos Passos
              </TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[50vh] px-6 py-4">
            {/* Tab Resumo */}
            <TabsContent value="resumo" className="mt-0 space-y-4">
              {/* Resumo Executivo */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Resumo Executivo
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {analysis?.resumo_executivo || meeting.summary || 'Sem resumo disponível'}
                  </p>
                </CardContent>
              </Card>

              {/* Participantes */}
              {analysis?.participantes_identificados &&
                analysis.participantes_identificados.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Participantes Identificados
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-wrap gap-2">
                        {analysis.participantes_identificados.map((p, i) => (
                          <Badge key={i} variant="secondary">
                            {p}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Pontos Importantes */}
              {analysis?.pontos_importantes && analysis.pontos_importantes.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Lightbulb className="h-4 w-4 text-yellow-500" />
                      Pontos Importantes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.pontos_importantes.map((ponto, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <span className="text-primary mt-1">•</span>
                          {ponto}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Riscos */}
              {analysis?.riscos_identificados && analysis.riscos_identificados.length > 0 && (
                <Card className="border-red-200">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-red-600">
                      <AlertTriangle className="h-4 w-4" />
                      Riscos Identificados
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {analysis.riscos_identificados.map((risco, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-red-700">
                          <span className="mt-1">⚠️</span>
                          {risco}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            {/* Tab Tarefas */}
            <TabsContent value="tarefas" className="mt-0 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  Selecione as tarefas que deseja criar
                </p>
                <Button size="sm" variant="outline" onClick={addNewTask}>
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar Tarefa
                </Button>
              </div>

              {/* Nova Tarefa (formulário) */}
              {newTask && (
                <Card className="border-primary">
                  <CardContent className="pt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="col-span-2">
                        <Label>Título</Label>
                        <Input
                          value={newTask.titulo || ''}
                          onChange={(e) =>
                            setNewTask({ ...newTask, titulo: e.target.value })
                          }
                          placeholder="Título da tarefa"
                        />
                      </div>
                      <div className="col-span-2">
                        <Label>Descrição</Label>
                        <Textarea
                          value={newTask.descricao || ''}
                          onChange={(e) =>
                            setNewTask({ ...newTask, descricao: e.target.value })
                          }
                          placeholder="Descrição da tarefa"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>Prioridade</Label>
                        <Select
                          value={newTask.prioridade || 'medium'}
                          onValueChange={(v) =>
                            setNewTask({ ...newTask, prioridade: v as any })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="high">Alta</SelectItem>
                            <SelectItem value="medium">Média</SelectItem>
                            <SelectItem value="low">Baixa</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Prazo</Label>
                        <Input
                          value={newTask.prazo_sugerido || ''}
                          onChange={(e) =>
                            setNewTask({ ...newTask, prazo_sugerido: e.target.value })
                          }
                          placeholder="Ex: Esta semana"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setNewTask(null)}
                      >
                        Cancelar
                      </Button>
                      <Button size="sm" onClick={saveNewTask}>
                        Adicionar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Lista de Tarefas */}
              {editedTasks.map((task, index) => (
                <Card
                  key={index}
                  className={cn(
                    'transition-all',
                    selectedTasks[index]
                      ? 'border-primary/50 bg-primary/5'
                      : 'opacity-60'
                  )}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start gap-3">
                      <Checkbox
                        checked={selectedTasks[index] || false}
                        onCheckedChange={() => toggleTask(index)}
                        className="mt-1"
                      />
                      <div className="flex-1 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <Input
                              value={task.titulo}
                              onChange={(e) =>
                                updateTask(index, 'titulo', e.target.value)
                              }
                              className="font-medium border-0 p-0 h-auto text-base focus-visible:ring-0"
                            />
                            <Textarea
                              value={task.descricao}
                              onChange={(e) =>
                                updateTask(index, 'descricao', e.target.value)
                              }
                              className="text-sm text-muted-foreground border-0 p-0 resize-none focus-visible:ring-0 mt-1"
                              rows={2}
                            />
                          </div>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => removeTask(index)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge
                            variant="outline"
                            className={
                              priorityConfig[task.prioridade]?.color ||
                              'text-gray-500'
                            }
                          >
                            {priorityConfig[task.prioridade]?.label || task.prioridade}
                          </Badge>
                          {task.prazo_sugerido && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {task.prazo_sugerido}
                            </span>
                          )}
                          {task.responsavel_sugerido && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {task.responsavel_sugerido}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {editedTasks.length === 0 && !newTask && (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckSquare className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma tarefa identificada na reunião</p>
                  <Button size="sm" variant="outline" className="mt-3" onClick={addNewTask}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar Manualmente
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Tab Decisões */}
            <TabsContent value="decisoes" className="mt-0 space-y-4">
              {analysis?.decisoes && analysis.decisoes.length > 0 ? (
                analysis.decisoes.map((decisao, i) => (
                  <Card key={i}>
                    <CardContent className="pt-4">
                      <p className="font-medium">{decisao.decisao}</p>
                      {decisao.contexto && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {decisao.contexto}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Lightbulb className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhuma decisão identificada na reunião</p>
                </div>
              )}
            </TabsContent>

            {/* Tab Próximos Passos */}
            <TabsContent value="proximos" className="mt-0 space-y-4">
              {analysis?.proximos_passos && analysis.proximos_passos.length > 0 ? (
                <Card>
                  <CardContent className="pt-4">
                    <ol className="space-y-3">
                      {analysis.proximos_passos.map((passo, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm flex items-center justify-center">
                            {i + 1}
                          </span>
                          <span className="text-sm pt-0.5">{passo}</span>
                        </li>
                      ))}
                    </ol>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <ArrowRight className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>Nenhum próximo passo identificado</p>
                </div>
              )}
            </TabsContent>
          </ScrollArea>
        </Tabs>

        <DialogFooter className="p-6 pt-4 border-t">
          <div className="flex items-center justify-between w-full">
            <p className="text-sm text-muted-foreground">
              {Object.values(selectedTasks).filter(Boolean).length} tarefa(s) selecionada(s)
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowTrainingModal(true)}>
                <BookOpen className="h-4 w-4 mr-2" />
                Treinamento
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Fechar
              </Button>
              <Button
                onClick={handleCreateTasks}
                disabled={createTasks.isPending || Object.values(selectedTasks).filter(Boolean).length === 0}
              >
                {createTasks.isPending && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Criar Tarefas Selecionadas
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {showTrainingModal && meeting && (
      <SaveToTrainingModal
        open={showTrainingModal}
        onOpenChange={setShowTrainingModal}
        defaultData={{
          title: `Reunião: ${meeting.lead?.name || meeting.title || 'Sem nome'}`,
          source_type: 'meeting',
          meeting_id: meeting.id,
          transcription: meeting.transcriptions,
          ai_analysis: analysis,
          record_url: undefined,
          lead_id: meeting.lead_id || undefined,
          sales_rep_id: undefined,
        }}
      />
    )}
  </>
  );
}
