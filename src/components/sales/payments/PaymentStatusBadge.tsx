import { Badge } from "@/components/ui/badge";
import type { PaymentStatus } from "@/types/payment.types";
import {
  PAYMENT_STATUS_LABELS,
  PAYMENT_STATUS_COLORS,
} from "@/types/payment.types";
import {
  Clock,
  Link,
  CheckCircle,
  AlertCircle,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaymentStatusBadgeProps {
  status: PaymentStatus;
  size?: "sm" | "md";
}

const STATUS_ICONS: Record<PaymentStatus, React.ElementType> = {
  pending: Clock,
  link_generated: Link,
  confirmed: CheckCircle,
  received: CheckCircle,
  overdue: AlertCircle,
  refunded: RotateCcw,
  cancelled: XCircle,
};

export function PaymentStatusBadge({
  status,
  size = "md",
}: PaymentStatusBadgeProps) {
  const Icon = STATUS_ICONS[status];

  return (
    <Badge
      variant="outline"
      className={cn(
        PAYMENT_STATUS_COLORS[status],
        "border-0 font-medium",
        size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
      )}
    >
      <Icon
        className={cn(
          "mr-1",
          size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"
        )}
      />
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}
