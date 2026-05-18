import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCreateScheduledMessage, useScheduledMessages, useCancelScheduledMessage, type ScheduledMessage } from "@/hooks/useScheduledMessages";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Clock, Send, Trash2, CheckCircle2, XCircle, AlertCircle, Loader2, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

interface ScheduleMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  leadPhone: string;
  instanceId?: string | null;
}

function formatScheduledDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}

const statusConfig: Record<string, { icon: React.ElementType; label: string; className: string }> = {
  pending: { icon: Clock, label: "Pendente", className: "bg-amber-100 text-amber-700" },
  sent: { icon: CheckCircle2, label: "Enviada", className: "bg-emerald-100 text-emerald-700" },
  failed: { icon: AlertCircle, label: "Falhou", className: "bg-red-100 text-red-700" },
  cancelled: { icon: XCircle, label: "Cancelada", className: "bg-gray-100 text-gray-700" },
};

export function ScheduleMessageModal({
  open,
  onOpenChange,
  leadId,
  leadName,
  leadPhone,
  instanceId,
}: ScheduleMessageModalProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const createMessage = useCreateScheduledMessage();
  const cancelMessage = useCancelScheduledMessage(leadId);
  const { data: scheduledMessages = [] } = useScheduledMessages(leadId);

  // Default to tomorrow 8:00 BRT
  const getDefaultDateTime = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(8, 0, 0, 0);
    // Format for datetime-local input (YYYY-MM-DDTHH:MM)
    const y = tomorrow.getFullYear();
    const m = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const d = String(tomorrow.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}T08:00`;
  };

  const [content, setContent] = useState("");
  const [scheduledAt, setScheduledAt] = useState(getDefaultDateTime);
  const [autoUnpauseAgent, setAutoUnpauseAgent] = useState(true);
  // Key para forçar re-render do form após agendamento
  const [formKey, setFormKey] = useState(0);

  const handleSchedule = async () => {
    if (!content.trim()) {
      toast({ title: "Escreva a mensagem", variant: "destructive" });
      return;
    }
    if (!scheduledAt) {
      toast({ title: "Selecione data/hora", variant: "destructive" });
      return;
    }

    // Convert local datetime to ISO (the input is local timezone)
    const localDate = new Date(scheduledAt);
    if (localDate <= new Date()) {
      toast({ title: "Data deve ser no futuro", variant: "destructive" });
      return;
    }

    try {
      await createMessage.mutateAsync({
        lead_id: leadId,
        phone: leadPhone,
        content: content.trim(),
        scheduled_at: localDate.toISOString(),
        instance_id: instanceId || null,
        created_by: user?.id || null,
        metadata: { auto_unpause_agent: autoUnpauseAgent },
      });

      toast({ title: "Mensagem agendada!" });
      // Reset completo do form
      setContent("");
      setScheduledAt(getDefaultDateTime());
      setFormKey(k => k + 1);
    } catch (error: any) {
      toast({ title: "Erro ao agendar", description: error.message, variant: "destructive" });
    }
  };

  const handleCancel = async (msgId: string) => {
    try {
      await cancelMessage.mutateAsync(msgId);
    } catch {
      toast({ title: "Erro ao cancelar", variant: "destructive" });
    }
  };

  const pendingMessages = scheduledMessages.filter((m) => m.status === "pending");
  const pastMessages = scheduledMessages.filter((m) => m.status !== "pending").slice(0, 5);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Agendar Mensagem
          </DialogTitle>
          <DialogDescription>
            Programe uma mensagem WhatsApp para {leadName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4" key={formKey}>
          {/* Datetime picker */}
          <div className="space-y-2">
            <Label>Data e Hora</Label>
            <Input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="h-9"
            />
          </div>

          {/* Message */}
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              placeholder={`Olá ${leadName.split(" ")[0]}, ...`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              {content.length} caracteres
            </p>
          </div>

          {/* Auto-unpause agent toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-violet-500" />
              <div>
                <p className="text-sm font-medium">Ativar agente IA após envio</p>
                <p className="text-xs text-muted-foreground">O agente assume o follow-up automaticamente</p>
              </div>
            </div>
            <Switch
              checked={autoUnpauseAgent}
              onCheckedChange={setAutoUnpauseAgent}
            />
          </div>

          {/* Pending messages */}
          {pendingMessages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Agendadas ({pendingMessages.length})</Label>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {pendingMessages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} onCancel={handleCancel} />
                ))}
              </div>
            </div>
          )}

          {/* Past messages */}
          {pastMessages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Histórico</Label>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {pastMessages.map((msg) => (
                  <MessageRow key={msg.id} msg={msg} />
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
          <Button
            onClick={handleSchedule}
            disabled={createMessage.isPending || !content.trim()}
          >
            {createMessage.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Agendar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageRow({ msg, onCancel }: { msg: ScheduledMessage; onCancel?: (id: string) => void }) {
  const config = statusConfig[msg.status] || statusConfig.pending;
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-2 p-2 rounded-md border bg-muted/30 text-sm">
      <Badge variant="secondary" className={cn("text-[10px] px-1.5 py-0 shrink-0 mt-0.5", config.className)}>
        <Icon className="h-3 w-3 mr-0.5" />
        {config.label}
      </Badge>
      <div className="flex-1 min-w-0 overflow-hidden">
        <p className="text-xs text-muted-foreground">{formatScheduledDate(msg.scheduled_at)}</p>
        <p className="text-xs line-clamp-2 break-all">{msg.content}</p>
        {msg.error_message && (
          <p className="text-[10px] text-red-500 mt-0.5">{msg.error_message}</p>
        )}
      </div>
      {msg.status === "pending" && onCancel && (
        <button
          onClick={() => onCancel(msg.id)}
          className="text-muted-foreground hover:text-red-500 transition-colors shrink-0"
          title="Cancelar"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
