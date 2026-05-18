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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useCommissionRules,
  useCreateCommissionRule,
  useUpdateCommissionRule,
  useDeleteCommissionRule,
} from "@/hooks/useCommissions";
import { useProducts } from "@/hooks/useProducts";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";
import type {
  CommissionRule,
  CommissionType,
  PaymentTrigger,
  CalculateOn,
  CreateCommissionRuleInput,
} from "@/types/commission.types";
import {
  COMMISSION_TYPE_LABELS,
  PAYMENT_TRIGGER_LABELS,
  CALCULATE_ON_LABELS,
} from "@/types/commission.types";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
  Percent,
  DollarSign,
  Settings,
  Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";

const defaultFormData: CreateCommissionRuleInput = {
  name: "",
  commission_type: "percentage",
  commission_value: 10,
  payment_trigger: "on_payment",
  is_active: true,
  priority: 0,
  valid_from: undefined,
  valid_to: undefined,
  calculate_on: "gross",
};

export function CommissionRulesTable() {
  const { toast } = useToast();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [deleteConfirmRule, setDeleteConfirmRule] = useState<CommissionRule | null>(null);
  const [formData, setFormData] = useState<CreateCommissionRuleInput>(defaultFormData);

  const { data: rules, isLoading } = useCommissionRules();
  const { data: products } = useProducts();
  const { data: teamMembers } = useTeamMembers();
  const createRule = useCreateCommissionRule();
  const updateRule = useUpdateCommissionRule();
  const deleteRule = useDeleteCommissionRule();

  const handleOpenCreate = () => {
    setEditingRule(null);
    setFormData(defaultFormData);
    setIsFormOpen(true);
  };

  const handleOpenEdit = (rule: CommissionRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      sales_rep_id: rule.sales_rep_id || undefined,
      product_id: rule.product_id || undefined,
      commission_type: rule.commission_type,
      commission_value: rule.commission_value,
      payment_trigger: rule.payment_trigger,
      is_active: rule.is_active,
      priority: rule.priority,
      valid_from: rule.valid_from || undefined,
      valid_to: rule.valid_to || undefined,
      calculate_on: rule.calculate_on || "gross",
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome da regra e obrigatorio",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingRule) {
        await updateRule.mutateAsync({
          id: editingRule.id,
          ...formData,
          sales_rep_id: formData.sales_rep_id || null,
          product_id: formData.product_id || null,
        });
        toast({ title: "Sucesso", description: "Regra atualizada!" });
      } else {
        await createRule.mutateAsync(formData);
        toast({ title: "Sucesso", description: "Regra criada!" });
      }
      setIsFormOpen(false);
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao salvar regra",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmRule) return;

    try {
      await deleteRule.mutateAsync(deleteConfirmRule.id);
      toast({ title: "Sucesso", description: "Regra desativada" });
      setDeleteConfirmRule(null);
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao desativar regra",
        variant: "destructive",
      });
    }
  };

  const isPending = createRule.isPending || updateRule.isPending;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Regras de Comissao</h3>
          <p className="text-sm text-muted-foreground">
            Configure como as comissoes sao calculadas
          </p>
        </div>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Regra
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Regra</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Produto</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Gatilho</TableHead>
              <TableHead>Base</TableHead>
              <TableHead>Periodo</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : !rules || rules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Settings className="h-8 w-8" />
                    <p>Nenhuma regra configurada</p>
                    <Button variant="outline" size="sm" onClick={handleOpenCreate}>
                      Criar primeira regra
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              rules.map((rule) => {
                const salesRep = Array.isArray(rule.sales_rep)
                  ? rule.sales_rep[0]
                  : rule.sales_rep;
                const product = Array.isArray(rule.product)
                  ? rule.product[0]
                  : rule.product;

                return (
                  <TableRow key={rule.id} className={cn(!rule.is_active && "opacity-50")}>
                    <TableCell>
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Prioridade: {rule.priority}
                      </p>
                    </TableCell>
                    <TableCell>
                      {salesRep?.name || (
                        <span className="text-muted-foreground">Todos</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {product?.name || (
                        <span className="text-muted-foreground">Todos</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="gap-1">
                        {rule.commission_type === "percentage" ? (
                          <Percent className="h-3 w-3" />
                        ) : (
                          <DollarSign className="h-3 w-3" />
                        )}
                        {COMMISSION_TYPE_LABELS[rule.commission_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-bold">
                      {rule.commission_type === "percentage"
                        ? `${rule.commission_value}%`
                        : `R$ ${rule.commission_value.toFixed(2)}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {PAYMENT_TRIGGER_LABELS[rule.payment_trigger]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {CALCULATE_ON_LABELS[rule.calculate_on || "gross"]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {rule.valid_from || rule.valid_to ? (
                        <div className="text-xs">
                          {rule.valid_from && (
                            <span>{rule.valid_from.split("-").reverse().join("/")}</span>
                          )}
                          {rule.valid_from && rule.valid_to && <span> - </span>}
                          {rule.valid_to && (
                            <span>{rule.valid_to.split("-").reverse().join("/")}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sem prazo</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant={rule.is_active ? "default" : "secondary"}
                        className={cn(
                          rule.is_active
                            ? "bg-green-100 text-green-800 hover:bg-green-100"
                            : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {rule.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(rule)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar
                          </DropdownMenuItem>
                          {rule.is_active && (
                            <DropdownMenuItem
                              onClick={() => setDeleteConfirmRule(rule)}
                              className="text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Desativar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Dialog */}
      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {editingRule ? "Editar Regra" : "Nova Regra de Comissao"}
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nome da Regra *</Label>
              <Input
                id="name"
                placeholder="Ex: Comissao Padrao 10%"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Vendedor</Label>
                <Select
                  value={formData.sales_rep_id || "all"}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      sales_rep_id: v === "all" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos vendedores</SelectItem>
                    {teamMembers?.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Produto</Label>
                <Select
                  value={formData.product_id || "all"}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      product_id: v === "all" ? undefined : v,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos produtos</SelectItem>
                    {products?.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo de Comissao</Label>
                <Select
                  value={formData.commission_type}
                  onValueChange={(v: CommissionType) =>
                    setFormData({ ...formData, commission_type: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentual (%)</SelectItem>
                    <SelectItem value="fixed">Valor Fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>
                  Valor{" "}
                  {formData.commission_type === "percentage" ? "(%)" : "(R$)"}
                </Label>
                <Input
                  type="number"
                  step={formData.commission_type === "percentage" ? "0.1" : "0.01"}
                  min="0"
                  value={formData.commission_value}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      commission_value: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Quando Pagar</Label>
              <Select
                value={formData.payment_trigger}
                onValueChange={(v: PaymentTrigger) =>
                  setFormData({ ...formData, payment_trigger: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="on_deal_won">Ao Ganhar Deal</SelectItem>
                  <SelectItem value="on_payment">A Cada Pagamento</SelectItem>
                  <SelectItem value="on_full_payment">Ao Quitar Total</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {formData.payment_trigger === "on_deal_won" &&
                  "Comissao gerada quando o deal e marcado como ganho"}
                {formData.payment_trigger === "on_payment" &&
                  "Comissao gerada a cada pagamento recebido"}
                {formData.payment_trigger === "on_full_payment" &&
                  "Comissao gerada quando o deal for totalmente quitado"}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Calcular Sobre</Label>
              <Select
                value={formData.calculate_on || "gross"}
                onValueChange={(v: CalculateOn) =>
                  setFormData({ ...formData, calculate_on: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gross">Valor Bruto</SelectItem>
                  <SelectItem value="net">Valor Liquido (descontando taxas do gateway)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Valido de
                </Label>
                <Input
                  type="date"
                  value={formData.valid_from || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      valid_from: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  Valido ate
                </Label>
                <Input
                  type="date"
                  value={formData.valid_to || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      valid_to: e.target.value || undefined,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Prioridade</Label>
              <Input
                type="number"
                min="0"
                value={formData.priority}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    priority: parseInt(e.target.value) || 0,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">
                Maior prioridade = regra mais especifica (aplicada primeiro)
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFormOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRule ? "Salvar" : "Criar Regra"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog
        open={!!deleteConfirmRule}
        onOpenChange={() => setDeleteConfirmRule(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Regra</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja desativar a regra "{deleteConfirmRule?.name}"? Ela nao sera
              mais aplicada a novos calculos de comissao.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteRule.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
