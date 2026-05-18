import { useState } from "react";
import {
  Phone,
  Settings,
  Check,
  X,
  Loader2,
  AlertCircle,
  Wifi,
  WifiOff,
  RefreshCw,
  RotateCcw,
  Trash2,
  Plus,
  Eye,
  EyeOff,
  Copy,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCall } from "@/contexts/CallContext";
import {
  useWavoipDevice,
  useCreateWavoipDevice,
  useUpdateWavoipDevice,
  useDeleteWavoipDevice,
} from "@/hooks/useWavoip";
import { cn } from "@/lib/utils";

// Status badge para uso em outros lugares
export function WavoipStatusBadge({ className }: { className?: string }) {
  const { device, isConnected, deviceLoading } = useCall();

  if (deviceLoading) {
    return (
      <Badge variant="secondary" className={cn("animate-pulse", className)}>
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        Carregando
      </Badge>
    );
  }

  if (!device) {
    return (
      <Badge variant="outline" className={cn("text-muted-foreground", className)}>
        <WifiOff className="h-3 w-3 mr-1" />
        Não configurado
      </Badge>
    );
  }

  if (isConnected) {
    return (
      <Badge className={cn("bg-green-500 hover:bg-green-600", className)}>
        <Wifi className="h-3 w-3 mr-1" />
        Conectado
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn("text-yellow-700 bg-yellow-100", className)}>
      <WifiOff className="h-3 w-3 mr-1" />
      Desconectado
    </Badge>
  );
}

// Configuração completa do dispositivo
export function WavoipDeviceConfig() {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const { restartDevice, isConnected } = useCall();

  const { data: device, isLoading, refetch } = useWavoipDevice(teamMember?.id);
  const createDevice = useCreateWavoipDevice();
  const updateDevice = useUpdateWavoipDevice();
  const deleteDevice = useDeleteWavoipDevice();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const [formData, setFormData] = useState({
    token: "",
    name: "",
  });

  const handleCreate = async () => {
    if (!formData.token.trim()) {
      toast({
        title: "Erro",
        description: "Token é obrigatório",
        variant: "destructive",
      });
      return;
    }

    try {
      await createDevice.mutateAsync({
        teamMemberId: teamMember!.id,
        token: formData.token.trim(),
        name: formData.name.trim() || "Meu WhatsApp",
      });

      toast({
        title: "Sucesso",
        description: "Dispositivo WaVoIP configurado",
      });

      setShowCreateModal(false);
      setFormData({ token: "", name: "" });
      refetch();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao configurar dispositivo",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!device) return;

    try {
      await deleteDevice.mutateAsync(device.id);

      toast({
        title: "Sucesso",
        description: "Dispositivo removido",
      });

      setShowDeleteConfirm(false);
      refetch();
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao remover dispositivo",
        variant: "destructive",
      });
    }
  };

  const copyWebhookUrl = () => {
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wavoip-webhook?token=${device?.token}`;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: "Copiado!",
      description: "URL do webhook copiada para área de transferência",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            WaVoIP - Chamadas WhatsApp
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            WaVoIP - Chamadas WhatsApp
          </CardTitle>
          <CardDescription>
            Configure seu dispositivo WaVoIP para fazer e receber chamadas via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {device ? (
            <>
              {/* Status do dispositivo */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-full",
                      device.status === "connected"
                        ? "bg-green-100"
                        : "bg-yellow-100"
                    )}
                  >
                    {device.status === "connected" ? (
                      <Wifi className="h-5 w-5 text-green-600" />
                    ) : (
                      <WifiOff className="h-5 w-5 text-yellow-600" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">{device.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {device.phone_number || "Número não detectado"}
                    </p>
                  </div>
                </div>
                <Badge
                  variant={device.status === "connected" ? "default" : "secondary"}
                  className={
                    device.status === "connected"
                      ? "bg-green-500"
                      : "bg-yellow-500"
                  }
                >
                  {device.status === "connected" ? "Conectado" : "Desconectado"}
                </Badge>
              </div>

              {/* Token (oculto) */}
              <div className="space-y-2">
                <Label>Token WaVoIP</Label>
                <div className="flex gap-2">
                  <Input
                    type={showToken ? "text" : "password"}
                    value={device.token}
                    readOnly
                    className="font-mono"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setShowToken(!showToken)}
                  >
                    {showToken ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      navigator.clipboard.writeText(device.token);
                      toast({ title: "Token copiado!" });
                    }}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* URL do Webhook */}
              <div className="space-y-2">
                <Label>URL do Webhook</Label>
                <div className="flex gap-2">
                  <Input
                    value={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/wavoip-webhook?token=${device.token.substring(0, 10)}...`}
                    readOnly
                    className="font-mono text-xs"
                  />
                  <Button variant="outline" onClick={copyWebhookUrl}>
                    <Copy className="h-4 w-4 mr-2" />
                    Copiar
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Configure esta URL no painel do WaVoIP para receber eventos
                </p>
              </div>

              {/* Alerta de configuração */}
              {!device.webhook_configured && (
                <Alert variant="default">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Configurar Webhook</AlertTitle>
                  <AlertDescription>
                    Copie a URL acima e configure no painel do WaVoIP em
                    Configurações → Webhooks para receber eventos de chamadas.
                  </AlertDescription>
                </Alert>
              )}

              {/* Ações */}
              <div className="flex flex-wrap gap-2 pt-4">
                <Button variant="outline" onClick={() => refetch()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Status
                </Button>
                <Button
                  variant="outline"
                  onClick={() => restartDevice()}
                  disabled={!isConnected}
                  title="Reinicia o dispositivo e encerra chamadas pendentes"
                >
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Reiniciar Dispositivo
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Remover
                </Button>
              </div>

              {/* Dica sobre chamadas pendentes */}
              <p className="text-xs text-muted-foreground">
                💡 Se aparecer erro de "limite de chamadas", clique em "Reiniciar Dispositivo" para liberar chamadas pendentes.
              </p>
            </>
          ) : (
            /* Sem dispositivo configurado */
            <div className="text-center py-8 space-y-4">
              <div className="w-16 h-16 mx-auto bg-muted rounded-full flex items-center justify-center">
                <Phone className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <p className="font-medium">Nenhum dispositivo configurado</p>
                <p className="text-sm text-muted-foreground">
                  Configure seu token WaVoIP para fazer chamadas via WhatsApp
                </p>
              </div>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Configurar WaVoIP
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de criar dispositivo */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurar WaVoIP</DialogTitle>
            <DialogDescription>
              Insira seu token do WaVoIP para habilitar chamadas via WhatsApp
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="token">Token WaVoIP *</Label>
              <Input
                id="token"
                placeholder="Cole seu token aqui"
                value={formData.token}
                onChange={(e) =>
                  setFormData({ ...formData, token: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Encontre seu token no painel do WaVoIP em Configurações → API
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Nome do Dispositivo</Label>
              <Input
                id="name"
                placeholder="Ex: Meu WhatsApp Comercial"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createDevice.isPending}
            >
              {createDevice.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover Dispositivo?</DialogTitle>
            <DialogDescription>
              Isso irá desconectar o WaVoIP e você não poderá mais fazer ou
              receber chamadas via WhatsApp até configurar novamente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDevice.isPending}
            >
              {deleteDevice.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
