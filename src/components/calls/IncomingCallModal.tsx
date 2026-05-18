import { useEffect, useState } from "react";
import { Phone, PhoneOff, User, PhoneIncoming } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { useCall } from "@/contexts/CallContext";
import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

interface LeadInfo {
  id: string;
  name: string;
  organization?: string;
  products?: string[];
}

export function IncomingCallModal() {
  const {
    activeCall,
    showIncomingModal,
    setShowIncomingModal,
    answerCall,
    rejectCall,
  } = useCall();

  const [leadInfo, setLeadInfo] = useState<LeadInfo | null>(null);
  const [loading, setLoading] = useState(false);

  // Buscar info do lead pelo telefone
  useEffect(() => {
    if (!activeCall?.peerPhone || !showIncomingModal) {
      setLeadInfo(null);
      return;
    }

    const fetchLeadInfo = async () => {
      setLoading(true);
      try {
        // Buscar lead pelo telefone
        const { data } = await supabase.rpc("find_lead_by_phone", {
          p_phone: activeCall.peerPhone,
        });

        if (data) {
          const { data: lead } = await supabase
            .from("leads")
            .select(`
              id,
              name,
              active_products,
              organization:organizations(name)
            `)
            .eq("id", data)
            .single();

          if (lead) {
            setLeadInfo({
              id: lead.id,
              name: lead.name,
              organization: lead.organization?.name,
              products: lead.active_products || [],
            });
          }
        }
      } catch (e) {
        console.error("Erro ao buscar lead:", e);
      } finally {
        setLoading(false);
      }
    };

    fetchLeadInfo();
  }, [activeCall?.peerPhone, showIncomingModal]);

  if (!activeCall || !showIncomingModal) return null;

  return (
    <DialogPrimitive.Root open={showIncomingModal}>
      <DialogPrimitive.Portal>
        {/* Overlay that does NOT close on click */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-[50%] top-[50%] z-[90] grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg"
          // Block dismiss by click outside and ESC
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Chamada recebida</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Chamada recebida de {leadInfo?.name || activeCall.peerPhone}
          </DialogPrimitive.Description>

          <div className="flex flex-col items-center py-6 space-y-6">
            {/* Animação de chamada recebida */}
            <div className="relative">
              <div className="absolute inset-0 animate-ping">
                <div className="w-32 h-32 rounded-full bg-green-200 opacity-50" />
              </div>
              <div className="relative w-32 h-32 rounded-full bg-green-100 flex items-center justify-center">
                <PhoneIncoming className="h-16 w-16 text-green-600 animate-bounce" />
              </div>
            </div>

            {/* Info do chamador */}
            <div className="text-center space-y-2">
              <p className="text-sm text-muted-foreground">Chamada recebida</p>
              <p className="text-2xl font-bold">
                {leadInfo?.name || activeCall.peerPhone}
              </p>
              {leadInfo?.name && (
                <p className="text-lg text-muted-foreground">{activeCall.peerPhone}</p>
              )}

              {/* Info adicional do lead */}
              {leadInfo && (
                <div className="flex flex-col items-center gap-1 mt-2">
                  {leadInfo.organization && (
                    <span className="text-sm text-muted-foreground">
                      {leadInfo.organization}
                    </span>
                  )}
                  {leadInfo.products && leadInfo.products.length > 0 && (
                    <div className="flex gap-1 flex-wrap justify-center">
                      {leadInfo.products.slice(0, 3).map((product) => (
                        <span
                          key={product}
                          className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full"
                        >
                          {product}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {loading && (
                <p className="text-sm text-muted-foreground animate-pulse">
                  Buscando informações...
                </p>
              )}
            </div>

            {/* Botões de ação */}
            <div className="flex items-center gap-8 pt-4">
              {/* Rejeitar */}
              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="destructive"
                  size="lg"
                  className="rounded-full h-16 w-16"
                  onClick={rejectCall}
                >
                  <PhoneOff className="h-8 w-8" />
                </Button>
                <span className="text-sm font-medium text-destructive">Rejeitar</span>
              </div>

              {/* Atender */}
              <div className="flex flex-col items-center gap-2">
                <Button
                  size="lg"
                  className="rounded-full h-16 w-16 bg-green-600 hover:bg-green-700"
                  onClick={answerCall}
                >
                  <Phone className="h-8 w-8" />
                </Button>
                <span className="text-sm font-medium text-green-600">Atender</span>
              </div>
            </div>

            {/* Minimizar - fallback para quem quer sair mas não perder a chamada */}
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
              onClick={() => setShowIncomingModal(false)}
            >
              Minimizar (a chamada continua tocando)
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
