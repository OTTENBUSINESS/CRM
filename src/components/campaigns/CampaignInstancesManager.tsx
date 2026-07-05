import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  useCampaignInstances,
  useCreateCampaignInstance,
  useUpdateCampaignInstance,
  useDeleteCampaignInstance,
} from '@/hooks/useCampaigns';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  Smartphone,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  QrCode,
  RefreshCw,
  Wifi,
  WifiOff,
} from 'lucide-react';

interface InstanceForm {
  name: string;
}

const EMPTY_FORM: InstanceForm = { name: '' };

export default function CampaignInstancesManager() {
  const { toast } = useToast();
  const { data: instances = [], isLoading } = useCampaignInstances();
  const createInstance = useCreateCampaignInstance();
  const updateInstance = useUpdateCampaignInstance();
  const deleteInstance = useDeleteCampaignInstance();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<InstanceForm>(EMPTY_FORM);

  // QR code state
  const [qrMap, setQrMap] = useState<Record<string, string | null>>({});
  const [statusMap, setStatusMap] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);

  // Poll status for all instances on mount
  useEffect(() => {
    instances.forEach((inst: any) => {
      if (inst.api_key && (inst.api_url || inst.webhook_url)) {
        checkStatus(inst);
      }
    });
  }, [instances.length]);

  const checkStatus = async (inst: any) => {
    const url = inst.api_url || inst.webhook_url;
    if (!url || !inst.api_key) return;
    try {
      const res = await fetch(`${url}/instance/status`, {
        headers: { token: inst.api_key },
      });
      const data = await res.json();
      const connected = data.status?.connected ? 'connected' : 'disconnected';
      setStatusMap((prev) => ({ ...prev, [inst.id]: connected }));
      // Sync DB if changed
      if (inst.status !== connected) {
        await supabase
          .from('whatsapp_instances' as any)
          .update({ status: connected })
          .eq('id', inst.id);
      }
    } catch {
      setStatusMap((prev) => ({ ...prev, [inst.id]: 'disconnected' }));
    }
  };

  const handleGenerateQR = async (inst: any) => {
    const url = inst.api_url || inst.webhook_url;
    if (!url || !inst.api_key) {
      toast({ title: 'Configure a URL da API e Token primeiro', variant: 'destructive' });
      return;
    }
    setLoadingId(inst.id);
    try {
      await fetch(`${url}/instance/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: inst.api_key },
        body: JSON.stringify({}),
      });
      await new Promise((r) => setTimeout(r, 2000));
      const statusRes = await fetch(`${url}/instance/status`, {
        headers: { token: inst.api_key },
      });
      const statusData = await statusRes.json();
      const qr = statusData.instance?.qrcode || statusData.qrcode;
      if (qr) {
        setQrMap((prev) => ({ ...prev, [inst.id]: qr }));
        toast({ title: 'QR Code gerado! Escaneie com o WhatsApp.' });
      } else {
        toast({ title: 'QR Code nao disponivel, tente novamente', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Erro ao gerar QR Code', variant: 'destructive' });
    } finally {
      setLoadingId(null);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (inst: any) => {
    setEditingId(inst.id);
    setForm({
      name: inst.name || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome e obrigatorio', variant: 'destructive' });
      return;
    }
    try {
      if (editingId) {
        await updateInstance.mutateAsync({ id: editingId, name: form.name });
        toast({ title: 'Instancia atualizada!' });
      } else {
        await createInstance.mutateAsync({ name: form.name });
        toast({ title: 'Instancia criada com sucesso! Clique em Conectar para gerar o QR Code.' });
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toast({ title: err?.message || 'Erro ao criar instancia', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta instancia de campanha?')) return;
    try {
      await deleteInstance.mutateAsync(id);
      toast({ title: 'Instancia excluida!' });
    } catch {
      toast({ title: 'Erro ao excluir instancia', variant: 'destructive' });
    }
  };

  const isSaving = createInstance.isPending || updateInstance.isPending;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-5 w-5" />
                Instancias WhatsApp para Campanhas
              </CardTitle>
              <CardDescription>
                Instancias dedicadas para envio de campanhas em massa (separadas do inbox)
              </CardDescription>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Instancia
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : instances.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Smartphone className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhuma instancia de campanha cadastrada</p>
              <p className="text-xs mt-1">
                Crie instancias dedicadas para enviar campanhas sem afetar o inbox
              </p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-1" /> Criar Instancia
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {instances.map((instance: any) => {
                const liveStatus = statusMap[instance.id] || instance.status;
                const isConnected = liveStatus === 'connected';
                const qr = qrMap[instance.id];
                const isLoadingThis = loadingId === instance.id;

                return (
                  <div key={instance.id} className="rounded-lg border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={isConnected ? 'default' : 'secondary'}
                          className={cn(
                            'text-xs gap-1',
                            isConnected
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {isConnected ? (
                            <Wifi className="h-3 w-3" />
                          ) : (
                            <WifiOff className="h-3 w-3" />
                          )}
                          {isConnected ? 'Online' : 'Offline'}
                        </Badge>
                        <span className="font-medium text-sm">{instance.name}</span>
                        {instance.phone_number && (
                          <span className="text-xs text-muted-foreground">
                            {instance.phone_number}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {!isConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={() => handleGenerateQR(instance)}
                            disabled={isLoadingThis}
                          >
                            {isLoadingThis ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <QrCode className="h-3 w-3" />
                            )}
                            Conectar
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => checkStatus(instance)}
                          title="Atualizar status"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEdit(instance)}
                          title="Editar"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => handleDelete(instance.id)}
                          title="Excluir"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    {/* QR Code display */}
                    {qr && !isConnected && (
                      <div className="flex flex-col items-center gap-2 py-3 bg-white rounded-lg border">
                        <p className="text-xs text-muted-foreground">
                          Escaneie o QR Code com o WhatsApp
                        </p>
                        <img
                          src={qr.startsWith('data:') ? qr : `data:image/png;base64,${qr}`}
                          alt="QR Code"
                          className="w-48 h-48"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => checkStatus(instance)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />
                          Verificar conexao
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Editar Instancia' : 'Nova Instancia de Campanha'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Altere o nome da instancia'
                : 'A instancia WhatsApp sera criada automaticamente. Basta dar um nome para identificar.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Instancia *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: Campanha Reativacao"
                autoFocus
              />
            </div>
            {!editingId && (
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  <strong>Dica:</strong> Use numeros WhatsApp separados para campanhas. Isso evita
                  que disparos em massa afetem o numero do inbox.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !form.name.trim()}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
