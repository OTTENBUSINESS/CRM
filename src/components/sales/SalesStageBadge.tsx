import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { SalesStage } from "@/types/sales.types";
import {
  CircleDot,
  Search,
  CalendarCheck,
  HandshakeIcon,
  Trophy,
  XCircle,
} from "lucide-react";

interface SalesStageBadgeProps {
  stage: SalesStage;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const stageConfig: Record<
  SalesStage,
  {
    label: string;
    icon: React.ElementType;
    className: string;
  }
> = {
  captura: {
    label: "Captura",
    icon: CircleDot,
    className: "bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200",
  },
  qualificacao: {
    label: "Qualificação",
    icon: Search,
    className: "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200",
  },
  agendamento: {
    label: "Agendamento",
    icon: CalendarCheck,
    className: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200",
  },
  negociacao: {
    label: "Negociação",
    icon: HandshakeIcon,
    className: "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200",
  },
  fechado: {
    label: "Fechado",
    icon: Trophy,
    className: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200",
  },
  perdido: {
    label: "Perdido",
    icon: XCircle,
    className: "bg-red-100 text-red-700 border-red-200 hover:bg-red-200",
  },
};

const sizeClasses = {
  sm: "text-xs px-1.5 py-0.5",
  md: "text-xs px-2 py-1",
  lg: "text-sm px-2.5 py-1",
};

const iconSizes = {
  sm: "h-3 w-3",
  md: "h-3.5 w-3.5",
  lg: "h-4 w-4",
};

export function SalesStageBadge({
  stage,
  size = "md",
  showIcon = true,
}: SalesStageBadgeProps) {
  const config = stageConfig[stage];

  if (!config) {
    return null;
  }

  const Icon = config.icon;

  return (
    <Badge
      variant="outline"
      className={cn(
        "font-medium gap-1 border transition-colors",
        config.className,
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      <span>{config.label}</span>
    </Badge>
  );
}

// Utility component for stage selector
export function SalesStageSelect({
  value,
  onChange,
  className,
}: {
  value: SalesStage;
  onChange: (stage: SalesStage) => void;
  className?: string;
}) {
  const stages: SalesStage[] = [
    "captura",
    "qualificacao",
    "agendamento",
    "negociacao",
    "fechado",
    "perdido",
  ];

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {stages.map((stage) => (
        <button
          key={stage}
          onClick={() => onChange(stage)}
          className={cn(
            "transition-all",
            value === stage ? "scale-105 ring-2 ring-offset-1 ring-primary/50 rounded-full" : "opacity-70 hover:opacity-100"
          )}
        >
          <SalesStageBadge stage={stage} size="sm" />
        </button>
      ))}
    </div>
  );
}
