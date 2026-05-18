import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { User, Users, AlertCircle, Clock, Heart, Package } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { InboxConversation } from "@/hooks/useCSInbox";
import { formatWaitTime } from "@/hooks/useCSInbox";

interface ConversationItemProps {
  conversation: InboxConversation;
  isSelected: boolean;
  onClick: () => void;
}

export function ConversationItem({
  conversation,
  isSelected,
  onClick,
}: ConversationItemProps) {
  const isGroup = conversation.conversation_type === "grupo";
  const isPending = conversation.pending_reply;
  const isCritical = conversation.sla_status === "critical";
  const isWarning = conversation.sla_status === "warning";

  // Cor de fundo baseada no SLA
  const bgColor = isSelected
    ? "bg-accent"
    : isCritical
    ? "bg-red-50 hover:bg-red-100"
    : isWarning
    ? "bg-amber-50 hover:bg-amber-100"
    : isPending
    ? "bg-blue-50/50 hover:bg-blue-50"
    : "hover:bg-muted/50";

  // Formatação da última mensagem
  const lastMessageTime = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : "";

  // Truncar mensagem
  const truncatedMessage = conversation.last_message
    ? conversation.last_message.length > 60
      ? conversation.last_message.slice(0, 60) + "..."
      : conversation.last_message
    : "Sem mensagens";

  // Health indicator
  const healthColor =
    conversation.health_status === "risk"
      ? "bg-red-500"
      : conversation.health_status === "alert"
      ? "bg-amber-500"
      : conversation.health_status === "healthy"
      ? "bg-green-500"
      : "bg-gray-300";

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 p-3 cursor-pointer transition-all border-b",
        bgColor
      )}
      onClick={onClick}
    >
      {/* Indicador de SLA crítico */}
      {isCritical && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-red-500" />
      )}
      {isWarning && !isCritical && (
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-amber-500" />
      )}

      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <Avatar className="h-11 w-11">
          <AvatarImage src={conversation.lead_photo_url || undefined} />
          <AvatarFallback className={cn(isGroup ? "bg-purple-100" : "bg-blue-100")}>
            {isGroup ? (
              <Users className="h-5 w-5 text-purple-600" />
            ) : (
              <User className="h-5 w-5 text-blue-600" />
            )}
          </AvatarFallback>
        </Avatar>
        {/* Health indicator */}
        {conversation.organization_id && (
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white",
              healthColor
            )}
            title={`Saúde: ${conversation.health_status}`}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        {/* Header Row */}
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-sm truncate">
              {conversation.conversation_name}
            </span>
            {conversation.organization_id && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] font-normal">
                Cliente
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {lastMessageTime}
          </span>
        </div>

        {/* Message Preview */}
        <p className="text-sm text-muted-foreground truncate mb-1.5">
          {conversation.is_from_me && (
            <span className="text-green-600 mr-1">✓</span>
          )}
          {truncatedMessage}
        </p>

        {/* Bottom Row: Products + Wait Time */}
        <div className="flex items-center justify-between gap-2">
          {/* Products */}
          <div className="flex items-center gap-1 flex-wrap">
            {conversation.lead_products && conversation.lead_products.length > 0 ? (
              conversation.lead_products.slice(0, 2).map((productId, i) => (
                <Badge
                  key={i}
                  variant="secondary"
                  className="h-5 px-1.5 text-[10px] font-normal bg-violet-100 text-violet-700"
                >
                  <Package className="h-3 w-3 mr-0.5" />
                  {productId.length > 10 ? productId.slice(0, 10) + "..." : productId}
                </Badge>
              ))
            ) : conversation.organization_name ? (
              <Badge
                variant="secondary"
                className="h-5 px-1.5 text-[10px] font-normal"
              >
                {conversation.organization_name}
              </Badge>
            ) : null}
            {conversation.lead_products && conversation.lead_products.length > 2 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                +{conversation.lead_products.length - 2}
              </Badge>
            )}
          </div>

          {/* Wait Time / SLA */}
          {isPending && (
            <div
              className={cn(
                "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded min-h-[28px]",
                isCritical
                  ? "text-red-700 bg-red-100"
                  : isWarning
                  ? "text-amber-700 bg-amber-100"
                  : "text-blue-700 bg-blue-100"
              )}
            >
              {isCritical ? (
                <AlertCircle className="h-3 w-3" />
              ) : (
                <Clock className="h-3 w-3" />
              )}
              <span>{formatWaitTime(conversation.wait_minutes)}</span>
            </div>
          )}

          {/* Unread Count */}
          {conversation.unread_count > 0 && (
            <span className="flex items-center justify-center min-w-5 h-5 px-1.5 bg-primary text-primary-foreground text-xs font-bold rounded-full">
              {conversation.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
