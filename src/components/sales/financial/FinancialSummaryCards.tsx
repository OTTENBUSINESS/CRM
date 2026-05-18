import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadFinancialSummary } from "@/hooks/useDealPayments";
import {
  DollarSign,
  CheckCircle,
  Clock,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FinancialSummaryCardsProps {
  leadId: string;
}

export function FinancialSummaryCards({ leadId }: FinancialSummaryCardsProps) {
  const { data: summary, isLoading } = useLeadFinancialSummary(leadId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  if (!summary || summary.total_deals === 0) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum deal fechado ainda</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const cards = [
    {
      title: "Deals Ganhos",
      value: summary.total_deals.toString(),
      subtitle: "total de deals",
      icon: Briefcase,
      color: "text-blue-600",
      bgColor: "bg-blue-50",
    },
    {
      title: "Valor Total",
      value: formatCurrency(summary.total_value),
      subtitle: "valor negociado",
      icon: DollarSign,
      color: "text-purple-600",
      bgColor: "bg-purple-50",
    },
    {
      title: "Total Pago",
      value: formatCurrency(summary.total_paid),
      subtitle:
        summary.total_value > 0
          ? `${Math.round((summary.total_paid / summary.total_value) * 100)}% do total`
          : "0%",
      icon: CheckCircle,
      color: "text-green-600",
      bgColor: "bg-green-50",
    },
    {
      title: "Pendente",
      value: formatCurrency(summary.total_pending),
      subtitle: "aguardando pagamento",
      icon: Clock,
      color: "text-yellow-600",
      bgColor: "bg-yellow-50",
    },
    {
      title: "Atrasado",
      value: formatCurrency(summary.total_overdue),
      subtitle: summary.total_overdue > 0 ? "requer atencao" : "tudo em dia",
      icon: AlertTriangle,
      color: summary.total_overdue > 0 ? "text-red-600" : "text-gray-400",
      bgColor: summary.total_overdue > 0 ? "bg-red-50" : "bg-gray-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
