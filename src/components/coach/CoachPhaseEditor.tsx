import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  Info,
  CheckSquare,
  Lightbulb,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  PlaybookPhase,
  PlaybookChecklistItem,
  PlaybookAlert,
  AlertSeverity,
} from '@/types/coach.types';

interface CoachPhaseEditorProps {
  phases: PlaybookPhase[];
  onChange: (phases: PlaybookPhase[]) => void;
}

const severityIcons: Record<AlertSeverity, React.ReactNode> = {
  warning: <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  error: <AlertCircle className="h-4 w-4 text-red-500" />,
  info: <Info className="h-4 w-4 text-blue-500" />,
};

const generateId = () => Math.random().toString(36).substring(2, 9);

export function CoachPhaseEditor({ phases, onChange }: CoachPhaseEditorProps) {
  const [expandedPhases, setExpandedPhases] = useState<string[]>([]);

  const addPhase = () => {
    const newPhase: PlaybookPhase = {
      id: generateId(),
      name: `Fase ${phases.length + 1}`,
      description: '',
      order: phases.length,
      checklist: [],
      alerts: [],
      tips: [],
    };
    onChange([...phases, newPhase]);
    setExpandedPhases([...expandedPhases, newPhase.id]);
  };

  const updatePhase = (index: number, updates: Partial<PlaybookPhase>) => {
    const newPhases = [...phases];
    newPhases[index] = { ...newPhases[index], ...updates };
    onChange(newPhases);
  };

  const removePhase = (index: number) => {
    const newPhases = phases.filter((_, i) => i !== index).map((p, i) => ({ ...p, order: i }));
    onChange(newPhases);
  };

  const movePhase = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= phases.length) return;

    const newPhases = [...phases];
    [newPhases[index], newPhases[newIndex]] = [newPhases[newIndex], newPhases[index]];
    newPhases.forEach((p, i) => (p.order = i));
    onChange(newPhases);
  };

  // Checklist handlers
  const addChecklistItem = (phaseIndex: number) => {
    const newItem: PlaybookChecklistItem = {
      id: generateId(),
      text: '',
      required: false,
    };
    updatePhase(phaseIndex, {
      checklist: [...phases[phaseIndex].checklist, newItem],
    });
  };

  const updateChecklistItem = (
    phaseIndex: number,
    itemIndex: number,
    updates: Partial<PlaybookChecklistItem>
  ) => {
    const checklist = [...phases[phaseIndex].checklist];
    checklist[itemIndex] = { ...checklist[itemIndex], ...updates };
    updatePhase(phaseIndex, { checklist });
  };

  const removeChecklistItem = (phaseIndex: number, itemIndex: number) => {
    const checklist = phases[phaseIndex].checklist.filter((_, i) => i !== itemIndex);
    updatePhase(phaseIndex, { checklist });
  };

  // Alert handlers
  const addAlert = (phaseIndex: number) => {
    const newAlert: PlaybookAlert = {
      id: generateId(),
      trigger: '',
      message: '',
      severity: 'warning',
    };
    updatePhase(phaseIndex, {
      alerts: [...(phases[phaseIndex].alerts || []), newAlert],
    });
  };

  const updateAlert = (phaseIndex: number, alertIndex: number, updates: Partial<PlaybookAlert>) => {
    const alerts = [...(phases[phaseIndex].alerts || [])];
    alerts[alertIndex] = { ...alerts[alertIndex], ...updates };
    updatePhase(phaseIndex, { alerts });
  };

  const removeAlert = (phaseIndex: number, alertIndex: number) => {
    const alerts = (phases[phaseIndex].alerts || []).filter((_, i) => i !== alertIndex);
    updatePhase(phaseIndex, { alerts });
  };

  // Tips handlers
  const addTip = (phaseIndex: number) => {
    updatePhase(phaseIndex, {
      tips: [...(phases[phaseIndex].tips || []), ''],
    });
  };

  const updateTip = (phaseIndex: number, tipIndex: number, text: string) => {
    const tips = [...(phases[phaseIndex].tips || [])];
    tips[tipIndex] = text;
    updatePhase(phaseIndex, { tips });
  };

  const removeTip = (phaseIndex: number, tipIndex: number) => {
    const tips = (phases[phaseIndex].tips || []).filter((_, i) => i !== tipIndex);
    updatePhase(phaseIndex, { tips });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Fases do Playbook</h3>
        <Button variant="outline" size="sm" onClick={addPhase} className="gap-2">
          <Plus className="h-4 w-4" />
          Adicionar Fase
        </Button>
      </div>

      {phases.length === 0 ? (
        <div className="text-center py-8 border border-dashed rounded-lg text-muted-foreground">
          Nenhuma fase cadastrada. Clique em "Adicionar Fase" para começar.
        </div>
      ) : (
        <Accordion
          type="multiple"
          value={expandedPhases}
          onValueChange={setExpandedPhases}
          className="space-y-2"
        >
          {phases.map((phase, phaseIndex) => (
            <AccordionItem
              key={phase.id}
              value={phase.id}
              className="border rounded-lg overflow-hidden"
            >
              <AccordionTrigger className="px-4 py-3 hover:no-underline">
                <div className="flex items-center gap-3 flex-1">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <Badge variant="outline" className="shrink-0">
                    {phaseIndex + 1}
                  </Badge>
                  <span className="font-medium">{phase.name || 'Sem nome'}</span>
                  <div className="flex items-center gap-2 ml-auto mr-4 text-sm text-muted-foreground">
                    <span>{phase.checklist.length} itens</span>
                    {(phase.alerts?.length || 0) > 0 && (
                      <span>{phase.alerts?.length} alertas</span>
                    )}
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4 pt-2">
                <div className="space-y-4">
                  {/* Phase basic info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Nome da Fase</label>
                      <Input
                        value={phase.name}
                        onChange={(e) => updatePhase(phaseIndex, { name: e.target.value })}
                        placeholder="Ex: Qualificação BANT"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Duração Sugerida (segundos)</label>
                      <Input
                        type="number"
                        value={phase.suggested_duration_seconds || ''}
                        onChange={(e) =>
                          updatePhase(phaseIndex, {
                            suggested_duration_seconds: e.target.value
                              ? parseInt(e.target.value)
                              : undefined,
                          })
                        }
                        placeholder="Ex: 120"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Descrição</label>
                    <Textarea
                      value={phase.description || ''}
                      onChange={(e) => updatePhase(phaseIndex, { description: e.target.value })}
                      placeholder="Descreva o objetivo desta fase..."
                      rows={2}
                    />
                  </div>

                  {/* Checklist */}
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <CheckSquare className="h-4 w-4" />
                          Checklist
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addChecklistItem(phaseIndex)}
                          className="h-7"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="py-2">
                      {phase.checklist.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nenhum item no checklist
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {phase.checklist.map((item, itemIndex) => (
                            <div key={item.id} className="flex items-center gap-2">
                              <Input
                                value={item.text}
                                onChange={(e) =>
                                  updateChecklistItem(phaseIndex, itemIndex, { text: e.target.value })
                                }
                                placeholder="Descreva o item do checklist..."
                                className="flex-1"
                              />
                              <Button
                                variant={item.required ? 'default' : 'ghost'}
                                size="sm"
                                onClick={() =>
                                  updateChecklistItem(phaseIndex, itemIndex, {
                                    required: !item.required,
                                  })
                                }
                                className={cn('h-9 px-2', item.required && 'bg-primary')}
                              >
                                {item.required ? 'Obrigatório' : 'Opcional'}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeChecklistItem(phaseIndex, itemIndex)}
                                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Alerts */}
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4" />
                          Alertas (Violações)
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addAlert(phaseIndex)}
                          className="h-7"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="py-2">
                      {(phase.alerts?.length || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nenhum alerta configurado
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {phase.alerts?.map((alert, alertIndex) => (
                            <div key={alert.id} className="flex items-start gap-2 p-2 border rounded">
                              <Select
                                value={alert.severity}
                                onValueChange={(value: AlertSeverity) =>
                                  updateAlert(phaseIndex, alertIndex, { severity: value })
                                }
                              >
                                <SelectTrigger className="w-[110px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="info">
                                    <div className="flex items-center gap-2">
                                      {severityIcons.info} Info
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="warning">
                                    <div className="flex items-center gap-2">
                                      {severityIcons.warning} Atenção
                                    </div>
                                  </SelectItem>
                                  <SelectItem value="error">
                                    <div className="flex items-center gap-2">
                                      {severityIcons.error} Alerta
                                    </div>
                                  </SelectItem>
                                </SelectContent>
                              </Select>
                              <div className="flex-1 space-y-2">
                                <Input
                                  value={alert.trigger}
                                  onChange={(e) =>
                                    updateAlert(phaseIndex, alertIndex, { trigger: e.target.value })
                                  }
                                  placeholder="Gatilho (palavra-chave ou padrão)..."
                                  className="text-sm"
                                />
                                <Input
                                  value={alert.message}
                                  onChange={(e) =>
                                    updateAlert(phaseIndex, alertIndex, { message: e.target.value })
                                  }
                                  placeholder="Mensagem de alerta..."
                                  className="text-sm"
                                />
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeAlert(phaseIndex, alertIndex)}
                                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Tips */}
                  <Card>
                    <CardHeader className="py-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Lightbulb className="h-4 w-4" />
                          Dicas
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => addTip(phaseIndex)}
                          className="h-7"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Adicionar
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent className="py-2">
                      {(phase.tips?.length || 0) === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-2">
                          Nenhuma dica cadastrada
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {phase.tips?.map((tip, tipIndex) => (
                            <div key={tipIndex} className="flex items-center gap-2">
                              <Input
                                value={tip}
                                onChange={(e) => updateTip(phaseIndex, tipIndex, e.target.value)}
                                placeholder="Dica para o vendedor..."
                                className="flex-1"
                              />
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => removeTip(phaseIndex, tipIndex)}
                                className="h-9 w-9 text-muted-foreground hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* Phase actions */}
                  <div className="flex items-center justify-between pt-2 border-t">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => movePhase(phaseIndex, 'up')}
                        disabled={phaseIndex === 0}
                      >
                        <ChevronUp className="h-4 w-4 mr-1" />
                        Subir
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => movePhase(phaseIndex, 'down')}
                        disabled={phaseIndex === phases.length - 1}
                      >
                        <ChevronDown className="h-4 w-4 mr-1" />
                        Descer
                      </Button>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removePhase(phaseIndex)}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Remover Fase
                    </Button>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}
