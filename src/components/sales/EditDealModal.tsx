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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useUpdateDeal, useMoveDealStage } from "@/hooks/useSalesDeals";
import { useProducts } from "@/hooks/useProducts";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useToast } from "@/hooks/use-toast";
import type { Deal } from "@/types/sales.types";
import {
  Loader2,
  Pencil,
  Package,
  DollarSign,
  Calendar,
  FileText,
  Target,
} from "lucide-react";

interface EditDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
}

export function EditDealModal({
  open,
  onOpenChange,
  deal,
}: EditDealModalProps) {
  const { toast } = useToast();
  const updateDeal = useUpdateDeal();
  const moveDealStage = useMoveDealStage();
  const { data: products, isLoading: productsLoading } = useProducts();
  const { data: stages } = usePipelineStages(deal?.pipeline_id || undefined);

  const [formData, setFormData] = useState({
    product_id: "",
    original_price: 0,
    negotiated_price: 0,
    discount_percent: 0,
    discount_reason: "",
    expected_close_date: "",
    notes: "",
    pipeline_stage_id: "",
  });

  // Populate form when deal changes
  useEffect(() => {
    if (deal) {
      setFormData({
        product_id: deal.product_id || "",
        original_price: deal.original_price || 0,
        negotiated_price: deal.negotiated_price || 0,
        discount_percent: deal.discount_percent || 0,
        discount_reason: deal.discount_reason || "",
        expected_close_date: deal.expected_close_date
          ? deal.expected_close_date.split("T")[0]
          : "",
        notes: deal.notes || "",
        pipeline_stage_id: deal.pipeline_stage_id || "",
      });
    }
  }, [deal]);

  const handleProductChange = (productId: string) => {
    const product = products?.find((p) => p.id === productId);
    if (product) {
      const originalPrice = Number(product.price) || 0;
      const negotiatedPrice = formData.negotiated_price || originalPrice;
      const discount =
        originalPrice > 0
          ? ((originalPrice - negotiatedPrice) / originalPrice) * 100
          : 0;

      setFormData({
        ...formData,
        product_id: productId,
        original_price: originalPrice,
        discount_percent: Math.max(0, Math.round(discount * 100) / 100),
      });
    }
  };

  const handlePriceChange = (negotiatedPrice: number) => {
    const original = formData.original_price || 0;
    const discount =
      original > 0 ? ((original - negotiatedPrice) / original) * 100 : 0;
    setFormData({
      ...formData,
      negotiated_price: negotiatedPrice,
      discount_percent: Math.max(0, Math.round(discount * 100) / 100),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!deal) return;

    if (!formData.negotiated_price || formData.negotiated_price <= 0) {
      toast({
        title: "Erro",
        description: "Informe o valor negociado",
        variant: "destructive",
      });
      return;
    }

    try {
      const stageChanged = formData.pipeline_stage_id !== deal.pipeline_stage_id;

      // Se o estágio mudou, usar useMoveDealStage (trata status won/lost, sync lead, notificações)
      if (stageChanged && formData.pipeline_stage_id) {
        await moveDealStage.mutateAsync({
          dealId: deal.id,
          stageId: formData.pipeline_stage_id,
        });
      }

      // Atualizar os outros campos (preço, produto, notas, etc.)
      await updateDeal.mutateAsync({
        id: deal.id,
        product_id: formData.product_id && formData.product_id !== "none" ? formData.product_id : null,
        original_price: formData.original_price,
        negotiated_price: formData.negotiated_price,
        discount_percent: formData.discount_percent,
        discount_reason: formData.discount_reason,
        expected_close_date: formData.expected_close_date || null,
        notes: formData.notes,
        // NÃO enviar pipeline_stage_id aqui - já foi tratado pelo moveDealStage
        ...(stageChanged ? {} : { pipeline_stage_id: formData.pipeline_stage_id || null }),
      });

      toast({ title: "Sucesso", description: "Deal atualizado com sucesso!" });
      onOpenChange(false);
    } catch (error) {
      console.error("Erro ao atualizar deal:", error);
      toast({
        title: "Erro",
        description: "Erro ao atualizar deal",
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

  const leadName = deal?.lead?.name || "Lead";
  const isPending = updateDeal.isPending || moveDealStage.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { document.body.style.pointerEvents = ''; setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); } }}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-blue-600" />
            Editar Deal
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Lead: {leadName}</p>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Produto */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produto
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
                <SelectItem value="none">Nenhum produto</SelectItem>
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

          {/* Etapa do Pipeline */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Target className="h-4 w-4" />
              Etapa do Pipeline
            </Label>
            <Select
              value={formData.pipeline_stage_id}
              onValueChange={(value) =>
                setFormData({ ...formData, pipeline_stage_id: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a etapa..." />
              </SelectTrigger>
              <SelectContent>
                {stages?.map((stage) => (
                  <SelectItem key={stage.id} value={stage.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: stage.color || "#888" }}
                      />
                      {stage.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Precos */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Preco Original
              </Label>
              <Input
                type="number"
                value={formData.original_price || ""}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    original_price: Number(e.target.value),
                  })
                }
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
          {formData.discount_percent > 0 && (
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
            <Label className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Observacoes
            </Label>
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
          {formData.negotiated_price > 0 && (
            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-700 dark:text-green-300">
                  Valor do Deal
                </span>
                <span className="text-xl font-bold text-green-600">
                  {formatCurrency(formData.negotiated_price)}
                </span>
              </div>
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
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Salvar Alteracoes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
