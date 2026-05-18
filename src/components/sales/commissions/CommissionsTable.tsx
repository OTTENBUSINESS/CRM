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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCommissions,
  useUpdateCommission,
  usePayCommission,
} from "@/hooks/useCommissions";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import { useToast } from "@/hooks/use-toast";
import type { Commission, CommissionStatus } from "@/types/commission.types";
import {
  COMMISSION_STATUS_LABELS,
  COMMISSION_STATUS_COLORS,
} from "@/types/commission.types";
import {
  DollarSign,
  Loader2,
  Filter,
  CheckCircle,
  Wallet,
  XCircle,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

export function CommissionsTable() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "all">("all");
  const [salesRepFilter, setSalesRepFilter] = useState<string>("all");
  const [payModalCommission, setPayModalCommission] = useState<Commission | null>(null);
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: commissions, isLoading } = useCommissions({
    status: statusFilter !== "all" ? statusFilter : undefined,
    sales_rep_id: salesRepFilter !== "all" ? salesRepFilter : undefined,
  });

  const { data: teamMembers } = useTeamMembers();
  const updateCommission = useUpdateCommission();
  const payCommission = usePayCommission();

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const handleApprove = async (id: string) => {
    try {
      await updateCommission.mutateAsync({ id, status: "approved" });
      toast({ title: "Sucesso", description: "Comissao aprovada!" });
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao aprovar comissao",
        variant: "destructive",
      });
    }
  };

  const handleCancel = async (id: string) => {
    try {
      await updateCommission.mutateAsync({ id, status: "cancelled" });
      toast({ title: "Sucesso", description: "Comissao cancelada" });
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao cancelar comissao",
        variant: "destructive",
      });
    }
  };

  const handlePay = async () => {
    if (!payModalCommission) return;

    try {
      await payCommission.mutateAsync({
        id: payModalCommission.id,
        payment_reference: paymentReference || undefined,
        notes: paymentNotes || undefined,
      });
      toast({ title: "Sucesso", description: "Comissao marcada como paga!" });
      setPayModalCommission(null);
      setPaymentReference("");
      setPaymentNotes("");
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao marcar comissao como paga",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
          <SelectTrigger className="w-[180px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
            <SelectItem value="pending">Pendente</SelectItem>
            <SelectItem value="approved">Aprovado</SelectItem>
            <SelectItem value="paid">Pago</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>

        <Select value={salesRepFilter} onValueChange={setSalesRepFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Vendedor" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Vendedores</SelectItem>
            {teamMembers?.map((member) => (
              <SelectItem key={member.id} value={member.id}>
                {member.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Vendedor</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Deal/Produto</TableHead>
              <TableHead className="text-right">Bruto</TableHead>
              <TableHead className="text-right">Taxa GW</TableHead>
              <TableHead className="text-right">Liquido</TableHead>
              <TableHead className="text-right">Comissao</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead>Competencia</TableHead>
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
            ) : !commissions || commissions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <DollarSign className="h-8 w-8" />
                    <p>Nenhuma comissao encontrada</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              commissions.map((commission) => {
                const salesRep = Array.isArray(commission.sales_rep)
                  ? commission.sales_rep[0]
                  : commission.sales_rep;
                const deal = Array.isArray(commission.deal)
                  ? commission.deal[0]
                  : commission.deal;
                const rule = Array.isArray(commission.commission_rule)
                  ? commission.commission_rule[0]
                  : commission.commission_rule;

                return (
                  <TableRow key={commission.id}>
                    <TableCell>
                      <p className="font-medium">{salesRep?.name || "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {salesRep?.email}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{deal?.lead?.name || "-"}</p>
                    </TableCell>
                    <TableCell>
                      <p className="font-medium">{deal?.product?.name || "-"}</p>
                      <p className="text-xs text-muted-foreground">
                        {rule?.name || "Regra padrao"}
                      </p>
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(commission.base_amount)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {commission.gateway_fee_amount > 0
                        ? formatCurrency(commission.gateway_fee_amount)
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      {commission.net_amount > 0
                        ? formatCurrency(commission.net_amount)
                        : formatCurrency(commission.base_amount)}
                    </TableCell>
                    <TableCell className="text-right font-bold text-green-600">
                      {formatCurrency(commission.commission_amount)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge
                        variant="outline"
                        className={cn(
                          "border-0",
                          COMMISSION_STATUS_COLORS[commission.status]
                        )}
                      >
                        {COMMISSION_STATUS_LABELS[commission.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">
                        {format(new Date(commission.reference_date || commission.created_at), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                      {commission.paid_at && (
                        <p className="text-xs text-green-600">
                          Pago em{" "}
                          {format(new Date(commission.paid_at), "dd/MM", {
                            locale: ptBR,
                          })}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {commission.status === "pending" && (
                            <>
                              <DropdownMenuItem
                                onClick={() => handleApprove(commission.id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-2 text-blue-600" />
                                Aprovar
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleCancel(commission.id)}
                                className="text-red-600"
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Cancelar
                              </DropdownMenuItem>
                            </>
                          )}
                          {commission.status === "approved" && (
                            <DropdownMenuItem
                              onClick={() => setPayModalCommission(commission)}
                            >
                              <Wallet className="h-4 w-4 mr-2 text-green-600" />
                              Marcar como Pago
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

      {/* Pay Modal */}
      <Dialog
        open={!!payModalCommission}
        onOpenChange={() => setPayModalCommission(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-green-600" />
              Marcar Comissao como Paga
            </DialogTitle>
          </DialogHeader>

          {payModalCommission && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Valor</span>
                  <span className="text-xl font-bold text-green-600">
                    {formatCurrency(payModalCommission.commission_amount)}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="payment_reference">
                  Referencia do Pagamento (opcional)
                </Label>
                <Input
                  id="payment_reference"
                  placeholder="Ex: PIX 123456, Transferencia #789"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Observacoes (opcional)</Label>
                <Textarea
                  id="notes"
                  placeholder="Anotacoes sobre o pagamento..."
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPayModalCommission(null)}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePay}
              disabled={payCommission.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {payCommission.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
