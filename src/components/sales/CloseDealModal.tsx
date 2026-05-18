import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useUpdateDeal } from "@/hooks/useSalesDeals";
import { useCreateDealPaymentsBatch, useGeneratePaymentLink } from "@/hooks/useDealPayments";
import { useDealContacts } from "@/hooks/useDealContacts";
import { useToast } from "@/hooks/use-toast";
import { FlexiblePaymentForm } from "./payments/FlexiblePaymentForm";
import type { PaymentPart } from "@/types/payment.types";
import type { Deal } from "@/types/sales.types";
import {
  Loader2,
  FileText,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Send,
  Hand,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface RegisterNegotiationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal;
  leadCpfCnpj?: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Alias for backwards compatibility
export const CloseDealModal = RegisterNegotiationModal;

export function RegisterNegotiationModal({
  open,
  onOpenChange,
  deal,
  leadCpfCnpj,
}: RegisterNegotiationModalProps) {
  const { toast } = useToast();
  const updateDeal = useUpdateDeal();
  const createPaymentsBatch = useCreateDealPaymentsBatch();
  const generatePaymentLink = useGeneratePaymentLink();
  const { data: dealContacts } = useDealContacts(deal?.id);

  const [step, setStep] = useState<"config" | "generating" | "success">("config");
  const [paymentMode, setPaymentMode] = useState<"manual" | "integration">("manual");
  const [cpfCnpj, setCpfCnpj] = useState(leadCpfCnpj || "");
  const [payments, setPayments] = useState<PaymentPart[]>([]);
  const [editableDealValue, setEditableDealValue] = useState(0);
  const [savedDealValue, setSavedDealValue] = useState(0);
  const [generatedLinks, setGeneratedLinks] = useState<Array<{
    description: string;
    link: string;
    amount: number;
  }>>([]);

  // Track if we already initialized for this modal session
  const initializedRef = useRef(false);
  const lastDealIdRef = useRef<string | null>(null);

  // Initialize payments when modal opens (only once per open)
  useEffect(() => {
    // Only initialize when modal opens with a new deal
    if (open && deal && (!initializedRef.current || lastDealIdRef.current !== deal.id)) {
      const defaultDueDate = new Date();
      defaultDueDate.setDate(defaultDueDate.getDate() + 3);
      const initialValue = Number(deal.negotiated_price) || 0;

      setEditableDealValue(initialValue);
      setSavedDealValue(initialValue);
      setPayments([
        {
          id: Math.random().toString(36).substr(2, 9),
          description: "Pagamento Total",
          billing_type: "pix",
          gateway: "",
          amount: initialValue,
          installments: 1,
          due_date: defaultDueDate.toISOString().split("T")[0],
        },
      ]);
      setStep("config");
      setGeneratedLinks([]);
      setCpfCnpj(leadCpfCnpj || "");
      setPaymentMode("manual");

      initializedRef.current = true;
      lastDealIdRef.current = deal.id;
    }

    // Reset the ref when modal closes so it can reinitialize next time
    if (!open) {
      initializedRef.current = false;
    }
  }, [open, deal?.id, leadCpfCnpj]);

  const safeNumber = (val: number | undefined | null) => {
    const num = Number(val);
    return isNaN(num) ? 0 : num;
  };

  const totalPayments = payments.reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const originalDealValue = safeNumber(deal?.negotiated_price);
  const dealValue = safeNumber(editableDealValue);
  const isPaymentsValid = dealValue > 0 && Math.abs(dealValue - totalPayments) < 0.01;
  const valueChanged = Math.abs(originalDealValue - dealValue) >= 0.01;

  const isIntegration = paymentMode === "integration";
  const isManual = paymentMode === "manual";

  const handleRegisterNegotiation = async () => {
    // Validate
    if (isIntegration && !cpfCnpj) {
      toast({
        title: "CPF/CNPJ obrigatorio",
        description: "Para gerar cobrancas no Asaas, informe o CPF/CNPJ do cliente",
        variant: "destructive",
      });
      return;
    }

    if (!isPaymentsValid) {
      toast({
        title: "Valores nao conferem",
        description: "A soma dos pagamentos deve ser igual ao valor do deal",
        variant: "destructive",
      });
      return;
    }

    try {
      setStep("generating");

      // Save the deal value for success screen before any async operations
      const finalDealValue = editableDealValue;
      setSavedDealValue(finalDealValue);

      // 0. Update deal value if changed
      if (valueChanged) {
        await updateDeal.mutateAsync({
          id: deal.id,
          negotiated_price: finalDealValue,
        });
      }

      // 1. Create deal_payments records
      const paymentsToCreate = payments.map((payment) => ({
        deal_id: deal.id,
        description: payment.description,
        billing_type: payment.billing_type,
        amount: payment.amount,
        installments: payment.installments,
        due_date: payment.due_date,
        gateway: payment.gateway || "manual",
        payer_lead_id: payment.payer_lead_id,
      }));

      const createdPayments = await createPaymentsBatch.mutateAsync(paymentsToCreate);

      // 2. Generate Asaas payment links only for integration mode
      const links: typeof generatedLinks = [];

      if (isIntegration && createdPayments && createdPayments.length > 0) {
        for (const payment of createdPayments) {
          try {
            const result = await generatePaymentLink.mutateAsync({
              paymentId: payment.id,
              dealId: payment.deal_id,
              cpfCnpj: cpfCnpj.replace(/\D/g, ""),
            });

            if (result?.payment_link) {
              links.push({
                description: payment.description || "Pagamento",
                link: result.payment_link,
                amount: Number(payment.amount),
              });
            }
          } catch (linkError) {
            console.error("Error generating link for payment:", payment.id, linkError);
          }
        }
      }

      // NOTE: NOT marking deal as won here!
      // The salesperson will mark as won LATER after receiving payment confirmation

      setGeneratedLinks(links);
      setStep("success");

      toast({
        title: isManual ? "Pagamento registrado!" : "Negociacao registrada!",
        description: isIntegration
          ? `${links.length} link(s) de pagamento gerado(s) - Envie para o cliente!`
          : "Pagamento registrado com sucesso",
      });
    } catch (error) {
      console.error("Error registering negotiation:", error);
      setStep("config");
      toast({
        title: "Erro ao registrar negociacao",
        description: "Tente novamente ou contate o suporte",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Link copiado!" });
  };

  const copyAllLinks = () => {
    const text = generatedLinks
      .map((l) => `${l.description}: ${l.link}`)
      .join("\n\n");
    navigator.clipboard.writeText(text);
    toast({ title: "Todos os links copiados!" });
  };

  const leadOrContact = deal?.lead || deal?.contact;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Registrar Negociacao - {leadOrContact?.name || "Cliente"}
          </DialogTitle>
          <DialogDescription>
            Configure os pagamentos para este deal
          </DialogDescription>
        </DialogHeader>

        {step === "config" && (
          <>
            {/* Mode Toggle */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentMode("manual");
                  // Limpar gateway de todos os pagamentos ao voltar pra manual
                  setPayments(prev => prev.map(p => ({ ...p, gateway: "" })));
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                  isManual
                    ? "border-blue-500 bg-blue-50"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <Hand className={cn("h-5 w-5", isManual ? "text-blue-600" : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium text-sm", isManual ? "text-blue-700" : "text-foreground")}>Manual</p>
                  <p className="text-xs text-muted-foreground">Registrar pagamento sem gerar link</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentMode("integration");
                  // Setar gateway "asaas" em todos os pagamentos
                  setPayments(prev => prev.map(p => ({ ...p, gateway: "asaas" })));
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left",
                  isIntegration
                    ? "border-green-500 bg-green-50"
                    : "border-muted hover:border-muted-foreground/30"
                )}
              >
                <Zap className={cn("h-5 w-5", isIntegration ? "text-green-600" : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium text-sm", isIntegration ? "text-green-700" : "text-foreground")}>Integracao</p>
                  <p className="text-xs text-muted-foreground">Gerar link de pagamento (Asaas)</p>
                </div>
              </button>
            </div>

            {/* Deal Summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Produto</span>
                <span className="font-medium">{deal?.product?.name || "N/A"}</span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="deal-value" className="text-sm text-muted-foreground">
                  Valor Final da Venda
                </Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">R$</span>
                  <Input
                    id="deal-value"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editableDealValue || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      const newValue = value === "" ? 0 : parseFloat(value) || 0;
                      setEditableDealValue(newValue);
                      // Update the first payment to match if there's only one payment
                      if (payments.length === 1) {
                        setPayments([{ ...payments[0], amount: newValue }]);
                      }
                    }}
                    className="text-lg font-bold"
                  />
                </div>
                {valueChanged && (
                  <p className="text-xs text-amber-600">
                    Valor original: {formatCurrency(originalDealValue)} → Novo: {formatCurrency(editableDealValue)}
                  </p>
                )}
              </div>
              {deal?.discount_percent && deal.discount_percent > 0 && (
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Desconto aplicado</span>
                  <Badge variant="secondary" className="text-green-600">
                    -{deal.discount_percent}%
                  </Badge>
                </div>
              )}
            </div>

            <Separator />

            {/* CPF/CNPJ for integration mode */}
            {isIntegration && (
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF/CNPJ do Cliente *</Label>
                <Input
                  id="cpf"
                  placeholder="000.000.000-00 ou 00.000.000/0000-00"
                  value={cpfCnpj}
                  onChange={(e) => setCpfCnpj(e.target.value)}
                />
              </div>
            )}

            {(isIntegration) && <Separator />}

            {/* Flexible Payments */}
            <Accordion type="single" collapsible defaultValue="payments">
              <AccordionItem value="payments">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Formas de Pagamento
                    {!isPaymentsValid && (
                      <Badge variant="destructive" className="ml-2">
                        Valores nao conferem
                      </Badge>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <FlexiblePaymentForm
                    payments={payments}
                    onChange={setPayments}
                    totalDealValue={dealValue}
                    defaultGateway={isIntegration ? "asaas" : ""}
                    hideGatewaySelector={isIntegration}
                    dealContacts={dealContacts}
                  />

                  {!isPaymentsValid && (
                    <Alert variant="destructive" className="mt-4">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>
                        Diferenca: {formatCurrency(Math.abs(dealValue - totalPayments))}
                      </AlertDescription>
                    </Alert>
                  )}
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleRegisterNegotiation}
                disabled={!isPaymentsValid || (isIntegration && !cpfCnpj) || (isIntegration && payments.some(p => !p.gateway))}
                className={cn(
                  isManual ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
                )}
              >
                {isManual ? (
                  <>
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Registrar Pagamento
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Gerar Links de Pagamento
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === "generating" && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="font-medium">
                {isIntegration ? "Gerando links de pagamento..." : "Registrando pagamento..."}
              </p>
              <p className="text-sm text-muted-foreground">
                {isIntegration
                  ? "Criando cobranças no Asaas"
                  : "Salvando dados do pagamento"}
              </p>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="space-y-6">
            <div className="text-center py-6">
              <div className={cn(
                "w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4",
                isManual ? "bg-blue-100" : "bg-green-100"
              )}>
                <CheckCircle2 className={cn("h-8 w-8", isManual ? "text-blue-600" : "text-green-600")} />
              </div>
              <h3 className={cn("text-xl font-bold", isManual ? "text-blue-600" : "text-green-600")}>
                {isManual ? "Pagamento Registrado!" : "Links Gerados!"}
              </h3>
              <p className="text-muted-foreground mt-1">
                Valor total: {formatCurrency(savedDealValue)}
              </p>
            </div>

            {generatedLinks.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium">Links de Pagamento</h4>
                    <Button variant="outline" size="sm" onClick={copyAllLinks}>
                      <Copy className="h-4 w-4 mr-2" />
                      Copiar Todos
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {generatedLinks.map((link, index) => (
                      <div
                        key={index}
                        className="bg-muted/50 rounded-lg p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{link.description}</span>
                          <Badge>{formatCurrency(link.amount)}</Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            value={link.link}
                            readOnly
                            className="text-xs bg-background"
                          />
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => copyToClipboard(link.link)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => window.open(link.link, "_blank")}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <Alert className="bg-amber-50 border-amber-200">
                    <Send className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-800">
                      <strong>Proximo passo:</strong> Envie os links para o cliente via WhatsApp.
                    </AlertDescription>
                  </Alert>
                </div>
              </>
            )}

            {isManual && (
              <Alert className="bg-blue-50 border-blue-200">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-800">
                  Pagamento registrado manualmente. Marque como <strong>"Pago"</strong> quando receber a confirmacao.
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button onClick={() => onOpenChange(false)} className="w-full">
                {isManual ? "Fechar" : "Fechar e Enviar Links"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
