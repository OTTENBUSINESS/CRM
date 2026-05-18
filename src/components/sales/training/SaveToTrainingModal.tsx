import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useCreateTrainingCase } from '@/hooks/useSalesTraining';
import { useToast } from '@/hooks/use-toast';

interface SaveToTrainingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultData?: {
    title?: string;
    source_type?: string;
    transcript?: string;
    category?: string;
  };
}

export function SaveToTrainingModal({
  open,
  onOpenChange,
  defaultData = {},
}: SaveToTrainingModalProps) {
  const { toast } = useToast();
  const createCase = useCreateTrainingCase();

  const [title, setTitle] = useState(defaultData.title ?? '');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(defaultData.category ?? 'sdr_call');
  const [difficulty, setDifficulty] = useState('medium');
  const [outcome, setOutcome] = useState('won');
  const [transcript, setTranscript] = useState(defaultData.transcript ?? '');

  async function handleSubmit() {
    if (!title.trim()) {
      toast({ title: 'Informe um título', variant: 'destructive' });
      return;
    }

    try {
      await createCase.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        category,
        difficulty,
        outcome,
        transcript: transcript.trim() || undefined,
        is_public: true,
      });

      toast({ title: 'Caso salvo com sucesso!' });
      onOpenChange(false);
      setTitle('');
      setDescription('');
      setTranscript('');
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar caso',
        description: err.message,
        variant: 'destructive',
      });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo Caso de Treinamento</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="tc-title">Título *</Label>
            <Input
              id="tc-title"
              placeholder="Ex: Como lidar com 'tá caro'"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tc-desc">Descrição</Label>
            <Textarea
              id="tc-desc"
              placeholder="Contexto do caso, o que aconteceu..."
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sdr_call">SDR</SelectItem>
                  <SelectItem value="closer_call">Closer</SelectItem>
                  <SelectItem value="meeting">Reunião</SelectItem>
                  <SelectItem value="objection_handling">Objeção</SelectItem>
                  <SelectItem value="closing">Fechamento</SelectItem>
                  <SelectItem value="discovery">Discovery</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Dificuldade</Label>
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="easy">Fácil</SelectItem>
                  <SelectItem value="medium">Médio</SelectItem>
                  <SelectItem value="hard">Difícil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Resultado</Label>
              <Select value={outcome} onValueChange={setOutcome}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="won">Positivo</SelectItem>
                  <SelectItem value="lost">Negativo</SelectItem>
                  <SelectItem value="neutral">Neutro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tc-transcript">Transcrição (opcional)</Label>
            <Textarea
              id="tc-transcript"
              placeholder="Cole aqui a transcrição da call ou reunião..."
              rows={4}
              value={transcript}
              onChange={e => setTranscript(e.target.value)}
              className="font-mono text-[12px]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createCase.isPending}>
            {createCase.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar Caso
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
