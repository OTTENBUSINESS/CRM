import { useState } from "react";
import { User, Users, CheckCircle2, MoreVertical, ListTodo, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import type { InboxConversation } from "@/hooks/useCSInbox";
import { CreateTaskModal } from "@/components/tasks/CreateTaskModal";
import { getProductColor } from "@/lib/productColors";

interface ConversationRowProps {
  conv: InboxConversation;
  isSelected: boolean;
  onClick: () => void;
  onMarkHandled: () => void;
  onUnmarkHandled: () => void;
}

export function ConversationRow({
  conv,
  isSelected,
  onClick,
  onMarkHandled,
  onUnmarkHandled,
}: ConversationRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false);

  const isCritical = conv.sla_status === "critical" && !conv.is_handled;
  const isWarning = conv.sla_status === "warning" && !conv.is_handled;
  const isGroup = conv.conversation_type === "grupo";
  const isClient = !!conv.organization_id;
  const isHandled = conv.is_handled;
  const needsFollowUp = conv.needs_follow_up && !conv.is_handled;

  // Format time
  const messageDate = conv.last_message_at ? new Date(conv.last_message_at) : null;
  const now = new Date();
  const isToday = messageDate && messageDate.toDateString() === now.toDateString();
  const isYesterday = messageDate && new Date(now.getTime() - 86400000).toDateString() === messageDate.toDateString();

  let timeStr = "";
  if (messageDate) {
    if (isToday) {
      timeStr = format(messageDate, "HH:mm");
    } else if (isYesterday) {
      timeStr = "Ontem " + format(messageDate, "HH:mm");
    } else {
      timeStr = format(messageDate, "dd/MM HH:mm");
    }
  }

  const waitTime = conv.wait_minutes != null && conv.wait_minutes > 0
    ? (conv.wait_minutes < 60 ? conv.wait_minutes + "m" : Math.floor(conv.wait_minutes / 60) + "h")
    : null;

  const healthColor = conv.health_status === "risk" ? "bg-red-500" : conv.health_status === "alert" ? "bg-amber-500" : conv.health_status === "healthy" ? "bg-green-500" : "bg-gray-300";

  let bgColor = "bg-white hover:bg-gray-50";
  if (isSelected) bgColor = "bg-green-100";
  else if (isHandled) bgColor = "bg-green-50/50 hover:bg-green-50";
  else if (isCritical) bgColor = "bg-red-50 hover:bg-red-100";
  else if (isWarning) bgColor = "bg-amber-50 hover:bg-amber-100";
  else if (needsFollowUp) bgColor = "bg-orange-50 hover:bg-orange-100";

  // Gerar sugestão de tarefa baseada no contexto
  const getTaskSuggestion = () => {
    const products = conv.lead_products?.join(", ") || "";
    const waitInfo = conv.pending_reply && conv.wait_minutes
      ? `Aguardando resposta há ${waitTime}`
      : "";

    let taskType: 'follow_up' | 'call' | 'whatsapp' = 'follow_up';

    if (conv.pending_reply && conv.wait_minutes && conv.wait_minutes > 120) {
      taskType = 'call'; // Cliente crítico, melhor ligar
    } else if (conv.pending_reply) {
      taskType = 'whatsapp'; // Follow-up por WhatsApp
    }

    return { taskType, products, waitInfo };
  };

  return (
    <>
      <div
        className={`p-3 border-b cursor-pointer ${bgColor} relative`}
        onClick={onClick}
      >
        <div className="flex gap-3">
          {/* Avatar */}
          <div className="relative flex-shrink-0">
            {conv.lead_photo_url ? (
              <img
                src={conv.lead_photo_url}
                alt={conv.conversation_name}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isGroup ? "bg-purple-100" : "bg-blue-100"}`}>
                {isGroup ? <Users className="h-5 w-5 text-purple-600" /> : <User className="h-5 w-5 text-blue-600" />}
              </div>
            )}
            {isClient && <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${healthColor}`} />}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Row 1: Name and Time */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm truncate">{conv.conversation_name}</span>
              <span className="text-[11px] text-gray-500">{timeStr}</span>
              {isClient && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Cliente</span>}
              {isHandled && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700">Resolvida</span>}
              {conv.pending_tasks_count > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 flex items-center gap-0.5">
                  <ListTodo className="h-2.5 w-2.5" />
                  {conv.pending_tasks_count}
                </span>
              )}
            </div>

            {/* Row 2: Message preview */}
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {conv.is_from_me && <span className="text-green-600 mr-1">✓</span>}
              {conv.last_message || "Sem mensagens"}
            </div>

            {/* Row 3: Tags */}
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {conv.lead_products?.slice(0, 3).map((p, i) => {
                const color = getProductColor(p);
                return (
                  <span
                    key={i}
                    className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${color.bg} ${color.text} ${color.border} border`}
                  >
                    {p}
                  </span>
                );
              })}
              {conv.pending_reply && waitTime && !isHandled && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isCritical ? "bg-red-200 text-red-800" : isWarning ? "bg-amber-200 text-amber-800" : "bg-blue-100 text-blue-700"}`}>
                  Aguardando {waitTime}
                </span>
              )}
              {needsFollowUp && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-orange-200 text-orange-800 flex items-center gap-0.5">
                  <RotateCcw className="h-2.5 w-2.5" />
                  Follow-up
                </span>
              )}
            </div>
          </div>

          {/* Menu 3 pontinhos */}
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 hover:bg-gray-200 rounded"
            >
              <MoreVertical className="h-4 w-4 text-gray-500" />
            </button>

            {/* Dropdown */}
            {menuOpen && (
              <>
                {/* Overlay para fechar */}
                <div
                  className="fixed inset-0 z-10"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                {/* Menu */}
                <div className="absolute right-0 top-6 z-20 bg-white border rounded-lg shadow-lg py-1 min-w-[180px]">
                  {/* Criar Tarefa */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      setIsCreateTaskOpen(true);
                    }}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-blue-700"
                  >
                    <ListTodo className="h-4 w-4" />
                    Criar Tarefa
                  </button>

                  <div className="border-t my-1" />

                  {/* Marcar/Desmarcar como resolvida */}
                  {isHandled ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnmarkHandled();
                        setMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2"
                    >
                      ↩ Voltar para pendentes
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onMarkHandled();
                        setMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 text-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Marcar como resolvida
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Criar Tarefa */}
      <CreateTaskModal
        open={isCreateTaskOpen}
        onOpenChange={setIsCreateTaskOpen}
        defaultValues={{
          lead_id: conv.lead_id || undefined,
          lead_name: conv.conversation_name,
          organization_id: conv.organization_id || undefined,
          organization_name: conv.organization_name || undefined,
          team: 'cs',
          task_type: getTaskSuggestion().taskType,
        }}
        zClass="z-[95]"
      />
    </>
  );
}
