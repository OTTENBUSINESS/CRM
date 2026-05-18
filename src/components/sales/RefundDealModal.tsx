import { useState, useEffect } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDealPayments } from "@/hooks/useDealPayments";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { RotateCcw, AlertTriangle, CreditCard, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface RefundDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: any;
}

const REFUND_REASONS = [
  { value: "cdc_7_dias", label: "CDC 7 dias — arrependimento" },
  { value: "insatisfacao", label: "Insatisfação com o produto" },
  { value: "nao_era_esperado", label: "Não era o que esperava" },
  { value: "financeiro", label: "Problemas financeiros" },
  { value: "concorrente", label: "Migrou pra concorrente" },
  { value: "duplicidade", label: "Cobrança duplicada" },
  { value: "erro_cobranca", label: "Erro na cobrança" },
  { value: "outro", label: "Outro motivo" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

// IDs dos estágios "Reembolso" por pipeline
const REFUND_STAGES: Record<string, string> = {
  "9c21bd06-a898-44a1-88db-ad3c6ec7140c": "2870a135-bce1-4920-9f1e-f8955147fa44", // Closer
  "90b09d81-8282-4503-a869-1787baf8f736": "d39d2ff2-ba59-4e8e-bd70-fbfc6e40f0e6", // Webinário
};

export function RefundDealModal({ open, onOpenChange, deal }: RefundDealModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const queryClient = useQueryClient();
  const { data: payments } = useDealPayments(deal?.id);

  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [refundType, setRefundType] = useState<"total" | "parcial">("total");
  const [refundAmount, setRefundAmount] = useState(0);
  const [cancelPending, setCancelPending] = useState(true);
  const [refundReceived, setRefundReceived] = useState(true);

  const totalReceived = (payments || [])
    .filter((p: any) => p.status === "received" || p.status === "confirmed")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalPending = (payments || [])
    .filter((p: any) => p.status === "pending" || p.status === "link_generated")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalDeal = Number(deal?.negotiated_price) || 0;

  useEffect(() => {
    if (open) {
      setReason("");
      setDetails("");
      setRefundType("total");
      setRefundAmount(totalReceived);
      setCancelPending(true);
      setRefundReceived(true);
    }
  }, [open, totalReceived]);

  const handleRefund = async () => {
    if (!reason) {
      toast({ title: "Selecione o motivo", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      const leadId = deal.lead_id || deal.lead?.id;
      const pipelineId = deal.pipeline_id || deal.pipeline_stage?.pipeline_id;
      const refundStageId = REFUND_STAGES[pipelineId];
      const reasonLabel = REFUND_REASONS.find(r => r.value === reason)?.label || reason;
      const effectiveRefundAmount = refundType === "total" ? totalReceived : refundAmount;

      // 1. Mover deal pra estágio Reembolso
      const dealUpdates: Record<string, any> = {
        status: "lost",
        lost_at: new Date().toISOString(),
        lost_reason: `Reembolso: ${reasonLabel}${details ? ` — ${details}` : ""}`,
        updated_at: new Date().toISOString(),
      };
      if (refundStageId) {
        dealUpdates.pipeline_stage_id = refundStageId;
      }
      await supabase.from("deals").update(dealUpdates).eq("id", deal.id);

      // 2. Cancelar parcelas pendentes
      if (cancelPending && payments) {
        const pendingIds = payments
          .filter((p: any) => p.status === "pending" || p.status === "link_generated")
          .map((p: any) => p.id);
        if (pendingIds.length > 0) {
          await supabase.from("deal_payments").update({ status: "cancelled" }).in("id", pendingIds);
        }
      }

      // 3. Marcar pagamentos recebidos como estornados
      if (refundReceived && payments) {
        const receivedIds = payments
          .filter((p: any) => p.status === "received" || p.status === "confirmed")
          .map((p: any) => p.id);
        if (receivedIds.length > 0) {
          await supabase.from("deal_payments").update({ status: "refunded" }).in("id", receivedIds);
        }
      }

      // 4. Registrar na timeline
      if (leadId) {
        try {
          await supabase.from("company_activities").insert({
            lead_id: leadId,
            team: "sales",
            task_type: "refund",
            name: `💸 Reembolso processado por ${teamMember?.name || "vendedor"}`,
            description: `${deal.title || "Deal"} — ${reasonLabel}. Valor estornado: ${formatCurrency(effectiveRefundAmount)}${cancelPending ? `. ${totalPending > 0 ? `${formatCurrency(totalPending)} em parcelas canceladas` : "Parcelas canceladas"}` : ""}`,
            status: "completed",
            completed: true,
            metadata: {
              deal_id: deal.id,
              deal_title: deal.title,
              reason,
              reason_label: reasonLabel,
              details,
              refund_type: refundType,
              refund_amount: effectiveRefundAmount,
              total_received: totalReceived,
              total_pending: totalPending,
              cancel_pending: cancelPending,
              refund_received: refundReceived,
              processed_by: teamMember?.name,
            },
          });
        } catch { /* silent */ }
      }

      // 5. Sincronizar: se tem organização vinculada, atualizar status
      if (leadId) {
        const { data: org } = await supabase
          .from("organizations")
          .select("id")
          .eq("primary_contact_id", leadId)
          .maybeSingle();
        if (org) {
          await supabase.from("organizations").update({
            notes: `Reembolso em ${new Date().toLocaleDateString("pt-BR")}. Motivo: ${reasonLabel}. Valor: ${formatCurrency(effectiveRefundAmount)}`,
            updated_at: new Date().toISOString(),
          }).eq("id", org.id);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["contact-deals"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["deal-payments"] });
      queryClient.invalidateQueries({ queryKey: ["client-timeline"] });

      toast({ title: "Reembolso processado", description: `${formatCurrency(effectiveRefundAmount)} estornado` });
      onOpenChange(false);
    } catch (error) {
      console.error("Refund error:", error);
      toast({ title: "Erro ao processar reembolso", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!deal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <RotateCcw className="h-5 w-5" />
            Processar Reembolso
          </DialogTitle>
          <DialogDescription>
            {deal.title || "Deal"} — {formatCurrency(totalDeal)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Resumo financeiro */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
              <p className="text-lg font-bold text-green-700">{formatCurrency(totalReceived)}</p>
              <p className="text-[10px] text-green-600">Recebido</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-center">
              <p className="text-lg font-bold text-amber-700">{formatCurrency(totalPending)}</p>
              <p className="text-[10px] text-amber-600">Pendente</p>
            </div>
            <div className="p-3 rounded-lg bg-muted text-center">
              <p className="text-lg font-bold">{payments?.length || 0}</p>
              <p className="text-[10px] text-muted-foreground">Parcelas</p>
            </div>
          </div>

          {/* Motivo */}
          <div className="space-y-2">
            <Label>Motivo do reembolso *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className={cn(!reason && "border-red-300")}>
                <SelectValue placeholder="Selecione o motivo..." />
              </SelectTrigger>
              <SelectContent>
                {REFUND_REASONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo: total ou parcial */}
          <div className="space-y-2">
            <Label>Tipo de reembolso</Label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setRefundType("total"); setRefundAmount(totalReceived); }}
                className={cn("flex-1 p-3 rounded-lg border text-sm font-medium transition-colors",
                  refundType === "total" ? "border-red-500 bg-red-50 text-red-700" : "border-border hover:bg-muted"
                )}
              >
                Total ({formatCurrency(totalReceived)})
              </button>
              <button
                type="button"
                onClick={() => setRefundType("parcial")}
                className={cn("flex-1 p-3 rounded-lg border text-sm font-medium transition-colors",
                  refundType === "parcial" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-border hover:bg-muted"
                )}
              >
                Parcial
              </button>
            </div>
          </div>

          {/* Valor parcial */}
          {refundType === "parcial" && (
            <div className="space-y-2">
              <Label>Valor do reembolso</Label>
              <Input
                type="text"
                inputMode="numeric"
                value={refundAmount ? formatCurrency(refundAmount) : ""}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d]/g, "");
                  setRefundAmount(Number(raw) / 100);
                }}
                placeholder="R$ 0,00"
                className="text-lg font-bold h-12 text-center"
              />
            </div>
          )}

          {/* Ações nos pagamentos */}
          <div className="space-y-3">
            {totalPending > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm">Cancelar parcelas pendentes?</Label>
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(totalPending)} em parcelas abertas</p>
                </div>
                <Switch checked={cancelPending} onCheckedChange={setCancelPending} />
              </div>
            )}

            {totalReceived > 0 && (
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div>
                  <Label className="text-sm">Marcar recebidos como estornados?</Label>
                  <p className="text-[10px] text-muted-foreground">{formatCurrency(totalReceived)} já recebidos</p>
                </div>
                <Switch checked={refundReceived} onCheckedChange={setRefundReceived} />
              </div>
            )}
          </div>

          {/* Detalhes */}
          <div className="space-y-2">
            <Label>Detalhes / observações</Label>
            <Textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Ex: Cliente solicitou reembolso dentro do prazo CDC. Não utilizou a plataforma..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Alerta de confirmação */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-xs space-y-1">
              <p className="font-semibold">Esta ação vai:</p>
              <p>• Mover deal pra estágio "Reembolso"</p>
              {cancelPending && totalPending > 0 && <p>• Cancelar {formatCurrency(totalPending)} em parcelas pendentes</p>}
              {refundReceived && totalReceived > 0 && <p>• Marcar {formatCurrency(totalReceived)} como estornado</p>}
              <p>• Registrar na timeline com seu nome</p>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            onClick={handleRefund}
            disabled={isLoading || !reason}
            className="bg-red-600 hover:bg-red-700"
          >
            {isLoading ? "Processando..." : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Confirmar Reembolso
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
