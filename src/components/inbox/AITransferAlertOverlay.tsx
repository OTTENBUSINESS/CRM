import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { X, UserCheck, MessageSquare, User, Phone, Building2, ExternalLink } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { isCallModeActive } from "@/hooks/useNotifications";
import { isNotificationsMuted } from "@/lib/notification-mute";

interface TransferAlert {
  id: string;
  lead_id: string;
  lead_name: string;
  lead_phone?: string | null;
  lead_company?: string | null;
  reason: string;
  transferred_at: string;
}

const DISMISSED_KEY = "ai_transfer_alert_dismissed";

const getDismissed = (): Record<string, number> => {
  try {
    const stored = localStorage.getItem(DISMISSED_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
};

const saveDismissed = (id: string) => {
  try {
    const dismissed = getDismissed();
    dismissed[id] = Date.now();
    const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
    Object.keys(dismissed).forEach((k) => {
      if (dismissed[k] < oneDayAgo) delete dismissed[k];
    });
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissed));
  } catch {}
};

const isDismissed = (id: string): boolean => {
  const dismissed = getDismissed();
  const at = dismissed[id];
  if (!at) return false;
  return at > Date.now() - 24 * 60 * 60 * 1000;
};

const NOTIFICATION_SOUND_URL = "https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3";

function playSound() {
  if (isCallModeActive() || isNotificationsMuted()) return;
  try {
    const audio = new Audio(NOTIFICATION_SOUND_URL);
    audio.volume = 0.6;
    audio.play().catch(() => {});
  } catch {}
}

export function AITransferAlertOverlay() {
  const { user, teamMember } = useAuth();
  const navigate = useNavigate();
  const [alerts, setAlerts] = useState<TransferAlert[]>([]);
  const processedIdsRef = useRef<Set<string>>(new Set());

  // Check for recent transfers on mount + periodically
  const checkRecentTransfers = useCallback(async () => {
    if (!user || !teamMember) return;

    try {
      // Buscar conversas transferidas nas últimas 2 horas
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

      const { data: transfers, error } = await supabase
        .from("ai_agent_conversations")
        .select(`
          id,
          lead_id,
          status,
          updated_at,
          metadata,
          lead:leads!ai_agent_conversations_lead_id_fkey(id, name, phone, company_name, sales_rep_id)
        `)
        .eq("status", "transferred")
        .gte("updated_at", twoHoursAgo)
        .order("updated_at", { ascending: false });

      if (error || !transfers) return;

      // Filtrar: só alertar se o lead é meu (sales_rep_id)
      const myId = teamMember.id;

      const relevantTransfers = transfers.filter((t: any) => {
        if (isDismissed(t.id)) return false;
        if (processedIdsRef.current.has(t.id)) return false;
        const lead = t.lead;
        if (!lead) return false;
        return lead.sales_rep_id === myId;
      });

      if (relevantTransfers.length > 0) {
        const newAlerts: TransferAlert[] = relevantTransfers.map((t: any) => ({
          id: t.id,
          lead_id: t.lead_id,
          lead_name: t.lead?.name || "Lead",
          lead_phone: t.lead?.phone,
          lead_company: t.lead?.company_name,
          reason: t.metadata?.transfer_reason || "Solicitou atendimento humano",
          transferred_at: t.updated_at,
        }));

        setAlerts((prev) => {
          const existingIds = new Set(prev.map((a) => a.id));
          const onlyNew = newAlerts.filter((a) => !existingIds.has(a.id));
          return [...onlyNew, ...prev];
        });
      }
    } catch (err) {
      console.error("[AITransferAlert] Error checking transfers:", err);
    }
  }, [user, teamMember]);

  // Initial check
  useEffect(() => {
    if (!user) return;
    checkRecentTransfers();
    const interval = setInterval(checkRecentTransfers, 60000); // check every 60s
    return () => clearInterval(interval);
  }, [user, checkRecentTransfers]);

  // Real-time listener for new transfers
  useEffect(() => {
    if (!user || !teamMember) return;

    const channel = supabase
      .channel("ai-transfer-alerts")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "ai_agent_conversations",
        },
        async (payload) => {
          const newRecord = payload.new as any;
          const oldRecord = payload.old as any;

          // Só interessa quando status muda para "transferred"
          if (newRecord.status !== "transferred" || oldRecord.status === "transferred") return;
          if (isDismissed(newRecord.id)) return;
          if (processedIdsRef.current.has(newRecord.id)) return;

          // Buscar dados do lead
          const { data: lead } = await supabase
            .from("leads")
            .select("id, name, phone, company_name, sales_rep_id")
            .eq("id", newRecord.lead_id)
            .single();

          if (!lead) return;

          // Só alertar o vendedor responsável
          const myId = teamMember.id;
          if (lead.sales_rep_id !== myId) return;

          processedIdsRef.current.add(newRecord.id);

          const alert: TransferAlert = {
            id: newRecord.id,
            lead_id: newRecord.lead_id,
            lead_name: lead.name || "Lead",
            lead_phone: lead.phone,
            lead_company: lead.company_name,
            reason: newRecord.metadata?.transfer_reason || "Solicitou atendimento humano",
            transferred_at: newRecord.updated_at,
          };

          setAlerts((prev) => [alert, ...prev]);
          playSound();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, teamMember]);

  const handleDismiss = (id: string) => {
    saveDismissed(id);
    processedIdsRef.current.add(id);
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  const handleGoToConversation = (alert: TransferAlert) => {
    handleDismiss(alert.id);
    navigate(`/comercial/inbox?lead=${alert.lead_id}`);
  };

  // Show only the most recent alert
  const currentAlert = alerts[0];
  if (!currentAlert) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-20 pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md mx-4 rounded-xl shadow-2xl border-2 overflow-hidden animate-in slide-in-from-top-5 duration-500 bg-blue-50 border-blue-400">
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between bg-blue-500">
          <div className="flex items-center gap-2 text-white">
            <UserCheck className="h-5 w-5 animate-pulse" />
            <span className="font-bold text-lg">
              Conversa transferida para Humano!
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white hover:bg-white/20"
            onClick={() => handleDismiss(currentAlert.id)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div className="text-center">
            <div className="text-xl font-bold text-blue-700">
              O agente IA transferiu uma conversa
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              O lead precisa de atendimento humano
            </div>
          </div>

          {/* Lead details */}
          <div className="bg-white rounded-lg p-3 border space-y-2">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <User className="h-6 w-6 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-foreground text-lg">
                  {currentAlert.lead_name}
                </div>
                {currentAlert.lead_company && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {currentAlert.lead_company}
                  </div>
                )}
                {currentAlert.lead_phone && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {currentAlert.lead_phone}
                  </div>
                )}
              </div>
            </div>

            {/* Reason */}
            <div className="pt-2 border-t">
              <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Motivo da transferência</div>
              <div className="text-sm text-foreground bg-blue-50 p-2 rounded">
                {currentAlert.reason}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              className="flex-1 gap-2 bg-blue-600 hover:bg-blue-700"
              onClick={() => handleGoToConversation(currentAlert)}
            >
              <MessageSquare className="h-4 w-4" />
              Abrir Conversa
            </Button>
            <Button
              variant="outline"
              className="flex-1 gap-2"
              onClick={() => {
                handleDismiss(currentAlert.id);
                navigate(`/comercial/leads/${currentAlert.lead_id}?from=inbox`);
              }}
            >
              <User className="h-4 w-4" />
              Ver Lead
            </Button>
          </div>

          {/* Dismiss + count */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleDismiss(currentAlert.id)}
            >
              Entendi, pode fechar
            </Button>
            {alerts.length > 1 && (
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                +{alerts.length - 1} pendente{alerts.length > 2 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
