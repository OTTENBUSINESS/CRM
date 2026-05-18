import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCommissionSummary } from "@/hooks/useCommissions";
import { DollarSign, Clock, CheckCircle, Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface CommissionSummaryCardProps {
  salesRepId?: string;
}

export function CommissionSummaryCard({ salesRepId }: CommissionSummaryCardProps) {
  const { data: summary, isLoading } = useCommissionSummary(
    salesRepId ? { sales_rep_id: salesRepId } : undefined
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    {
      title: "Total Ganho",
      value: formatCurrency(summary.total_pending + summary.total_approved + summary.total_paid),
      subtitle: `${summary.pending_count + summary.approved_count + summary.paid_count} comissoes`,
      icon: DollarSign,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Pendente",
      value: formatCurrency(summary.total_pending),
      subtitle: `${summary.pending_count} aguardando`,
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Aprovado",
      value: formatCurrency(summary.total_approved),
      subtitle: `${summary.approved_count} para pagar`,
      icon: CheckCircle,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Pago",
      value: formatCurrency(summary.total_paid),
      subtitle: `${summary.paid_count} comissoes`,
      icon: Wallet,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.title} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {card.title}
                </p>
                <p className={cn("text-xl font-bold", card.color)}>
                  {card.value}
                </p>
                <p className="text-xs text-muted-foreground">{card.subtitle}</p>
              </div>
              <div className={cn("p-2 rounded-lg", card.bgColor)}>
                <card.icon className={cn("h-5 w-5", card.color)} />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
