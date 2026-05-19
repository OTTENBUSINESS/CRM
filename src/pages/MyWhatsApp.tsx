import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { useCall } from "@/contexts/CallContext";
import { useWavoipDevice, useCreateWavoipDevice, useDeleteWavoipDevice } from "@/hooks/useWavoip";
import {
  MessageSquare, Phone, Wifi, WifiOff, RefreshCw, Loader2, QrCode,
  CheckCircle2, XCircle, Smartphone, Plus, Trash2, Eye, EyeOff,
  Globe, FileText, Clock, Send, AlertCircle, Check
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// ========== Mensagens (UAZAPI) ==========
function MessagingSection() {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const [instance, setInstance] = useState<any>(null);
  const [status, setStatus] = useState<"checking" | "connected" | "disconnected">("checking");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchInstance = useCallback(async () => {
    if (!teamMember?.whatsapp_instance_id) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("whatsapp_instances")
      .select("*")
      .eq("id", teamMember.whatsapp_instance_id)
      .single();
    setInstance(data);
    setLoading(false);

    if (data?.api_url && data?.api_key) {
      try {
        // Endpoint CORRETO: /instance/status (consulta status da instancia especifica via token).
        // Antes estava /status (health check do servidor — retornava instancia aleatoria!).
        const res = await fetch(`${data.api_url}/instance/status`, { headers: { token: data.api_key } });
        if (res.status === 401) {
          toast({
            title: "Token da instância inválido",
            description: "Essa instância não autentica no UAZAPI. Peça ao administrador pra reconfigurá-la em Configurações > WhatsApp.",
            variant: "destructive",
          });
          setStatus("disconnected");
          return;
        }
        const json = await res.json();
        // UAZAPI retorna: { instance: {...}, status: { connected: bool, jid, loggedIn } }
        const isConnected = json?.status?.connected === true || json?.instance?.status === 'connected';
        const realStatus: "connected" | "disconnected" = isConnected ? "connected" : "disconnected";
        setStatus(realStatus);

        // Sincronizar com o banco se divergente (defesa em profundidade — webhook
        // de connection da UAZAPI nao e sempre confiavel)
        if (data.status !== realStatus) {
          await supabase.from("whatsapp_instances").update({ status: realStatus }).eq("id", data.id);
        }
      } catch {
        setStatus("disconnected");
      }
    }
  }, [teamMember?.whatsapp_instance_id]);

  const fetchQR = async () => {
    if (!instance?.api_url || !instance?.api_key) return;
    try {
      // POST /instance/connect — inicia conexao da instancia (gera QR se desconectado).
      // GET /instance/qrcode soh retorna QR se instancia ja esta em "connecting".
      const res = await fetch(`${instance.api_url}/instance/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json", token: instance.api_key },
      });
      if (res.status === 401) {
        toast({
          title: "Token da instância inválido",
          description: "Essa instância não autentica no UAZAPI. Peça ao administrador pra reconfigurá-la em Configurações > WhatsApp.",
          variant: "destructive",
        });
        return;
      }
      const json = await res.json();
      const qrcode = json?.instance?.qrcode || json?.qrcode;
      if (qrcode) {
        setQrCode(qrcode);
        toast({ title: "QR Code gerado", description: "Escaneie com o WhatsApp do celular." });
      } else if (json?.status?.connected) {
        toast({ title: "WhatsApp ja esta conectado" });
        setStatus("connected");
        await supabase.from("whatsapp_instances").update({ status: "connected" }).eq("id", instance.id);
      } else {
        toast({
          title: "Aguarde alguns segundos e tente de novo",
          description: "A instancia esta sendo preparada — gere o QR novamente em 5s.",
        });
      }
    } catch (err: any) {
      toast({ title: "Erro ao gerar QR Code", description: err?.message || "Falha de rede", variant: "destructive" });
    }
  };

  const disconnectInstance = async () => {
    if (!instance?.api_url || !instance?.api_key) return;
    const ok = window.confirm(
      "Tem certeza que quer desconectar o WhatsApp?\n\nO n\u00famero atual vai deslogar. Depois voc\u00ea pode escanear o QR Code com um novo n\u00famero."
    );
    if (!ok) return;

    try {
      const res = await fetch(`${instance.api_url}/instance/disconnect`, {
        method: "POST",
        headers: { token: instance.api_key, "Content-Type": "application/json" },
      });

      // Tenta extrair body JSON pra mostrar mensagem da API
      let body: any = null;
      try { body = await res.json(); } catch { /* ignore */ }

      if (res.ok) {
        toast({
          title: "WhatsApp desconectado",
          description: body?.response || "Gere um novo QR Code pra vincular outro n\u00famero.",
        });
        // Persiste status no banco
        await supabase
          .from("whatsapp_instances")
          .update({ status: "disconnected" })
          .eq("id", instance.id);
        setQrCode(null);
        setStatus("disconnected");
        setTimeout(() => fetchInstance(), 800);
        return;
      }

      // Erros esperados da UAZAPI
      if (res.status === 401) {
        toast({
          title: "Token da inst\u00e2ncia inv\u00e1lido",
          description:
            "Essa inst\u00e2ncia n\u00e3o autentica mais no servidor UAZAPI. Pe\u00e7a ao administrador pra recri\u00e1-la em Configura\u00e7\u00f5es > WhatsApp.",
          variant: "destructive",
        });
        return;
      }

      toast({
        title: "Erro ao desconectar",
        description: body?.message || `HTTP ${res.status}`,
        variant: "destructive",
      });
    } catch (err: any) {
      toast({
        title: "Erro ao desconectar",
        description: err?.message || "Falha de rede",
        variant: "destructive",
      });
    }
  };

  useEffect(() => { fetchInstance(); }, [fetchInstance]);

  // === REALTIME: escutar mudancas no status da instancia (atualizado pelo webhook) ===
  useEffect(() => {
    const instanceId = teamMember?.whatsapp_instance_id;
    if (!instanceId) return;

    const channel = supabase
      .channel(`whatsapp-instance-${instanceId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'whatsapp_instances', filter: `id=eq.${instanceId}` },
        (payload: any) => {
          const newStatus = payload?.new?.status;
          if (newStatus === 'connected' || newStatus === 'disconnected' || newStatus === 'connecting') {
            setStatus(newStatus === 'connecting' ? 'disconnected' : newStatus);
            setInstance((prev: any) => ({ ...prev, ...payload.new }));
            if (newStatus === 'connected') {
              setQrCode(null);
              toast({ title: 'WhatsApp conectado!' });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [teamMember?.whatsapp_instance_id, toast]);

  // === POLLING enquanto QR esta aberto (defesa em profundidade) ===
  // Realtime cobre 99% dos casos. Polling cobre 1% (caso webhook UAZAPI atrase).
  useEffect(() => {
    if (!qrCode || !instance?.api_url || !instance?.api_key) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${instance.api_url}/instance/status`, { headers: { token: instance.api_key } });
        const json = await res.json();
        const isConnected = json?.status?.connected === true || json?.instance?.status === 'connected';
        if (isConnected) {
          setStatus('connected');
          setQrCode(null);
          await supabase.from('whatsapp_instances').update({ status: 'connected' }).eq('id', instance.id);
          toast({ title: 'WhatsApp conectado!' });
        }
      } catch { /* ignore */ }
    }, 3000);

    return () => clearInterval(interval);
  }, [qrCode, instance?.api_url, instance?.api_key, instance?.id, toast]);

  if (loading) {
    return <Card><CardContent className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (!instance) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Nenhuma instância vinculada</p>
          <p className="text-sm mt-1">Peça ao administrador pra vincular uma instância ao seu perfil.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", status === "connected" ? "bg-green-100 dark:bg-green-950" : "bg-red-100 dark:bg-red-950")}>
              <MessageSquare className={cn("h-5 w-5", status === "connected" ? "text-green-600" : "text-red-500")} />
            </div>
            <div>
              <CardTitle className="text-base">Mensagens</CardTitle>
              <CardDescription>{instance.name}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn(status === "connected" ? "bg-green-500" : status === "disconnected" ? "bg-red-500" : "bg-yellow-500")}>
              {status === "connected" ? <><Wifi className="h-3 w-3 mr-1" /> Conectado</> :
               status === "disconnected" ? <><WifiOff className="h-3 w-3 mr-1" /> Desconectado</> :
               <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Verificando</>}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={fetchInstance}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {instance.phone_number && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Smartphone className="h-4 w-4" />
            <span>{instance.phone_number.replace(/(\d{2})(\d{2})(\d{5})(\d{4})/, "+$1 ($2) $3-$4")}</span>
          </div>
        )}

        {status === "disconnected" && (
          <div className="mt-3 space-y-3">
            <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900">
              <p className="text-sm text-red-700 dark:text-red-400">Instância desconectada. Escaneie o QR Code pra reconectar.</p>
            </div>
            <Button onClick={fetchQR} variant="outline" className="w-full">
              <QrCode className="h-4 w-4 mr-2" /> Gerar QR Code
            </Button>
            {qrCode && (
              <div className="flex justify-center p-4 bg-white rounded-lg border">
                <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
              </div>
            )}
          </div>
        )}

        {status === "connected" && (
          <div className="space-y-3">
            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
              <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" /> Pronto pra enviar e receber mensagens
              </p>
            </div>
            <Button
              onClick={disconnectInstance}
              variant="outline"
              className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <XCircle className="h-4 w-4 mr-2" /> Desconectar e trocar número
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========== Ligações (WaVoIP) ==========
function CallingSection() {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const { device: callDevice, isConnected: sdkConnected, connectWavoip, disconnectWavoip, deviceLoading } = useCall();
  const { data: dbDevice, isLoading, refetch } = useWavoipDevice(teamMember?.id);
  const createDevice = useCreateWavoipDevice();
  const deleteDevice = useDeleteWavoipDevice();

  const [showSetup, setShowSetup] = useState(false);
  const [token, setToken] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [wavoipStatus, setWavoipStatus] = useState<"checking" | "connected" | "disconnected">("checking");

  // Checar status real do WaVoIP via API (independente do SDK)
  useEffect(() => {
    if (!dbDevice?.token) { setWavoipStatus("disconnected"); return; }
    const checkStatus = async () => {
      try {
        const res = await fetch(`https://devices.wavoip.com/${dbDevice.token}/whatsapp/status`);
        const json = await res.json();
        setWavoipStatus(json?.result === "open" ? "connected" : "disconnected");
      } catch { setWavoipStatus("disconnected"); }
    };
    checkStatus();
    const interval = setInterval(checkStatus, 15000); // Checa a cada 15s
    return () => clearInterval(interval);
  }, [dbDevice?.token]);

  const isConnected = sdkConnected || wavoipStatus === "connected";

  const handleCreate = async () => {
    if (!token.trim()) {
      toast({ title: "Token é obrigatório", variant: "destructive" });
      return;
    }
    try {
      await createDevice.mutateAsync({
        teamMemberId: teamMember!.id,
        token: token.trim(),
        name: deviceName.trim() || `WhatsApp ${teamMember!.name}`,
      });
      toast({ title: "Dispositivo configurado!" });
      setShowSetup(false);
      setToken("");
      setDeviceName("");
      refetch();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!dbDevice?.id) return;
    try {
      disconnectWavoip();
      await deleteDevice.mutateAsync(dbDevice.id);
      toast({ title: "Dispositivo removido" });
      refetch();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  if (isLoading || deviceLoading) {
    return <Card><CardContent className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (!dbDevice) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gray-100 dark:bg-gray-800">
              <Phone className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">Suas Ligações</CardTitle>
              <CardDescription>Ainda não configurado — fale com o admin</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!showSetup ? (
            <div className="text-center py-4">
              <Phone className="h-10 w-10 mx-auto mb-3 opacity-40 text-muted-foreground" />
              <p className="text-sm text-muted-foreground mb-1">
                <strong>Seu dispositivo de ligações ainda não foi configurado.</strong>
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Peça pro admin configurar em <code className="bg-muted px-1 rounded">Configurações → Equipe → Membros</code>.<br/>
                Depois você volta aqui pra escanear o QR Code.
              </p>
              <Button variant="outline" onClick={() => setShowSetup(true)}>
                <Plus className="h-4 w-4 mr-2" /> Configurar manualmente
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                  1. Acesse <strong>devices.wavoip.com</strong> e crie um device<br />
                  2. Copie o <strong>token</strong> gerado<br />
                  3. Cole aqui embaixo
                </p>
              </div>
              <div>
                <Label>Nome (opcional)</Label>
                <Input placeholder={`WhatsApp ${teamMember?.name}`} value={deviceName} onChange={(e) => setDeviceName(e.target.value)} />
              </div>
              <div>
                <Label>Token WaVoIP</Label>
                <Input type="password" placeholder="Cole o token aqui" value={token} onChange={(e) => setToken(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createDevice.isPending} className="flex-1">
                  {createDevice.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                  Salvar
                </Button>
                <Button variant="outline" onClick={() => setShowSetup(false)}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isConnected ? "bg-green-100 dark:bg-green-950" : "bg-yellow-100 dark:bg-yellow-950")}>
              <Phone className={cn("h-5 w-5", isConnected ? "text-green-600" : "text-yellow-600")} />
            </div>
            <div>
              <CardTitle className="text-base">Suas Ligações</CardTitle>
              <CardDescription>{dbDevice.name || "WaVoIP"} — vinculado a você</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={cn(isConnected ? "bg-green-500" : "bg-yellow-500")}>
              {isConnected ? <><Wifi className="h-3 w-3 mr-1" /> Conectado</> : <><WifiOff className="h-3 w-3 mr-1" /> Desconectado</>}
            </Badge>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Token */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Token:</span>
          <code className="bg-muted px-2 py-0.5 rounded text-xs font-mono">
            {showToken ? dbDevice.token : dbDevice.token?.substring(0, 8) + "..."}
          </code>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowToken(!showToken)}>
            {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
          </Button>
        </div>

        {/* Ações */}
        <div className="flex gap-2">
          {!isConnected ? (
            <Button onClick={connectWavoip} className="flex-1">
              <Wifi className="h-4 w-4 mr-2" /> Conectar
            </Button>
          ) : (
            <Button variant="outline" onClick={disconnectWavoip} className="flex-1">
              <WifiOff className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          )}
          <Button variant="destructive" size="icon" onClick={handleDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {isConnected && (
          <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
            <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Pronto pra fazer e receber ligações
            </p>
          </div>
        )}

        {!isConnected && dbDevice.token && (
          <div className="space-y-3">
            <div className="p-3 bg-yellow-50 dark:bg-yellow-950/30 rounded-lg border border-yellow-200 dark:border-yellow-900">
              <p className="text-sm text-yellow-700 dark:text-yellow-400">
                Escaneie o QR Code abaixo no seu celular pra vincular o WhatsApp.
              </p>
            </div>
            <div className="flex justify-center p-2 bg-white rounded-lg border overflow-hidden">
              <iframe
                src={`https://devices.wavoip.com/${dbDevice.token}/whatsapp/qr-image`}
                className="w-72 h-72 border-0"
                title="QR Code WaVoIP"
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">
              Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ========== API Oficial (Cloud API) + Templates ==========
function CloudAPISection() {
  const { toast } = useToast();
  const [instance, setInstance] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', body: '', category: 'UTILITY' });
  const [showAllTemplates, setShowAllTemplates] = useState(false);

  const fetchData = useCallback(async () => {
    // Buscar instância Cloud API
    const { data: inst } = await supabase
      .from('whatsapp_instances')
      .select('*')
      .eq('metadata->>type', 'cloud_api')
      .limit(1)
      .maybeSingle();
    setInstance(inst);

    // Buscar templates
    const { data: tpls } = await supabase
      .from('whatsapp_templates')
      .select('*')
      .order('name');
    setTemplates(tpls || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const syncTemplates = async () => {
    if (!instance) return;
    setSyncing(true);
    try {
      // Buscar token da instância
      const token = instance.api_key;
      const waba_id = instance.metadata?.business_account_id;
      if (!token || !waba_id) throw new Error('Token ou WABA ID não configurado');

      const res = await fetch(
        `https://graph.facebook.com/v22.0/${waba_id}/message_templates?fields=name,status,components,language,category&limit=100`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);

      const metaTemplates = data.data || [];
      let synced = 0;

      for (const t of metaTemplates) {
        const bodyComp = t.components?.find((c: any) => c.type === 'BODY');
        const buttonComp = t.components?.find((c: any) => c.type === 'BUTTONS');
        const headerComp = t.components?.find((c: any) => c.type === 'HEADER');

        // Checar se já existe como 'platform' pra não sobrescrever source
        const { data: existing } = await supabase
          .from('whatsapp_templates')
          .select('source')
          .eq('meta_template_id', t.id)
          .maybeSingle();

        await supabase.from('whatsapp_templates').upsert({
          meta_template_id: t.id,
          name: t.name,
          status: t.status,
          category: t.category,
          language: t.language || 'pt_BR',
          body_text: bodyComp?.text || '',
          header_type: headerComp?.format || null,
          header_text: headerComp?.text || null,
          buttons: buttonComp?.buttons || [],
          components: t.components || [],
          instance_id: instance.id,
          source: existing?.source === 'platform' ? 'platform' : 'meta_sync',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'meta_template_id' });
        synced++;
      }

      toast({ title: `${synced} templates sincronizados!` });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao sincronizar', description: err.message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const createTemplate = async () => {
    if (!instance || !newTemplate.name.trim() || !newTemplate.body.trim()) return;
    setCreating(true);
    try {
      const token = instance.api_key;
      const waba_id = instance.metadata?.business_account_id;

      // Detectar variáveis {{1}}, {{2}} etc no body
      const varMatches = newTemplate.body.match(/\{\{\d+\}\}/g) || [];
      const uniqueVars = [...new Set(varMatches)];
      const exampleValues = uniqueVars.map((_, i) => i === 0 ? 'João' : `Exemplo ${i + 1}`);

      const bodyComponent: any = {
        type: 'BODY',
        text: newTemplate.body,
      };
      if (uniqueVars.length > 0) {
        bodyComponent.example = { body_text: [exampleValues] };
      }

      const components: any[] = [bodyComponent];

      // Marketing templates exigem botão de opt-out no Meta
      if (newTemplate.category === 'MARKETING') {
        components.push({
          type: 'BUTTONS',
          buttons: [{ type: 'QUICK_REPLY', text: 'Parar promoções' }],
        });
      }

      const res = await fetch(
        `https://graph.facebook.com/v22.0/${waba_id}/message_templates`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: newTemplate.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
            language: 'pt_BR',
            category: newTemplate.category,
            components,
          }),
        }
      );
      const data = await res.json();
      console.log('[CreateTemplate] Response:', JSON.stringify(data));
      console.log('[CreateTemplate] WABA ID:', waba_id, '| Name:', newTemplate.name, '| Category:', newTemplate.category);
      if (data.error) {
        // Traduzir erros comuns do Meta
        const userMsg = data.error.error_user_msg || data.error.message;
        const translations: Record<string, string> = {
          'As variáveis não podem estar no início ou no fim do modelo.': 'A mensagem não pode começar nem terminar com variável (ex: {{1}}). Coloque texto antes e depois.',
        };
        const translated = translations[userMsg] || userMsg;
        throw new Error(translated);
      }

      // Salvar na tabela local
      await supabase.from('whatsapp_templates').insert({
        meta_template_id: data.id,
        name: newTemplate.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        status: data.status || 'PENDING',
        category: newTemplate.category,
        language: 'pt_BR',
        body_text: newTemplate.body,
        buttons: [],
        components,
        instance_id: instance.id,
        source: 'platform',
      });

      toast({ title: 'Template criado!', description: 'Aguardando aprovação do Meta (pode levar até 24h).' });
      setShowCreateDialog(false);
      setNewTemplate({ name: '', body: '', category: 'UTILITY' });
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erro ao criar template', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  };

  if (loading) return <Card><CardContent className="p-6 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></CardContent></Card>;
  if (!instance) return null;

  const statusColors: Record<string, string> = {
    APPROVED: 'text-green-600 border-green-300 bg-green-50',
    PENDING: 'text-amber-600 border-amber-300 bg-amber-50',
    REJECTED: 'text-red-600 border-red-300 bg-red-50',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-green-500" />
            <div>
              <CardTitle className="text-base">API Oficial (Cloud API)</CardTitle>
              <CardDescription>{instance.name} • {instance.metadata?.phone_number || ''}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-300">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Ativa
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Templates ({showAllTemplates ? templates.length : templates.filter(t => t.source === 'platform').length})
          </h3>
          <div className="flex gap-2">
            <Button
              variant={showAllTemplates ? "default" : "outline"}
              size="sm"
              onClick={() => setShowAllTemplates(!showAllTemplates)}
              className="text-xs"
            >
              {showAllTemplates ? 'Mostrar meus' : 'Ver todos'}
            </Button>
            <Button variant="outline" size="sm" onClick={syncTemplates} disabled={syncing}>
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
              Sincronizar
            </Button>
            <Button size="sm" onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Criar Template
            </Button>
          </div>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhum template. Clique em "Sincronizar" pra buscar do Meta ou "Criar Template" pra criar novo.
          </div>
        ) : (
          <div className="space-y-2">
            {(showAllTemplates ? templates : templates.filter(t => t.source === 'platform')).map((t) => (
              <div key={t.id} className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{t.name.replace(/_/g, ' ')}</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={cn('text-[10px]', statusColors[t.status] || '')}>
                      {t.status === 'APPROVED' && <Check className="h-2.5 w-2.5 mr-0.5" />}
                      {t.status === 'PENDING' && <Clock className="h-2.5 w-2.5 mr-0.5" />}
                      {t.status === 'REJECTED' && <XCircle className="h-2.5 w-2.5 mr-0.5" />}
                      {t.status}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">{t.category}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-line">{t.body_text}</p>
                {t.buttons && t.buttons.length > 0 && (
                  <div className="flex gap-1 mt-1.5">
                    {t.buttons.map((b: any, i: number) => (
                      <Badge key={i} variant="secondary" className="text-[10px]">{b.text}</Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Dialog criar template */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Criar Template</DialogTitle>
              <DialogDescription>
                O template será enviado pro Meta pra aprovação. Pode levar até 24h.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Nome (sem espaço, só letras e _)</Label>
                <Input
                  value={newTemplate.name}
                  onChange={(e) => setNewTemplate(p => ({ ...p, name: e.target.value }))}
                  placeholder="follow_up_qualificacao"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <select
                  value={newTemplate.category}
                  onChange={(e) => setNewTemplate(p => ({ ...p, category: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="UTILITY">Utility (transacional)</option>
                  <option value="MARKETING">Marketing (promocional)</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Texto (use {'{{1}}'} pro nome do lead)</Label>
                <Textarea
                  value={newTemplate.body}
                  onChange={(e) => setNewTemplate(p => ({ ...p, body: e.target.value }))}
                  placeholder={"Opa {{1}}.. tudo bem?\n\nVi que a gente tava conversando e queria retomar..."}
                  className="mt-1 min-h-[100px]"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Preview: {(newTemplate.body || '').replace(/\{\{1\}\}/g, 'João')}
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancelar</Button>
              <Button onClick={createTemplate} disabled={creating || !newTemplate.name.trim() || !newTemplate.body.trim()}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Send className="h-4 w-4 mr-1" />}
                Submeter pra Aprovação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ========== Página Principal ==========
export default function MyWhatsApp() {
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Meu WhatsApp</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas conexões de mensagens e ligações</p>
        </div>

        <CloudAPISection />
        <MessagingSection />
        <CallingSection />
      </div>
    </AppLayout>
  );
}
