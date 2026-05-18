import { useState } from "react";
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  User,
  Clock,
  VolumeX,
  FileText,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCall, formatCallDuration } from "@/contexts/CallContext";
import { CallTranscriptionPanel } from "./CallTranscriptionPanel";
import { cn } from "@/lib/utils";

export function ActiveCallModal() {
  const {
    activeCall,
    showActiveCallModal,
    setShowActiveCallModal,
    endCall,
    toggleMute,
    transcriptions,
    isTranscribing,
    isRecording,
    transcriptionError,
  } = useCall();

  const [showTranscription, setShowTranscription] = useState(true);

  // Não mostrar se não há chamada ativa
  if (!activeCall || !showActiveCallModal) return null;

  // Status da biblioteca WaVoIP: RINGING, CALLING, NOT_ANSWERED, ACTIVE, ENDED, REJECTED, FAILED, DISCONNECTED
  const isActive = activeCall.status === "ACTIVE";
  const isConnecting =
    activeCall.status === "CALLING" ||
    activeCall.status === "RINGING" ||
    activeCall.status === "CONNECTING";

  return (
    <Dialog open={showActiveCallModal} onOpenChange={setShowActiveCallModal}>
      <DialogContent
        className={cn(
          "transition-all duration-300 z-[90]",
          showTranscription ? "sm:max-w-xl" : "sm:max-w-md"
        )}
        overlayClassName="z-[90]"
        aria-describedby="call-description"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">Chamada em andamento</DialogTitle>
          <DialogDescription id="call-description" className="sr-only">
            Chamada {activeCall.direction === "INCOMING" ? "recebida de" : "para"} {activeCall.peerName || activeCall.peerPhone}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col py-4 space-y-4">
          {/* Header com info do contato */}
          <div className="flex items-center gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              {activeCall.profilePicture ? (
                <img
                  src={activeCall.profilePicture}
                  alt={activeCall.peerName || "Contato"}
                  className={cn(
                    "w-16 h-16 rounded-full object-cover border-3",
                    isActive ? "border-green-500" : "border-blue-500",
                    isConnecting && "animate-pulse"
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "w-16 h-16 rounded-full flex items-center justify-center",
                    isActive ? "bg-green-100" : "bg-blue-100",
                    isConnecting && "animate-pulse"
                  )}
                >
                  <User className={cn("h-8 w-8", isActive ? "text-green-600" : "text-blue-600")} />
                </div>
              )}
              {isActive && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                  <Phone className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-lg font-semibold truncate">
                {activeCall.peerName || activeCall.peerPhone}
              </p>
              {activeCall.peerName && (
                <p className="text-sm text-muted-foreground truncate">{activeCall.peerPhone}</p>
              )}
              <p
                className={cn(
                  "text-sm font-medium",
                  isActive ? "text-green-600" : "text-blue-600"
                )}
              >
                {isConnecting && "Chamando..."}
                {isActive && "Em chamada"}
                {activeCall.status === "DISCONNECTED" && "Reconectando..."}
              </p>
            </div>

            {/* Duração */}
            <div className="flex items-center gap-1.5 text-xl font-mono">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span>{formatCallDuration(activeCall.duration)}</span>
            </div>
          </div>

          {/* Indicador de peer mutado */}
          {activeCall.isPeerMuted && (
            <div className="flex items-center gap-2 text-sm text-yellow-600 bg-yellow-50 px-3 py-1.5 rounded-md">
              <VolumeX className="h-4 w-4" />
              <span>Outro lado está mutado</span>
            </div>
          )}

          {/* Painel de Transcrição */}
          <div className="border rounded-lg overflow-hidden">
            <button
              onClick={() => setShowTranscription(!showTranscription)}
              className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted transition-colors"
            >
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Transcrição em tempo real</span>
                {isTranscribing && (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                    Ativa
                  </span>
                )}
                {isRecording && (
                  <span className="flex items-center gap-1 text-xs text-red-600">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                    Gravando
                  </span>
                )}
              </div>
              {showTranscription ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>

            {showTranscription && (
              <div className="p-3 bg-background">
                <CallTranscriptionPanel
                  transcriptions={transcriptions}
                  isTranscribing={isTranscribing}
                  error={transcriptionError}
                  maxHeight="350px"
                />
              </div>
            )}
          </div>

          {/* Controles */}
          <div className="flex items-center justify-center gap-4 pt-2">
            {/* Mute */}
            <Button
              variant={activeCall.isMuted ? "destructive" : "outline"}
              size="lg"
              className="rounded-full h-14 w-14"
              onClick={() => toggleMute()}
              disabled={!isActive}
              title={activeCall.isMuted ? "Desmutar" : "Mutar"}
            >
              {activeCall.isMuted ? (
                <MicOff className="h-6 w-6" />
              ) : (
                <Mic className="h-6 w-6" />
              )}
            </Button>

            {/* Encerrar */}
            <Button
              variant="destructive"
              size="lg"
              className="rounded-full h-16 w-16"
              onClick={() => endCall()}
              title="Encerrar chamada"
            >
              <PhoneOff className="h-7 w-7" />
            </Button>
          </div>

          {/* Info adicional */}
          <div className="text-xs text-muted-foreground text-center">
            {activeCall.direction === "INCOMING" ? "Chamada recebida" : "Chamada realizada"} via WhatsApp
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
