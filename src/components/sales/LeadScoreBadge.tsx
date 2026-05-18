import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Flame, TrendingUp, Minus, TrendingDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface LeadScoreBadgeProps {
  score: number;
  reason?: string;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  showIcon?: boolean;
}

function getScoreConfig(score: number) {
  if (score >= 80) {
    return {
      label: "Quente",
      icon: Flame,
      className: "bg-red-100 text-red-700 border-red-200",
      iconClassName: "text-red-500",
      barColor: "bg-red-500",
    };
  }
  if (score >= 60) {
    return {
      label: "Alto",
      icon: TrendingUp,
      className: "bg-orange-100 text-orange-700 border-orange-200",
      iconClassName: "text-orange-500",
      barColor: "bg-orange-500",
    };
  }
  if (score >= 40) {
    return {
      label: "Médio",
      icon: Minus,
      className: "bg-amber-100 text-amber-700 border-amber-200",
      iconClassName: "text-amber-500",
      barColor: "bg-amber-500",
    };
  }
  if (score >= 20) {
    return {
      label: "Baixo",
      icon: TrendingDown,
      className: "bg-blue-100 text-blue-700 border-blue-200",
      iconClassName: "text-blue-500",
      barColor: "bg-blue-500",
    };
  }
  return {
    label: "Frio",
    icon: TrendingDown,
    className: "bg-slate-100 text-slate-600 border-slate-200",
    iconClassName: "text-slate-400",
    barColor: "bg-slate-400",
  };
}

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

export function LeadScoreBadge({
  score,
  reason,
  size = "md",
  showLabel = true,
  showIcon = true,
}: LeadScoreBadgeProps) {
  const config = getScoreConfig(score);
  const Icon = config.icon;

  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "font-medium gap-1 border transition-colors",
        config.className,
        sizeClasses[size]
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], config.iconClassName)} />}
      <span className="font-bold">{score}</span>
      {showLabel && <span className="opacity-75">/ 100</span>}
    </Badge>
  );

  if (reason) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-xs">
            <p className="text-xs">{reason}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return badge;
}

// Score bar visualization
export function LeadScoreBar({
  score,
  className,
  showValue = true,
}: {
  score: number;
  className?: string;
  showValue?: boolean;
}) {
  const config = getScoreConfig(score);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", config.barColor)}
          style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
        />
      </div>
      {showValue && (
        <span className={cn("text-xs font-medium min-w-[2rem]", config.iconClassName)}>
          {score}
        </span>
      )}
    </div>
  );
}

// Circular score display
export function LeadScoreCircle({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const config = getScoreConfig(score);
  const circumference = 2 * Math.PI * 18; // radius = 18
  const strokeDashoffset = circumference - (score / 100) * circumference;

  const sizes = {
    sm: "w-10 h-10",
    md: "w-14 h-14",
    lg: "w-20 h-20",
  };

  const fontSizes = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-lg",
  };

  return (
    <div className={cn("relative", sizes[size], className)}>
      <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r="18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          className="text-muted"
        />
        <circle
          cx="20"
          cy="20"
          r="18"
          stroke="currentColor"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={config.barColor.replace("bg-", "text-")}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("font-bold", fontSizes[size], config.iconClassName)}>
          {score}
        </span>
      </div>
    </div>
  );
}
