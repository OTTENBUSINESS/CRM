import { useState } from "react";
import { Phone, PhoneOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useCall } from "@/contexts/CallContext";
import { PreCallPlaybookSelector } from "@/components/coach/CallCoachIntegration";
import { cn } from "@/lib/utils";
import type { CoachPlaybook } from "@/types/coach.types";

// Store selected playbook globally so CallCoachIntegration can access it
let selectedPlaybookForCall: CoachPlaybook | null = null;

export function getSelectedPlaybook(): CoachPlaybook | null {
  return selectedPlaybookForCall;
}

export function clearSelectedPlaybook(): void {
  selectedPlaybookForCall = null;
}

interface CallButtonProps {
  phoneNumber: string;
  leadId?: string;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost";
  showLabel?: boolean;
  className?: string;
  skipPlaybookSelector?: boolean;
}

export function CallButton({
  phoneNumber,
  leadId,
  size = "default",
  variant = "default",
  showLabel = false,
  className,
  skipPlaybookSelector = false,
}: CallButtonProps) {
  const { device, deviceLoading, activeCall, initiateCall } = useCall();
  const [showPlaybookSelector, setShowPlaybookSelector] = useState(false);

  const hasActiveCall = !!activeCall;
  const canCall = device && !hasActiveCall;

  const handleCallClick = () => {
    if (!canCall) return;

    if (skipPlaybookSelector) {
      // Call directly without playbook
      selectedPlaybookForCall = null;
      initiateCall(phoneNumber, leadId);
    } else {
      // Show playbook selector first
      setShowPlaybookSelector(true);
    }
  };

  const handlePlaybookSelected = async (playbook: CoachPlaybook | null) => {
    selectedPlaybookForCall = playbook;
    setShowPlaybookSelector(false);
    await initiateCall(phoneNumber, leadId);
  };

  // Ainda carregando device
  if (deviceLoading) {
    return (
      <Button variant={variant} size={size} disabled className={className}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {showLabel && <span className="ml-2">Carregando...</span>}
      </Button>
    );
  }

  // Sem device configurado
  if (!device) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size={size} disabled className={cn("opacity-50", className)}>
              <PhoneOff className="h-4 w-4" />
              {showLabel && <span className="ml-2">Ligar</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>WaVoIP não configurado</p>
            <p className="text-xs text-muted-foreground">Configure nas configurações</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Chamada em andamento
  if (hasActiveCall) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="destructive" size={size} disabled className={className}>
              <Phone className="h-4 w-4 animate-pulse" />
              {showLabel && <span className="ml-2">Em chamada</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Chamada em andamento</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Pronto para ligar
  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={variant}
              size={size}
              onClick={handleCallClick}
              className={cn("bg-green-600 hover:bg-green-700 text-white", className)}
            >
              <Phone className="h-4 w-4" />
              {showLabel && <span className="ml-2">Ligar</span>}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Ligar via WhatsApp</p>
            <p className="text-xs text-muted-foreground">{phoneNumber}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Playbook Selector Modal */}
      <PreCallPlaybookSelector
        open={showPlaybookSelector}
        onClose={() => setShowPlaybookSelector(false)}
        onSelect={handlePlaybookSelected}
      />
    </>
  );
}

// Versão compacta para uso em listas
export function CallButtonIcon({
  phoneNumber,
  leadId,
  className,
}: {
  phoneNumber: string;
  leadId?: string;
  className?: string;
}) {
  return (
    <CallButton
      phoneNumber={phoneNumber}
      leadId={leadId}
      size="icon"
      variant="ghost"
      className={cn("h-8 w-8", className)}
    />
  );
}
