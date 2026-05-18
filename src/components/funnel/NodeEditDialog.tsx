import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';

interface NodeEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  nodeId: string | null;
  nodeData: any;
  onSave: (nodeId: string, newData: any) => void;
}

export default function NodeEditDialog({ open, onOpenChange, nodeId, nodeData, onSave }: NodeEditDialogProps) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('action');
  const [channel, setChannel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (nodeData) {
      setLabel(nodeData.label || '');
      setType(nodeData.type || 'action');
      setChannel(nodeData.channel || nodeData.icon || '');
    }
  }, [nodeData]);

  const handleSave = () => {
    if (!nodeId) return;

    setSaving(true);

    const newData = {
      ...nodeData,
      label,
      type,
      channel: channel || undefined,
      icon: channel || type,
    };

    onSave(nodeId, newData);
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Editar Etapa do Funil</DialogTitle>
          <DialogDescription>
            Personalize o nome, tipo e icone desta etapa
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="label">Nome da Etapa *</Label>
            <Input
              id="label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Trafego Facebook"
            />
          </div>

          <div className="grid gap-2">
            <Label>Tipo de Etapa</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="acquisition">Aquisicao</SelectItem>
                <SelectItem value="landing">Landing/Captura</SelectItem>
                <SelectItem value="conversion">Conversao</SelectItem>
                <SelectItem value="retention">Retencao</SelectItem>
                <SelectItem value="action">Acao Generica</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>Canal/Icone</Label>
            <Select value={channel} onValueChange={setChannel}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um icone..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="facebook">Facebook</SelectItem>
                <SelectItem value="instagram">Instagram</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="landing_page">Landing Page</SelectItem>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="checkout">Checkout</SelectItem>
                <SelectItem value="conversion">Conversao</SelectItem>
                <SelectItem value="action">Acao</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !label.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
