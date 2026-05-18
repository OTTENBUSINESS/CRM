import { useEffect } from 'react';
import { useMeeting } from '@/contexts/MeetingContext';
import { Button } from '@/components/ui/button';
import { Video, X, RefreshCw } from 'lucide-react';

export function MeetingRecoveryBanner() {
  const { hasPendingSession, recoverSession, dismissPendingSession, activeMeeting } = useMeeting();

  useEffect(() => {
    console.log('[MeetingRecoveryBanner] 🔄 Estado:', { hasPendingSession, hasActiveMeeting: !!activeMeeting });
  }, [hasPendingSession, activeMeeting]);

  // Não mostrar se já tem reunião ativa ou não tem sessão pendente
  if (activeMeeting || !hasPendingSession) {
    console.log('[MeetingRecoveryBanner] 🚫 Não mostrando banner:', { activeMeeting: !!activeMeeting, hasPendingSession });
    return null;
  }

  console.log('[MeetingRecoveryBanner] ✅ Mostrando banner de recuperação');

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="bg-amber-500 text-white rounded-lg shadow-lg p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-full">
            <Video className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-sm">Reunião em andamento</h4>
            <p className="text-xs text-white/90 mt-1">
              Você tem uma reunião que não foi finalizada. Deseja continuar?
            </p>
            <div className="flex gap-2 mt-3">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 text-xs bg-white text-amber-600 hover:bg-white/90"
                onClick={recoverSession}
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Continuar
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-white hover:bg-white/20"
                onClick={dismissPendingSession}
              >
                <X className="h-3 w-3 mr-1" />
                Descartar
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
