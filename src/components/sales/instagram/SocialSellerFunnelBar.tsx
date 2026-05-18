import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useSocialSellerFunnelStats, type FunnelStats } from "@/hooks/useInstagram";
import { Sparkles, MessageCircle, Flame, Target, Hand, CheckCircle } from "lucide-react";

interface SocialSellerFunnelBarProps {
  accountId?: string;
  selectedStage?: string | null;
  onStageSelect?: (stageSlug: string | null) => void;
}

const stageIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  novo: Sparkles,
  engajando: MessageCircle,
  aquecido: Flame,
  interessado: Target,
  levantou_mao: Hand,
  convertido: CheckCircle,
};

export function SocialSellerFunnelBar({ accountId, selectedStage, onStageSelect }: SocialSellerFunnelBarProps) {
  const { data: stats = [], isLoading } = useSocialSellerFunnelStats(accountId);

  if (isLoading) {
    return (
      <div className="flex gap-2 p-2 bg-muted/30 rounded-lg animate-pulse">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="h-10 w-24 bg-muted rounded-md" />
        ))}
      </div>
    );
  }

  const total = stats.reduce((acc, s) => acc + Number(s.conversation_count), 0);
  const totalUnread = stats.reduce((acc, s) => acc + Number(s.unread_count), 0);

  return (
    <div className="flex flex-wrap gap-2 p-2 bg-muted/30 rounded-lg">
      {/* All */}
      <button
        onClick={() => onStageSelect?.(null)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
          selectedStage === null
            ? "bg-background shadow-sm"
            : "hover:bg-background/50"
        )}
      >
        <span>Todos</span>
        <Badge variant="secondary" className="h-5 min-w-[20px] justify-center">
          {total}
        </Badge>
        {totalUnread > 0 && (
          <Badge variant="default" className="h-5 min-w-[20px] justify-center bg-blue-500">
            {totalUnread}
          </Badge>
        )}
      </button>

      {/* Stages */}
      {stats.map((stage) => {
        const Icon = stageIcons[stage.stage_slug] || Sparkles;
        const isSelected = selectedStage === stage.stage_slug;

        return (
          <button
            key={stage.stage_slug}
            onClick={() => onStageSelect?.(stage.stage_slug)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isSelected
                ? "bg-background shadow-sm"
                : "hover:bg-background/50"
            )}
            style={{
              color: isSelected ? stage.stage_color : undefined,
            }}
          >
            <Icon className="h-4 w-4" style={{ color: stage.stage_color }} />
            <span>{stage.stage_name}</span>
            <Badge
              variant="secondary"
              className="h-5 min-w-[20px] justify-center"
              style={{
                backgroundColor: isSelected ? `${stage.stage_color}20` : undefined,
                color: isSelected ? stage.stage_color : undefined,
              }}
            >
              {stage.conversation_count}
            </Badge>
            {Number(stage.unread_count) > 0 && (
              <Badge variant="default" className="h-5 min-w-[20px] justify-center bg-blue-500">
                {stage.unread_count}
              </Badge>
            )}
          </button>
        );
      })}
    </div>
  );
}
