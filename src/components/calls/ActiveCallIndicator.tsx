import { Phone, Lightbulb, Clock, PhoneOff, PhoneIncoming } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useCall, formatCallDuration } from '@/contexts/CallContext';
import { cn } from '@/lib/utils';

interface ActiveCallIndicatorProps {
  onOpenCallModal: () => void;
  onOpenCoachPanel: () => void;
  isCoachPanelVisible: boolean;
}

/**
 * Indicador persistente de chamada ativa.
 * Fica sempre visível no canto inferior da tela quando há uma chamada em andamento.
 * Permite reabrir o modal de chamada e o painel do coach.
 *
 * Quando a chamada está em RINGING e o modal de incoming foi minimizado,
 * mostra botões de Atender/Rejeitar com animação pulsante.
 */
export function ActiveCallIndicator({
  onOpenCallModal,
  onOpenCoachPanel,
  isCoachPanelVisible,
}: ActiveCallIndicatorProps) {
  const {
    activeCall,
    showActiveCallModal,
    showIncomingModal,
    setShowIncomingModal,
    answerCall,
    rejectCall,
    endCall,
  } = useCall();

  // Não mostrar se não há chamada ativa
  if (!activeCall) return null;

  const isRinging = activeCall.status === 'RINGING';
  const isActive = activeCall.status === 'ACTIVE';
  const isIncoming = activeCall.direction === 'INCOMING';
  const isRingingMinimized = isRinging && isIncoming && !showIncomingModal;

  // Ringing minimizado — indicador especial pulsante com ações
  if (isRingingMinimized) {
    return (
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999]">
        <div
          className={cn(
            'flex items-center gap-3 px-5 py-3 rounded-full shadow-2xl border-2',
            'bg-white dark:bg-slate-900',
            'border-green-500 animate-pulse',
            'cursor-pointer'
          )}
          onClick={() => setShowIncomingModal(true)}
        >
          {/* Ícone pulsante */}
          <div className="relative">
            <PhoneIncoming className="h-6 w-6 text-green-500 animate-bounce" />
            <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-green-500 animate-ping" />
          </div>

          {/* Info */}
          <div className="flex flex-col">
            <span className="text-xs text-green-600 font-semibold uppercase tracking-wide">
              Chamada recebida
            </span>
            <span className="font-bold text-sm truncate max-w-[180px]">
              {activeCall.peerName || activeCall.peerPhone}
            </span>
          </div>

          {/* Separador */}
          <div className="w-px h-8 bg-border" />

          {/* Ações rápidas */}
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="rounded-full h-10 w-10"
                    onClick={(e) => { e.stopPropagation(); rejectCall(); }}
                  >
                    <PhoneOff className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Rejeitar</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    className="rounded-full h-10 w-10 bg-green-600 hover:bg-green-700"
                    onClick={(e) => { e.stopPropagation(); answerCall(); }}
                  >
                    <Phone className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Atender</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>
    );
  }

  // Chamada ativa — indicador normal com controles e coach
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70]">
      {/* Indicador de chamada ativa */}
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-full shadow-xl border-2',
          'bg-white dark:bg-slate-900',
          isActive ? 'border-green-500' : 'border-blue-500'
        )}
      >
        {/* Ícone pulsante */}
        <div className="relative">
          <Phone
            className={cn(
              'h-5 w-5',
              isActive ? 'text-green-500' : 'text-blue-500'
            )}
          />
          <div
            className={cn(
              'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full',
              isActive ? 'bg-green-500 animate-pulse' : 'bg-blue-500 animate-pulse'
            )}
          />
        </div>

        {/* Info */}
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold truncate max-w-[150px]">
            {activeCall.peerName || activeCall.peerPhone}
          </span>
          <span className="flex items-center gap-1.5 text-muted-foreground font-mono text-base">
            <Clock className="h-4 w-4" />
            {formatCallDuration(activeCall.duration)}
          </span>
        </div>

        {/* Separador */}
        <div className="w-px h-6 bg-border" />

        {/* Botões de ação */}
        <div className="flex items-center gap-1">
          {/* Abrir modal de chamada */}
          {!showActiveCallModal && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 rounded-full hover:bg-green-100 dark:hover:bg-green-900 gap-1.5"
                    onClick={onOpenCallModal}
                  >
                    <Phone className="h-4 w-4 text-green-600" />
                    <span className="text-xs font-medium text-green-600">Controles</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Abrir controles da chamada (mutar, encerrar)</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Abrir coach panel */}
          {!isCoachPanelVisible && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 rounded-full hover:bg-amber-100 dark:hover:bg-amber-900 gap-1.5"
                    onClick={onOpenCoachPanel}
                  >
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-medium text-amber-600">Coach</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Abrir painel do Sales Coach</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Botão de encerrar chamada - sempre visível como fallback */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="destructive"
                  size="icon"
                  className="h-8 w-8 rounded-full"
                  onClick={() => endCall()}
                >
                  <PhoneOff className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Encerrar chamada</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}
