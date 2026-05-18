import { AlertCircle, Clock, CheckCircle2, MessageSquare, TrendingUp, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InboxMetrics } from "@/hooks/useCSInbox";
import { formatWaitTime } from "@/hooks/useCSInbox";

interface InboxMetricsBarProps {
  metrics: InboxMetrics | undefined;
  isLoading?: boolean;
}

export function InboxMetricsBar({ metrics, isLoading }: InboxMetricsBarProps) {
  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 p-2 sm:p-3 bg-muted/30 rounded-lg animate-pulse">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-muted rounded-lg" />
        ))}
      </div>
    );
  }

  const criticalCount = metrics.critical_count ?? 0;
  const warningCount = metrics.warning_count ?? 0;
  const followUpCount = metrics.follow_up_count ?? 0;

  const cards = [
    {
      label: "Críticos",
      value: criticalCount,
      subtext: "> 2 horas",
      icon: AlertCircle,
      color: criticalCount > 0
        ? "bg-red-50 border-red-200 text-red-700"
        : "bg-gray-50 border-gray-200 text-gray-500",
      iconColor: criticalCount > 0 ? "text-red-500" : "text-gray-400",
      pulse: criticalCount > 0,
    },
    {
      label: "Atenção",
      value: warningCount,
      subtext: "> 30 min",
      icon: Clock,
      color: warningCount > 0
        ? "bg-amber-50 border-amber-200 text-amber-700"
        : "bg-gray-50 border-gray-200 text-gray-500",
      iconColor: warningCount > 0 ? "text-amber-500" : "text-gray-400",
    },
    {
      label: "Follow-up",
      value: followUpCount,
      subtext: "Sem resposta desde ontem",
      icon: RotateCcw,
      color: followUpCount > 0
        ? "bg-orange-50 border-orange-200 text-orange-700"
        : "bg-gray-50 border-gray-200 text-gray-500",
      iconColor: followUpCount > 0 ? "text-orange-500" : "text-gray-400",
    },
    {
      label: "Pendentes",
      value: metrics.total_pending ?? 0,
      subtext: `Média: ${formatWaitTime(metrics.avg_wait_minutes ?? 0)}`,
      icon: MessageSquare,
      color: "bg-blue-50 border-blue-200 text-blue-700",
      iconColor: "text-blue-500",
    },
    {
      label: "Resolvidos Hoje",
      value: metrics.resolved_today ?? 0,
      subtext: `Total: ${metrics.total_conversations ?? 0}`,
      icon: CheckCircle2,
      color: "bg-green-50 border-green-200 text-green-700",
      iconColor: "text-green-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className={cn(
            "relative flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border transition-all",
            card.color
          )}
        >
          {card.pulse && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          )}
          <div className={cn("p-2 rounded-lg bg-white/50", card.iconColor)}>
            <card.icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="text-xl sm:text-2xl font-bold">{card.value}</span>
              <span className="text-xs font-medium opacity-70">{card.label}</span>
            </div>
            <p className="text-xs opacity-60 truncate">{card.subtext}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
