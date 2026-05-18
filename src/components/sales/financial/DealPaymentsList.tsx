import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useLeadPayments, useDealPayments, useDeleteDealPayment } from "@/hooks/useDealPayments";
import { useCommissions } from "@/hooks/useCommissions";
import { PaymentPartCard } from "../payments/PaymentPartCard";
import { InstallmentsTable } from "../payments/InstallmentsTable";
import type { DealPayment } from "@/types/payment.types";
import { COMMISSION_STATUS_LABELS, COMMISSION_STATUS_COLORS } from "@/types/commission.types";
import { ChevronDown, ChevronRight, Package, CreditCard, DollarSign } from "lucide-react";
import { cn } from "@/lib/utils";

interface DealPaymentsListProps {
  leadId?: string;
  dealId?: string;
}

interface DealGroup {
  dealId: string;
  productName: string;
  totalAmount: number;
  payments: DealPayment[];
}

export function DealPaymentsList({ leadId, dealId }: DealPaymentsListProps) {
  const {
    data: leadPayments,
    isLoading: leadLoading,
  } = useLeadPayments(leadId || "");

  const {
    data: dealPayments,
    isLoading: dealLoading,
  } = useDealPayments(dealId || "");

  const payments = dealId ? dealPayments : leadPayments;
  const isLoading = dealId ? dealLoading : leadLoading;

  // Get all deal IDs to fetch commissions (filtered by deal)
  const allDealIds = payments?.map(p => p.deal_id).filter(Boolean) || [];
  const uniqueDealIds = [...new Set(allDealIds)];
  const { data: allCommissions } = useCommissions(uniqueDealIds.length > 0 ? { deal_ids: uniqueDealIds } : undefined);
  const commissionsByDeal = (allCommissions || []).reduce<Record<string, { total: number; status: string; count: number }>>((acc, c) => {
    const did = c.deal_id;
    if (!acc[did]) acc[did] = { total: 0, status: c.status, count: 0 };
    acc[did].total += c.commission_amount;
    acc[did].count++;
    // Use worst status: pending > approved > paid
    if (c.status === 'pending') acc[did].status = 'pending';
    else if (c.status === 'approved' && acc[did].status !== 'pending') acc[did].status = 'approved';
    return acc;
  }, {});

  const deletePayment = useDeleteDealPayment();

  const [expandedDeals, setExpandedDeals] = useState<Set<string>>(new Set());
  const [expandedInstallments, setExpandedInstallments] = useState<Set<string>>(
    new Set()
  );

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const toggleDeal = (dealId: string) => {
    const newExpanded = new Set(expandedDeals);
    if (newExpanded.has(dealId)) {
      newExpanded.delete(dealId);
    } else {
      newExpanded.add(dealId);
    }
    setExpandedDeals(newExpanded);
  };

  const toggleInstallments = (paymentId: string) => {
    const newExpanded = new Set(expandedInstallments);
    if (newExpanded.has(paymentId)) {
      newExpanded.delete(paymentId);
    } else {
      newExpanded.add(paymentId);
    }
    setExpandedInstallments(newExpanded);
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  if (!payments || payments.length === 0) {
    return (
      <Card className="bg-muted/50">
        <CardContent className="flex items-center justify-center py-8 text-muted-foreground">
          <div className="text-center">
            <CreditCard className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>Nenhum pagamento registrado</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If showing a single deal, just list payments
  if (dealId) {
    return (
      <div className="space-y-3">
        {payments.map((payment) => (
          <div key={payment.id}>
            <PaymentPartCard
              payment={payment}
              leadId={leadId}
              onDelete={() => deletePayment.mutate({ id: payment.id, dealId: payment.deal_id })}
            />
            {payment.installments > 1 && (
              <Collapsible
                open={expandedInstallments.has(payment.id)}
                onOpenChange={() => toggleInstallments(payment.id)}
              >
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full mt-1 text-muted-foreground"
                  >
                    {expandedInstallments.has(payment.id) ? (
                      <ChevronDown className="h-4 w-4 mr-2" />
                    ) : (
                      <ChevronRight className="h-4 w-4 mr-2" />
                    )}
                    Ver {payment.installments} parcelas
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2">
                  <InstallmentsTable paymentId={payment.id} />
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Group payments by deal
  const dealGroups: DealGroup[] = [];
  const dealMap = new Map<string, DealGroup>();

  for (const payment of payments) {
    const dId = payment.deal_id;
    if (!dealMap.has(dId)) {
      dealMap.set(dId, {
        dealId: dId,
        productName: payment.deal?.product?.name || "Produto",
        totalAmount: 0,
        payments: [],
      });
    }
    const group = dealMap.get(dId)!;
    group.payments.push(payment);
    group.totalAmount += payment.amount;
  }

  dealMap.forEach((group) => dealGroups.push(group));

  return (
    <div className="space-y-4">
      {dealGroups.map((group) => {
        const isExpanded = expandedDeals.has(group.dealId);
        const paidPayments = group.payments.filter(
          (p) => p.status === "received" || p.status === "confirmed"
        );
        const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);
        const paidPercentage =
          group.totalAmount > 0
            ? Math.round((totalPaid / group.totalAmount) * 100)
            : 0;

        return (
          <Card key={group.dealId}>
            <Collapsible
              open={isExpanded}
              onOpenChange={() => toggleDeal(group.dealId)}
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <Package className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">
                          {group.productName}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {group.payments.length} pagamento
                          {group.payments.length > 1 ? "s" : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="text-right space-y-1">
                        <p className="font-bold text-lg">
                          {formatCurrency(group.totalAmount)}
                        </p>
                        <div className="flex items-center gap-2 justify-end">
                          <Badge
                            variant="outline"
                            className={cn(
                              "border-0 text-[10px]",
                              paidPercentage === 100
                                ? "bg-green-100 text-green-800"
                                : paidPercentage > 0
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-800"
                            )}
                          >
                            {formatCurrency(totalPaid)} recebido ({paidPercentage}%)
                          </Badge>
                          {group.totalAmount - totalPaid > 0 && (
                            <Badge variant="outline" className="border-0 bg-red-50 text-red-700 text-[10px]">
                              {formatCurrency(group.totalAmount - totalPaid)} pendente
                            </Badge>
                          )}
                        </div>
                        {commissionsByDeal[group.dealId] && (
                          <p className="text-[10px] text-muted-foreground">
                            Comissão: {formatCurrency(commissionsByDeal[group.dealId].total)} ({COMMISSION_STATUS_LABELS[commissionsByDeal[group.dealId].status as keyof typeof COMMISSION_STATUS_LABELS]})
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-3">
                  {group.payments.map((payment) => (
                    <div key={payment.id}>
                      <PaymentPartCard
              payment={payment}
              leadId={leadId}
              onDelete={() => deletePayment.mutate({ id: payment.id, dealId: payment.deal_id })}
            />
                      {payment.installments > 1 && (
                        <Collapsible
                          open={expandedInstallments.has(payment.id)}
                          onOpenChange={() => toggleInstallments(payment.id)}
                        >
                          <CollapsibleTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="w-full mt-1 text-muted-foreground"
                            >
                              {expandedInstallments.has(payment.id) ? (
                                <ChevronDown className="h-4 w-4 mr-2" />
                              ) : (
                                <ChevronRight className="h-4 w-4 mr-2" />
                              )}
                              Ver {payment.installments} parcelas
                            </Button>
                          </CollapsibleTrigger>
                          <CollapsibleContent className="mt-2 pl-4">
                            <InstallmentsTable paymentId={payment.id} />
                          </CollapsibleContent>
                        </Collapsible>
                      )}
                    </div>
                  ))}
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        );
      })}
    </div>
  );
}
