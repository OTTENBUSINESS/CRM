import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";

export function GoogleCalendarSection() {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);
  const [isCalendarConnected, setIsCalendarConnected] = useState(
    teamMember?.google_calendar_connected || false
  );
  const [isSyncingCalendar, setIsSyncingCalendar] = useState(false);
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  const GOOGLE_REDIRECT_URI = `${window.location.origin}/configuracoes`;
  const GOOGLE_SCOPES =
    "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/calendar.events";

  // Load Google Client ID from config table
  useEffect(() => {
    const loadClientId = async () => {
      try {
        const { data } = await supabase
          .from("config")
          .select("value")
          .eq("key", "GOOGLE_CLIENT_ID")
          .maybeSingle();
        setGoogleClientId(data?.value || null);
      } catch {
        setGoogleClientId(null);
      } finally {
        setLoadingConfig(false);
      }
    };
    loadClientId();
  }, []);

  useEffect(() => {
    const handleOAuthCallback = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");
      if (code && teamMember) {
        window.history.replaceState({}, document.title, "/configuracoes?s=google-calendar");
        try {
          const { data: result, error: invokeError } = await supabase.functions.invoke(
            "google-oauth-callback",
            {
              body: {
                code,
                redirect_uri: GOOGLE_REDIRECT_URI,
                team_member_id: teamMember.id,
              },
            }
          );
          if (invokeError) throw invokeError;
          if (result.success) {
            setIsCalendarConnected(true);
            toast({ title: "Google Calendar conectado! 🎉" });
          } else {
            toast({
              title: "Erro ao conectar",
              description: result.error || "Falha ao obter tokens do Google",
              variant: "destructive",
            });
          }
        } catch {
          toast({
            title: "Erro ao conectar",
            description: "Falha na comunicação com o servidor",
            variant: "destructive",
          });
        }
      }
    };
    handleOAuthCallback();
  }, [teamMember]);

  useEffect(() => {
    if (teamMember?.google_calendar_connected) {
      setIsCalendarConnected(true);
    }
  }, [teamMember]);

  const handleConnectGoogle = () => {
    if (!googleClientId) {
      toast({
        title: "Google Client ID não configurado",
        description: "Vá em Configurações → Chaves de API e configure o Google Client ID primeiro.",
        variant: "destructive",
      });
      return;
    }
    const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authUrl.searchParams.set("client_id", googleClientId);
    authUrl.searchParams.set("redirect_uri", GOOGLE_REDIRECT_URI);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("scope", GOOGLE_SCOPES);
    authUrl.searchParams.set("access_type", "offline");
    authUrl.searchParams.set("prompt", "consent");
    window.location.href = authUrl.toString();
  };

  const handleDisconnectGoogle = async () => {
    try {
      if (!teamMember) return;
      await (supabase as any)
        .from("team_members")
        .update({
          google_access_token: null,
          google_refresh_token: null,
          google_token_expires_at: null,
          google_calendar_connected: false,
        })
        .eq("id", teamMember.id);
      toast({ title: "Google Calendar desconectado" });
      window.location.reload();
    } catch {
      toast({ title: "Erro ao desconectar", variant: "destructive" });
    }
  };

  const handleSetupCalendarSync = async () => {
    if (!teamMember) return;
    setIsSyncingCalendar(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "setup-calendar-watch",
        { body: { team_member_id: teamMember.id, action: "setup" } }
      );
      if (invokeError) throw invokeError;
      if (result.success) {
        toast({
          title: "Sincronização ativada! 🎉",
          description: `${result.initialSync?.stats?.created || 0} eventos importados`,
        });
        window.location.reload();
      } else {
        toast({ title: "Erro ao ativar sincronização", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao ativar sincronização", variant: "destructive" });
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleStopCalendarSync = async () => {
    if (!teamMember) return;
    setIsSyncingCalendar(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "setup-calendar-watch",
        { body: { team_member_id: teamMember.id, action: "stop" } }
      );
      if (invokeError) throw invokeError;
      if (result.success) {
        toast({ title: "Sincronização desativada" });
        window.location.reload();
      } else {
        toast({ title: "Erro ao desativar", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro ao desativar sincronização", variant: "destructive" });
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  const handleManualSync = async () => {
    if (!teamMember) return;
    setIsSyncingCalendar(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke(
        "sync-google-calendar",
        { body: { team_member_id: teamMember.id, full_sync: false } }
      );
      if (invokeError) throw invokeError;
      if (result.success) {
        toast({ title: "Sincronização concluída! ✅", description: result.message });
      } else {
        toast({ title: "Erro na sincronização", description: result.error, variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro na sincronização", variant: "destructive" });
    } finally {
      setIsSyncingCalendar(false);
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Warning if Google Client ID is not configured */}
      {!googleClientId && !isCalendarConnected && (
        <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-foreground font-medium">Google Client ID não configurado</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Para usar o Google Calendar, primeiro configure o <strong>Google Client ID</strong> e o <strong>Google Client Secret</strong> em{" "}
              <a
                href="/configuracoes?s=api-keys"
                className="underline hover:text-foreground"
              >
                Integrações → Chaves de API
              </a>.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-full ${
                  isCalendarConnected ? "bg-green-500/10" : "bg-gray-500/10"
                }`}
              >
                {isCalendarConnected ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : (
                  <XCircle className="h-5 w-5 text-gray-500" />
                )}
              </div>
              <div>
                <p className="font-medium">
                  {isCalendarConnected ? "Conectado" : "Não conectado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isCalendarConnected
                    ? "Seu Google Calendar está integrado"
                    : "Conecte para agendar reuniões automaticamente"}
                </p>
              </div>
            </div>
            {isCalendarConnected ? (
              <Button variant="outline" onClick={handleDisconnectGoogle}>
                Desconectar
              </Button>
            ) : (
              <Button onClick={handleConnectGoogle} disabled={isConnectingGoogle}>
                {isConnectingGoogle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar Google
              </Button>
            )}
          </div>

          {isCalendarConnected && (
            <>
              <div className="text-sm text-muted-foreground space-y-1">
                <p>✅ Criar eventos no Google Calendar</p>
                <p>✅ Gerar links do Google Meet automaticamente</p>
                <p>✅ Enviar convites para participantes</p>
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Sincronização Automática</p>
                    <p className="text-sm text-muted-foreground">
                      Eventos do Google Calendar aparecem nas suas tarefas
                    </p>
                  </div>
                  <Badge
                    variant={
                      (teamMember as any)?.google_calendar_watch_channel_id
                        ? "default"
                        : "secondary"
                    }
                  >
                    {(teamMember as any)?.google_calendar_watch_channel_id
                      ? "Ativo"
                      : "Inativo"}
                  </Badge>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant={
                      (teamMember as any)?.google_calendar_watch_channel_id
                        ? "outline"
                        : "default"
                    }
                    size="sm"
                    onClick={handleSetupCalendarSync}
                    disabled={isSyncingCalendar}
                  >
                    {isSyncingCalendar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {(teamMember as any)?.google_calendar_watch_channel_id
                      ? "Reconfigurar Sync"
                      : "Ativar Sincronização"}
                  </Button>

                  {(teamMember as any)?.google_calendar_watch_channel_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleStopCalendarSync}
                      disabled={isSyncingCalendar}
                    >
                      Desativar
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleManualSync}
                    disabled={isSyncingCalendar}
                  >
                    {isSyncingCalendar && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Sincronizar Agora
                  </Button>
                </div>

                {(teamMember as any)?.google_calendar_watch_expiration && (
                  <p className="text-xs text-muted-foreground">
                    Sincronização ativa até:{" "}
                    {new Date(
                      (teamMember as any).google_calendar_watch_expiration
                    ).toLocaleDateString("pt-BR")}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
