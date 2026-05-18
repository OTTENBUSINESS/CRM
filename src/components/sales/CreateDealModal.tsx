import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useCreateDeal } from "@/hooks/useSalesDeals";
import { useProducts } from "@/hooks/useProducts";
import { useCreateDealPaymentsBatch } from "@/hooks/useDealPayments";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { FlexiblePaymentForm } from "./payments/FlexiblePaymentForm";
import type { PaymentPart } from "@/types/payment.types";
import type { CreateDealInput } from "@/types/sales.types";
import {
  Loader2,
  DollarSign,
  Package,
  CreditCard,
  Calendar,
  ChevronDown,
  ChevronRight,
  User,
  UserPlus,
} from "lucide-react";

interface CreateDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName?: string;
  defaultNotes?: string;
}

const paymentMethods = [
  { value: "pix", label: "PIX" },
  { value: "credit_card", label: "Cartao de Credito" },
  { value: "debit_card", label: "Cartao de Debito" },
  { value: "boleto", label: "Boleto" },
  { value: "transfer", label: "Transferencia" },
];

const installmentOptions = [
  { value: 1, label: "A vista" },
  { value: 2, label: "2x" },
  { value: 3, label: "3x" },
  { value: 4, label: "4x" },
  { value: 5, label: "5x" },
  { value: 6, label: "6x" },
  { value: 10, label: "10x" },
  { value: 12, label: "12x" },
];

export function CreateDealModal({
  open,
  onOpenChange,
  leadId,
  leadName,
  defaultNotes,
}: CreateDealModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const createDeal = useCreateDeal();
  const createPaymentsBatch = useCreateDealPaymentsBatch();
  const { data: products, isLoading: productsLoading } = useProducts();

  // Buscar todos os membros do time (mesma query do LeadDetail)
  const { data: teamMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('id, name, role')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const [useFlexiblePayments, setUseFlexiblePayments] = useState(false);
  const [flexiblePayments, setFlexiblePayments] = useState<PaymentPart[]>([]);
  const [isPaymentsOpen, setIsPaymentsOpen] = useState(true);

  const [formData, setFormData] = useState<Partial<CreateDealInput>>({
    contact_id: leadId,
    product_id: "",
    sales_rep_id: "",
    sdr_id: "",
    original_price: 0,
    negotiated_price: 0,
    discount_percent: 0,
    discount_reason: "",
    payment_method: "pix",
    installments: 1,
    expected_close_date: "",
    notes: "",
  });

  // Update leadId and sales_rep_id when props change or modal opens
  useEffect(() => {
    if (open) {
      setFormData((prev) => ({
        ...prev,
        contact_id: leadId,
        sales_rep_id: prev.sales_rep_id || teamMember?.id || "",
        notes: prev.notes || defaultNotes || "",
      }));
    }
  }, [leadId, open, teamMember?.id, defaultNotes]);

  // Reset flexible payments when negotiated price changes
  useEffect(() => {
    if (formData.negotiated_price && formData.negotiated_price > 0 && useFlexiblePayments) {
      // Only reset if no payments exist yet or if there's a significant price change
      if (flexiblePayments.length === 0) {
        const defaultDueDate = new Date();
        defaultDueDate.setDate(defaultDueDate.getDate() + 7);

        setFlexiblePayments([
          {
            id: Math.random().toString(36).substr(2, 9),
            description: "Pagamento Principal",
            billing_type: "pix",
            amount: formData.negotiated_price,
            installments: 1,
            due_date: defaultDueDate.toISOString().split("T")[0],
          },
        ]);
      }
    }
  }, [formData.negotiated_price, useFlexiblePayments]);

  const handleProductChange = (productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      setFormData({
        ...formData,
        product_id: productId,
        original_price: Number(product.price) || 0,
        negotiated_price: Number(product.price) || 0,
        discount_percent: 0,
      });
      setFlexiblePayments([]); // Reset payments when product changes
    }
  };

  const handlePriceChange = (negotiatedPrice: number) => {
    const original = formData.original_price || 0;
    const discount =
      original > 0 ? ((original - negotiatedPrice) / original) * 100 : 0;
    setFormData({
      ...formData,
      negotiated_price: negotiatedPrice,
      discount_percent: Math.round(discount * 100) / 100,
    });
    setFlexiblePayments([]); // Reset payments when price changes
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.product_id) {
      toast({
        title: "Erro",
        description: "Selecione um produto",
        variant: "destructive",
      });
      return;
    }

    if (!formData.negotiated_price || formData.negotiated_price <= 0) {
      toast({
        title: "Erro",
        description: "Informe o valor negociado",
        variant: "destructive",
      });
      return;
    }

    // Validate flexible payments
    if (useFlexiblePayments) {
      const totalPayments = flexiblePayments.reduce((sum, p) => sum + p.amount, 0);
      const difference = Math.abs(formData.negotiated_price - totalPayments);

      if (difference > 0.01) {
        toast({
          title: "Erro",
          description: "A soma dos pagamentos deve ser igual ao valor negociado",
          variant: "destructive",
        });
        return;
      }

      if (flexiblePayments.some((p) => !p.due_date)) {
        toast({
          title: "Erro",
          description: "Informe a data de vencimento de todos os pagamentos",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      // Create the deal
      const deal = await createDeal.mutateAsync({
        contact_id: leadId,
        product_id: formData.product_id,
        sales_rep_id: formData.sales_rep_id || undefined,
        sdr_id: formData.sdr_id || undefined,
        original_price: formData.original_price || 0,
        negotiated_price: formData.negotiated_price || 0,
        discount_percent: formData.discount_percent,
        discount_reason: formData.discount_reason,
        payment_method: useFlexiblePayments
          ? flexiblePayments[0]?.billing_type || "pix"
          : formData.payment_method,
        installments: useFlexiblePayments
          ? flexiblePayments[0]?.installments || 1
          : formData.installments,
        expected_close_date: formData.expected_close_date || undefined,
        notes: formData.notes,
      });

      // Create deal payments if using flexible payments
      if (useFlexiblePayments && flexiblePayments.length > 0 && deal?.id) {
        const paymentsToCreate = flexiblePayments.map((payment) => ({
          deal_id: deal.id,
          description: payment.description,
          billing_type: payment.billing_type,
          amount: payment.amount,
          installments: payment.installments,
          due_date: payment.due_date,
        }));

        await createPaymentsBatch.mutateAsync(paymentsToCreate);
      }

      toast({ title: "Sucesso", description: "Deal criado com sucesso!" });
      onOpenChange(false);

      // Reset form
      setFormData({
        contact_id: leadId,
        product_id: "",
        sales_rep_id: teamMember?.id || "",
        sdr_id: "",
        original_price: 0,
        negotiated_price: 0,
        discount_percent: 0,
        discount_reason: "",
        payment_method: "pix",
        installments: 1,
        expected_close_date: "",
        notes: "",
      });
      setFlexiblePayments([]);
      setUseFlexiblePayments(false);
    } catch (error) {
      console.error("Erro ao criar deal:", error);
      toast({
        title: "Erro",
        description: "Erro ao criar deal",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const isPending = createDeal.isPending || createPaymentsBatch.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-green-600" />
            Novo Deal
          </DialogTitle>
          {leadName && (
            <p className="text-sm text-muted-foreground">Lead: {leadName}</p>
          )}
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Produto e Responsável */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Package className="h-4 w-4" />
                Produto *
              </Label>
              <Select
                value={formData.product_id}
                onValueChange={handleProductChange}
                disabled={productsLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o produto..." />
                </SelectTrigger>
                <SelectContent>
                  {products?.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      <div className="flex justify-between items-center w-full gap-4">
                        <span>{product.name}</span>
                        <span className="text-muted-foreground text-sm">
                          {formatCurrency(Number(product.price) || 0)}
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Responsável
              </Label>
              <Select
                value={formData.sales_rep_id || ""}
                onValueChange={(value) =>
                  setFormData({ ...formData, sales_rep_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* SDR */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              SDR (quem agendou)
            </Label>
            <Select
              value={formData.sdr_id || ""}
              onValueChange={(value) =>
                setFormData({ ...formData, sdr_id: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Opcional..." />
              </SelectTrigger>
              <SelectContent>
                {teamMembers.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Precos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Preco Original</Label>
              <Input
                type="number"
                value={formData.original_price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    original_price: Number(e.target.value),
                  })
                }
                disabled
                className="bg-muted"
              />
            </div>

            <div className="space-y-2">
              <Label>Valor Negociado *</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={formData.negotiated_price || ""}
                onChange={(e) => handlePriceChange(Number(e.target.value))}
              />
            </div>
          </div>

          {/* Desconto */}
          {formData.discount_percent && formData.discount_percent > 0 ? (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Desconto aplicado
                </span>
                <span className="text-lg font-bold text-yellow-600">
                  {formData.discount_percent.toFixed(1)}%
                </span>
              </div>
              <div className="mt-2">
                <Label className="text-xs text-yellow-700 dark:text-yellow-300">
                  Motivo do desconto
                </Label>
                <Input
                  placeholder="Ex: Cliente fidelidade, pacote..."
                  value={formData.discount_reason || ""}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_reason: e.target.value })
                  }
                  className="mt-1 bg-white dark:bg-background"
                />
              </div>
            </div>
          ) : null}

          {/* Toggle Flexible Payments */}
          {formData.negotiated_price && formData.negotiated_price > 0 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="flexible-payments" className="text-sm font-medium">
                  Pagamentos Flexiveis
                </Label>
                <p className="text-xs text-muted-foreground">
                  Permite multiplas formas de pagamento para este deal
                </p>
              </div>
              <Switch
                id="flexible-payments"
                checked={useFlexiblePayments}
                onCheckedChange={setUseFlexiblePayments}
              />
            </div>
          )}

          {/* Flexible Payments Form */}
          {useFlexiblePayments && formData.negotiated_price ? (
            <Collapsible open={isPaymentsOpen} onOpenChange={setIsPaymentsOpen}>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full justify-between p-3 h-auto"
                >
                  <span className="flex items-center gap-2">
                    <CreditCard className="h-4 w-4" />
                    Formas de Pagamento
                  </span>
                  {isPaymentsOpen ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <FlexiblePaymentForm
                  totalAmount={formData.negotiated_price}
                  payments={flexiblePayments}
                  onChange={setFlexiblePayments}
                />
              </CollapsibleContent>
            </Collapsible>
          ) : (
            /* Simple Payment Fields */
            formData.negotiated_price && formData.negotiated_price > 0 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Forma de Pagamento
                    </Label>
                    <Select
                      value={formData.payment_method}
                      onValueChange={(value) =>
                        setFormData({ ...formData, payment_method: value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {paymentMethods.map((method) => (
                          <SelectItem key={method.value} value={method.value}>
                            {method.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Parcelas</Label>
                    <Select
                      value={String(formData.installments)}
                      onValueChange={(value) =>
                        setFormData({ ...formData, installments: Number(value) })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {installmentOptions.map((opt) => (
                          <SelectItem key={opt.value} value={String(opt.value)}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )
          )}

          {/* Data prevista */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Previsao de Fechamento
            </Label>
            <Input
              type="date"
              value={formData.expected_close_date || ""}
              onChange={(e) =>
                setFormData({ ...formData, expected_close_date: e.target.value })
              }
            />
          </div>

          {/* Notas */}
          <div className="space-y-2">
            <Label>Observacoes</Label>
            <Textarea
              placeholder="Detalhes da negociacao..."
              value={formData.notes || ""}
              onChange={(e) =>
                setFormData({ ...formData, notes: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Resumo */}
          {formData.negotiated_price && formData.negotiated_price > 0 && !useFlexiblePayments && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700 dark:text-green-300">
                  Valor do Deal
                </span>
                <span className="text-xl font-bold text-green-600">
                  {formatCurrency(formData.negotiated_price)}
                </span>
              </div>
              {formData.installments && formData.installments > 1 && (
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                  {formData.installments}x de{" "}
                  {formatCurrency(
                    formData.negotiated_price / formData.installments
                  )}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Criar Deal
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
