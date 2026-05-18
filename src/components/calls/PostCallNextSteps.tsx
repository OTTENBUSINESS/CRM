import { useState } from 'react';
import { Phone, DollarSign, XCircle, Check, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  useActiveDealForLead,
  useLossReasons,
  useSchedulePartnerCall,
  useSchedulePayment,
  useMarkCallLost,
} from '@/hooks/usePostCallActions';

interface PostCallNextStepsProps {
  callId: string;
  leadId: string;
  leadName?: string;
  onActionComplete?: (action: string) => void;
}

type ActionType = 'partner_call' | 'payment' | 'lost' | null;
type CompletedAction = {
  type: ActionType;
  label: string;
};

const DATE_CHIPS = [
  { label: 'Amanhã 10h', days: 1, hour: 10 },
  { label: '+2 dias', days: 2, hour: 10 },
  { label: '+3 dias', days: 3, hour: 10 },
  { label: '+1 semana', days: 7, hour: 10 },
];

function getScheduledDate(daysFromNow: number, hour: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return date;
}

export function PostCallNextSteps({ callId, leadId, leadName = 'Lead', onActionComplete }: PostCallNextStepsProps) {
  const [expandedAction, setExpandedAction] = useState<ActionType>(null);
  const [completedAction, setCompletedAction] = useState<CompletedAction | null>(null);

  const { data: activeDeal } = useActiveDealForLead(leadId);
  const { data: lossReasons = [] } = useLossReasons();

  const schedulePartnerCall = useSchedulePartnerCall();
  const schedulePayment = useSchedulePayment();
  const markCallLost = useMarkCallLost();

  const isLoading = schedulePartnerCall.isPending || schedulePayment.isPending || markCallLost.isPending;

  const handleSchedulePartnerCall = async (days: number, hour: number) => {
    const scheduledDate = getScheduledDate(days, hour);
    await schedulePartnerCall.mutateAsync({
      callId,
      leadId,
      leadName,
      scheduledDate,
      dealId: activeDeal?.id,
      dealStageId: activeDeal?.pipeline_stage_id,
    });
    setCompletedAction({ type: 'partner_call', label: 'Call com sócio agendada' });
    onActionComplete?.('schedule_partner_call');
  };

  const handleSchedulePayment = async (days: number, hour: number) => {
    const scheduledDate = getScheduledDate(days, hour);
    await schedulePayment.mutateAsync({
      callId,
      leadId,
      leadName,
      scheduledDate,
      dealId: activeDeal?.id,
      dealPipelineId: (activeDeal?.pipeline_stage as any)?.pipeline_id,
    });
    setCompletedAction({ type: 'payment', label: 'Pagamento agendado' });
    onActionComplete?.('schedule_payment');
  };

  const handleMarkLost = async (reason: string) => {
    await markCallLost.mutateAsync({
      callId,
      leadId,
      reason,
      dealId: activeDeal?.id,
    });
    setCompletedAction({ type: 'lost', label: 'Marcado como perdido' });
    onActionComplete?.('lost');
  };

  // Estado concluído
  if (completedAction) {
    return (
      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium text-emerald-800">{completedAction.label}</span>
          {activeDeal && (
            <Badge variant="outline" className="ml-auto text-xs border-emerald-300 text-emerald-600">
              Deal atualizado
            </Badge>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-sm font-semibold flex items-center gap-2 text-slate-800">
        <span className="text-lg">⚡</span>
        <span>Próximo Passo</span>
        {activeDeal && (
          <Badge variant="outline" className="ml-1 text-xs font-normal">
            Deal: {activeDeal.title}
          </Badge>
        )}
      </div>

      {/* 3 botões principais */}
      <div className="grid grid-cols-3 gap-2">
        {/* Agendar Call com Sócio */}
        <button
          onClick={() => setExpandedAction(expandedAction === 'partner_call' ? null : 'partner_call')}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
            expandedAction === 'partner_call'
              ? "border-blue-500 bg-blue-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/50"
          )}
        >
          <Phone className="h-5 w-5 text-blue-600" />
          <span className="text-xs font-medium text-slate-700 leading-tight">Agendar Call<br />com Sócio</span>
        </button>

        {/* Agendar Pagamento */}
        <button
          onClick={() => setExpandedAction(expandedAction === 'payment' ? null : 'payment')}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
            expandedAction === 'payment'
              ? "border-emerald-500 bg-emerald-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/50"
          )}
        >
          <DollarSign className="h-5 w-5 text-emerald-600" />
          <span className="text-xs font-medium text-slate-700 leading-tight">Agendar<br />Pagamento</span>
        </button>

        {/* Perdida */}
        <button
          onClick={() => setExpandedAction(expandedAction === 'lost' ? null : 'lost')}
          disabled={isLoading}
          className={cn(
            "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center",
            expandedAction === 'lost'
              ? "border-red-500 bg-red-50 shadow-sm"
              : "border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/50"
          )}
        >
          <XCircle className="h-5 w-5 text-red-500" />
          <span className="text-xs font-medium text-slate-700 leading-tight">Perdida</span>
        </button>
      </div>

      {/* Expansão inline: chips de data */}
      {(expandedAction === 'partner_call' || expandedAction === 'payment') && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-slate-500 w-full mb-1">
            {expandedAction === 'partner_call' ? 'Quando será a call?' : 'Quando espera o pagamento?'}
          </span>
          {DATE_CHIPS.map((chip) => (
            <button
              key={chip.label}
              onClick={() =>
                expandedAction === 'partner_call'
                  ? handleSchedulePartnerCall(chip.days, chip.hour)
                  : handleSchedulePayment(chip.days, chip.hour)
              }
              disabled={isLoading}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                "bg-white border-slate-200 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <Calendar className="h-3 w-3 inline mr-1" />
                  {chip.label}
                </>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Expansão inline: motivos de perda */}
      {expandedAction === 'lost' && (
        <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-red-50/50 border border-red-200 animate-in fade-in slide-in-from-top-1 duration-200">
          <span className="text-xs text-slate-500 w-full mb-1">Qual o motivo?</span>
          {lossReasons.map((reason) => (
            <button
              key={reason.id}
              onClick={() => handleMarkLost(reason.label)}
              disabled={isLoading}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
                "bg-white border-red-200 hover:border-red-400 hover:bg-red-50 hover:text-red-700",
                isLoading && "opacity-50 cursor-not-allowed"
              )}
            >
              {isLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                reason.label
              )}
            </button>
          ))}
          <button
            onClick={() => handleMarkLost('Sem interesse')}
            disabled={isLoading}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
              "bg-white border-red-200 hover:border-red-400 hover:bg-red-50 hover:text-red-700",
              isLoading && "opacity-50 cursor-not-allowed"
            )}
          >
            Sem interesse
          </button>
        </div>
      )}
    </div>
  );
}
