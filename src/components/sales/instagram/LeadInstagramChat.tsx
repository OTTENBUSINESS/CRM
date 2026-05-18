import { useState, useRef, useEffect } from "react";
import { Instagram, Loader2, MessageCircle, Send } from "lucide-react";
import {
  useLeadInstagramConversation,
  useLinkConversationToLead,
  useSendInstagramDMToUsername,
} from "@/hooks/useInstagram";
import { InstagramChat } from "./InstagramChat";
import { SocialSellerStageBadge } from "./SocialSellerStageBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";

interface LeadInstagramChatProps {
  leadId: string;
  instagramUsername?: string;
  instagramId?: string;
}

export function LeadInstagramChat({
  leadId,
  instagramUsername,
  instagramId,
}: LeadInstagramChatProps) {
  const {
    data: conversation,
    isLoading,
  } = useLeadInstagramConversation(leadId, instagramId);

  const linkConversation = useLinkConversationToLead();

  // Auto-link conversation to lead if found by instagram_id but not linked
  useEffect(() => {
    if (conversation && !conversation.lead_id && leadId) {
      linkConversation.mutate({
        conversationId: conversation.id,
        leadId,
      });
    }
  }, [conversation?.id, conversation?.lead_id, leadId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[500px] border rounded-lg bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No conversation but has instagram username → show new DM composer
  if (!conversation && instagramUsername) {
    return (
      <div className="border rounded-lg overflow-hidden bg-background">
        <NewDMComposer
          instagramUsername={instagramUsername}
          leadId={leadId}
        />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] border rounded-lg bg-muted/20">
        <div className="relative mb-4">
          <Instagram className="h-16 w-16 text-muted-foreground/30" />
          <MessageCircle className="h-6 w-6 text-muted-foreground/40 absolute -bottom-1 -right-1" />
        </div>
        <p className="font-medium text-muted-foreground">
          Nenhuma conversa no Instagram ainda
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Adicione o @ do Instagram no lead para enviar DMs
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      {/* Stage badge header */}
      {conversation.social_seller_stage && (
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
          <span className="text-xs text-muted-foreground">Funil:</span>
          <SocialSellerStageBadge
            stage={conversation.social_seller_stage}
            size="sm"
          />
        </div>
      )}
      {/* Reuse full InstagramChat */}
      <div className="h-[500px]">
        <InstagramChat conversationId={conversation.id} />
      </div>
    </div>
  );
}

// --- New DM Composer (when no conversation exists yet) ---

function NewDMComposer({
  instagramUsername,
  leadId,
}: {
  instagramUsername: string;
  leadId: string;
}) {
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const sendDM = useSendInstagramDMToUsername();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = async () => {
    if (!newMessage.trim() || sendDM.isPending) return;

    const messageText = newMessage.trim();
    setNewMessage("");

    try {
      const result = await sendDM.mutateAsync({
        instagramUsername,
        leadId,
        message: messageText,
      });

      toast({
        title: "Mensagem enviada",
        description: `DM enviada para @${instagramUsername}`,
      });

      // The conversation query will be invalidated automatically
      // and LeadInstagramChat will re-render with the new conversation
      console.log("DM sent, conversation:", result.conversation_id);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Não foi possível enviar a mensagem";
      const isNotFound = errorMsg.includes("não encontrado no uChat");
      toast({
        title: isNotFound ? "Lead não encontrado no Instagram" : "Erro ao enviar",
        description: isNotFound
          ? `@${instagramUsername} precisa enviar uma DM primeiro para que você possa responder. Envie a mensagem diretamente pelo Instagram.`
          : errorMsg,
        variant: "destructive",
        duration: isNotFound ? 8000 : 5000,
      });
      setNewMessage(messageText);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[500px]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background">
        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
          <Instagram className="h-5 w-5 text-white" />
        </div>
        <div>
          <h3 className="font-medium">@{instagramUsername}</h3>
          <p className="text-xs text-muted-foreground">Nova conversa</p>
        </div>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
        <div className="relative mb-4">
          <Instagram className="h-16 w-16 opacity-20" />
          <Send className="h-6 w-6 opacity-30 absolute -bottom-1 -right-1" />
        </div>
        <p className="font-medium">Iniciar conversa</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Envie a primeira DM para @{instagramUsername}
        </p>
      </div>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex items-center gap-2">
          <Input
            ref={inputRef}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Enviar DM para @${instagramUsername}...`}
            disabled={sendDM.isPending}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sendDM.isPending}
            size="icon"
            className="bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
          >
            {sendDM.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
