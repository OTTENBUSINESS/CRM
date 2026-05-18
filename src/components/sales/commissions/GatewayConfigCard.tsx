import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  usePaymentGateways,
  useCreatePaymentGateway,
  useUpdatePaymentGateway,
  useDeletePaymentGateway,
} from "@/hooks/usePaymentGateways";
import { useToast } from "@/hooks/use-toast";
import type { PaymentGatewayWithFees } from "@/types/gateway.types";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CreditCard,
  QrCode,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const BILLING_TYPES = [
  { key: "pix", label: "PIX", icon: QrCode },
  { key: "boleto", label: "Boleto", icon: FileText },
  { key: "credit_card", label: "Cartao", icon: CreditCard },
];

interface FeeFormData {
  pix_percent: number;
  pix_fixed: number;
  boleto_percent: number;
  boleto_fixed: number;
  credit_card_percent: number;
  credit_card_fixed: number;
}

const defaultFees: FeeFormData = {
  pix_percent: 0,
  pix_fixed: 0,
  boleto_percent: 0,
  boleto_fixed: 0,
  credit_card_percent: 0,
  credit_card_fixed: 0,
};

export function GatewayConfigCard() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingGateway, setEditingGateway] = useState<PaymentGatewayWithFees | null>(null);
  const [deleteGateway, setDeleteGateway] = useState<PaymentGatewayWithFees | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [fees, setFees] = useState<FeeFormData>(defaultFees);

  const { data: gateways, isLoading } = usePaymentGateways(false);
  const createGateway = useCreatePaymentGateway();
  const updateGateway = useUpdatePaymentGateway();
  const deleteGw = useDeletePaymentGateway();

  const handleOpenCreate = () => {
    setEditingGateway(null);
    setName("");
    setSlug("");
    setFees(defaultFees);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (gw: PaymentGatewayWithFees) => {
    setEditingGateway(gw);
    setName(gw.name);
    setSlug(gw.slug);

    const feeMap: FeeFormData = { ...defaultFees };
    for (const f of gw.fees) {
      const bt = f.billing_type as "pix" | "boleto" | "credit_card";
      feeMap[`${bt}_percent`] = Number(f.fee_percent);
      feeMap[`${bt}_fixed`] = Number(f.fee_fixed);
    }
    setFees(feeMap);
    setIsFormOpen(true);
  };

  const buildFeesArray = () => {
    return BILLING_TYPES.map((bt) => ({
      billing_type: bt.key,
      fee_percent: fees[`${bt.key}_percent` as keyof FeeFormData],
      fee_fixed: fees[`${bt.key}_fixed` as keyof FeeFormData],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      toast({ title: "Erro", description: "Nome obrigatorio", variant: "destructive" });
      return;
    }

    try {
      if (editingGateway) {
        await updateGateway.mutateAsync({
          id: editingGateway.id,
          name,
          fees: buildFeesArray(),
        });
        toast({ title: "Sucesso", description: "Gateway atualizado!" });
      } else {
        if (!slug.trim()) {
          toast({ title: "Erro", description: "Slug obrigatorio", variant: "destructive" });
          return;
        }
        await createGateway.mutateAsync({
          name,
          slug: slug.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
          fees: buildFeesArray(),
        });
        toast({ title: "Sucesso", description: "Gateway criado!" });
      }
      setIsFormOpen(false);
    } catch {
      toast({ title: "Erro", description: "Erro ao salvar gateway", variant: "destructive" });
    }
  };

  const handleToggleActive = async (gw: PaymentGatewayWithFees) => {
    try {
      await updateGateway.mutateAsync({
        id: gw.id,
        is_active: !gw.is_active,
      });
      toast({
        title: "Sucesso",
        description: gw.is_active ? "Gateway desativado" : "Gateway ativado",
      });
    } catch {
      toast({ title: "Erro", description: "Erro ao alterar status", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteGateway) return;
    try {
      await deleteGw.mutateAsync(deleteGateway.id);
      toast({ title: "Sucesso", description: "Gateway desativado" });
      setDeleteGateway(null);
    } catch {
      toast({ title: "Erro", description: "Erro ao desativar gateway", variant: "destructive" });
    }
  };

  const isPending = createGateway.isPending || updateGateway.isPending;

  const getFeeDisplay = (gw: PaymentGatewayWithFees, billingType: string) => {
    const fee = gw.fees.find((f) => f.billing_type === billingType);
    if (!fee) return "-";
    const parts: string[] = [];
    if (Number(fee.fee_percent) > 0) parts.push(`${fee.fee_percent}%`);
    if (Number(fee.fee_fixed) > 0) parts.push(`R$ ${Number(fee.fee_fixed).toFixed(2)}`);
    return parts.length > 0 ? parts.join(" + ") : "0";
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Gateways de Pagamento</h3>
          <p className="text-sm text-muted-foreground">
            Configure gateways e taxas por forma de pagamento
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Gateway
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Gateway</TableHead>
              <TableHead className="text-center">PIX</TableHead>
              <TableHead className="text-center">Boleto</TableHead>
              <TableHead className="text-center">Cartao</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !gateways || gateways.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nenhum gateway cadastrado
                </TableCell>
              </TableRow>
            ) : (
              gateways.map((gw) => (
                <TableRow key={gw.id} className={cn(!gw.is_active && "opacity-50")}>
                  <TableCell>
                    <p className="font-medium">{gw.name}</p>
                    <p className="text-xs text-muted-foreground">{gw.slug}</p>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {getFeeDisplay(gw, "pix")}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {getFeeDisplay(gw, "boleto")}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {getFeeDisplay(gw, "credit_card")}
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={gw.is_active}
                      onCheckedChange={() => handleToggleActive(gw)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleOpenEdit(gw)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-600"
                        onClick={() => setDeleteGateway(gw)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingGateway ? "Editar Gateway" : "Novo Gateway de Pagamento"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  placeholder="Ex: PagarMe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug *</Label>
                <Input
                  placeholder="Ex: pagarme"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={!!editingGateway}
                />
                {!editingGateway && (
                  <p className="text-xs text-muted-foreground">
                    Identificador unico (sem espacos)
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-semibold">Taxas por Forma de Pagamento</Label>

              {BILLING_TYPES.map((bt) => {
                const Icon = bt.icon;
                return (
                  <div key={bt.key} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2 w-24">
                      <Icon className="h-4 w-4" />
                      <span className="text-sm font-medium">{bt.label}</span>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">% do valor</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fees[`${bt.key}_percent` as keyof FeeFormData] || ""}
                          onChange={(e) =>
                            setFees({
                              ...fees,
                              [`${bt.key}_percent`]: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-8"
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Fixo (R$)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={fees[`${bt.key}_fixed` as keyof FeeFormData] || ""}
                          onChange={(e) =>
                            setFees({
                              ...fees,
                              [`${bt.key}_fixed`]: parseFloat(e.target.value) || 0,
                            })
                          }
                          className="h-8"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingGateway ? "Salvar" : "Criar Gateway"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteGateway} onOpenChange={() => setDeleteGateway(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Gateway</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desativar o gateway "{deleteGateway?.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteGw.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
