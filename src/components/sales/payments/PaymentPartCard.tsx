import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PaymentStatusBadge } from "./PaymentStatusBadge";
import { PaymentLinkButton } from "./PaymentLinkButton";
import { PaymentAuditLog } from "./PaymentAuditLog";
import { useMarkPaymentAsPaid, useUpdateDealPayment, usePaymentHasEdits } from "@/hooks/useDealPayments";
import { useTriggerCommissionCalculation } from "@/hooks/useCommissions";
import { usePaymentGateways } from "@/hooks/usePaymentGateways";
import { useBillingReminderTemplate, useSendBillingReminder, buildBillingMessage, getDefaultTemplate } from "@/hooks/useBillingReminder";
import { useToast } from "@/hooks/use-toast";
import type { DealPayment, BillingType } from "@/types/payment.types";
import { BILLING_TYPE_LABELS, isCreditCardType } from "@/types/payment.types";
import {
  AlertTriangle,
  CreditCard,
  QrCode,
  FileText,
  MoreHorizontal,
  Trash2,
  Calendar,
  CheckCircle2,
  Link2,
  Loader2,
  Percent,
  Pencil,
  Receipt,
  MessageSquare,
  Send,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface PaymentPartCardProps {
  payment: DealPayment;
  onDelete?: () => void;
  showDealInfo?: boolean;
  leadId?: string;
}

const BILLING_TYPE_ICONS: Record<BillingType, React.ElementType> = {
  pix: QrCode,
  boleto: FileText,
  credit_card: CreditCard,
  credit_card_no_anticipation: CreditCard,
  credit_card_recurring: CreditCard,
};

export function PaymentPartCard({
  payment,
  onDelete,
  showDealInfo = false,
  leadId: propLeadId,
}: PaymentPartCardProps) {
  const Icon = BILLING_TYPE_ICONS[payment.billing_type];
  const { toast } = useToast();
  const markAsPaidMutation = useMarkPaymentAsPaid();
  const updatePaymentMutation = useUpdateDealPayment();
  const triggerCommission = useTriggerCommissionCalculation();
  const { data: gateways } = usePaymentGateways();

  // Billing reminder
  const [showBillingModal, setShowBillingModal] = useState(false);
  const [billingMessage, setBillingMessage] = useState("");
  const { data: billingTemplate } = useBillingReminderTemplate();
  const sendBillingReminder = useSendBillingReminder();

  const isPaid = payment.status === "received" || payment.status === "confirmed";
  const canEdit = payment.status === "pending" || payment.status === "link_generated" || payment.status === "overdue";
  const canEditPaid = isPaid; // Allow editing all fields on paid payments (with audit)

  const { data: hasEdits } = usePaymentHasEdits(payment.id);

  // State for "Mark as Paid" modal
  const [showMarkPaidModal, setShowMarkPaidModal] = useState(false);
  const [paidDate, setPaidDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [asaasInvoiceNumber, setAsaasInvoiceNumber] = useState((payment as any).asaas_invoice_number || "");

  // State for "Edit Payment" modal
  const [showEditModal, setShowEditModal] = useState(false);
  const [editBillingType, setEditBillingType] = useState<BillingType>(payment.billing_type);
  const [editGateway, setEditGateway] = useState(payment.gateway || "asaas");
  const [editAmount, setEditAmount] = useState(payment.amount);
  const [editDueDate, setEditDueDate] = useState(payment.due_date?.split("T")[0] || "");
  const [editDescription, setEditDescription] = useState(payment.description || "");
  const [editInstallments, setEditInstallments] = useState(payment.installments || 1);
  const [editPaidAt, setEditPaidAt] = useState(payment.paid_at?.split("T")[0] || "");
  const [editReason, setEditReason] = useState("");

  // Force-clean pointer-events when any dialog closes (Radix nested dialog bug)
  const cleanupPointerEvents = () => {
    // Immediate + delayed cleanup to handle Radix animation timing
    document.body.style.removeProperty('pointer-events');
    const timers = [
      setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 100),
      setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 300),
      setTimeout(() => { document.body.style.removeProperty('pointer-events'); }, 600),
    ];
    return timers;
  };

  // Safety net: clean up pointer-events on body when all dialogs are closed
  useEffect(() => {
    if (!showMarkPaidModal && !showEditModal && !showBillingModal) {
      const timers = cleanupPointerEvents();
      return () => timers.forEach(clearTimeout);
    }
  }, [showMarkPaidModal, showEditModal, showBillingModal]);

  // Extract invoice number from URL if pasted
  const handleAsaasInput = (value: string) => {
    // Check if it's a URL like https://www.asaas.com/payment/show/729675332
    const urlMatch = value.match(/asaas\.com\/(?:payment\/show|i)\/(\w+)/);
    if (urlMatch) {
      setAsaasInvoiceNumber(urlMatch[1]);
    } else {
      setAsaasInvoiceNumber(value);
    }
  };

  const handleMarkAsPaid = async () => {
    // Close dialog BEFORE mutation to prevent orphaned Radix overlay
    setShowMarkPaidModal(false);
    try {
      await markAsPaidMutation.mutateAsync({
        paymentId: payment.id,
        paidAt: new Date(paidDate).toISOString(),
        asaasInvoiceNumber: asaasInvoiceNumber || undefined,
      });

      toast({
        title: "Pagamento confirmado!",
        description: "O pagamento foi marcado como recebido.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao confirmar pagamento",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleOpenEdit = () => {
    setEditBillingType(payment.billing_type);
    setEditGateway(payment.gateway || "asaas");
    setEditAmount(payment.amount);
    setEditDueDate(payment.due_date?.split("T")[0] || "");
    setEditDescription(payment.description || "");
    setEditInstallments(payment.installments || 1);
    setEditPaidAt(payment.paid_at?.split("T")[0] || "");
    setEditReason("");
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    // Require reason when editing paid payment
    if (isPaid && !editReason.trim()) {
      toast({
        title: "Motivo obrigatorio",
        description: "Informe o motivo da alteracao para pagamentos ja recebidos.",
        variant: "destructive",
      });
      return;
    }

    try {
      const installmentValue = editInstallments > 1
        ? editAmount / editInstallments
        : editAmount;

      const updateData: any = {
        id: payment.id,
        description: editDescription,
        billing_type: editBillingType,
        gateway: editGateway,
        amount: editAmount,
        installments: editInstallments,
        installment_value: installmentValue,
        due_date: editDueDate,
      };

      // Include paid_at if editing a paid payment
      if (isPaid && editPaidAt) {
        updateData.paid_at = new Date(editPaidAt).toISOString();
      }

      // Add audit trail for paid payments
      if (isPaid) {
        updateData.audit_reason = editReason.trim();
        updateData.audit_previous_values = {
          amount: payment.amount,
          installments: payment.installments,
          installment_value: payment.installment_value,
          due_date: payment.due_date?.split("T")[0],
          paid_at: payment.paid_at?.split("T")[0],
          billing_type: payment.billing_type,
          gateway: payment.gateway,
          description: payment.description,
        };
      }

      // Close dialog BEFORE mutation to prevent orphaned Radix overlay
      const hasCommissionWarning = isPaid && editAmount !== payment.amount;
      setShowEditModal(false);

      await updatePaymentMutation.mutateAsync(updateData);

      toast({
        title: "Pagamento atualizado!",
        description: hasCommissionWarning
          ? "Alteracoes salvas. Verifique se ha comissoes que precisam ser recalculadas."
          : "As alteracoes foram salvas.",
      });
    } catch (error: any) {
      toast({
        title: "Erro ao atualizar",
        description: error.message || "Tente novamente",
        variant: "destructive",
      });
    }
  };

  const canMarkAsPaid = payment.status === "pending" ||
                        payment.status === "link_generated" ||
                        payment.status === "overdue";

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleTriggerCommission = async () => {
    try {
      const result = await triggerCommission.mutateAsync({
        deal_id: payment.deal_id,
        deal_payment_id: payment.id,
        trigger: "payment",
      });
      if (result?.success) {
        toast({
          title: "Comissao calculada!",
          description: `Regra "${result.rule_applied}" aplicada: ${formatCurrency(result.commission_amount)}`,
        });
      } else {
        toast({
          title: "Aviso",
          description: result?.message || "Nao foi possivel calcular comissao",
        });
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message || "Erro ao calcular comissao",
        variant: "destructive",
      });
    }
  };

  const handleOpenBilling = () => {
    const template = billingTemplate || getDefaultTemplate();
    // Extract parcela info from description (e.g. "Parcela 1/10")
    const parcelaMatch = payment.description?.match(/(\d+)\/(\d+)/);
    const parcelaNum = parcelaMatch ? parcelaMatch[1] : "1";
    const totalParcelas = parcelaMatch ? parcelaMatch[2] : "1";
    const parcela = payment.description || `Parcela ${parcelaNum}/${totalParcelas}`;
    const leadName = payment.payer_lead?.name || payment.deal?.contact?.name || "Cliente";
    const firstName = leadName.split(" ")[0];

    const msg = buildBillingMessage(template, {
      cliente: leadName,
      primeiro_nome: firstName,
      valor: payment.amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
      parcela,
      vencimento: payment.due_date
        ? format(new Date(payment.due_date), "dd/MM/yyyy")
        : "-",
      total_parcelas: totalParcelas,
      produto: payment.deal?.product?.name || "Servico",
    });
    setBillingMessage(msg);
    setShowBillingModal(true);
  };

  const handleSendBilling = async () => {
    const leadId = propLeadId || payment.payer_lead?.id || payment.deal?.contact?.id || (payment.deal as any)?.lead?.id || "";
    if (!leadId) {
      toast({
        title: "Lead nao encontrado",
        description: "Nao foi possivel identificar o lead deste pagamento.",
        variant: "destructive",
      });
      return;
    }

    const parcelaMatch = payment.description?.match(/(\d+)\/(\d+)/);
    // Close dialog BEFORE mutation to prevent orphaned Radix overlay
    setShowBillingModal(false);
    sendBillingReminder.mutate(
      {
        leadId,
        message: billingMessage,
        parcela: payment.description || undefined,
        valor: payment.amount,
        vencimento: payment.due_date ? format(new Date(payment.due_date), "dd/MM/yyyy") : undefined,
        produto: payment.deal?.product?.name || undefined,
      },
      {
        onSuccess: () => {
          toast({
            title: "Cobranca enviada!",
            description: "Mensagem enviada via WhatsApp com sucesso.",
          });
        },
        onError: (err: any) => {
          toast({
            title: "Erro ao enviar cobranca",
            description: err.message,
            variant: "destructive",
          });
        },
      }
    );
  };

  const isOverdue =
    payment.status !== "received" &&
    payment.status !== "confirmed" &&
    payment.status !== "cancelled" &&
    payment.status !== "refunded" &&
    new Date(payment.due_date) < new Date();

  return (
    <Card
      className={cn(
        "transition-colors",
        isOverdue && "border-red-200 bg-red-50/50"
      )}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          {/* Left side - Info */}
          <div className="flex items-start gap-3 flex-1">
            <div
              className={cn(
                "h-10 w-10 rounded-lg flex items-center justify-center",
                payment.billing_type === "pix" && "bg-green-100 text-green-700",
                payment.billing_type === "boleto" && "bg-orange-100 text-orange-700",
                isCreditCardType(payment.billing_type) && "bg-blue-100 text-blue-700"
              )}
            >
              <Icon className="h-5 w-5" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium">
                  {payment.description || BILLING_TYPE_LABELS[payment.billing_type]}
                </span>
                <PaymentStatusBadge status={payment.status} size="sm" />
                {hasEdits && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 text-amber-600 border-amber-300">
                    Editado
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                <span>{BILLING_TYPE_LABELS[payment.billing_type]}</span>
                {payment.gateway && (
                  <>
                    <span>-</span>
                    <span className="capitalize">{payment.gateway}</span>
                  </>
                )}
                {payment.installments > 1 && (
                  <>
                    <span>-</span>
                    <span>
                      {payment.installments}x de{" "}
                      {formatCurrency(payment.installment_value || payment.amount / payment.installments)}
                    </span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                <span>
                  Vence em{" "}
                  {format(new Date(payment.due_date), "dd 'de' MMM", {
                    locale: ptBR,
                  })}
                </span>
              </div>

              {payment.payer_lead && (
                <p className="text-xs text-muted-foreground mt-1">
                  Pagador: <span className="font-medium text-foreground">{payment.payer_lead.name}</span>
                </p>
              )}

              {showDealInfo && payment.deal?.product && (
                <p className="text-xs text-muted-foreground mt-1">
                  Produto: {payment.deal.product.name}
                </p>
              )}
            </div>
          </div>

          {/* Right side - Amount and actions */}
          <div className="flex flex-col items-end gap-2">
            <span className="text-lg font-bold">
              {formatCurrency(payment.amount)}
            </span>

            <div className="flex items-center gap-1">
              <PaymentLinkButton payment={payment} variant="compact" />

              {/* Actions dropdown - always show (NFSe available for all statuses) */}
              {(true) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(canEdit || canEditPaid) && (
                      <DropdownMenuItem onClick={handleOpenEdit}>
                        <Pencil className="h-4 w-4 mr-2" />
                        Editar
                      </DropdownMenuItem>
                    )}
                    {canMarkAsPaid && (
                      <DropdownMenuItem
                        onClick={() => setShowMarkPaidModal(true)}
                        className="text-green-600"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Marcar como Pago
                      </DropdownMenuItem>
                    )}
                    {isPaid && (
                      <DropdownMenuItem
                        onClick={handleTriggerCommission}
                        disabled={triggerCommission.isPending}
                        className="text-blue-600"
                      >
                        {triggerCommission.isPending ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Percent className="h-4 w-4 mr-2" />
                        )}
                        Calcular Comissao
                      </DropdownMenuItem>
                    )}
                    {payment.status === "pending" || payment.status === "overdue" || payment.status === "link_generated" ? (
                      <DropdownMenuItem
                        onClick={handleOpenBilling}
                        className="text-orange-600"
                      >
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Enviar Cobranca
                      </DropdownMenuItem>
                    ) : null}
                    {(canEdit || isPaid) && onDelete && payment.status === "pending" && (
                      <DropdownMenuSeparator />
                    )}
                    {onDelete && payment.status === "pending" && (
                      <DropdownMenuItem
                        onClick={onDelete}
                        className="text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remover
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        {/* Paid at info */}
        {payment.paid_at && (
          <p className={cn("text-xs mt-2", payment.status === "refunded" ? "text-muted-foreground line-through" : "text-green-600")}>
            Pago em{" "}
            {format(new Date(payment.paid_at), "dd/MM/yyyy 'as' HH:mm", {
              locale: ptBR,
            })}
          </p>
        )}
        {payment.status === "refunded" && (
          <p className="text-xs text-red-600 mt-1 font-medium">
            Estornado em{" "}
            {payment.updated_at
              ? format(new Date(payment.updated_at), "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })
              : "data não registrada"}
          </p>
        )}

        {/* Asaas ID info */}
        {(payment.asaas_payment_id || (payment as any).asaas_invoice_number) && (
          <p className="text-xs text-muted-foreground mt-1">
            <Link2 className="h-3 w-3 inline mr-1" />
            Asaas: {(payment as any).asaas_invoice_number || payment.asaas_payment_id}
          </p>
        )}

        {/* Audit trail */}
        {hasEdits && <PaymentAuditLog paymentId={payment.id} />}
      </CardContent>

      {/* Mark as Paid Modal */}
      <Dialog open={showMarkPaidModal} onOpenChange={(open) => { setShowMarkPaidModal(open); if (!open) cleanupPointerEvents(); }}>
        <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); cleanupPointerEvents(); }}>
          <DialogHeader>
            <DialogTitle>Confirmar Pagamento Recebido</DialogTitle>
            <DialogDescription>
              Registre o pagamento de {formatCurrency(payment.amount)} como recebido.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paidDate">Data do Pagamento</Label>
              <Input
                id="paidDate"
                type="date"
                value={paidDate}
                onChange={(e) => setPaidDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="asaasId">
                Link ou Número do Asaas <span className="text-muted-foreground">(opcional)</span>
              </Label>
              <Input
                id="asaasId"
                placeholder="Cole a URL ou número (ex: 729675332)"
                value={asaasInvoiceNumber}
                onChange={(e) => handleAsaasInput(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Cole a URL da cobrança (ex: asaas.com/payment/show/729675332) ou apenas o número.
                Isso vincula com o Asaas para baixa automática via webhook.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowMarkPaidModal(false)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleMarkAsPaid}
              disabled={markAsPaidMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {markAsPaidMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Payment Modal */}
      <Dialog open={showEditModal} onOpenChange={(open) => { setShowEditModal(open); if (!open) cleanupPointerEvents(); }}>
        <DialogContent className="sm:max-w-[480px]" onCloseAutoFocus={(e) => { e.preventDefault(); cleanupPointerEvents(); }}>
          <DialogHeader>
            <DialogTitle>Editar Pagamento</DialogTitle>
            <DialogDescription>
              {isPaid
                ? "Edite os dados do pagamento recebido. Um motivo e obrigatorio para registrar a alteracao."
                : "Altere os dados do pagamento."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {isPaid && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Este pagamento ja foi recebido. Alteracoes serao registradas no historico de auditoria.
                  {" "}Se o valor mudar, verifique as comissoes calculadas.
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Descricao</Label>
              <Input
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                placeholder="Ex: Pagamento Principal"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Gateway</Label>
                <Select value={editGateway} onValueChange={setEditGateway}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {gateways?.map((gw) => (
                      <SelectItem key={gw.slug} value={gw.slug}>
                        {gw.name}
                      </SelectItem>
                    ))}
                    {!gateways?.length && (
                      <>
                        <SelectItem value="asaas">Asaas</SelectItem>
                        <SelectItem value="manual">Manual</SelectItem>
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Forma</Label>
                <Select
                  value={editBillingType}
                  onValueChange={(v: BillingType) => {
                    setEditBillingType(v);
                    if (!isCreditCardType(v)) setEditInstallments(1);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">
                      <span className="flex items-center gap-2">
                        <QrCode className="h-4 w-4" /> PIX
                      </span>
                    </SelectItem>
                    <SelectItem value="boleto">
                      <span className="flex items-center gap-2">
                        <FileText className="h-4 w-4" /> Boleto
                      </span>
                    </SelectItem>
                    <SelectItem value="credit_card">
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Cartao
                      </span>
                    </SelectItem>
                    <SelectItem value="credit_card_no_anticipation">
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Cartao 12x s/ Antecipacao
                      </span>
                    </SelectItem>
                    <SelectItem value="credit_card_recurring">
                      <span className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" /> Cartao Recorrente
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editAmount || ""}
                  onChange={(e) => setEditAmount(parseFloat(e.target.value) || 0)}
                />
              </div>

              <div className="space-y-2">
                <Label>Parcelas</Label>
                <Select
                  value={String(editInstallments)}
                  onValueChange={(v) => setEditInstallments(parseInt(v))}
                  disabled={!isCreditCardType(editBillingType)}
                >
                  <SelectTrigger className={cn(!isCreditCardType(editBillingType) && "opacity-50")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n === 1 ? "A vista" : `${n}x`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className={cn("grid gap-4", isPaid ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-2">
                <Label>Vencimento</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => setEditDueDate(e.target.value)}
                />
              </div>

              {isPaid && (
                <div className="space-y-2">
                  <Label>Data do Pagamento</Label>
                  <Input
                    type="date"
                    value={editPaidAt}
                    onChange={(e) => setEditPaidAt(e.target.value)}
                  />
                </div>
              )}
            </div>

            {isPaid && (
              <div className="space-y-2">
                <Label>
                  Motivo da alteracao <span className="text-red-500">*</span>
                </Label>
                <Textarea
                  value={editReason}
                  onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Ex: Cliente pagou com desconto, valor registrado incorretamente..."
                  rows={2}
                  className="resize-none"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={updatePaymentMutation.isPending || (isPaid && !editReason.trim())}
            >
              {updatePaymentMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 mr-2" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Billing Reminder Modal */}
      <Dialog open={showBillingModal} onOpenChange={(open) => { setShowBillingModal(open); if (!open) cleanupPointerEvents(); }}>
        <DialogContent onCloseAutoFocus={(e) => { e.preventDefault(); cleanupPointerEvents(); }}>
          <DialogHeader>
            <DialogTitle>Enviar Cobranca via WhatsApp</DialogTitle>
            <DialogDescription>
              A mensagem sera enviada para o cliente via instancia CAROL.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Mensagem</Label>
              <Textarea
                value={billingMessage}
                onChange={(e) => setBillingMessage(e.target.value)}
                rows={10}
                className="resize-none font-mono text-sm"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Voce pode editar a mensagem antes de enviar.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBillingModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSendBilling}
              disabled={sendBillingReminder.isPending || !billingMessage.trim()}
              className="bg-green-600 hover:bg-green-700"
            >
              {sendBillingReminder.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar via WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </Card>
  );
}
