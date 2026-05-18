import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  useCreateCoachPlaybook,
  useUpdateCoachPlaybook,
} from '@/hooks/useCoachPlaybooks';
import { CoachPhaseEditor } from './CoachPhaseEditor';
import {
  playbookTypeLabels,
  type CoachPlaybook,
  type PlaybookType,
  type PlaybookPhase,
} from '@/types/coach.types';

interface CoachPlaybookFormProps {
  playbook?: CoachPlaybook | null;
  onBack: () => void;
}

export function CoachPlaybookForm({ playbook, onBack }: CoachPlaybookFormProps) {
  const { toast } = useToast();
  const isEditing = !!playbook;

  const [name, setName] = useState('');
  const [type, setType] = useState<PlaybookType>('sales');
  const [description, setDescription] = useState('');
  const [context, setContext] = useState('');
  const [phases, setPhases] = useState<PlaybookPhase[]>([]);
  const [isDefault, setIsDefault] = useState(false);

  const createPlaybook = useCreateCoachPlaybook();
  const updatePlaybook = useUpdateCoachPlaybook();

  const isLoading = createPlaybook.isPending || updatePlaybook.isPending;

  useEffect(() => {
    if (playbook) {
      setName(playbook.name);
      setType(playbook.type);
      setDescription(playbook.description || '');
      setContext(playbook.context || '');
      setPhases(playbook.phases || []);
      setIsDefault(playbook.is_default);
    }
  }, [playbook]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast({
        title: 'Nome obrigatório',
        description: 'Por favor, informe um nome para o playbook.',
        variant: 'destructive',
      });
      return;
    }

    if (phases.length === 0) {
      toast({
        title: 'Fases obrigatórias',
        description: 'Adicione pelo menos uma fase ao playbook.',
        variant: 'destructive',
      });
      return;
    }

    try {
      if (isEditing && playbook) {
        await updatePlaybook.mutateAsync({
          id: playbook.id,
          name,
          type,
          description: description || undefined,
          context: context || undefined,
          phases,
          is_default: isDefault,
        });
        toast({
          title: 'Playbook atualizado',
          description: `"${name}" foi atualizado com sucesso.`,
        });
      } else {
        await createPlaybook.mutateAsync({
          name,
          type,
          description: description || undefined,
          context: context || undefined,
          phases,
          is_default: isDefault,
        });
        toast({
          title: 'Playbook criado',
          description: `"${name}" foi criado com sucesso.`,
        });
      }
      onBack();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar o playbook.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>
        <Button onClick={handleSubmit} disabled={isLoading} className="gap-2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {isEditing ? 'Salvar Alterações' : 'Criar Playbook'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{isEditing ? 'Editar Playbook' : 'Novo Playbook'}</CardTitle>
          <CardDescription>
            Configure as informações básicas e as fases do playbook
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome do Playbook *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Primeira Call Comercial"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Tipo</Label>
              <Select value={type} onValueChange={(v: PlaybookType) => setType(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(playbookTypeLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva quando este playbook deve ser usado..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="context">Contexto para IA</Label>
            <Textarea
              id="context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Informações adicionais para a IA usar ao gerar sugestões (ex: produto vendido, público-alvo, tom de voz)..."
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Este contexto será usado pela IA para personalizar as sugestões durante a chamada.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Playbook Padrão</Label>
              <p className="text-sm text-muted-foreground">
                Será selecionado automaticamente para novas chamadas do tipo "{playbookTypeLabels[type]}"
              </p>
            </div>
            <Switch checked={isDefault} onCheckedChange={setIsDefault} />
          </div>

          <Separator />

          {/* Phase editor */}
          <CoachPhaseEditor phases={phases} onChange={setPhases} />
        </CardContent>
      </Card>
    </div>
  );
}
