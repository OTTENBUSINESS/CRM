import { cn } from "@/lib/utils";
import { Sparkles, MessageCircle, Flame, Target, Hand, CheckCircle } from "lucide-react";

interface SocialSellerStageBadgeProps {
  stage?: {
    name: string;
    slug: string;
    color: string;
  } | null;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
}

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  novo: Sparkles,
  engajando: MessageCircle,
  aquecido: Flame,
  interessado: Target,
  levantou_mao: Hand,
  convertido: CheckCircle,
};

export function SocialSellerStageBadge({ stage, size = "md", showIcon = true }: SocialSellerStageBadgeProps) {
  if (!stage) {
    return (
      <span className="text-xs text-muted-foreground">-</span>
    );
  }

  const Icon = stageIcons[stage.slug] || Sparkles;

  const sizeClasses = {
    sm: "text-xs px-1.5 py-0.5 gap-1",
    md: "text-xs px-2 py-1 gap-1.5",
    lg: "text-sm px-3 py-1.5 gap-2",
  };

  const iconSizes = {
    sm: "h-3 w-3",
    md: "h-3.5 w-3.5",
    lg: "h-4 w-4",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium whitespace-nowrap",
        sizeClasses[size]
      )}
      style={{
        backgroundColor: `${stage.color}20`,
        color: stage.color,
      }}
    >
      {showIcon && <Icon className={iconSizes[size]} />}
      {stage.name}
    </span>
  );
}
