import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  useSalesAutomationRules,
  useCreateAutomationRule,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  useToggleAutomationRule,
  TRIGGER_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  TEAM_LABELS,
  type AutomationRule,
  type CreateAutomationRuleInput,
} from '@/hooks/useSalesAutomationRules';
import {
  Zap,
  Plus,
  Pencil,
  Trash2,
  Play,
  Pause,
  ArrowRight,
  Settings2,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Target,
  Bell,
  Webhook,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TRIGGER_ICONS: Record<string, React.ElementType> = {
  task_created: Plus,
  task_completed: CheckCircle2,
  deal_created: Target,
  deal_stage_changed: ArrowRight,
  lead_score_changed: Zap,
  days_in_stage: Clock,
};

const ACTION_ICONS: Record<string, React.ElementType> = {
  move_deal_stage: ArrowRight,
  create_task: Plus,
  send_notification: Bell,
  update_lead_field: Settings2,
  send_webhook: Webhook,
};

export function AutomationRulesTab() {
  const { toast } = useToast();
  const { data: rules, isLoading } = useSalesAutomationRules();
  const toggleRule = useToggleAutomationRule();
  const deleteRule = useDeleteAutomationRule();
  const createRule = useCreateAutomationRule();
  const updateRule = useUpdateAutomationRule();

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const handleToggle = async (rule: AutomationRule) => {
    try {
      await toggleRule.mutateAsync({ id: rule.id, is_active: !rule.is_active });
      toast({
        title: rule.is_active ? 'Regra desativada' : 'Regra ativada',
        description: `"${rule.name}" foi ${rule.is_active ? 'desativada' : 'ativada'}`,
      });
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível alterar a regra', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteRule.mutateAsync(deleteConfirmId);
      toast({ title: 'Regra excluída', description: 'A regra foi removida com sucesso' });
      setDeleteConfirmId(null);
    } catch {
      toast({ title: 'Erro', description: 'Não foi possível excluir a regra', variant: 'destructive' });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            Regras de Automação
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure automações para o funil de vendas
          </p>
        </div>
        <Button onClick={() => setIsCreateModalOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {rules?.length === 0 && (
          <Card className="p-8 text-center">
            <Zap className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">Nenhuma regra de automação configurada</p>
            <Button variant="outline" className="mt-4" onClick={() => setIsCreateModalOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar primeira regra
            </Button>
          </Card>
        )}

        {rules?.map((rule) => {
          const TriggerIcon = TRIGGER_ICONS[rule.trigger_type] || Zap;
          const ActionIcon = ACTION_ICONS[rule.action_type] || Settings2;

          return (
            <Card
              key={rule.id}
              className={cn(
                'transition-all',
                !rule.is_active && 'opacity-60 bg-muted/30'
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium truncate">{rule.name}</h4>
                      <Badge variant={rule.is_active ? 'default' : 'secondary'} className="text-xs">
                        {rule.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {TEAM_LABELS[rule.team]}
                      </Badge>
                    </div>
                    {rule.description && (
                      <p className="text-sm text-muted-foreground mb-3">{rule.description}</p>
                    )}

                    {/* Trigger -> Action */}
                    <div className="flex items-center gap-2 text-sm">
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-100 text-blue-700 rounded">
                        <TriggerIcon className="h-3.5 w-3.5" />
                        <span>{TRIGGER_TYPE_LABELS[rule.trigger_type]}</span>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <div className="flex items-center gap-1.5 px-2 py-1 bg-green-100 text-green-700 rounded">
                        <ActionIcon className="h-3.5 w-3.5" />
                        <span>{ACTION_TYPE_LABELS[rule.action_type]}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={() => handleToggle(rule)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setEditingRule(rule)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirmId(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      <RuleFormModal
        open={isCreateModalOpen || !!editingRule}
        onOpenChange={(open) => {
          if (!open) {
            setIsCreateModalOpen(false);
            setEditingRule(null);
          }
        }}
        rule={editingRule}
        onSave={async (data) => {
          try {
            if (editingRule) {
              await updateRule.mutateAsync({ id: editingRule.id, ...data });
              toast({ title: 'Regra atualizada', description: 'As alterações foram salvas' });
            } else {
              await createRule.mutateAsync(data);
              toast({ title: 'Regra criada', description: 'A nova regra foi adicionada' });
            }
            setIsCreateModalOpen(false);
            setEditingRule(null);
          } catch {
            toast({ title: 'Erro', description: 'Não foi possível salvar a regra', variant: 'destructive' });
          }
        }}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A regra será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Form Modal Component
function RuleFormModal({
  open,
  onOpenChange,
  rule,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: AutomationRule | null;
  onSave: (data: CreateAutomationRuleInput) => Promise<void>;
}) {
  const [name, setName] = useState(rule?.name || '');
  const [description, setDescription] = useState(rule?.description || '');
  const [triggerType, setTriggerType] = useState<AutomationRule['trigger_type']>(rule?.trigger_type || 'task_created');
  const [actionType, setActionType] = useState<AutomationRule['action_type']>(rule?.action_type || 'move_deal_stage');
  const [team, setTeam] = useState<AutomationRule['team']>(rule?.team || 'sales');
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      await onSave({
        name,
        description: description || undefined,
        trigger_type: triggerType,
        action_type: actionType,
        team,
        is_active: isActive,
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar Regra' : 'Nova Regra de Automação'}</DialogTitle>
          <DialogDescription>
            Configure quando e o que deve acontecer automaticamente
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Nome da Regra *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Mover para Call Agendada"
            />
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva o que esta regra faz..."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quando (Trigger)</Label>
              <Select value={triggerType} onValueChange={(v) => setTriggerType(v as AutomationRule['trigger_type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TRIGGER_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Então (Ação)</Label>
              <Select value={actionType} onValueChange={(v) => setActionType(v as AutomationRule['action_type'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACTION_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={team} onValueChange={(v) => setTeam(v as AutomationRule['team'])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(TEAM_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <div className="flex items-center gap-2 h-10">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <span className="text-sm">{isActive ? 'Ativa' : 'Inativa'}</span>
              </div>
            </div>
          </div>

          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Configuração avançada</p>
                <p className="text-amber-700">
                  As condições detalhadas do trigger e configurações da ação podem ser ajustadas diretamente no banco de dados.
                </p>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || isSaving}>
            {isSaving ? 'Salvando...' : rule ? 'Salvar' : 'Criar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
