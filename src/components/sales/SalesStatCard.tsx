import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SalesStatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const variantStyles = {
  default: {
    card: "border-border",
    icon: "bg-muted text-muted-foreground",
    value: "text-foreground",
  },
  success: {
    card: "border-emerald-200 bg-emerald-50/50",
    icon: "bg-emerald-100 text-emerald-600",
    value: "text-emerald-700",
  },
  warning: {
    card: "border-amber-200 bg-amber-50/50",
    icon: "bg-amber-100 text-amber-600",
    value: "text-amber-700",
  },
  danger: {
    card: "border-red-200 bg-red-50/50",
    icon: "bg-red-100 text-red-600",
    value: "text-red-700",
  },
  info: {
    card: "border-blue-200 bg-blue-50/50",
    icon: "bg-blue-100 text-blue-600",
    value: "text-blue-700",
  },
};

export function SalesStatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  className,
  onClick,
}: SalesStatCardProps) {
  const styles = variantStyles[variant];

  const TrendIcon = trend
    ? trend.value > 0
      ? TrendingUp
      : trend.value < 0
      ? TrendingDown
      : Minus
    : null;

  return (
    <Card
      className={cn(
        "transition-all",
        styles.card,
        onClick && "cursor-pointer hover:shadow-md",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-muted-foreground truncate">
              {title}
            </p>
            <p className={cn("text-2xl font-bold mt-1", styles.value)}>
              {value}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
            )}
            {trend && TrendIcon && (
              <div className="flex items-center gap-1 mt-2">
                <TrendIcon
                  className={cn(
                    "h-3.5 w-3.5",
                    trend.value > 0
                      ? "text-emerald-500"
                      : trend.value < 0
                      ? "text-red-500"
                      : "text-muted-foreground"
                  )}
                />
                <span
                  className={cn(
                    "text-xs font-medium",
                    trend.value > 0
                      ? "text-emerald-600"
                      : trend.value < 0
                      ? "text-red-600"
                      : "text-muted-foreground"
                  )}
                >
                  {trend.value > 0 ? "+" : ""}
                  {trend.value}%
                </span>
                {trend.label && (
                  <span className="text-xs text-muted-foreground">
                    {trend.label}
                  </span>
                )}
              </div>
            )}
          </div>
          {icon && (
            <div
              className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
                styles.icon
              )}
            >
              {icon}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Compact stat for inline use
export function SalesStatInline({
  label,
  value,
  icon,
  trend,
  className,
}: {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  trend?: number;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {icon && (
        <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
          {icon}
        </div>
      )}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{value}</span>
          {trend !== undefined && (
            <span
              className={cn(
                "text-xs",
                trend > 0 ? "text-emerald-600" : trend < 0 ? "text-red-600" : "text-muted-foreground"
              )}
            >
              {trend > 0 ? "+" : ""}
              {trend}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Mini stat badge
export function SalesStatBadge({
  value,
  label,
  variant = "default",
  className,
}: {
  value: string | number;
  label: string;
  variant?: "default" | "success" | "warning" | "danger";
  className?: string;
}) {
  const variantClasses = {
    default: "bg-muted text-muted-foreground",
    success: "bg-emerald-100 text-emerald-700",
    warning: "bg-amber-100 text-amber-700",
    danger: "bg-red-100 text-red-700",
  };

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs",
        variantClasses[variant],
        className
      )}
    >
      <span className="font-bold">{value}</span>
      <span className="opacity-75">{label}</span>
    </div>
  );
}

// Grid of stats
export function SalesStatsGrid({
  children,
  columns = 4,
  className,
}: {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const gridCols = {
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-2 lg:grid-cols-4",
    5: "grid-cols-2 lg:grid-cols-5",
    6: "grid-cols-2 lg:grid-cols-3 xl:grid-cols-6",
  };

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)}>
      {children}
    </div>
  );
}
