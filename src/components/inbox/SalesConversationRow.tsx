import { cn } from "@/lib/utils";
import { format, formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  User,
  Users,
  AlertCircle,
  Clock,
  CheckCircle2,
  MessageCircle,
  Reply,
  Flame,
  Zap,
  Building2,
  Bot,
  DollarSign,
  UserCheck,
} from "lucide-react";
import type { InboxConversation } from "@/hooks/useCSInbox";
import { getConversationFunnelStage, type FunnelStage } from "@/hooks/useCSInbox";

const funnelBadgeConfig: Record<string, { label: string; colors: string }> = {
  novo: { label: 'Novo', colors: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300' },
  em_contato: { label: 'Em contato', colors: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  agendado: { label: 'Agendado', colors: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  closer: { label: 'Closer', colors: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  fechado: { label: 'Fechado', colors: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  perdido: { label: 'Perdido', colors: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
};

interface SalesConversationRowProps {
  conv: InboxConversation;
  isSelected: boolean;
  pipelineName?: string;
  onClick: () => void;
  onNavigateToLead: () => void;
  onMarkHandled: () => void;
  onUnmarkHandled: () => void;
}

export function SalesConversationRow({
  conv,
  isSelected,
  pipelineName,
  onClick,
  onNavigateToLead,
  onMarkHandled,
  onUnmarkHandled,
}: SalesConversationRowProps) {
  const isCritical = conv.sla_status === "critical" && !conv.is_handled;
  const isWarning = conv.sla_status === "warning" && !conv.is_handled;
  const isGroup = conv.conversation_type === "grupo";
  const hasLead = !!conv.lead_id;
  const isHandled = conv.is_handled;

  // Status da conversa
  const awaitingYourReply = conv.pending_reply && !conv.is_from_me && !isHandled;
  const youReplied = conv.is_from_me;
  const funnelStage = getConversationFunnelStage(conv);

  // Score do lead (se tiver)
  const leadScore = (conv as any).lead_score;
  const isHotLead = leadScore && leadScore >= 70;
  const isWarmLead = leadScore && leadScore >= 40 && leadScore < 70;

  // Dados B2B
  const companyName = (conv as any).lead_company_name || (conv as any).company_name;
  const jobTitle = (conv as any).lead_job_title || (conv as any).job_title;
  const monthlyRevenue = conv.lead_monthly_revenue || (conv as any).monthly_revenue;
  const employeeCount = conv.lead_employee_count || (conv as any).employee_count;

  // Responsável (vendedor atribuído ao lead)
  const responsavelName = conv.assigned_agent_name;
  const responsavelFirstName = responsavelName?.split(' ')[0] || null;

  // Format time
  const messageDate = conv.last_message_at ? new Date(conv.last_message_at) : null;
  const now = new Date();
  const isToday = messageDate && messageDate.toDateString() === now.toDateString();
  const isYesterday = messageDate && new Date(now.getTime() - 86400000).toDateString() === messageDate.toDateString();

  const timeDisplay = messageDate
    ? isToday
      ? format(messageDate, "HH:mm")
      : isYesterday
      ? `Ontem ${format(messageDate, "HH:mm")}`
      : format(messageDate, "dd/MM HH:mm")
    : "";

  const waitTime = conv.wait_minutes != null && conv.wait_minutes > 0
    ? conv.wait_minutes < 60
      ? `${conv.wait_minutes}min`
      : `${Math.floor(conv.wait_minutes / 60)}h${conv.wait_minutes % 60 > 0 ? `${conv.wait_minutes % 60}m` : ""}`
    : null;

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 p-3 cursor-pointer border-b border-l-[3px] transition-all",
        isSelected ? "bg-blue-100 dark:bg-blue-900/30 border-l-blue-500" :
        isHandled ? "bg-green-50/30 dark:bg-green-950/20 hover:bg-green-50/50 dark:hover:bg-green-950/30 opacity-70 border-l-green-400" :
        isCritical ? "bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/40 border-l-red-500" :
        isWarning ? "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/40 border-l-amber-500" :
        awaitingYourReply ? "bg-blue-50/50 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30 border-l-blue-400" :
        "hover:bg-gray-50 dark:hover:bg-muted/50 border-l-transparent"
      )}
      onClick={onClick}
    >
      {/* Static indicator for critical */}
      {isCritical && !isSelected && (
        <div className="absolute top-2 right-2">
          <span className="inline-flex rounded-full h-3 w-3 bg-red-500 ring-2 ring-red-200 dark:ring-red-800"></span>
        </div>
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {(conv.lead_photo_url || (conv as any).photo_url) && !isGroup ? (
          <img
            src={conv.lead_photo_url || (conv as any).photo_url}
            alt={conv.conversation_name}
            className={cn(
              "w-11 h-11 rounded-full object-cover ring-2",
              isHotLead ? "ring-red-300 dark:ring-red-700" :
              isWarmLead ? "ring-amber-300 dark:ring-amber-700" :
              awaitingYourReply ? "ring-blue-300 dark:ring-blue-700" :
              "ring-gray-200 dark:ring-border"
            )}
          />
        ) : (
          <div className={cn(
            "w-11 h-11 rounded-full flex items-center justify-center ring-2",
            isGroup ? "bg-purple-100 dark:bg-purple-900/40 ring-purple-200 dark:ring-purple-700" :
            isHotLead ? "bg-red-100 dark:bg-red-900/40 ring-red-300 dark:ring-red-700" :
            isWarmLead ? "bg-amber-100 dark:bg-amber-900/40 ring-amber-300 dark:ring-amber-700" :
            awaitingYourReply ? "bg-blue-100 dark:bg-blue-900/40 ring-blue-300 dark:ring-blue-700" :
            "bg-gray-100 dark:bg-muted ring-gray-200 dark:ring-border"
          )}>
            {isGroup ? (
              <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            ) : isHotLead ? (
              <Flame className="h-5 w-5 text-red-500" />
            ) : isWarmLead ? (
              <Zap className="h-5 w-5 text-amber-500" />
            ) : (
              <User className="h-5 w-5 text-gray-600 dark:text-muted-foreground" />
            )}
          </div>
        )}
        {/* Status indicator */}
        {awaitingYourReply && !isHandled && (
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-background bg-blue-500 flex items-center justify-center" title="Aguardando sua resposta">
            <MessageCircle className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {youReplied && !awaitingYourReply && !isHandled && (
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-background bg-green-500 flex items-center justify-center" title="Você respondeu">
            <Reply className="h-2.5 w-2.5 text-white" />
          </span>
        )}
        {isHandled && (
          <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-background bg-green-400 flex items-center justify-center" title="Resolvida">
            <CheckCircle2 className="h-2.5 w-2.5 text-white" />
          </span>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + Company */}
        <div className="mb-1">
          <div className="flex items-center gap-2">
            <span className={cn(
              "font-semibold text-sm truncate",
              isCritical && "text-red-800 dark:text-red-300",
              isWarning && !isCritical && "text-amber-800 dark:text-amber-300"
            )}>
              <span data-sensitive="name">{conv.conversation_name}</span>
            </span>
            {/* Compact lead score indicator */}
            {isHotLead && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300 font-bold shrink-0">
                {leadScore}
              </span>
            )}
            {isWarmLead && (
              <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-300 font-bold shrink-0">
                {leadScore}
              </span>
            )}
          </div>
          {companyName && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{companyName}</span>
            </p>
          )}
          {(monthlyRevenue || employeeCount) && (
            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
              {monthlyRevenue ? (
                <span className="text-green-600 dark:text-green-400 font-medium">
                  <DollarSign className="h-3 w-3 inline shrink-0" />R${monthlyRevenue}
                </span>
              ) : employeeCount ? (
                <span className="opacity-70">{employeeCount} funcionários</span>
              ) : null}
            </p>
          )}
        </div>

        {/* Row 2: Message preview */}
        <div className="flex items-center gap-2 mb-1.5">
          <p className={cn(
            "text-sm truncate flex-1",
            awaitingYourReply ? "text-foreground font-medium" : "text-muted-foreground"
          )}>
            {conv.is_from_me && <span className="text-green-600 dark:text-green-400 mr-1">✓</span>}
            {conv.last_message || "Sem mensagens"}
          </p>
        </div>

        {/* Row 3: Status badges + time */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Awaiting reply badge - clicável para resolver */}
            {awaitingYourReply && waitTime && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkHandled(); }}
                title="Clique para marcar como resolvida"
                className={cn(
                  "text-[11px] px-2 py-1 rounded-full font-bold flex items-center gap-1 transition-colors group/badge relative overflow-hidden",
                  isCritical ? "bg-red-500 text-white hover:bg-green-500" :
                  isWarning ? "bg-amber-500 text-white hover:bg-green-500" :
                  "bg-blue-500 text-white hover:bg-green-500"
                )}
              >
                {/* Ambos spans sempre renderizados, hover troca opacidade (sem layout shift) */}
                <span className="flex items-center gap-1 group-hover/badge:opacity-0 transition-opacity">
                  {isCritical ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                  {isCritical ? "URGENTE " : ""}Aguardando {waitTime}
                </span>
                <span className="absolute inset-0 flex items-center justify-center gap-1 opacity-0 group-hover/badge:opacity-100 transition-opacity">
                  <CheckCircle2 className="h-3 w-3" /> Resolver
                </span>
              </button>
            )}

            {/* Pipeline badge — sempre visível */}
            {pipelineName && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                pipelineName === 'Closer' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                : pipelineName === 'Webinário' ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'
              )}>
                {pipelineName}
              </span>
            )}
            {/* Funnel stage badge */}
            {funnelStage && funnelBadgeConfig[funnelStage] && (
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded font-medium",
                funnelBadgeConfig[funnelStage].colors
              )}>
                {funnelBadgeConfig[funnelStage].label}
              </span>
            )}

            {/* Responsável (vendedor atribuído) */}
            {responsavelFirstName && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300 flex items-center gap-0.5"
                title={`Responsável: ${responsavelName}`}
              >
                <UserCheck className="h-2.5 w-2.5" />
                {responsavelFirstName}
              </span>
            )}

            {/* You replied badge — compact */}
            {youReplied && !awaitingYourReply && !isHandled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center gap-0.5">
                <Reply className="h-2.5 w-2.5" /> Respondido
              </span>
            )}

            {/* Handled badge — compact with time */}
            {isHandled && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 flex items-center gap-0.5" title={conv.handled_at ? `Resolvida ${format(new Date(conv.handled_at), "dd/MM HH:mm")}` : "Resolvida"}>
                <CheckCircle2 className="h-2.5 w-2.5" /> Resolvida
                {conv.handled_at && (
                  <span className="text-green-600/70 dark:text-green-400/70 ml-0.5">
                    {formatDistanceToNow(new Date(conv.handled_at), { locale: ptBR, addSuffix: false })}
                  </span>
                )}
              </span>
            )}

            {/* Time display */}
            <span className={cn(
              "text-[10px]",
              isCritical ? "text-red-500 font-medium" : isWarning ? "text-amber-500 font-medium" : "text-muted-foreground"
            )}>
              {timeDisplay}
            </span>

            {/* Revenue / Employees */}
            {monthlyRevenue && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5 truncate max-w-[120px]" title={`Faturamento: ${monthlyRevenue}`}>
                <DollarSign className="h-3 w-3 shrink-0" />
                {isNaN(Number(monthlyRevenue))
                  ? (monthlyRevenue.length > 12 ? monthlyRevenue.slice(0, 12) + "…" : monthlyRevenue)
                  : Number(monthlyRevenue).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </span>
            )}
            {!monthlyRevenue && employeeCount && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 flex items-center gap-0.5" title={`${employeeCount} funcionários`}>
                <Users className="h-3 w-3 shrink-0" />
                {employeeCount}
              </span>
            )}

            {/* Products */}
            {conv.lead_products && conv.lead_products.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
                {conv.lead_products[0].length > 15 ? conv.lead_products[0].slice(0, 15) + "..." : conv.lead_products[0]}
                {conv.lead_products.length > 1 && ` +${conv.lead_products.length - 1}`}
              </span>
            )}

            {/* AI Agent Status */}
            {conv.ai_agent_status === "active" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5" title="Agente IA ativo">
                <Bot className="h-3 w-3" /> IA
              </span>
            )}
            {conv.ai_agent_status?.startsWith("paused") && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center gap-0.5" title={conv.ai_agent_status === "paused_by_human" ? "IA pausado pelo vendedor" : "IA pausado por horário"}>
                <Bot className="h-3 w-3" /> IA
              </span>
            )}
            {conv.ai_agent_status === "transferred" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 flex items-center gap-0.5" title="Transferido para humano pelo agente IA">
                <UserCheck className="h-3 w-3" /> Transferido
              </span>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            {/* Mark as handled button */}
            {awaitingYourReply && !isHandled && (
              <button
                onClick={(e) => { e.stopPropagation(); onMarkHandled(); }}
                className="text-[11px] px-2 py-1 rounded font-medium bg-gray-100 dark:bg-muted text-gray-600 dark:text-muted-foreground hover:bg-green-100 dark:hover:bg-green-900/40 hover:text-green-700 dark:hover:text-green-300 transition-colors flex items-center gap-1 min-h-[32px]"
                title="Marcar como resolvida"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Resolver
              </button>
            )}

            {/* Unmark button */}
            {isHandled && (
              <button
                onClick={(e) => { e.stopPropagation(); onUnmarkHandled(); }}
                className="text-[11px] px-2 py-1 rounded font-medium bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:bg-amber-100 dark:hover:bg-amber-900/40 hover:text-amber-700 dark:hover:text-amber-300 transition-colors min-h-[32px]"
                title="Reabrir conversa"
              >
                Reabrir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
