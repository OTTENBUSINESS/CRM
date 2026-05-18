import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLeadPayments } from "@/hooks/useDealPayments";
import { PaymentStatusBadge } from "../payments/PaymentStatusBadge";
import type { BillingType } from "@/types/payment.types";
import { BILLING_TYPE_LABELS } from "@/types/payment.types";
import {
  CreditCard,
  QrCode,
  FileText,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { format, isAfter, isBefore, isToday, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

interface FinancialTimelineProps {
  leadId: string;
}

const BILLING_TYPE_ICONS: Record<BillingType, React.ElementType> = {
  pix: QrCode,
  boleto: FileText,
  credit_card: CreditCard,
  credit_card_no_anticipation: CreditCard,
  credit_card_recurring: CreditCard,
};

export function FinancialTimeline({ leadId }: FinancialTimelineProps) {
  const { data: payments, isLoading } = useLeadPayments(leadId);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!payments || payments.length === 0) {
    return null;
  }

  // Sort by due date
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  );

  // Group by status category
  const overduePayments = sortedPayments.filter(
    (p) =>
      (p.status === "pending" || p.status === "link_generated" || p.status === "overdue") &&
      isBefore(new Date(p.due_date), new Date())
  );

  const upcomingPayments = sortedPayments.filter(
    (p) =>
      (p.status === "pending" || p.status === "link_generated") &&
      !isBefore(new Date(p.due_date), new Date()) &&
      isBefore(new Date(p.due_date), addDays(new Date(), 30))
  );

  const completedPayments = sortedPayments.filter(
    (p) => p.status === "received" || p.status === "confirmed"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Calendar className="h-5 w-5" />
          Timeline de Pagamentos
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overdue */}
        {overduePayments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-red-600 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              Atrasados ({overduePayments.length})
            </h4>
            <div className="space-y-2 pl-4 border-l-2 border-red-200">
              {overduePayments.map((payment) => (
                <TimelineItem key={payment.id} payment={payment} variant="overdue" />
              ))}
            </div>
          </div>
        )}

        {/* Upcoming */}
        {upcomingPayments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-yellow-600 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              Proximos 30 dias ({upcomingPayments.length})
            </h4>
            <div className="space-y-2 pl-4 border-l-2 border-yellow-200">
              {upcomingPayments.map((payment) => (
                <TimelineItem key={payment.id} payment={payment} variant="upcoming" />
              ))}
            </div>
          </div>
        )}

        {/* Completed */}
        {completedPayments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium text-green-600 mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              Recebidos ({completedPayments.length})
            </h4>
            <div className="space-y-2 pl-4 border-l-2 border-green-200">
              {completedPayments.map((payment) => (
                <TimelineItem key={payment.id} payment={payment} variant="completed" />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface TimelineItemProps {
  payment: {
    id: string;
    description?: string;
    billing_type: BillingType;
    amount: number;
    due_date: string;
    paid_at?: string;
    status: string;
    deal?: {
      product?: {
        name: string;
      };
    };
  };
  variant: "overdue" | "upcoming" | "completed";
}

function TimelineItem({ payment, variant }: TimelineItemProps) {
  const Icon = BILLING_TYPE_ICONS[payment.billing_type];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const dueDate = new Date(payment.due_date);
  const isOverdue = variant === "overdue";
  const today = isToday(dueDate);

  return (
    <div
      className={cn(
        "flex items-center gap-4 p-3 rounded-lg",
        isOverdue && "bg-red-50",
        variant === "upcoming" && "bg-yellow-50/50",
        variant === "completed" && "bg-green-50/50"
      )}
    >
      <div
        className={cn(
          "h-8 w-8 rounded flex items-center justify-center flex-shrink-0",
          payment.billing_type === "pix" && "bg-green-100 text-green-700",
          payment.billing_type === "boleto" && "bg-orange-100 text-orange-700",
          (payment.billing_type === "credit_card" || payment.billing_type === "credit_card_no_anticipation" || payment.billing_type === "credit_card_recurring") && "bg-blue-100 text-blue-700"
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm truncate">
            {payment.description || BILLING_TYPE_LABELS[payment.billing_type]}
          </p>
          {payment.deal?.product && (
            <span className="text-xs text-muted-foreground">
              - {payment.deal.product.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>
            {today
              ? "Hoje"
              : format(dueDate, "dd 'de' MMM", { locale: ptBR })}
          </span>
          {payment.paid_at && (
            <>
              <ArrowRight className="h-3 w-3" />
              <span className="text-green-600">
                Pago em {format(new Date(payment.paid_at), "dd/MM")}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="font-bold text-sm">{formatCurrency(payment.amount)}</p>
        <PaymentStatusBadge status={payment.status as any} size="sm" />
      </div>
    </div>
  );
}
