import { useState } from "react";
import {
  Phone,
  Wifi,
  WifiOff,
  Loader2,
  Trash2,
  Pencil,
  Plus,
  ExternalLink,
  AlertCircle,
  Users,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  useWavoipDevices,
  useCreateWavoipDevice,
  useUpdateWavoipDevice,
  useDeleteWavoipDevice,
} from "@/hooks/useWavoip";
import { useAllTeamMembers } from "@/hooks/useTeamMembers";
import { cn } from "@/lib/utils";

export function WavoipAdminPanel() {
  const { toast } = useToast();
  const { data: devices = [], isLoading: loadingDevices } = useWavoipDevices();
  const { data: members = [], isLoading: loadingMembers } = useAllTeamMembers();

  const createDevice = useCreateWavoipDevice();
  const updateDevice = useUpdateWavoipDevice();
  const deleteDevice = useDeleteWavoipDevice();

  const [modalMember, setModalMember] = useState<any | null>(null);
  const [token, setToken] = useState("");
  const [name, setName] = useState("");

  const getDevice = (memberId: string) =>
    (devices as any[]).find((d) => d.team_member_id === memberId && d.is_active);

  const openModal = (member: any) => {
    const existing = getDevice(member.id);
    setModalMember(member);
    setToken(existing?.token || "");
    setName(existing?.name || "");
  };

  const handleSave = async () => {
    if (!modalMember || !token.trim()) {
      toast({ title: "Token é obrigatório", variant: "destructive" });
      return;
    }
    try {
      const existing = getDevice(modalMember.id);
      if (existing) {
        await updateDevice.mutateAsync({
          deviceId: existing.id,
          token: token.trim(),
          name: name.trim() || `WhatsApp ${modalMember.name}`,
        });
      } else {
        await createDevice.mutateAsync({
          teamMemberId: modalMember.id,
          token: token.trim(),
          name: name.trim() || `WhatsApp ${modalMember.name}`,
        });
      }
      toast({ title: existing ? "Dispositivo atualizado!" : "Dispositivo criado!" });
      setModalMember(null);
      setToken("");
      setName("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async (member: any) => {
    const device = getDevice(member.id);
    if (!device) return;
    if (!confirm(`Remover WaVoIP de ${member.name}?`)) return;
    try {
      await deleteDevice.mutateAsync(device.id);
      toast({ title: "Dispositivo removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const activeMembers = (members || []).filter((m: any) => m.is_active);
  const configured = activeMembers.filter((m: any) => getDevice(m.id));
  const pending = activeMembers.filter((m: any) => !getDevice(m.id));

  if (loadingDevices || loadingMembers) {
    return (
      <Card>
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Header explicativo */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Telefonia (WaVoIP) — Painel Admin
          </CardTitle>
          <CardDescription>
            Configure o dispositivo de ligações de cada vendedor. Cada membro tem 1 token próprio — o vendedor escaneia o QR Code do próprio celular depois.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <strong>Como funciona:</strong> você cria 1 device em{" "}
              <a
                href="https://devices.wavoip.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline font-medium inline-flex items-center gap-1"
              >
                devices.wavoip.com
                <ExternalLink className="h-3 w-3" />
              </a>{" "}
              por vendedor, pega o token, cola aqui pro membro correto. Depois o vendedor abre <code className="text-xs bg-muted px-1 rounded">/meu-whatsapp</code> e escaneia o QR com o celular dele.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="p-3 rounded-lg border bg-muted/40">
              <div className="text-2xl font-bold">{activeMembers.length}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" /> Membros ativos
              </div>
            </div>
            <div className="p-3 rounded-lg border border-green-500/30 bg-green-50 dark:bg-green-950/30">
              <div className="text-2xl font-bold text-green-700 dark:text-green-400">
                {configured.length}
              </div>
              <div className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                <Wifi className="h-3 w-3" /> Com WaVoIP
              </div>
            </div>
            <div className="p-3 rounded-lg border border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/30">
              <div className="text-2xl font-bold text-yellow-700 dark:text-yellow-400">
                {pending.length}
              </div>
              <div className="text-xs text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
                <WifiOff className="h-3 w-3" /> Sem WaVoIP
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de membros */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Dispositivos do time</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vendedor</TableHead>
                <TableHead>Nome do dispositivo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Número detectado</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeMembers.map((member: any) => {
                const device = getDevice(member.id);
                const connected = device?.status === "connected";
                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {device?.name || "—"}
                    </TableCell>
                    <TableCell>
                      {!device ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          <WifiOff className="h-3 w-3 mr-1" /> Não configurado
                        </Badge>
                      ) : connected ? (
                        <Badge className="bg-green-500 hover:bg-green-600">
                          <Wifi className="h-3 w-3 mr-1" /> Conectado
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-400"
                        >
                          <WifiOff className="h-3 w-3 mr-1" /> Desconectado
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {device?.phone_number || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      {!device ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openModal(member)}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Configurar
                        </Button>
                      ) : (
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openModal(member)}
                            title="Editar token"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDelete(member)}
                            title="Remover"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {activeMembers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    Nenhum membro ativo. Cadastre membros em <strong>Equipe → Membros</strong>.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal de configuração */}
      <Dialog
        open={!!modalMember}
        onOpenChange={(open) => !open && setModalMember(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Configurar WaVoIP
            </DialogTitle>
            <DialogDescription>
              Dispositivo de <strong>{modalMember?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-sm space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-300">Como pegar o token:</p>
              <ol className="text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-0.5">
                <li>
                  Acesse{" "}
                  <a
                    href="https://devices.wavoip.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium inline-flex items-center gap-1"
                  >
                    devices.wavoip.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Crie um novo device (1 device por vendedor)</li>
                <li>Copie o <strong>token</strong> gerado e cole abaixo</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label>Nome do dispositivo</Label>
              <Input
                placeholder={`WhatsApp ${modalMember?.name}`}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Token WaVoIP *</Label>
              <Input
                placeholder="Cole o token aqui"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Depois de salvar, o vendedor precisa abrir <code>/meu-whatsapp</code> e escanear o QR Code pra conectar o número dele.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMember(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                createDevice.isPending || updateDevice.isPending || !token.trim()
              }
            >
              {(createDevice.isPending || updateDevice.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
