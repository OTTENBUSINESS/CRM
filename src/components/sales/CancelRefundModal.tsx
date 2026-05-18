/**
 * CancelRefundModal — Componente unificado pra Reembolso + Churn
 * Usado tanto pelo Comercial (SalesLeadDetail) quanto pelo CS (ClientDetail)
 *
 * Mode 'refund': foco no deal (reembolso financeiro)
 * Mode 'churn': foco no cliente (cancelamento completo)
 * Ambos fazem TUDO — a diferença é só o ponto de entrada
 */
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
import { Separator } from "@/components/ui/separator";
import { useDealPayments } from "@/hooks/useDealPayments";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { RotateCcw, AlertTriangle, UserX, Lock, MessageSquare, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface CancelRefundModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Deal específico (modo refund do comercial) */
  deal?: any;
  /** Organização (modo churn do CS) */
  organizationId?: string;
  organizationName?: string;
  /** Lead ID (resolve automaticamente se não passar) */
  leadId?: string;
  /** Modo: refund (foco deal) ou churn (foco cliente) */
  mode?: "refund" | "churn";
}

const REASONS = [
  { value: "cdc_7_dias", label: "CDC 7 dias — arrependimento", group: "refund" },
  { value: "insatisfacao", label: "Insatisfação com o produto", group: "both" },
  { value: "nao_era_esperado", label: "Não era o que esperava", group: "both" },
  { value: "financeiro", label: "Problemas financeiros", group: "both" },
  { value: "concorrente", label: "Migrou pra concorrente", group: "both" },
  { value: "sem_tempo", label: "Sem tempo pra usar", group: "churn" },
  { value: "suporte", label: "Insatisfação com atendimento", group: "churn" },
  { value: "negocio_fechou", label: "Empresa encerrou atividades", group: "churn" },
  { value: "duplicidade", label: "Cobrança duplicada", group: "refund" },
  { value: "erro_cobranca", label: "Erro na cobrança", group: "refund" },
  { value: "outro", label: "Outro motivo", group: "both" },
];

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

const PAIN_AREA_MEMBROS_URL = import.meta.env.VITE_PAIN_AREA_MEMBROS_URL || "https://YOUR_PAIN_PROJECT_REF.supabase.co/functions/v1";
const PAIN_API_KEY = import.meta.env.VITE_PAIN_API_KEY || "";

const REFUND_STAGES: Record<string, string> = {
  "9c21bd06-a898-44a1-88db-ad3c6ec7140c": "2870a135-bce1-4920-9f1e-f8955147fa44",
  "90b09d81-8282-4503-a869-1787baf8f736": "d39d2ff2-ba59-4e8e-bd70-fbfc6e40f0e6",
};

export function CancelRefundModal({
  open, onOpenChange, deal, organizationId, organizationName, leadId, mode = "refund",
}: CancelRefundModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const queryClient = useQueryClient();

  // Pagamentos do deal específico (modo refund)
  const { data: dealPayments } = useDealPayments(deal?.id);

  // Deals + pagamentos do lead (modo churn sem deal específico)
  const [allDeals, setAllDeals] = useState<any[]>([]);
  const [allPayments, setAllPayments] = useState<any[]>([]);

  const resolvedLeadId = leadId || deal?.lead_id || deal?.lead?.id;

  // Buscar todos os deals e pagamentos quando abre sem deal específico
  useEffect(() => {
    if (!open || deal?.id) {
      setAllDeals([]);
      setAllPayments([]);
      return;
    }

    (async () => {
      // Resolver o leadId: pode vir direto ou via org
      let effectiveLeadId = resolvedLeadId;
      if (!effectiveLeadId && organizationId) {
        const { data: org } = await supabase.from("organizations")
          .select("primary_contact_id").eq("id", organizationId).single();
        effectiveLeadId = org?.primary_contact_id;
      }

      console.log("[CancelRefundModal] buscando deals para leadId:", effectiveLeadId, "orgId:", organizationId);
      if (!effectiveLeadId) { console.log("[CancelRefundModal] sem leadId, abortando"); return; }

      const { data: deals } = await supabase.from("deals")
        .select("id, title, negotiated_price, pipeline_id, status, pipeline_stage:sales_pipeline_stages(name)")
        .eq("lead_id", effectiveLeadId)
        .in("status", ["won", "open", "negotiation"]);
      console.log("[CancelRefundModal] deals encontrados:", deals?.length);
      setAllDeals(deals || []);

      if (deals && deals.length > 0) {
        const dealIds = deals.map((d: any) => d.id);
        const { data: pms } = await supabase.from("deal_payments")
          .select("*")
          .in("deal_id", dealIds);
        setAllPayments(pms || []);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deal?.id, resolvedLeadId, organizationId]);

  // Unificar pagamentos: do deal específico OU de todos os deals
  const payments = deal?.id ? (dealPayments || []) : allPayments;

  const [isLoading, setIsLoading] = useState(false);
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [feedback, setFeedback] = useState("");
  const [refundType, setRefundType] = useState<"total" | "parcial">("total");
  const [refundAmount, setRefundAmount] = useState(0);
  const [cancelPending, setCancelPending] = useState(true);
  const [refundReceived, setRefundReceived] = useState(true);
  const [blockMemberArea, setBlockMemberArea] = useState(true);
  const [removeFromWhatsApp, setRemoveFromWhatsApp] = useState(true);

  const totalReceived = payments
    .filter((p: any) => p.status === "received" || p.status === "confirmed")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalPending = payments
    .filter((p: any) => p.status === "pending" || p.status === "link_generated")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalDealValue = deal
    ? Number(deal.negotiated_price || 0)
    : allDeals.reduce((s: number, d: any) => s + Number(d.negotiated_price || 0), 0);

  const filteredReasons = REASONS.filter(r => r.group === "both" || r.group === mode);

  useEffect(() => {
    if (open) {
      setReason("");
      setDetails("");
      setFeedback("");
      setRefundType("total");
      setRefundAmount(totalReceived);
      setCancelPending(true);
      setRefundReceived(true);
      setBlockMemberArea(true);
      setRemoveFromWhatsApp(true);
    } else {
      // Fix: Radix Dialog às vezes não remove pointer-events do body ao fechar
      setTimeout(() => {
        document.body.style.pointerEvents = "";
      }, 300);
    }
  }, [open, totalReceived]);

  const handleSubmit = async () => {
    if (!reason) {
      toast({ title: "Selecione o motivo", variant: "destructive" });
      return;
    }
    setIsLoading(true);

    try {
      const resolvedLeadId = leadId || deal?.lead_id || deal?.lead?.id;
      const reasonLabel = REASONS.find(r => r.value === reason)?.label || reason;
      const effectiveRefundAmount = refundType === "total" ? totalReceived : refundAmount;
      const processedBy = teamMember?.name || "sistema";

      // ═══════ 1. DEALS: Mover pra Reembolso + cancelar/estornar parcelas ═══════
      if (deal) {
        // Modo refund: 1 deal específico
        const pipelineId = deal.pipeline_id || deal.pipeline_stage?.pipeline_id;
        const refundStageId = REFUND_STAGES[pipelineId];
        await supabase.from("deals").update({
          status: "lost",
          lost_at: new Date().toISOString(),
          lost_reason: `${mode === "churn" ? "Churn" : "Reembolso"}: ${reasonLabel}`,
          pipeline_stage_id: refundStageId || undefined,
          updated_at: new Date().toISOString(),
        }).eq("id", deal.id);

        if (cancelPending && payments) {
          const pendingIds = payments.filter((p: any) => p.status === "pending" || p.status === "link_generated").map((p: any) => p.id);
          if (pendingIds.length > 0) await supabase.from("deal_payments").update({ status: "cancelled" }).in("id", pendingIds);
        }
        if (refundReceived && payments) {
          const receivedIds = payments.filter((p: any) => p.status === "received" || p.status === "confirmed").map((p: any) => p.id);
          if (receivedIds.length > 0) await supabase.from("deal_payments").update({ status: "refunded" }).in("id", receivedIds);
        }
      } else if (resolvedLeadId) {
        // Modo churn sem deal: pegar todos os deals do lead
        const { data: churnDeals } = await supabase.from("deals").select("id, pipeline_id, status")
          .eq("lead_id", resolvedLeadId).in("status", ["won", "open", "negotiation"]);
        for (const d of (churnDeals || [])) {
          const refundStageId = REFUND_STAGES[d.pipeline_id];
          await supabase.from("deals").update({
            status: "lost", lost_at: new Date().toISOString(),
            lost_reason: `Churn: ${reasonLabel}`,
            pipeline_stage_id: refundStageId || undefined,
          }).eq("id", d.id);
          await supabase.from("deal_payments").update({ status: "cancelled" }).eq("deal_id", d.id).in("status", ["pending", "link_generated"]);
          if (refundReceived) {
            await supabase.from("deal_payments").update({ status: "refunded" }).eq("deal_id", d.id).in("status", ["received", "confirmed"]);
          }
        }
      }

      // ═══════ 1.5. COMISSÕES + TRANSAÇÕES: Cancelar comissões pendentes, estornar transações ═══════
      // Coletar IDs dos deals afetados (deal específico OU todos do churn)
      let affectedDealIds: string[] = [];
      if (deal?.id) {
        affectedDealIds = [deal.id];
      } else if (resolvedLeadId) {
        // Buscar IDs dos deals que acabaram de ser marcados como lost
        const { data: lostDeals } = await supabase.from("deals").select("id")
          .eq("lead_id", resolvedLeadId).eq("status", "lost");
        affectedDealIds = (lostDeals || []).map((d: any) => d.id);
      }
      if (affectedDealIds.length > 0) {
        // Cancelar comissões pendentes dos deals afetados
        await supabase.from("commissions")
          .update({ status: "cancelled", notes: `${mode === "churn" ? "Churn" : "Reembolso"}: ${reasonLabel}`, updated_at: new Date().toISOString() })
          .in("deal_id", affectedDealIds)
          .in("status", ["pending", "approved"]);

        // Marcar transações vinculadas a deal_payments como refunded
        const paymentIds = payments.filter((p: any) => p.status === "refunded" || p.status === "cancelled").map((p: any) => p.id);
        if (paymentIds.length > 0) {
          await supabase.from("transactions")
            .update({ status: "refunded" })
            .in("deal_payment_id", paymentIds)
            .in("status", ["paid", "RECEIVED", "approved"]);
        }
      }

      // ═══════ 2. ORGANIZAÇÃO: Marcar como churned (se modo churn OU se é o último deal) ═══════
      const resolvedOrgId = organizationId || (resolvedLeadId ? await (async () => {
        const { data } = await supabase.from("organizations").select("id").eq("primary_contact_id", resolvedLeadId).maybeSingle();
        return data?.id;
      })() : null);

      if (resolvedOrgId) {
        // Buscar membros pra bloqueio
        const { data: org } = await supabase.from("organizations").select(`
          primary_contact:leads!organizations_primary_contact_id_fkey(email, name),
          members:organization_members(id, contact:contacts(email, name))
        `).eq("id", resolvedOrgId).single();

        const memberEmails: string[] = [];
        if (org?.primary_contact?.email) memberEmails.push(org.primary_contact.email);
        if (org?.members) for (const m of org.members as any[]) { if (m.contact?.email) memberEmails.push(m.contact.email); }

        // Atualizar org
        await supabase.from("organizations").update({
          status: "churned",
          churned_at: new Date().toISOString(),
          churn_reason: reason,
          notes: `${reasonLabel}${details ? `. ${details}` : ""}${feedback ? `. Feedback: ${feedback}` : ""}${effectiveRefundAmount > 0 ? `. Reembolso: ${formatCurrency(effectiveRefundAmount)}` : ""}`,
        }).eq("id", resolvedOrgId);

        // Desativar produtos e membros
        await supabase.from("organization_products").update({ cs_status: "churned" }).eq("organization_id", resolvedOrgId);
        await supabase.from("organization_members").update({ status: "inactive", whatsapp_in_group: false }).eq("organization_id", resolvedOrgId);

        // Bloquear área de membros
        if (blockMemberArea && memberEmails.length > 0 && PAIN_API_KEY) {
          try {
            await fetch(`${PAIN_AREA_MEMBROS_URL}/deactivate-users`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-key": PAIN_API_KEY },
              body: JSON.stringify({ emails: memberEmails, reason, organization_id: resolvedOrgId }),
            });
          } catch { /* silent */ }
        }
      }

      // ═══════ 3. TIMELINE: Registrar tudo ═══════
      if (resolvedLeadId) {
        const taskType = mode === "churn" ? "churn" : "refund";
        const icon = mode === "churn" ? "🚫" : "💸";
        const title = mode === "churn"
          ? `${icon} Churn processado por ${processedBy}`
          : `${icon} Reembolso processado por ${processedBy}`;
        const descParts = [`${deal?.title || organizationName || "Deal"} — ${reasonLabel}`];
        if (effectiveRefundAmount > 0) descParts.push(`Valor estornado: ${formatCurrency(effectiveRefundAmount)}`);
        if (cancelPending && totalPending > 0) descParts.push(`${formatCurrency(totalPending)} em parcelas canceladas`);
        if (feedback) descParts.push(`Feedback: ${feedback}`);
        if (blockMemberArea) descParts.push("Área de membros bloqueada");
        if (removeFromWhatsApp) descParts.push("Removido do WhatsApp");

        try {
          await supabase.from("company_activities").insert({
            lead_id: resolvedLeadId,
            organization_id: resolvedOrgId || null,
            team: mode === "churn" ? "cs" : "sales",
            task_type: taskType,
            name: title,
            description: descParts.join(". "),
            status: "completed",
            completed: true,
            metadata: {
              deal_id: deal?.id, reason, reason_label: reasonLabel, details, feedback,
              refund_type: refundType, refund_amount: effectiveRefundAmount,
              cancel_pending: cancelPending, refund_received: refundReceived,
              block_member_area: blockMemberArea, remove_from_whatsapp: removeFromWhatsApp,
              processed_by: processedBy, mode,
            },
          });
        } catch { /* silent */ }
      }

      // ═══════ 4. INVALIDAR CACHES ═══════
      queryClient.invalidateQueries({ queryKey: ["contact-deals"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["deal-payments"] });
      queryClient.invalidateQueries({ queryKey: ["client-timeline"] });
      queryClient.invalidateQueries({ queryKey: ["organization"] });
      queryClient.invalidateQueries({ queryKey: ["commissions"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["financial"] });

      toast({
        title: mode === "churn" ? "Churn processado" : "Reembolso processado",
        description: effectiveRefundAmount > 0 ? `${formatCurrency(effectiveRefundAmount)} estornado` : "Parcelas canceladas",
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Cancel/Refund error:", error);
      toast({ title: "Erro ao processar", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            {mode === "churn" ? <UserX className="h-5 w-5" /> : <RotateCcw className="h-5 w-5" />}
            {mode === "churn" ? "Cancelar Cliente (Churn)" : "Processar Reembolso"}
          </DialogTitle>
          <DialogDescription>
            {deal?.title || organizationName || ""}
            {totalDealValue > 0 ? ` — ${formatCurrency(totalDealValue)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {/* Deals afetados (modo churn sem deal específico) */}
          {!deal && allDeals.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Deals afetados ({allDeals.length})
              </Label>
              <div className="space-y-1">
                {allDeals.map((d: any) => (
                  <div key={d.id} className="flex items-center justify-between p-2 rounded-lg border text-xs">
                    <span className="font-medium truncate">{d.title}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px]">{(d.pipeline_stage as any)?.name || d.status}</Badge>
                      {Number(d.negotiated_price) > 0 && (
                        <span className="font-bold text-green-700">{formatCurrency(Number(d.negotiated_price))}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Resumo financeiro */}
          {(totalReceived > 0 || totalPending > 0 || totalDealValue > 0) && (
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2.5 rounded-lg bg-green-50 dark:bg-green-950/20 text-center">
                <p className="text-sm font-bold text-green-700">{formatCurrency(totalReceived)}</p>
                <p className="text-[10px] text-green-600">Recebido</p>
              </div>
              <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-950/20 text-center">
                <p className="text-sm font-bold text-amber-700">{formatCurrency(totalPending)}</p>
                <p className="text-[10px] text-amber-600">Pendente</p>
              </div>
              <div className="p-2.5 rounded-lg bg-muted text-center">
                <p className="text-sm font-bold">{payments.length}</p>
                <p className="text-[10px] text-muted-foreground">Parcelas</p>
              </div>
            </div>
          )}

          {/* Motivo */}
          <div className="space-y-1.5">
            <Label className="text-sm">Motivo *</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className={cn(!reason && "border-red-300")}><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {filteredReasons.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Tipo de reembolso (se tem valores recebidos) */}
          {totalReceived > 0 && (
            <div className="space-y-1.5">
              <Label className="text-sm">Reembolso</Label>
              <div className="flex gap-2">
                <button type="button" onClick={() => { setRefundType("total"); setRefundAmount(totalReceived); }}
                  className={cn("flex-1 p-2.5 rounded-lg border text-xs font-medium transition-colors",
                    refundType === "total" ? "border-red-500 bg-red-50 text-red-700" : "border-border hover:bg-muted"
                  )}>Total ({formatCurrency(totalReceived)})</button>
                <button type="button" onClick={() => setRefundType("parcial")}
                  className={cn("flex-1 p-2.5 rounded-lg border text-xs font-medium transition-colors",
                    refundType === "parcial" ? "border-amber-500 bg-amber-50 text-amber-700" : "border-border hover:bg-muted"
                  )}>Parcial</button>
              </div>
              {refundType === "parcial" && (
                <Input type="text" inputMode="numeric" value={refundAmount ? formatCurrency(refundAmount) : ""}
                  onChange={(e) => setRefundAmount(Number(e.target.value.replace(/[^\d]/g, "")) / 100)}
                  placeholder="R$ 0,00" className="text-center font-bold h-10" />
              )}
            </div>
          )}

          {/* Ações nos pagamentos */}
          {(totalPending > 0 || totalReceived > 0) && (
            <div className="space-y-2">
              {totalPending > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div>
                    <Label className="text-xs">Cancelar parcelas pendentes</Label>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(totalPending)}</p>
                  </div>
                  <Switch checked={cancelPending} onCheckedChange={setCancelPending} />
                </div>
              )}
              {totalReceived > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg border">
                  <div>
                    <Label className="text-xs">Marcar recebidos como estornados</Label>
                    <p className="text-[10px] text-muted-foreground">{formatCurrency(totalReceived)}</p>
                  </div>
                  <Switch checked={refundReceived} onCheckedChange={setRefundReceived} />
                </div>
              )}
            </div>
          )}

          <Separator />

          {/* Ações no cliente (bloqueio, WhatsApp) */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Ações no cliente</Label>
            <div className="flex items-center justify-between p-2.5 rounded-lg border">
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs">Bloquear área de membros</Label>
              </div>
              <Switch checked={blockMemberArea} onCheckedChange={setBlockMemberArea} />
            </div>
            <div className="flex items-center justify-between p-2.5 rounded-lg border">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                <Label className="text-xs">Remover do grupo WhatsApp</Label>
              </div>
              <Switch checked={removeFromWhatsApp} onCheckedChange={setRemoveFromWhatsApp} />
            </div>
          </div>

          {/* Feedback + Detalhes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Feedback do cliente</Label>
            <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)}
              placeholder="O que o cliente disse sobre o cancelamento?" rows={2} className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Detalhes internos</Label>
            <Textarea value={details} onChange={(e) => setDetails(e.target.value)}
              placeholder="Observações internas (não visível pro cliente)" rows={2} className="text-sm" />
          </div>

          {/* Resumo das ações */}
          <Alert className="border-red-200 bg-red-50">
            <AlertTriangle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800 text-[11px] space-y-0.5">
              <p className="font-semibold">Esta ação vai:</p>
              <p>• Mover deal(s) pra estágio "Reembolso"</p>
              {cancelPending && totalPending > 0 && <p>• Cancelar {formatCurrency(totalPending)} em parcelas</p>}
              {refundReceived && totalReceived > 0 && <p>• Estornar {formatCurrency(totalReceived)}</p>}
              {blockMemberArea && <p>• Bloquear acesso à área de membros</p>}
              {removeFromWhatsApp && <p>• Remover do grupo WhatsApp</p>}
              <p>• Registrar na timeline ({teamMember?.name || "sistema"})</p>
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !reason} className="bg-red-600 hover:bg-red-700">
            {isLoading ? "Processando..." : (
              <>{mode === "churn" ? <UserX className="h-4 w-4 mr-2" /> : <RotateCcw className="h-4 w-4 mr-2" />}
                Confirmar {mode === "churn" ? "Churn" : "Reembolso"}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
