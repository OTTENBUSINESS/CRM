import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { PaymentPart, BillingType } from "@/types/payment.types";
import { BILLING_TYPE_LABELS, isCreditCardType, billingTypeToFeeKey } from "@/types/payment.types";
import { usePaymentGateways, getGatewayFee, calculateFeeAmount } from "@/hooks/usePaymentGateways";
import type { DealContact } from "@/hooks/useDealContacts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Plus,
  Trash2,
  CreditCard,
  QrCode,
  FileText,
  AlertCircle,
  CheckCircle,
  Info,
  User,
  CalendarRange,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FlexiblePaymentFormProps {
  totalDealValue: number;
  payments: PaymentPart[];
  onChange: (payments: PaymentPart[]) => void;
  disabled?: boolean;
  /** Gateway padrão para novos pagamentos (ex: "asaas" no modo integração) */
  defaultGateway?: string;
  /** Se true, esconde o seletor de gateway (ex: modo integração, sempre asaas) */
  hideGatewaySelector?: boolean;
  dealContacts?: DealContact[];
}

const BILLING_TYPE_ICONS: Record<BillingType, React.ElementType> = {
  pix: QrCode,
  boleto: FileText,
  credit_card: CreditCard,
  credit_card_no_anticipation: CreditCard,
  credit_card_recurring: CreditCard,
};

const INSTALLMENT_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: i === 0 ? "A vista" : `${i + 1}x`,
}));

// Generate default due date (today + 7 days)
const getDefaultDueDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0];
};

// Generate unique ID for form parts
const generatePartId = () => Math.random().toString(36).substr(2, 9);

export function FlexiblePaymentForm({
  totalDealValue,
  payments,
  onChange,
  disabled = false,
  defaultGateway,
  hideGatewaySelector = false,
  dealContacts,
}: FlexiblePaymentFormProps) {
  const { data: gateways } = usePaymentGateways();

  // Installment generator state
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [genBillingType, setGenBillingType] = useState<BillingType>("boleto");
  const [genCount, setGenCount] = useState(12);
  const [genTotalValue, setGenTotalValue] = useState(0);
  const [genFirstDueDate, setGenFirstDueDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    d.setDate(10);
    return d.toISOString().split("T")[0];
  });

  const formatCurrency = (value: number) => {
    if (isNaN(value) || value === null || value === undefined) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const safeNumber = (val: number | undefined | null) => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const totalAmount = safeNumber(totalDealValue);
  const totalPayments = payments.reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const difference = totalAmount - totalPayments;
  const remaining = Math.max(0, difference);
  const isValid = Math.abs(difference) < 0.01;

  const addPayment = useCallback(() => {
    // Calculate remaining amount intelligently
    const remainingAmount = remaining > 0 ? remaining : 0;

    // Auto-selecionar gateway se só tem 1
    const autoGateway = defaultGateway || (gateways && gateways.length === 1 ? gateways[0].slug : "");

    const newPayment: PaymentPart = {
      id: generatePartId(),
      description: payments.length === 0 ? "Entrada" : `Pagamento ${payments.length + 1}`,
      billing_type: "pix",
      gateway: autoGateway,
      amount: remainingAmount,
      installments: 1,
      due_date: getDefaultDueDate(),
    };
    onChange([...payments, newPayment]);
  }, [payments, onChange, remaining, defaultGateway]);

  const genValue = genTotalValue > 0 ? genTotalValue : totalAmount;

  const generateInstallments = useCallback(() => {
    const value = genTotalValue > 0 ? genTotalValue : totalAmount;
    if (value <= 0 || genCount < 2) return;

    const installmentValue = Math.floor((value / genCount) * 100) / 100;
    // Last installment absorbs rounding difference
    const lastInstallmentValue = +(value - installmentValue * (genCount - 1)).toFixed(2);

    const newPayments: PaymentPart[] = [];
    const firstDate = new Date(genFirstDueDate + "T12:00:00");

    for (let i = 0; i < genCount; i++) {
      const dueDate = new Date(firstDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      newPayments.push({
        id: generatePartId(),
        description: `Parcela ${i + 1}/${genCount}`,
        billing_type: genBillingType,
        gateway: defaultGateway || "",
        amount: i === genCount - 1 ? lastInstallmentValue : installmentValue,
        installments: 1,
        due_date: dueDate.toISOString().split("T")[0],
      });
    }

    onChange([...payments, ...newPayments]);
    setGeneratorOpen(false);
  }, [totalAmount, genTotalValue, genCount, genFirstDueDate, genBillingType, defaultGateway, onChange, payments]);

  const updatePayment = useCallback(
    (id: string, updates: Partial<PaymentPart>) => {
      onChange(
        payments.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    },
    [payments, onChange]
  );

  const removePayment = useCallback(
    (id: string) => {
      onChange(payments.filter((p) => p.id !== id));
    },
    [payments, onChange]
  );

  const [installmentsCollapsed, setInstallmentsCollapsed] = useState(true);

  // Auto-add first payment if none exists
  useEffect(() => {
    if (payments.length === 0 && totalAmount > 0) {
      addPayment();
    }
  }, [totalAmount]);

  // Helper to get fee preview
  const getFeePreview = (paymentGateway: string | undefined, billingType: string, amount: number) => {
    if (!paymentGateway || !gateways) return null;
    const fee = getGatewayFee(gateways, paymentGateway, billingTypeToFeeKey(billingType));
    if (!fee) return null;
    const feeAmount = calculateFeeAmount(fee.fee_percent, fee.fee_fixed, amount);
    if (feeAmount <= 0) return null;
    return feeAmount;
  };

  return (
    <div className="space-y-4">
      {/* Payments List */}
      <div className="space-y-3">
        {(() => {
          const generatedInstallments = payments.filter(p => /^(Parcela|Recorrência) \d+\/\d+$/.test(p.description));
          const hasGeneratedInstallments = generatedInstallments.length > 0;
          const installmentsTotal = generatedInstallments.reduce((s, p) => s + safeNumber(p.amount), 0);
          let installmentHeaderShown = false;

          return (
            <>
              {payments.map((payment, index) => {
                const isGenerated = /^(Parcela|Recorrência) \d+\/\d+$/.test(payment.description);

                // Se é parcela gerada e tá colapsado, mostra header na primeira e pula o resto
                if (isGenerated && hasGeneratedInstallments) {
                  if (!installmentHeaderShown) {
                    installmentHeaderShown = true;
                    return (
                      <div key={`installment-group-${payment.id}`}>
                        <button
                          type="button"
                          onClick={() => setInstallmentsCollapsed(!installmentsCollapsed)}
                          className="w-full flex items-center justify-between p-3 rounded-lg border bg-purple-50 dark:bg-purple-950/20 border-purple-200 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-950/30 transition-colors"
                        >
                          <div className="flex items-center gap-2">
                            <CalendarRange className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-800 dark:text-purple-300">
                              {generatedInstallments.length} parcelas — {formatCurrency(installmentsTotal)}
                            </span>
                            <span className="text-xs text-purple-600 dark:text-purple-400">
                              ({generatedInstallments.length}x de {formatCurrency(safeNumber(generatedInstallments[0]?.amount))})
                            </span>
                          </div>
                          <span className="text-xs text-purple-600">{installmentsCollapsed ? '▶ Expandir' : '▼ Comprimir'}</span>
                        </button>
                      </div>
                    );
                  }
                  // Se colapsado, pula as parcelas restantes
                  if (installmentsCollapsed) return null;
                }

                // Renderiza o card normal do pagamento
                const Icon = BILLING_TYPE_ICONS[payment.billing_type];
                const canHaveInstallments = isCreditCardType(payment.billing_type);
                const isGeneratedInstallment = /^(Parcela|Recorrência) \d+\/\d+$/.test(payment.description);

                return (
            <Card key={payment.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-4">
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "h-8 w-8 rounded flex items-center justify-center",
                        payment.billing_type === "pix" &&
                          "bg-green-100 text-green-700",
                        payment.billing_type === "boleto" &&
                          "bg-orange-100 text-orange-700",
                        isCreditCardType(payment.billing_type) &&
                          "bg-blue-100 text-blue-700"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <Input
                      value={payment.description}
                      onChange={(e) =>
                        updatePayment(payment.id, {
                          description: e.target.value,
                        })
                      }
                      className="h-8 w-[180px] border-0 px-2 bg-muted/50 focus-visible:bg-background"
                      placeholder="Descricao..."
                      disabled={disabled}
                    />
                  </div>

                  {payments.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-red-500"
                      onClick={() => removePayment(payment.id)}
                      disabled={disabled}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                {/* Fields Row 1: Forma + Gateway + Valor + Vencimento */}
                <div className={cn(
                  "grid gap-2",
                  hideGatewaySelector || !gateways || gateways.length <= 1 ? "grid-cols-3" : "grid-cols-2 sm:grid-cols-4"
                )}>
                  {/* Billing Type */}
                  <div className="space-y-1">
                    <Label className="text-xs">Forma</Label>
                    <Select
                      value={payment.billing_type}
                      onValueChange={(value: BillingType) => {
                        const updates: any = {
                          billing_type: value,
                          installments: !isCreditCardType(value) ? 1 : payment.installments,
                        };
                        // Cartão Recorrente → default parcelado + 1º vencimento 30 dias
                        if (value === 'credit_card_recurring') {
                          const thirtyDays = new Date();
                          thirtyDays.setDate(thirtyDays.getDate() + 30);
                          updates._installmentMode = true;
                          updates._installmentCount = 12;
                          updates.due_date = thirtyDays.toISOString().split('T')[0];
                        }
                        updatePayment(payment.id, updates);
                      }}
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pix">
                          <span className="flex items-center gap-2">
                            <QrCode className="h-4 w-4" />
                            PIX
                          </span>
                        </SelectItem>
                        <SelectItem value="boleto">
                          <span className="flex items-center gap-2">
                            <FileText className="h-4 w-4" />
                            Boleto
                          </span>
                        </SelectItem>
                        <SelectItem value="credit_card">
                          <span className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Crédito
                          </span>
                        </SelectItem>
                        <SelectItem value="credit_card_recurring">
                          <span className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4" />
                            Recorrente
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Gateway per payment — esconde se 0 ou 1 opção (auto-seleciona) */}
                  {!hideGatewaySelector && gateways && gateways.length > 1 && (
                    <div className="space-y-1">
                      <Label className="text-xs">Gateway</Label>
                      <Select
                        value={payment.gateway || ""}
                        onValueChange={(value) =>
                          updatePayment(payment.id, { gateway: value })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="Gateway..." />
                        </SelectTrigger>
                        <SelectContent>
                          {gateways.map((gw) => (
                            <SelectItem key={gw.slug} value={gw.slug}>
                              {gw.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Amount — mascarado */}
                  <div className="space-y-1">
                    <Label className="text-xs">Valor</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={safeNumber(payment.amount) ? formatCurrency(safeNumber(payment.amount)) : ""}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, "");
                        updatePayment(payment.id, { amount: Number(raw) / 100 });
                      }}
                      className="h-9 font-medium"
                      placeholder="R$ 0,00"
                      disabled={disabled}
                    />
                  </div>

                  {/* Parcelas no cartão — só aparece pra Cartão Crédito (não recorrente, não PIX, não boleto) */}
                  {canHaveInstallments && payment.billing_type !== 'credit_card_recurring' && (
                    <div className="space-y-1">
                      <Label className="text-xs">Parcelas no cartão</Label>
                      <Select
                        value={String(payment.installments)}
                        onValueChange={(value) =>
                          updatePayment(payment.id, {
                            installments: parseInt(value),
                          })
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INSTALLMENT_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {/* Due Date */}
                  <div className="space-y-1">
                    <Label className="text-xs">Vencimento</Label>
                    <Input
                      type="date"
                      value={payment.due_date}
                      onChange={(e) =>
                        updatePayment(payment.id, { due_date: e.target.value })
                      }
                      className="h-9"
                      disabled={disabled}
                    />
                  </div>
                </div>

                {/* Parcelamento inline — PIX, Boleto e Recorrente (NÃO mostra em parcelas já geradas) */}
                {!isGeneratedInstallment && (!canHaveInstallments || payment.billing_type === 'credit_card_recurring') ? (
                  <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
                    <div className="flex items-center gap-3">
                      <Label className="text-xs font-medium">Parcelado?</Label>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => updatePayment(payment.id, { _installmentMode: false } as any)}
                          className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                            !(payment as any)._installmentMode ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                          )}
                        >À vista</button>
                        <button
                          type="button"
                          onClick={() => updatePayment(payment.id, { _installmentMode: true, _installmentCount: (payment as any)._installmentCount || 12 } as any)}
                          className={cn("px-2.5 py-1 rounded text-xs font-medium transition-colors",
                            (payment as any)._installmentMode ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                          )}
                        >Parcelado</button>
                      </div>
                    </div>

                    {(payment as any)._installmentMode && (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Em quantas vezes?</Label>
                            <Input
                              type="number"
                              min={2}
                              max={48}
                              value={(payment as any)._installmentCount || 12}
                              onChange={(e) => updatePayment(payment.id, { _installmentCount: Math.max(2, parseInt(e.target.value) || 2) } as any)}
                              className="h-8 text-sm"
                              disabled={disabled}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">1º vencimento</Label>
                            <Input
                              type="date"
                              value={payment.due_date}
                              onChange={(e) => updatePayment(payment.id, { due_date: e.target.value })}
                              className="h-8 text-sm"
                              disabled={disabled}
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-between bg-background rounded p-2">
                          <span className="text-xs text-muted-foreground">
                            {(payment as any)._installmentCount || 12}x de {formatCurrency(safeNumber(payment.amount) / ((payment as any)._installmentCount || 12))}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 text-xs bg-purple-600 hover:bg-purple-700"
                            onClick={() => {
                              const count = (payment as any)._installmentCount || 12;
                              const value = safeNumber(payment.amount);
                              if (value <= 0 || count < 2) return;
                              const installmentValue = Math.floor((value / count) * 100) / 100;
                              const lastValue = +(value - installmentValue * (count - 1)).toFixed(2);
                              const firstDate = new Date(payment.due_date + "T12:00:00");
                              const newPayments: PaymentPart[] = [];
                              for (let i = 0; i < count; i++) {
                                const dueDate = new Date(firstDate);
                                dueDate.setMonth(dueDate.getMonth() + i);
                                newPayments.push({
                                  id: generatePartId(),
                                  description: `${payment.billing_type === 'credit_card_recurring' ? 'Recorrência' : 'Parcela'} ${i + 1}/${count}`,
                                  billing_type: payment.billing_type,
                                  gateway: payment.gateway || defaultGateway || "",
                                  amount: i === count - 1 ? lastValue : installmentValue,
                                  installments: 1,
                                  due_date: dueDate.toISOString().split("T")[0],
                                  payer_lead_id: payment.payer_lead_id,
                                });
                              }
                              // Substituir este card pelas parcelas geradas
                              const remaining = payments.filter(p => p.id !== payment.id);
                              onChange([...remaining, ...newPayments]);
                            }}
                            disabled={disabled || safeNumber(payment.amount) <= 0}
                          >
                            Gerar {(payment as any)._installmentCount || 12} parcelas
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Payer selector (only when deal has multiple contacts) */}
                {dealContacts && dealContacts.length > 1 && (
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1">
                      <User className="h-3 w-3" />
                      Pagador
                    </Label>
                    <Select
                      value={payment.payer_lead_id || ""}
                      onValueChange={(value) =>
                        updatePayment(payment.id, {
                          payer_lead_id: value || undefined,
                        })
                      }
                      disabled={disabled}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Lead principal" />
                      </SelectTrigger>
                      <SelectContent>
                        {dealContacts.map((contact) => (
                          <SelectItem key={contact.lead_id} value={contact.lead_id}>
                            <span className="flex items-center gap-2">
                              {contact.lead?.name || "Lead"}
                              {contact.role && (
                                <span className="text-xs text-muted-foreground">
                                  ({contact.role})
                                </span>
                              )}
                              {contact.is_primary && (
                                <span className="text-xs text-blue-600">★</span>
                              )}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Installment info */}
                {canHaveInstallments && payment.installments > 1 && (
                  <p className="text-xs text-muted-foreground">
                    {payment.installments}x de{" "}
                    {formatCurrency(safeNumber(payment.amount) / payment.installments)}
                  </p>
                )}

                {/* Gateway fee preview */}
                {payment.gateway && safeNumber(payment.amount) > 0 && (() => {
                  const feeAmount = getFeePreview(payment.gateway, payment.billing_type, safeNumber(payment.amount));
                  if (!feeAmount) return null;
                  return (
                    <div className="flex items-center gap-1 text-xs text-amber-600">
                      <Info className="h-3 w-3" />
                      <span>
                        Taxa {payment.gateway}: {formatCurrency(feeAmount)} (liquido: {formatCurrency(safeNumber(payment.amount) - feeAmount)})
                      </span>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          );
              })}
            </>
          );
        })()}
      </div>

      {/* Action Button — 1 botão só */}
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="border-dashed flex-1"
          onClick={addPayment}
          disabled={disabled}
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Forma de Pagamento
        </Button>

      </div>

      {/* Summary */}
      <div className="border rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Valor do Deal</span>
          <span className="font-medium">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total dos Pagamentos</span>
          <span className="font-medium">{formatCurrency(totalPayments)}</span>
        </div>
        {!isValid && (
          <div className="flex justify-between text-sm font-medium">
            <span className={difference > 0 ? "text-orange-600" : "text-red-600"}>
              {difference > 0 ? "Faltando" : "Excedente"}
            </span>
            <span className={difference > 0 ? "text-orange-600" : "text-red-600"}>
              {formatCurrency(Math.abs(difference))}
            </span>
          </div>
        )}
      </div>

      {/* Validation Alert */}
      {!isValid && (
        <Alert
          variant="destructive"
          className="bg-red-50 text-red-800 border-red-200"
        >
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {difference > 0
              ? `A soma dos pagamentos esta ${formatCurrency(difference)} abaixo do valor do deal.`
              : `A soma dos pagamentos esta ${formatCurrency(Math.abs(difference))} acima do valor do deal.`}
          </AlertDescription>
        </Alert>
      )}

      {isValid && payments.length > 0 && (
        <Alert className="bg-green-50 text-green-800 border-green-200">
          <CheckCircle className="h-4 w-4" />
          <AlertDescription>
            {payments.length === 1
              ? "Pagamento configurado corretamente!"
              : `${payments.length} formas de pagamento configuradas. Total correto!`}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
