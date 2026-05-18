import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Volume2, VolumeX } from "lucide-react";
import { isNotificationsMuted, toggleNotificationsMuted, onMuteChange } from "@/lib/notification-mute";
import { cn } from "@/lib/utils";

interface MuteNotificationsToggleProps {
  className?: string;
  /** Use 'header' for the global header, 'inbox' for inbox toolbar */
  variant?: 'header' | 'inbox';
}

export function MuteNotificationsToggle({ className, variant = 'inbox' }: MuteNotificationsToggleProps) {
  const [muted, setMuted] = useState(isNotificationsMuted);

  useEffect(() => {
    return onMuteChange(setMuted);
  }, []);

  const isHeader = variant === 'header';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => toggleNotificationsMuted()}
          className={cn(
            "h-8 w-8 p-0",
            isHeader
              ? muted
                ? "bg-red-100 text-red-600 hover:bg-red-200 hover:text-red-700 dark:bg-red-500/20 dark:text-red-400 dark:hover:bg-red-500/30"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
              : muted
                ? "bg-red-500/20 text-red-200 hover:bg-red-500/30 hover:text-red-100"
                : "text-white/70 hover:bg-white/20 hover:text-white",
            className
          )}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {muted ? "Modo foco ativo — notificações silenciadas (clique para desativar)" : "Silenciar notificações (modo foco)"}
      </TooltipContent>
    </Tooltip>
  );
}
