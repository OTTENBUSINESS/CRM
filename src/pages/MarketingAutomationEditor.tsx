import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeft, Loader2, Plus, Trash2, Zap } from 'lucide-react';
import {
  useEmailAutomation,
  useCreateEmailAutomation,
  useUpdateEmailAutomation,
} from '@/hooks/useEmailAutomations';
import { useEmailTemplates } from '@/hooks/useEmailMarketing';
import { AppLayout } from '@/components/layout/AppLayout';

// ── Tipos de passo ────────────────────────────────────────────────────
type StepType =
  | 'wait'
  | 'sendEmail'
  | 'updateField'
  | 'addTag'
  | 'createTask'
  | 'branch'
  | 'end';

interface Step {
  // id local só pra key do React; o id do node é gerado no salvar
  key: string;
  type: StepType;
  data: Record<string, any>;
}

const TRIGGER_OPTIONS = [
  { value: 'lead_created', label: 'Lead criado' },
  { value: 'lead_stage_changed', label: 'Lead mudou de etapa' },
  { value: 'deal_created', label: 'Negócio criado' },
  { value: 'deal_won', label: 'Negócio ganho' },
  { value: 'deal_lost', label: 'Negócio perdido' },
];

const STEP_OPTIONS: { type: StepType; label: string }[] = [
  { type: 'wait', label: 'Esperar' },
  { type: 'sendEmail', label: 'Enviar email' },
  { type: 'updateField', label: 'Atualizar campo' },
  { type: 'addTag', label: 'Adicionar tag' },
  { type: 'createTask', label: 'Criar tarefa' },
  { type: 'branch', label: 'Condição (branch)' },
  { type: 'end', label: 'Fim' },
];

const STEP_LABELS: Record<StepType, string> = Object.fromEntries(
  STEP_OPTIONS.map((s) => [s.type, s.label]),
) as Record<StepType, string>;

let keyCounter = 0;
const nextKey = () => `step-${Date.now()}-${keyCounter++}`;

// Defaults por tipo de passo
function defaultData(type: StepType): Record<string, any> {
  switch (type) {
    case 'wait':
      return { duration: 1, unit: 'days' };
    case 'sendEmail':
      return { template_id: '' };
    case 'updateField':
      return { field: '', value: '' };
    case 'addTag':
      return { tag: '' };
    case 'createTask':
      return { title: '', team: '' };
    case 'branch':
      return { condition_field: '', condition_op: 'eq', condition_value: '' };
    case 'end':
      return {};
    default:
      return {};
  }
}

// ── flow_json <-> steps ───────────────────────────────────────────────

// Monta o flow_json a partir da lista de passos (linear).
function stepsToFlowJson(steps: Step[]) {
  const nodes: any[] = [{ id: 'trigger-1', type: 'trigger', data: {} }];
  steps.forEach((step, i) => {
    nodes.push({ id: `node-${i + 1}`, type: step.type, data: { ...step.data } });
  });

  const edges: any[] = [];
  for (let i = 0; i < nodes.length - 1; i++) {
    edges.push({
      id: `edge-${i + 1}`,
      source: nodes[i].id,
      target: nodes[i + 1].id,
    });
  }

  return { nodes, edges };
}

// Faz o parse do flow_json de volta pra lista de passos (ignora o trigger).
function flowJsonToSteps(flow: any): Step[] {
  const nodes: any[] = Array.isArray(flow?.nodes) ? flow.nodes : [];
  return nodes
    .filter((n) => n?.type && n.type !== 'trigger')
    .map((n) => ({
      key: nextKey(),
      type: n.type as StepType,
      data: { ...defaultData(n.type as StepType), ...(n.data || {}) },
    }));
}

export default function MarketingAutomationEditor() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const { data: automation, isLoading } = useEmailAutomation(id);
  const { data: templates } = useEmailTemplates();
  const createMut = useCreateEmailAutomation();
  const updateMut = useUpdateEmailAutomation();

  // Campos principais
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerEvent, setTriggerEvent] = useState('lead_created');
  const [isActive, setIsActive] = useState(false);
  const [steps, setSteps] = useState<Step[]>([]);

  // Carrega dados quando editando
  useEffect(() => {
    if (!automation) return;
    setName(automation.name || '');
    setDescription(automation.description || '');
    setTriggerEvent(automation.trigger_event || 'lead_created');
    setIsActive(!!automation.is_active);
    setSteps(flowJsonToSteps(automation.flow_json));
  }, [automation]);

  const saving = createMut.isPending || updateMut.isPending;

  // ── Manipulação de passos ───────────────────────────────────────────
  const addStep = (type: StepType) =>
    setSteps((prev) => [...prev, { key: nextKey(), type, data: defaultData(type) }]);

  const removeStep = (key: string) =>
    setSteps((prev) => prev.filter((s) => s.key !== key));

  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const target = index + dir;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      [copy[index], copy[target]] = [copy[target], copy[index]];
      return copy;
    });

  const updateStepData = (key: string, patch: Record<string, any>) =>
    setSteps((prev) =>
      prev.map((s) => (s.key === key ? { ...s, data: { ...s.data, ...patch } } : s)),
    );

  // ── Salvar ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Dá um nome pra automação antes de salvar.');
      return;
    }

    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      trigger_event: triggerEvent,
      is_active: isActive,
      flow_json: stepsToFlowJson(steps),
    };

    try {
      if (isEdit) {
        await updateMut.mutateAsync({ id: id!, ...payload });
        toast.success('Automação atualizada!');
      } else {
        await createMut.mutateAsync(payload);
        toast.success('Automação criada!');
      }
      navigate('/marketing/automacoes');
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar a automação.');
    }
  };

  if (isEdit && isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate('/marketing/automacoes')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">
              {isEdit ? 'Editar automação' : 'Nova automação'}
            </h1>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salvar
        </Button>
      </div>

      {/* Configuração base */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Boas-vindas ao novo lead"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que essa automação faz?"
              rows={2}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Gatilho</Label>
              <Select value={triggerEvent} onValueChange={setTriggerEvent}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha o gatilho" />
                </SelectTrigger>
                <SelectContent>
                  {TRIGGER_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-md border px-3 self-end h-10">
              <Label htmlFor="active" className="cursor-pointer">
                Ativa
              </Label>
              <Switch id="active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Passos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold">Passos do fluxo</h2>
            <p className="text-xs text-muted-foreground">
              Rodam em ordem, de cima pra baixo, depois do gatilho.
            </p>
          </div>
        </div>

        {steps.length === 0 ? (
          <div className="text-center py-10 border border-dashed rounded-lg text-sm text-muted-foreground">
            Nenhum passo ainda. Adiciona o primeiro abaixo.
          </div>
        ) : (
          <div className="space-y-2">
            {steps.map((step, index) => (
              <Card key={step.key}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                        {index + 1}
                      </span>
                      <span className="font-medium text-sm">{STEP_LABELS[step.type]}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={index === 0}
                        onClick={() => moveStep(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2"
                        disabled={index === steps.length - 1}
                        onClick={() => moveStep(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        onClick={() => removeStep(step.key)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <StepFields step={step} templates={templates} onChange={updateStepData} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Adicionar passo */}
        <div className="flex flex-wrap gap-2 pt-1">
          {STEP_OPTIONS.map((opt) => (
            <Button
              key={opt.type}
              variant="outline"
              size="sm"
              onClick={() => addStep(opt.type)}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              {opt.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
    </AppLayout>
  );
}

// ── Campos por tipo de passo ──────────────────────────────────────────
function StepFields({
  step,
  templates,
  onChange,
}: {
  step: Step;
  templates: { id: string; name: string }[] | undefined;
  onChange: (key: string, patch: Record<string, any>) => void;
}) {
  const set = (patch: Record<string, any>) => onChange(step.key, patch);

  switch (step.type) {
    case 'wait':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Duração</Label>
            <Input
              type="number"
              min={0}
              value={step.data.duration ?? 0}
              onChange={(e) => set({ duration: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Unidade</Label>
            <Select value={step.data.unit || 'days'} onValueChange={(v) => set({ unit: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutos</SelectItem>
                <SelectItem value="hours">Horas</SelectItem>
                <SelectItem value="days">Dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      );

    case 'sendEmail':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Template</Label>
          <Select
            value={step.data.template_id || ''}
            onValueChange={(v) => set({ template_id: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha um template" />
            </SelectTrigger>
            <SelectContent>
              {(templates || []).map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      );

    case 'updateField':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Campo</Label>
            <Input
              value={step.data.field || ''}
              onChange={(e) => set({ field: e.target.value })}
              placeholder="Ex: status"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Input
              value={step.data.value || ''}
              onChange={(e) => set({ value: e.target.value })}
              placeholder="Ex: qualificado"
            />
          </div>
        </div>
      );

    case 'addTag':
      return (
        <div className="space-y-1.5">
          <Label className="text-xs">Tag</Label>
          <Input
            value={step.data.tag || ''}
            onChange={(e) => set({ tag: e.target.value })}
            placeholder="Ex: newsletter"
          />
        </div>
      );

    case 'createTask':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Título</Label>
            <Input
              value={step.data.title || ''}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Ex: Ligar pro lead"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Time</Label>
            <Input
              value={step.data.team || ''}
              onChange={(e) => set({ team: e.target.value })}
              placeholder="Ex: comercial"
            />
          </div>
        </div>
      );

    case 'branch':
      return (
        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Campo</Label>
            <Input
              value={step.data.condition_field || ''}
              onChange={(e) => set({ condition_field: e.target.value })}
              placeholder="Ex: status"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Operador</Label>
            <Select
              value={step.data.condition_op || 'eq'}
              onValueChange={(v) => set({ condition_op: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="eq">é igual a</SelectItem>
                <SelectItem value="neq">é diferente de</SelectItem>
                <SelectItem value="contains">contém</SelectItem>
                <SelectItem value="gt">maior que</SelectItem>
                <SelectItem value="lt">menor que</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Valor</Label>
            <Input
              value={step.data.condition_value || ''}
              onChange={(e) => set({ condition_value: e.target.value })}
              placeholder="Ex: ganho"
            />
          </div>
        </div>
      );

    case 'end':
      return (
        <p className="text-xs text-muted-foreground">Encerra o fluxo aqui.</p>
      );

    default:
      return null;
  }
}
