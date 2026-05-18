import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWinDeal, useUpdateDeal } from "@/hooks/useSalesDeals";
import { useDealPayments, useCreateDealPaymentsBatch } from "@/hooks/useDealPayments";
import { useDealContacts } from "@/hooks/useDealContacts";
import { useAllProducts } from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { FlexiblePaymentForm } from "./payments/FlexiblePaymentForm";
import type { PaymentPart } from "@/types/payment.types";
import {
  Trophy,
  AlertCircle,
  CreditCard,
  CalendarIcon,
  FileText,
  Clock,
  ShieldAlert,
  Gift,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  DollarSign,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

interface WinDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: any;
}

export function WinDealModal({ open, onOpenChange, deal }: WinDealModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const winDeal = useWinDeal();
  const { data: existingPayments } = useDealPayments(deal?.id);
  const createPaymentsBatch = useCreateDealPaymentsBatch();
  const { data: dealContacts } = useDealContacts(deal?.id);
  const { data: allProducts } = useAllProducts();
  const updateDeal = useUpdateDeal();

  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  // Step 1: Produto e Valor
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [editableValue, setEditableValue] = useState(0);
  const [priceJustification, setPriceJustification] = useState("");
  const [wonDate, setWonDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Step 2: Pagamento
  const [payments, setPayments] = useState<PaymentPart[]>([]);
  const hasExistingPayments = existingPayments && existingPayments.length > 0;

  // Step 3: Flags CS
  const [entradaCompleta, setEntradaCompleta] = useState(true);
  const [valorFaltante, setValorFaltante] = useState(0);
  const [garantiaCdc, setGarantiaCdc] = useState(true);
  const [tempoAcessoMeses, setTempoAcessoMeses] = useState("12");
  const [bonusSaas, setBonusSaas] = useState(false);
  const [observacoesCs, setObservacoesCs] = useState("");
  const [notes, setNotes] = useState("");

  const leadOrContact = deal?.lead || deal?.contact;

  // Reset on open
  useEffect(() => {
    if (open && deal) {
      setStep(1);
      setSelectedProductId(deal.product?.id || deal.product_id || null);
      setEditableValue(Number(deal.negotiated_price) || 0);
      setPriceJustification("");
      setWonDate(new Date().toISOString().split("T")[0]);
      setPayments([]);
      setEntradaCompleta(true);
      setValorFaltante(0);
      setGarantiaCdc(true);
      setTempoAcessoMeses("12");
      setBonusSaas(false);
      setObservacoesCs("");
      setNotes("");
    }
  }, [open, deal]);

  const handleConfirm = async () => {
    try {
      setIsLoading(true);

      // Atualizar valor e/ou produto se mudou
      const updates: Record<string, any> = {};
      if (editableValue !== Number(deal.negotiated_price)) updates.negotiated_price = editableValue;
      if (selectedProductId && selectedProductId !== (deal.product?.id || deal.product_id)) updates.product_id = selectedProductId;
      if (priceJustification.trim()) updates.discount_reason = priceJustification.trim();
      if (Object.keys(updates).length > 0) {
        updates.updated_at = new Date().toISOString();
        await supabase.from('deals').update(updates).eq('id', deal.id);
      }

      // Criar parcelas se configuradas (e não tem parcelas existentes)
      if (payments.length > 0 && !hasExistingPayments) {
        await createPaymentsBatch.mutateAsync(
          payments.map(p => ({
            deal_id: deal.id,
            amount: p.amount,
            due_date: p.due_date,
            billing_type: p.billing_type,
            installments: p.installments || 1,
            description: p.description,
            gateway: p.gateway || 'asaas',
            payer_lead_id: p.payer_lead_id,
          }))
        );
      }

      // Marcar como ganho
      await winDeal.mutateAsync({
        dealId: deal.id,
        notes: notes || undefined,
        wonAt: new Date().toISOString(),
        negotiationDetails: {
          entrada_completa: entradaCompleta,
          valor_faltante: entradaCompleta ? 0 : valorFaltante,
          garantia_cdc: garantiaCdc,
          garantia_cdc_inicio: garantiaCdc ? wonDate : null,
          tempo_acesso_meses: parseInt(tempoAcessoMeses),
          bonus_saas: bonusSaas,
          observacoes_cs: observacoesCs || null,
        },
      });

      // Registrar na timeline
      const leadId = deal.lead_id || deal.lead?.id;
      if (leadId) {
        const valorFmt = formatCurrency(editableValue);
        const selectedProduct = allProducts?.find((p: any) => p.id === selectedProductId);
        const prodPrice = Number(selectedProduct?.price) || 0;
        const justifText = priceJustification.trim() ? ` Justificativa: ${priceJustification.trim()}.` : '';
        const discountText = prodPrice > 0 && editableValue !== prodPrice
          ? ` (tabela: ${formatCurrency(prodPrice)}, ${editableValue < prodPrice ? 'desconto' : 'acréscimo'}: ${Math.abs(Math.round((1 - editableValue / prodPrice) * 100))}%).${justifText}`
          : '';
        try {
          await supabase.from('company_activities').insert({
            lead_id: leadId,
            team: 'sales',
            task_type: 'deal_won',
            name: `🏆 Deal marcado como GANHO por ${teamMember?.name || 'vendedor'}`,
            description: `${deal.title || 'Deal'} — ${valorFmt}${discountText}${notes ? ` Obs: ${notes}` : ''}`,
            status: 'completed',
            completed: true,
            metadata: {
              deal_id: deal.id,
              deal_title: deal.title,
              value: editableValue,
              won_by: teamMember?.name,
              won_at: wonDate,
              notes,
              payments_count: payments.length,
              entrada_completa: entradaCompleta,
              garantia_cdc: garantiaCdc,
            },
          });
        } catch { /* silent */ }
      }

      toast({ title: "Deal ganho!", description: `${formatCurrency(editableValue)} — Parabéns!` });
      onOpenChange(false);
    } catch (error) {
      console.error("Error winning deal:", error);
      toast({ title: "Erro ao marcar como ganho", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!deal) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-green-500" />
            Fechar como Ganho
          </DialogTitle>
          <DialogDescription>
            Passo {step} de 3 — {step === 1 ? 'Produto e Valor' : step === 2 ? 'Pagamento' : 'Detalhes para CS'}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicators */}
        <div className="flex items-center gap-2 px-1">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors",
                s < step ? "bg-green-500 text-white" :
                s === step ? "bg-primary text-primary-foreground" :
                "bg-muted text-muted-foreground"
              )}>
                {s < step ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              <span className={cn("text-xs truncate", s === step ? "font-semibold" : "text-muted-foreground")}>
                {s === 1 ? 'Valor' : s === 2 ? 'Pagamento' : 'CS'}
              </span>
              {s < 3 && <div className={cn("flex-1 h-0.5 rounded", s < step ? "bg-green-500" : "bg-muted")} />}
            </div>
          ))}
        </div>

        <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-4">
          {/* ═══════ STEP 1: Produto e Valor ═══════ */}
          {step === 1 && (
            <>
              {/* Card resumo */}
              <div className="bg-green-50 dark:bg-green-950/20 rounded-lg p-4 space-y-3 border border-green-200 dark:border-green-900">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Cliente</span>
                  <span className="font-semibold">{leadOrContact?.name || "N/A"}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Produto</span>
                  {deal?.product?.name && selectedProductId === deal.product.id ? (
                    <span className="font-medium flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {deal.product.name}
                    </span>
                  ) : (
                    <Badge variant="outline" className="text-amber-600 border-amber-200">
                      Selecione abaixo
                    </Badge>
                  )}
                </div>
              </div>

              {/* Produto — seletor se não tem */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Produto
                </Label>
                <Select
                  value={selectedProductId || ""}
                  onValueChange={(val) => {
                    setSelectedProductId(val);
                    const prod = allProducts?.find((p: any) => p.id === val);
                    if (prod?.price && !editableValue) {
                      setEditableValue(Number(prod.price));
                    }
                  }}
                >
                  <SelectTrigger className={cn("h-10", !selectedProductId && "border-amber-300 text-amber-600")}>
                    <SelectValue placeholder="Selecione o produto..." />
                  </SelectTrigger>
                  <SelectContent>
                    {(allProducts || []).filter((p: any) => p.is_active !== false).map((product: any) => (
                      <SelectItem key={product.id} value={product.id}>
                        <div className="flex items-center justify-between gap-3 w-full">
                          <span>{product.name}</span>
                          {product.price > 0 && (
                            <span className="text-xs text-muted-foreground">{formatCurrency(product.price)}</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Valor editável com máscara */}
              {(() => {
                const selectedProduct = allProducts?.find((p: any) => p.id === selectedProductId);
                const productPrice = Number(selectedProduct?.price) || 0;
                const diff = productPrice > 0 ? editableValue - productPrice : 0;
                const diffPercent = productPrice > 0 ? Math.round((diff / productPrice) * 100) : 0;

                return (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5">
                      <DollarSign className="h-3.5 w-3.5" />
                      Valor Final da Venda
                    </Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={editableValue ? formatCurrency(editableValue) : ''}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^\d]/g, '');
                        setEditableValue(Number(raw) / 100);
                      }}
                      className="text-xl font-bold h-14 text-center"
                      placeholder="R$ 0,00"
                    />

                    {/* Comparação com preço do produto */}
                    {productPrice > 0 && editableValue > 0 && editableValue !== productPrice && (
                      <div className={cn(
                        "flex items-center justify-between p-2 rounded-lg text-xs",
                        diff < 0 ? "bg-green-50 dark:bg-green-950/20 border border-green-200" :
                        diff > 0 ? "bg-amber-50 dark:bg-amber-950/20 border border-amber-200" : ""
                      )}>
                        <span className="text-muted-foreground">
                          Preço tabela: {formatCurrency(productPrice)}
                        </span>
                        {diff < 0 ? (
                          <Badge className="bg-green-100 text-green-700 border-green-300 hover:bg-green-100">
                            {diffPercent}% desconto ({formatCurrency(Math.abs(diff))} off)
                          </Badge>
                        ) : diff > 0 ? (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-100">
                            +{diffPercent}% acréscimo ({formatCurrency(diff)} a mais)
                          </Badge>
                        ) : null}
                      </div>
                    )}

                    {/* Justificativa — obrigatória quando valor difere do preço tabela */}
                    {productPrice > 0 && editableValue > 0 && editableValue !== productPrice && (
                      <div className="space-y-1">
                        <Label className="text-xs font-medium flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          Justificativa {diff < 0 ? 'do desconto' : 'do acréscimo'} *
                        </Label>
                        <Input
                          value={priceJustification}
                          onChange={(e) => setPriceJustification(e.target.value)}
                          placeholder={diff < 0
                            ? "Ex: Negociou condição especial por indicação, pagamento à vista..."
                            : "Ex: Inclui módulo extra, suporte premium, consultoria adicional..."
                          }
                          className={cn("text-sm h-9", !priceJustification && "border-amber-300")}
                        />
                      </div>
                    )}

                    {/* Se valor é 0 e tem produto, sugerir */}
                    {productPrice > 0 && !editableValue && (
                      <button
                        type="button"
                        onClick={() => setEditableValue(productPrice)}
                        className="text-xs text-primary hover:underline"
                      >
                        Usar preço do produto: {formatCurrency(productPrice)}
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Data de fechamento */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Data de Fechamento
                </Label>
                <Input
                  type="date"
                  value={wonDate}
                  onChange={(e) => setWonDate(e.target.value)}
                />
              </div>
            </>
          )}

          {/* ═══════ STEP 2: Pagamento ═══════ */}
          {step === 2 && (
            <>
              {hasExistingPayments ? (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Este deal já tem <strong>{existingPayments.length} parcela(s)</strong> configurada(s) totalizando{" "}
                    <strong>{formatCurrency(existingPayments.reduce((s: number, p: any) => s + Number(p.amount), 0))}</strong>.
                    As parcelas existentes serão mantidas.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <Alert className="border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20">
                    <CreditCard className="h-4 w-4 text-blue-600" />
                    <AlertDescription className="text-blue-800 dark:text-blue-300 text-sm">
                      Configure como o cliente vai pagar. Pode dividir em várias parcelas com formas de pagamento diferentes.
                    </AlertDescription>
                  </Alert>

                  <FlexiblePaymentForm
                    totalDealValue={editableValue}
                    payments={payments}
                    onChange={setPayments}
                    dealContacts={dealContacts || undefined}
                  />

                  {payments.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Clique em "+ Adicionar parcela" acima para configurar o pagamento.
                      <br />
                      Se preferir, pode pular e configurar depois.
                    </p>
                  )}
                </>
              )}
            </>
          )}

          {/* ═══════ STEP 3: Detalhes para CS ═══════ */}
          {step === 3 && (
            <>
              {/* Entrada */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-sm font-medium">Entrada completa?</Label>
                    <p className="text-[10px] text-muted-foreground">O cliente pagou o valor total da entrada?</p>
                  </div>
                  <Switch checked={entradaCompleta} onCheckedChange={setEntradaCompleta} />
                </div>
                {!entradaCompleta && (
                  <div className="space-y-2 pt-1">
                    <Alert className="border-amber-200 bg-amber-50">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-800 text-xs">
                        <strong>Onboarding como Follow-up:</strong> Acesso bloqueado até pagamento completo.
                      </AlertDescription>
                    </Alert>
                    <div className="space-y-1">
                      <Label className="text-xs">Valor faltante (R$)</Label>
                      <Input type="number" step="0.01" min="0" placeholder="Ex: 2600" value={valorFaltante || ""} onChange={(e) => setValorFaltante(parseFloat(e.target.value) || 0)} className="h-8 text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {/* CDC + Tempo + Bônus — compacto */}
              <div className="grid grid-cols-2 gap-2">
                <div className={cn("rounded-lg border p-3 flex items-center justify-between", garantiaCdc && "border-red-300 bg-red-50")}>
                  <div>
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <ShieldAlert className={cn("h-3 w-3", garantiaCdc ? "text-red-500" : "text-muted-foreground")} />
                      CDC 7 dias
                    </Label>
                  </div>
                  <Switch checked={garantiaCdc} onCheckedChange={setGarantiaCdc} />
                </div>

                <div className={cn("rounded-lg border p-3 flex items-center justify-between", bonusSaas && "border-green-300 bg-green-50")}>
                  <div>
                    <Label className="text-xs font-medium flex items-center gap-1">
                      <Gift className={cn("h-3 w-3", bonusSaas ? "text-green-500" : "text-muted-foreground")} />
                      Bônus SaaS
                    </Label>
                  </div>
                  <Switch checked={bonusSaas} onCheckedChange={setBonusSaas} />
                </div>
              </div>

              {/* Tempo de acesso */}
              <div className="rounded-lg border p-3 flex items-center justify-between">
                <div>
                  <Label className="text-xs font-medium flex items-center gap-1">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    Tempo de acesso
                  </Label>
                </div>
                <Select value={tempoAcessoMeses} onValueChange={setTempoAcessoMeses}>
                  <SelectTrigger className="w-[120px] h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">3 meses</SelectItem>
                    <SelectItem value="6">6 meses</SelectItem>
                    <SelectItem value="12">12 meses</SelectItem>
                    <SelectItem value="24">24 meses</SelectItem>
                    <SelectItem value="0">Vitalício</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Observações — 1 campo só */}
              <div className="space-y-2">
                <Label className="text-xs font-medium">Observações para CS / Onboarding</Label>
                <Textarea
                  placeholder="Ex: Foco em automação WhatsApp. Precisa ver resultado rápido. Objeção de preço foi forte. Pagou via PIX..."
                  value={observacoesCs}
                  onChange={(e) => setObservacoesCs(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
              </div>

              {/* Flags de alerta */}
              {(!entradaCompleta || garantiaCdc) && (
                <Alert className="border-red-200 bg-red-50">
                  <ShieldAlert className="h-4 w-4 text-red-600" />
                  <AlertDescription className="text-red-800 text-xs space-y-1">
                    <p className="font-semibold">Flags especiais neste cliente:</p>
                    {!entradaCompleta && <p>• <strong>Entrada parcial</strong> — Falta {formatCurrency(valorFaltante)}</p>}
                    {garantiaCdc && <p>• <strong>CDC 7 dias</strong> — Risco de cancelamento</p>}
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
        </div>

        {/* Footer: Navegação */}
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {step > 1 && (
              <Button variant="ghost" size="sm" onClick={() => setStep(step - 1)} disabled={isLoading}>
                <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancelar
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep(step + 1)} disabled={step === 1 && (!selectedProductId || editableValue <= 0 || (() => {
                const prod = allProducts?.find((p: any) => p.id === selectedProductId);
                const prodPrice = Number(prod?.price) || 0;
                return prodPrice > 0 && editableValue !== prodPrice && !priceJustification.trim();
              })())}>
                Próximo <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button onClick={handleConfirm} disabled={isLoading} className="bg-green-600 hover:bg-green-700">
                {isLoading ? "Processando..." : (
                  <>
                    <Trophy className="h-4 w-4 mr-2" />
                    Confirmar Ganho
                  </>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
