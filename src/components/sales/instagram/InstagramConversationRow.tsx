import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Instagram, User, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SocialSellerStageBadge } from "./SocialSellerStageBadge";
import type { InstagramConversation } from "@/hooks/useInstagram";

interface InstagramConversationRowProps {
  conversation: InstagramConversation;
  isSelected?: boolean;
  onClick?: () => void;
}

export function InstagramConversationRow({ conversation, isSelected, onClick }: InstagramConversationRowProps) {
  const hasUnread = conversation.unread_count > 0;
  const displayName = conversation.participant_name || conversation.participant_username || "Usuário";
  const initials = displayName.substring(0, 2).toUpperCase();

  const timeAgo = conversation.last_message_at
    ? formatDistanceToNow(new Date(conversation.last_message_at), {
        addSuffix: true,
        locale: ptBR,
      })
    : "-";

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 p-3 cursor-pointer border-b transition-colors",
        isSelected ? "bg-accent" : "hover:bg-muted/50",
        hasUnread && "bg-blue-50/50 dark:bg-blue-950/20"
      )}
    >
      {/* Avatar */}
      <div className="relative">
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.participant_profile_pic || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-sm">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="absolute -bottom-0.5 -right-0.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full p-0.5">
          <Instagram className="h-3 w-3 text-white" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn("font-medium truncate", hasUnread && "font-semibold")}>
              {displayName}
            </span>
            {conversation.participant_username && (
              <span className="text-xs text-muted-foreground">
                @{conversation.participant_username}
              </span>
            )}
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap">{timeAgo}</span>
        </div>

        {/* Last message */}
        <p className={cn(
          "text-sm truncate mt-0.5",
          hasUnread ? "text-foreground" : "text-muted-foreground"
        )}>
          {conversation.last_message || "Sem mensagens"}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between mt-1.5 gap-2">
          <div className="flex items-center gap-2">
            <SocialSellerStageBadge stage={conversation.social_seller_stage} size="sm" />

            {conversation.lead && (
              <div className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <Link2 className="h-3 w-3" />
                <span className="truncate max-w-[80px]">{conversation.lead.name}</span>
              </div>
            )}
          </div>

          {hasUnread && (
            <Badge variant="default" className="h-5 min-w-[20px] justify-center bg-blue-500">
              {conversation.unread_count}
            </Badge>
          )}
        </div>
      </div>
    </div>
  );
}
