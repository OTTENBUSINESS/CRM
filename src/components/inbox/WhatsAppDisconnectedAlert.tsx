import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { WifiOff, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { isCallModeActive } from "@/hooks/useNotifications";

const ALERT_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

interface DisconnectedInstance {
  id: string;
  name: string;
}

/**
 * Alerta global de WhatsApp desconectado.
 * - Badge piscando no header: TODOS os usuários veem se QUALQUER instância está offline
 * - Modal urgente: só abre pro dono da instância (quem tem ela vinculada)
 */
export function WhatsAppDisconnectedAlert() {
  const { teamMember } = useAuth();
  const [disconnectedInstances, setDisconnectedInstances] = useState<DisconnectedInstance[]>([]);
  const [showModal, setShowModal] = useState(false);
  const lastMyStatusRef = useRef<string | null>(null);
  const soundPlayedRef = useRef(false);

  const myInstanceId = teamMember?.whatsapp_instance_id;

  const checkAllInstances = useCallback(async () => {
    try {
      const { data } = await supabase
        .from("whatsapp_instances")
        .select("id, name, status, metadata")
        .neq("status", "connected");

      const offline = (data || [])
        .filter((i: any) => i.status !== "connected" && !i.metadata?.disabled && i.metadata?.type !== "cloud_api")
        .map((i: any) => ({ id: i.id, name: i.name || i.id }));

      setDisconnectedInstances(offline);

      // Modal + som só pro dono da instância na transição
      if (myInstanceId) {
        const myIsOffline = offline.some((i) => i.id === myInstanceId);
        if (myIsOffline && lastMyStatusRef.current === "connected") {
          setShowModal(true);
          if (!soundPlayedRef.current && !isCallModeActive()) {
            soundPlayedRef.current = true;
            try {
              const audio = new Audio(ALERT_SOUND_URL);
              audio.volume = 0.7;
              audio.play().catch(() => {});
            } catch {}
          }
        }
        if (!myIsOffline) {
          soundPlayedRef.current = false;
        }
        lastMyStatusRef.current = myIsOffline ? "disconnected" : "connected";
      }
    } catch {}
  }, [myInstanceId]);

  // Check inicial + polling a cada 30s
  useEffect(() => {
    checkAllInstances();
    const interval = setInterval(checkAllInstances, 30000);
    return () => clearInterval(interval);
  }, [checkAllInstances]);

  // Realtime: escutar mudanças em QUALQUER instância
  useEffect(() => {
    const channel = supabase
      .channel("global-wa-all-instances-status")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "whatsapp_instances",
        },
        () => checkAllInstances()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [checkAllInstances]);

  if (disconnectedInstances.length === 0) return null;

  const isMyInstanceOffline = myInstanceId
    ? disconnectedInstances.some((i) => i.id === myInstanceId)
    : false;

  return (
    <>
      {/* Badge piscando no header — TODOS os usuários veem */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer",
          "bg-red-600 text-white animate-pulse shadow-lg",
          "hover:bg-red-700 transition-colors"
        )}
        onClick={() => setShowModal(true)}
        title={`${disconnectedInstances.length} instância(s) desconectada(s): ${disconnectedInstances.map(i => i.name).join(", ")}`}
      >
        <WifiOff className="h-4 w-4" />
        <span className="text-xs font-bold whitespace-nowrap">
          {disconnectedInstances.length === 1
            ? `${disconnectedInstances[0].name} Offline`
            : `${disconnectedInstances.length} Instâncias Offline`}
        </span>
      </div>

      {/* Modal com detalhes */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <WifiOff className="h-6 w-6 animate-pulse" />
              WhatsApp Desconectado!
            </DialogTitle>
            <DialogDescription asChild>
              <div className="pt-4 space-y-4">
                {/* Lista de instâncias offline */}
                <div className="space-y-2">
                  {disconnectedInstances.map((inst) => (
                    <div
                      key={inst.id}
                      className={cn(
                        "flex items-center gap-2 p-3 rounded-lg border",
                        inst.id === myInstanceId
                          ? "bg-red-50 border-red-300"
                          : "bg-gray-50 border-gray-200"
                      )}
                    >
                      <div className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
                      <span className="font-medium text-sm text-foreground">{inst.name}</span>
                      {inst.id === myInstanceId && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium ml-auto">
                          Sua instância
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <p className="text-red-800 font-bold text-base mb-2">
                    Impacto IMEDIATO:
                  </p>
                  <ul className="text-sm text-red-700 space-y-1.5">
                    <li>- Mensagens do agente IA <strong>NÃO estão sendo enviadas</strong></li>
                    <li>- Novas mensagens de leads <strong>NÃO estão chegando</strong></li>
                    <li>- Cadências e follow-ups <strong>PARADOS</strong></li>
                  </ul>
                </div>

                {isMyInstanceOffline && (
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-amber-800 font-medium">Para reconectar sua instância:</p>
                    <ul className="text-sm text-amber-700 mt-2 space-y-1">
                      <li>1. Clique em <strong>"Reconectar"</strong> abaixo</li>
                      <li>2. Gere um novo QR Code</li>
                      <li>3. Escaneie com o celular</li>
                    </ul>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  O indicador vermelho vai sumir automaticamente quando reconectar.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="outline" onClick={() => setShowModal(false)}>
              Entendi
            </Button>
            {isMyInstanceOffline && (
              <Button
                className="gap-2 bg-red-600 hover:bg-red-700"
                onClick={() => {
                  window.open("/whatsapp", "_blank");
                  setShowModal(false);
                }}
              >
                <ExternalLink className="h-4 w-4" />
                Reconectar Agora
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
