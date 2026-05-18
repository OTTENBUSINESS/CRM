import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePaymentInstallments } from "@/hooks/useDealPayments";
import type { InstallmentStatus } from "@/types/payment.types";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";

interface InstallmentsTableProps {
  paymentId: string;
}

const STATUS_CONFIG: Record<
  InstallmentStatus,
  {
    label: string;
    color: string;
    icon: React.ElementType;
  }
> = {
  pending: {
    label: "Pendente",
    color: "bg-yellow-100 text-yellow-800",
    icon: Clock,
  },
  confirmed: {
    label: "Confirmado",
    color: "bg-blue-100 text-blue-800",
    icon: CheckCircle,
  },
  received: {
    label: "Recebido",
    color: "bg-green-100 text-green-800",
    icon: CheckCircle,
  },
  overdue: {
    label: "Atrasado",
    color: "bg-red-100 text-red-800",
    icon: AlertCircle,
  },
};

export function InstallmentsTable({ paymentId }: InstallmentsTableProps) {
  const { data: installments, isLoading } = usePaymentInstallments(paymentId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (!installments || installments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-4">
        Nenhuma parcela registrada
      </p>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">Parcela</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {installments.map((installment) => {
            const statusConfig = STATUS_CONFIG[installment.status];
            const StatusIcon = statusConfig.icon;
            const isOverdue =
              installment.status !== "received" &&
              installment.status !== "confirmed" &&
              new Date(installment.due_date) < new Date();

            return (
              <TableRow
                key={installment.id}
                className={cn(isOverdue && "bg-red-50/50")}
              >
                <TableCell className="font-medium">
                  {installment.installment_number}
                </TableCell>
                <TableCell>
                  {format(new Date(installment.due_date), "dd/MM/yyyy", {
                    locale: ptBR,
                  })}
                </TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(installment.amount)}
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border-0 gap-1",
                      isOverdue && installment.status === "pending"
                        ? STATUS_CONFIG.overdue.color
                        : statusConfig.color
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {isOverdue && installment.status === "pending"
                      ? STATUS_CONFIG.overdue.label
                      : statusConfig.label}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
