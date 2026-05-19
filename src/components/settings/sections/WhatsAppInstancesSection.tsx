import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Smartphone,
  RefreshCw,
  QrCode,
  Loader2,
  XCircle,
  Plus,
  Trash2,
  AlertCircle,
  UserPlus,
  Users,
  X,
  Link2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WhatsAppInstance {
  id: string;
  name: string;
  phone_number: string;
  teams: string[];
  status: string;
  api_key: string;
  api_url: string;
  webhook_url: string;
  metadata: any;
}

interface InstanceStatus {
  status?: { connected: boolean };
  instance?: { profileName: string; qrcode?: string };
}

interface UazapiConfig {
  url: string;
  token: string;
}

interface TeamMemberBasic {
  id: string;
  name: string;
  email: string;
  team: string;
  role: string;
  whatsapp_instance_id: string | null;
  is_active: boolean;
}

export function WhatsAppInstancesSection() {
  const { toast } = useToast();
  const [instances, setInstances] = useState<WhatsAppInstance[]>([]);
  const [members, setMembers] = useState<TeamMemberBasic[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMap, setStatusMap] = useState<Record<string, InstanceStatus | null>>({});
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [savingMemberId, setSavingMemberId] = useState<string | null>(null);

  // UAZAPI admin config
  const [uazapi, setUazapi] = useState<UazapiConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // Create modal
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newTeam, setNewTeam] = useState("comercial");
  const [isCreating, setIsCreating] = useState(false);

  // QR Code modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrModalData, setQrModalData] = useState<{ name: string; qrcode: string } | null>(null);

  // Webhook URL
  const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;

  // === LOAD ===
  useEffect(() => {
    loadUazapiConfig();
    fetchData();
  }, []);

  const loadUazapiConfig = async () => {
    try {
      const { data } = await supabase
        .from("config")
        .select("key, value")
        .in("key", ["UAZAPI_ADMIN_URL", "UAZAPI_ADMIN_TOKEN"]);
      const map: Record<string, string> = {};
      (data || []).forEach((r: any) => { map[r.key] = r.value; });
      if (map.UAZAPI_ADMIN_URL && map.UAZAPI_ADMIN_TOKEN) {
        setUazapi({ url: map.UAZAPI_ADMIN_URL.replace(/\/$/, ""), token: map.UAZAPI_ADMIN_TOKEN });
      }
    } catch { /* ignore */ }
    finally { setLoadingConfig(false); }
  };

  const fetchData = async () => {
    setLoading(true);
    const [instRes, membersRes] = await Promise.all([
      supabase.from("whatsapp_instances").select("*").order("created_at", { ascending: false }),
      supabase.from("team_members").select("id, name, email, team, role, whatsapp_instance_id, is_active").eq("is_active", true).order("name"),
    ]);
    setInstances(instRes.data || []);
    setMembers(membersRes.data || []);
    setLoading(false);
  };

  // === STATUS ===
  const fetchStatus = async (inst: WhatsAppInstance) => {
    const url = inst.api_url || inst.webhook_url;
    if (!url || !inst.api_key) return;
    setRefreshingId(inst.id);
    try {
      const res = await fetch(`${url}/instance/status`, { headers: { token: inst.api_key } });
      if (res.status === 401) {
        toast({
          title: `Token inválido — ${inst.name}`,
          description: "Essa instância não autentica no UAZAPI. Exclua e recrie-a para gerar um novo token.",
          variant: "destructive",
        });
        setStatusMap((prev) => ({ ...prev, [inst.id]: null }));
        return;
      }
      const data = await res.json();
      setStatusMap((prev) => ({ ...prev, [inst.id]: data }));
      const newStatus = data.status?.connected ? "connected" : "disconnected";
      if (inst.status !== newStatus) {
        await supabase.from("whatsapp_instances").update({ status: newStatus }).eq("id", inst.id);
        fetchData();
      }
    } catch {
      setStatusMap((prev) => ({ ...prev, [inst.id]: null }));
    } finally {
      setRefreshingId(null);
    }
  };

  // === CONNECT + QR ===
  const genQR = async (inst: WhatsAppInstance) => {
    const url = inst.api_url || inst.webhook_url;
    if (!url || !inst.api_key) {
      toast({ title: "Instância sem URL ou token", variant: "destructive" });
      return;
    }
    setRefreshingId(inst.id);
    try {
      const res = await fetch(`${url}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: inst.api_key },
      });
      if (res.status === 401) {
        toast({
          title: `Token inválido — ${inst.name}`,
          description: "Essa instância não autentica no UAZAPI. Exclua e recrie-a para gerar um novo token.",
          variant: "destructive",
        });
        return;
      }
      const data = await res.json();
      const qrcode = data.instance?.qrcode || data.qrcode;
      if (qrcode) {
        setStatusMap((prev) => ({
          ...prev,
          [inst.id]: {
            status: data.status || { connected: false },
            instance: { qrcode, profileName: data.instance?.profileName || "" },
          },
        }));
        // Abre modal com QR grande
        setQrModalData({ name: inst.name, qrcode });
        setQrModalOpen(true);
        toast({ title: "QR Code gerado — escaneie com o WhatsApp" });
      } else if (data.status?.connected) {
        setStatusMap((prev) => ({
          ...prev,
          [inst.id]: { status: { connected: true }, instance: data.instance },
        }));
        await supabase.from("whatsapp_instances").update({ status: "connected" }).eq("id", inst.id);
        toast({ title: "WhatsApp já conectado! ✅" });
        fetchData();
      } else {
        toast({ title: "Conectando... tente gerar o QR novamente em alguns segundos" });
      }
    } catch {
      toast({ title: "Erro ao conectar", variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  useEffect(() => {
    if (instances.length > 0) instances.forEach((i) => fetchStatus(i));
  }, [instances.length]);

  // === CREATE ===
  const handleCreate = async () => {
    if (!uazapi) return;
    if (!newName.trim()) {
      toast({ title: "Digite um nome", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    try {
      // UAZAPI usa /instance/init como endpoint oficial (o /instance/create \u00e9 legado).
      const createRes = await fetch(`${uazapi.url}/instance/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json", admintoken: uazapi.token },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!createRes.ok) throw new Error(`UAZAPI: ${createRes.status}`);
      const createData = await createRes.json();
      const instanceToken = createData.token || createData.apikey;
      if (!instanceToken) throw new Error("Token não retornado");

      // Configure webhook
      try {
        await fetch(`${uazapi.url}/webhook`, {
          method: "POST",
          headers: { "Content-Type": "application/json", token: instanceToken },
          body: JSON.stringify({
            url: WEBHOOK_URL,
            events: ["messages", "messages_update", "connection", "groups", "contacts", "call", "chats"],
            excludeMessages: ["wasSentByApi"],
            addUrlEvents: true,
          }),
        });
      } catch { /* webhook can be configured later */ }

      // Save
      await supabase.from("whatsapp_instances").insert({
        name: createData.name || newName.trim(),
        api_url: uazapi.url,
        webhook_url: uazapi.url,
        api_key: instanceToken,
        teams: [newTeam],
        status: "disconnected",
        metadata: { uazapi_instance_id: createData.instance?.id || null, webhook_url: WEBHOOK_URL },
      });

      toast({ title: "Instância criada! 🎉", description: "Gere o QR Code para conectar." });
      setIsCreateOpen(false);
      setNewName("");
      fetchData();
    } catch (error: any) {
      toast({ title: "Erro ao criar", description: error.message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  // === CONFIGURAR WEBHOOK ===
  const handleConfigureWebhook = async (inst: WhatsAppInstance) => {
    const url = inst.api_url || inst.webhook_url;
    if (!url || !inst.api_key) {
      toast({ title: "Instância sem URL ou token", variant: "destructive" });
      return;
    }
    setRefreshingId(inst.id);
    try {
      const res = await fetch(`${url}/webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: inst.api_key },
        body: JSON.stringify({
          url: WEBHOOK_URL,
          events: ["messages", "messages_update", "connection", "groups", "contacts", "call", "chats"],
          excludeMessages: ["wasSentByApi"],
          addUrlEvents: true,
        }),
      });
      if (res.ok) {
        toast({ title: "✅ Webhook configurado!", description: "O UAZAPI irá enviar eventos para o CRM agora." });
      } else {
        const txt = await res.text().catch(() => "");
        toast({ title: `Webhook: erro ${res.status}`, description: txt.slice(0, 120) || "Tente novamente", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "Erro ao configurar webhook", description: err.message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };

  // === DELETE ===
  const handleDelete = async (inst: WhatsAppInstance) => {
    if (!confirm(`Excluir "${inst.name}"?`)) return;
    try {
      await supabase.from("team_members").update({ whatsapp_instance_id: null }).eq("whatsapp_instance_id", inst.id);
      await supabase.from("whatsapp_instances").delete().eq("id", inst.id);
      toast({ title: "Instância excluída" });
      fetchData();
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  // === ASSIGN MEMBER ===
  const handleAssign = async (memberId: string, instanceId: string | null) => {
    setSavingMemberId(memberId);
    try {
      await supabase.from("team_members").update({ whatsapp_instance_id: instanceId }).eq("id", memberId);
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, whatsapp_instance_id: instanceId } : m));
      toast({ title: instanceId ? "Membro vinculado!" : "Vínculo removido" });
    } catch {
      toast({ title: "Erro ao vincular", variant: "destructive" });
    } finally {
      setSavingMemberId(null);
    }
  };

  const handleUnassign = async (memberId: string) => {
    await handleAssign(memberId, null);
  };

  // Helpers
  const getMembersForInstance = (instanceId: string) =>
    members.filter((m) => m.whatsapp_instance_id === instanceId);

  const getUnassignedMembers = () =>
    members.filter((m) => !m.whatsapp_instance_id);

  const teamLabel: Record<string, string> = { cs: "CS", suporte: "Suporte", comercial: "Comercial" };

  // === RENDER ===
  if (loading || loadingConfig) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* UAZAPI not configured */}
      {!uazapi && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-foreground font-medium">UAZAPI não configurado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Configure em{" "}
              <a href="/configuracoes?s=api-keys" className="underline hover:text-foreground">Chaves de API</a>.
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {instances.length} instância{instances.length !== 1 ? "s" : ""}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} />
            Atualizar
          </Button>
          <Button size="sm" onClick={() => setIsCreateOpen(true)} disabled={!uazapi}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Instância
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {instances.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Smartphone className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-muted-foreground text-sm font-medium mb-1">Nenhuma instância</p>
            <p className="text-xs text-muted-foreground mb-4">
              {uazapi ? "Crie sua primeira instância" : "Configure o UAZAPI primeiro"}
            </p>
            {uazapi && (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Criar Primeira Instância
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {instances.map((inst) => {
            const st = statusMap[inst.id];
            const busy = refreshingId === inst.id;
            const online = st?.status?.connected || inst.status === "connected";
            const qrCode = st?.instance?.qrcode;
            const team = inst.teams?.[0];
            const linkedMembers = getMembersForInstance(inst.id);
            const unassigned = getUnassignedMembers();

            return (
              <Card key={inst.id} className="rounded-xl">
                <CardContent className="p-5">
                  <div className="flex gap-5">
                    {/* LEFT: QR / Status */}
                    <div className="w-48 shrink-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 mb-1">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-base font-semibold truncate">{inst.name}</h3>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge
                          variant={online ? "default" : "secondary"}
                          className={cn(
                            "gap-1 text-[11px]",
                            online ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {online ? "● Conectado" : "Desconectado"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{team ? teamLabel[team] || team : ""}</span>
                      </div>

                      {/* QR area */}
                      <div className="bg-muted/50 rounded-lg p-3 mb-3">
                        {online ? (
                          <div className="text-center py-2">
                            <div className="w-10 h-10 mx-auto mb-1.5 rounded-full bg-green-500/10 flex items-center justify-center">
                              <Smartphone className="h-5 w-5 text-green-500" />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                              {inst.phone_number ? `+${inst.phone_number}` : "Conectado"}
                            </p>
                          </div>
                        ) : qrCode ? (
                          <div
                            className="text-center cursor-pointer group"
                            onClick={() => {
                              setQrModalData({ name: inst.name, qrcode: qrCode });
                              setQrModalOpen(true);
                            }}
                          >
                            <img src={qrCode} alt="QR Code" className="w-36 h-36 mx-auto rounded-lg group-hover:opacity-80 transition-opacity" />
                            <p className="text-[11px] text-muted-foreground mt-1">Clique para ampliar</p>
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <QrCode className="h-8 w-8 mx-auto mb-1.5 text-muted-foreground/40" />
                            <p className="text-[11px] text-muted-foreground">Gere o QR</p>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="space-y-1.5">
                        {!online ? (
                          <Button
                            className="w-full bg-green-500 hover:bg-green-600 text-white rounded-lg h-8 text-xs"
                            size="sm"
                            onClick={() => genQR(inst)}
                            disabled={busy}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <QrCode className="h-3.5 w-3.5 mr-1.5" />}
                            Gerar QR Code
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full rounded-lg h-8 text-xs"
                            size="sm"
                            onClick={() => fetchStatus(inst)}
                            disabled={busy}
                          >
                            {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                            Verificar
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="w-full rounded-lg h-8 text-xs text-blue-600 border-blue-200 hover:bg-blue-50"
                          size="sm"
                          onClick={() => handleConfigureWebhook(inst)}
                          disabled={busy}
                        >
                          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1.5" />}
                          Configurar Webhook
                        </Button>
                        <Button
                          variant="ghost"
                          className="w-full rounded-lg h-8 text-xs text-destructive hover:text-destructive"
                          size="sm"
                          onClick={() => handleDelete(inst)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                          Excluir
                        </Button>
                      </div>
                    </div>

                    {/* RIGHT: Members linked */}
                    <div className="flex-1 min-w-0 border-l border-border/50 pl-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <h4 className="text-sm font-medium">Membros vinculados</h4>
                      </div>

                      {/* Linked members */}
                      {linkedMembers.length > 0 ? (
                        <div className="space-y-1.5 mb-3">
                          {linkedMembers.map((m) => (
                            <div
                              key={m.id}
                              className="flex items-center justify-between py-1.5 px-2.5 rounded-md bg-muted/30"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                                  {m.name[0]?.toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{m.name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate">{m.role} • {m.team}</p>
                                </div>
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => handleUnassign(m.id)}
                                disabled={savingMemberId === m.id}
                              >
                                {savingMemberId === m.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground mb-3">
                          Nenhum membro vinculado a esta instância.
                        </p>
                      )}

                      {/* Add member dropdown */}
                      {unassigned.length > 0 && (
                        <div className="flex items-center gap-2">
                          <UserPlus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Select
                            value=""
                            onValueChange={(memberId) => handleAssign(memberId, inst.id)}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue placeholder="Vincular membro..." />
                            </SelectTrigger>
                            <SelectContent>
                              {unassigned.map((m) => (
                                <SelectItem key={m.id} value={m.id}>
                                  <span className="text-sm">{m.name}</span>
                                  <span className="text-muted-foreground ml-1 text-xs">({m.team})</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {unassigned.length === 0 && linkedMembers.length > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          ✅ Todos os membros ativos já estão vinculados.
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* === QR CODE MODAL === */}
      <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
        <DialogContent className="sm:max-w-lg flex flex-col items-center">
          <DialogHeader className="text-center">
            <DialogTitle>QR Code — {qrModalData?.name}</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Menu (⋮) → Aparelhos conectados → Conectar → Escaneie o código abaixo
            </DialogDescription>
          </DialogHeader>
          {qrModalData?.qrcode && (
            <div className="py-4">
              <img
                src={qrModalData.qrcode}
                alt="QR Code WhatsApp"
                className="w-[360px] h-[360px] mx-auto rounded-xl"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setQrModalOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* === CREATE MODAL === */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Instância WhatsApp</DialogTitle>
            <DialogDescription>
              Criada automaticamente no UAZAPI. Webhook e token configurados sozinhos.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="inst-name">Nome da instância</Label>
              <Input
                id="inst-name"
                placeholder="Ex: Comercial, Suporte, CS..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Select value={newTeam} onValueChange={setNewTeam}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="comercial">Comercial</SelectItem>
                  <SelectItem value="cs">Customer Success</SelectItem>
                  <SelectItem value="suporte">Suporte</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="p-2.5 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
              <p>✅ Token gerado automaticamente</p>
              <p>✅ Webhook configurado para receber mensagens</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={isCreating || !newName.trim()}>
              {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
