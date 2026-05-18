import { usePaymentAuditLog } from "@/hooks/useDealPayments";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { History, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";

const FIELD_LABELS: Record<string, string> = {
  amount: "Valor",
  installments: "Parcelas",
  installment_value: "Valor da parcela",
  due_date: "Vencimento",
  paid_at: "Data de pagamento",
  billing_type: "Forma",
  gateway: "Gateway",
  description: "Descricao",
  status: "Status",
};

const BILLING_LABELS: Record<string, string> = {
  pix: "PIX",
  boleto: "Boleto",
  credit_card: "Cartao",
};

function formatFieldValue(field: string, value: any): string {
  if (value === null || value === undefined) return "-";

  if (field === "amount" || field === "installment_value") {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(Number(value));
  }

  if (field === "due_date" || field === "paid_at") {
    try {
      return format(new Date(value), "dd/MM/yyyy", { locale: ptBR });
    } catch {
      return String(value);
    }
  }

  if (field === "billing_type") {
    return BILLING_LABELS[value] || value;
  }

  if (field === "installments") {
    return Number(value) === 1 ? "A vista" : `${value}x`;
  }

  return String(value);
}

interface PaymentAuditLogProps {
  paymentId: string;
}

export function PaymentAuditLog({ paymentId }: PaymentAuditLogProps) {
  const { data: logs, isLoading } = usePaymentAuditLog(paymentId);
  const [open, setOpen] = useState(false);

  if (isLoading || !logs || logs.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="mt-2">
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full">
        <History className="h-3 w-3" />
        <span>{logs.length} {logs.length === 1 ? "alteracao" : "alteracoes"}</span>
        <ChevronDown
          className={`h-3 w-3 ml-auto transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {logs.map((log) => (
          <div
            key={log.id}
            className="text-xs border rounded-md p-2 bg-muted/30 space-y-1"
          >
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="font-medium text-foreground">
                {log.changed_by_member?.name || "Sistema"}
              </span>
              <span>
                {format(new Date(log.changed_at), "dd/MM/yy HH:mm", {
                  locale: ptBR,
                })}
              </span>
            </div>
            {Array.isArray(log.changes) &&
              log.changes.map((change, i) => (
                <div key={i} className="text-muted-foreground">
                  <span className="font-medium">
                    {FIELD_LABELS[change.field] || change.field}
                  </span>
                  :{" "}
                  <span className="line-through text-red-500/70">
                    {formatFieldValue(change.field, change.old_value)}
                  </span>
                  {" → "}
                  <span className="text-green-600 font-medium">
                    {formatFieldValue(change.field, change.new_value)}
                  </span>
                </div>
              ))}
            {log.reason && (
              <p className="text-muted-foreground italic">
                Motivo: {log.reason}
              </p>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
