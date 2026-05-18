import { useMemo } from 'react';
import { useFocusMode } from '@/contexts/FocusModeContext';
import { useAuth } from '@/contexts/AuthContext';
import { SalesLeadDetailContent } from '@/pages/SalesLeadDetail';
import { WhatsAppChat } from '@/components/inbox/WhatsAppChat';
import { FocusActionCard } from './FocusActionCard';
import { FocusSidePanel } from './FocusSidePanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { X, Crosshair, ArrowLeft, CheckCircle2, ArrowRight, Flame } from 'lucide-react';

const MOTIVATIONAL_QUOTES = [
  "Cada ligação te aproxima do fechamento.",
  "Disciplina supera talento quando talento não tem disciplina.",
  "O próximo lead pode ser o deal do mês.",
  "Consistência é a mãe do resultado.",
  "Quem faz mais contatos, fecha mais negócios.",
  "Foco no processo, o resultado vem.",
  "Não espere o lead perfeito — crie a oportunidade.",
  "Velocidade mata a concorrência.",
  "Cada 'não' te aproxima do 'sim'.",
  "Hoje é dia de bater meta.",
  "Venda é atitude. Bora!",
  "O follow-up é onde o dinheiro mora.",
  "Quem agenda mais, fecha mais.",
  "Sua energia define o tom da call.",
  "Pipeline cheio, comissão cheia.",
  "O melhor closer é o que mais liga.",
  "Não existe sorte em vendas — existe preparo.",
  "Quem domina o processo, domina o resultado.",
  "Ação gera reação. Liga, manda, agenda.",
  "Você não perde vendas — você desiste cedo demais.",
];

function FocusComplete() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
      <div className="h-20 w-20 rounded-full bg-green-500/10 flex items-center justify-center">
        <CheckCircle2 className="h-10 w-10 text-green-500" />
      </div>
      <h2 className="text-2xl font-bold">Tudo limpo!</h2>
      <p className="text-muted-foreground max-w-md">
        Você processou todas as tarefas da fila. O pipeline está liberado. Bom trabalho!
      </p>
    </div>
  );
}

export const FocusModeOverlay = () => {
  const {
    isActive,
    currentItem,
    queue,
    queuePosition,
    totalItems,
    dismiss,
    isShowingLeadDetail,
    detailLeadId,
    hideLeadDetail,
    isShowingInlineChat,
    inlineChatLeadId,
    inlineChatLeadName,
    inlineChatLeadPhone,
    hideInlineChat,
    completeItem,
  } = useFocusMode();
  const { teamMember } = useAuth();

  const quote = useMemo(() => MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)], []);

  if (!isActive) return null;

  const processedCount = totalItems - queue.length;
  const progressPct = totalItems > 0 ? (processedCount / totalItems) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[80] bg-background flex flex-col">
      {/* Header */}
      <div className="h-14 border-b flex items-center justify-between px-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          {(isShowingLeadDetail || isShowingInlineChat) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={isShowingLeadDetail ? hideLeadDetail : hideInlineChat}
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Crosshair className="h-5 w-5 text-orange-500" />
                <span className="font-bold text-sm">Modo Foco</span>
              </div>
              <span className="hidden md:flex items-center gap-1.5 text-xs text-orange-400/80 italic">
                <Flame className="h-3 w-3" />
                {quote}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          {totalItems > 0 && (
            <div className="flex items-center gap-2 min-w-[200px]">
              <Progress value={progressPct} className="h-2 flex-1" />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {processedCount}/{totalItems}
              </span>
            </div>
          )}
          {queue.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {queue.length} na fila
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" /> Sair
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 min-h-0 grid grid-cols-12 gap-0">
        {/* Central panel - 8 cols */}
        <div className="col-span-8 border-r overflow-auto">
          {isShowingLeadDetail && detailLeadId ? (
            <div className="p-4 h-full overflow-auto">
              <SalesLeadDetailContent leadId={detailLeadId} hideBackButton />
            </div>
          ) : isShowingInlineChat && inlineChatLeadId ? (
            <div className="h-full flex flex-col">
              <WhatsAppChat
                contactName={inlineChatLeadName || 'Lead'}
                contactPhone={inlineChatLeadPhone}
                leadId={inlineChatLeadId}
                instanceId={teamMember?.whatsapp_instance_id}
                className="flex-1"
              />
              {/* Botão fixo para concluir após enviar mensagens */}
              <div className="flex-shrink-0 border-t p-3 bg-background flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  Envie suas mensagens e clique para avançar
                </span>
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={completeItem}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  Concluir e Próximo
                  <ArrowRight className="h-4 w-4 ml-1.5" />
                </Button>
              </div>
            </div>
          ) : currentItem ? (
            <FocusActionCard item={currentItem} />
          ) : (
            <FocusComplete />
          )}
        </div>

        {/* Side panel - 4 cols */}
        <div className="col-span-4 p-3 overflow-hidden">
          <FocusSidePanel />
        </div>
      </div>
    </div>
  );
};
