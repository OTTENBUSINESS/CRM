import { useState, useRef, useEffect, useCallback } from "react";
import { format, isToday, isYesterday, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Send, Image, Loader2, Instagram, ExternalLink, Reply, Mic, MessageCircle, RefreshCw, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import {
  useInstagramMessages,
  useInstagramConversation,
  useSendInstagramDM,
  useSyncInstagramMessages,
  type InstagramMessage,
} from "@/hooks/useInstagram";

function formatDateSeparator(date: Date): string {
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "dd 'de' MMMM", { locale: ptBR });
}

interface InstagramChatProps {
  conversationId: string;
}

function MessageBubble({ message, isOwn }: { message: InstagramMessage; isOwn: boolean }) {
  const time = format(new Date(message.sent_at), "HH:mm", { locale: ptBR });

  // Renderizar referência (story reply, etc)
  const isStoryRef = message.reference_type === "story" || message.reference_type === "story_reply";

  const renderReference = () => {
    const isComment = message.message_type === "post_comment";
    const isCommentReply = message.message_type === "comment_reply";

    // Post comment / comment reply card
    if (isComment || isCommentReply) {
      const permalink = message.metadata?.permalink || message.reference_url;
      const postCaption = message.metadata?.post_caption;
      const refType = message.reference_type;
      const label = isComment
        ? `Comentou no ${refType === "reel" ? "reel" : "post"}`
        : `Respondeu comentário no ${refType === "reel" ? "reel" : "post"}`;

      return (
        <div className="mb-2">
          <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs",
            isOwn ? "bg-white/15" : "bg-purple-50 border border-purple-200"
          )}>
            <MessageCircle className={cn("h-3.5 w-3.5 shrink-0", isOwn ? "text-white/80" : "text-purple-500")} />
            <span className={cn("font-medium", isOwn ? "text-white/90" : "text-purple-700")}>
              {label}
            </span>
            {permalink && (
              <a
                href={permalink}
                target="_blank"
                rel="noopener noreferrer"
                className={cn("ml-auto shrink-0", isOwn ? "text-white/70 hover:text-white" : "text-purple-500 hover:text-purple-700")}
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          {postCaption && (
            <p className={cn(
              "text-[11px] mt-1 line-clamp-2 italic",
              isOwn ? "text-white/60" : "text-muted-foreground"
            )}>
              {postCaption.length > 100 ? postCaption.substring(0, 100) + "..." : postCaption}
            </p>
          )}
        </div>
      );
    }

    if (!message.reference_type && message.message_type !== "story_reply") return null;

    const showStory = isStoryRef || message.message_type === "story_reply";

    return (
      <div className="mb-2">
        {/* Story thumbnail preview */}
        {showStory && message.reference_url && (
          <a
            href={message.reference_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block mb-1.5"
          >
            <div className="relative w-16 h-24 rounded-lg overflow-hidden border border-white/20">
              <img
                src={message.reference_url}
                alt="Story"
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
              <Instagram className="absolute bottom-1 left-1 h-3 w-3 text-white" />
            </div>
          </a>
        )}
        <div className={cn(
          "flex items-center gap-1.5 text-xs",
          isOwn ? "text-white/70" : "text-muted-foreground"
        )}>
          <Reply className="h-3 w-3" />
          {showStory && "Respondeu ao story"}
          {message.reference_type === "post" && "Respondeu ao post"}
          {message.reference_type === "reel" && "Compartilhou um reel"}
        </div>
      </div>
    );
  };

  // Renderizar mídia
  const renderMedia = () => {
    if (!message.media_url) return null;

    if (message.message_type === "image") {
      return (
        <img
          src={message.media_url}
          alt="Imagem"
          className="max-w-[200px] rounded-lg mt-1"
        />
      );
    }

    if (message.message_type === "video") {
      return (
        <video
          src={message.media_url}
          controls
          className="max-w-[200px] rounded-lg mt-1"
        />
      );
    }

    if (message.message_type === "audio") {
      return (
        <div className="mt-1">
          <div className="flex items-center gap-2 mb-1">
            <Mic className={cn("h-3.5 w-3.5", isOwn ? "text-white/70" : "text-muted-foreground")} />
            <span className={cn("text-xs", isOwn ? "text-white/70" : "text-muted-foreground")}>
              Mensagem de voz
            </span>
          </div>
          <audio controls className="max-w-[240px] h-8" preload="metadata">
            <source src={message.media_url} />
          </audio>
        </div>
      );
    }

    return null;
  };

  return (
    <div className={cn("flex", isOwn ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[70%] rounded-2xl px-4 py-2",
          isOwn
            ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
            : "bg-muted"
        )}
      >
        {renderReference()}
        {message.content && (
          <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        )}
        {renderMedia()}
        <div
          className={cn(
            "text-xs mt-1",
            isOwn ? "text-white/70" : "text-muted-foreground"
          )}
        >
          {time}
          {message.status === "sending" && " • Enviando..."}
          {message.status === "failed" && " • Falhou"}
        </div>
      </div>
    </div>
  );
}

const PAGE_SIZE = 100;

export function InstagramChat({ conversationId }: InstagramChatProps) {
  const { toast } = useToast();
  const [newMessage, setNewMessage] = useState("");
  const [offset, setOffset] = useState(0);
  const [olderMessages, setOlderMessages] = useState<InstagramMessage[]>([]);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevConversationRef = useRef<string | null>(null);

  const { data: conversation, isLoading: loadingConversation } = useInstagramConversation(conversationId);
  const { data: recentMessages = [], isLoading: loadingMessages } = useInstagramMessages(conversationId, PAGE_SIZE, 0);
  const sendMessage = useSendInstagramDM();
  const syncMessages = useSyncInstagramMessages();

  // Mensagens combinadas: older (paginadas) + recentes
  const allMessages = [...olderMessages, ...recentMessages];

  // Reset older messages when conversation changes
  useEffect(() => {
    if (conversationId !== prevConversationRef.current) {
      prevConversationRef.current = conversationId;
      setOlderMessages([]);
      setOffset(0);
      setHasMore(true);
    }
  }, [conversationId]);

  // Auto-sync messages when conversation changes
  useEffect(() => {
    if (conversationId) {
      syncMessages.mutate(conversationId);
    }
  }, [conversationId]);

  // Scroll to bottom when recent messages change (not when loading older)
  useEffect(() => {
    if (scrollRef.current && !loadingOlder) {
      const viewport = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (viewport) {
        viewport.scrollTop = viewport.scrollHeight;
      }
    }
  }, [recentMessages, loadingOlder]);

  // Focus input when conversation changes
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversationId]);

  // Load older messages
  const handleLoadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    setLoadingOlder(true);
    try {
      const { supabase } = await import("@/lib/supabase");
      const newOffset = offset + PAGE_SIZE;
      const { data, error } = await supabase
        .from("instagram_messages")
        .select("*, metadata")
        .eq("conversation_id", conversationId)
        .order("sent_at", { ascending: false })
        .range(newOffset, newOffset + PAGE_SIZE - 1);

      if (error) throw error;
      const older = ((data || []) as InstagramMessage[]).reverse();
      if (older.length < PAGE_SIZE) setHasMore(false);
      if (older.length > 0) {
        setOlderMessages(prev => [...older, ...prev]);
        setOffset(newOffset);
      } else {
        setHasMore(false);
      }
    } catch {
      toast({ title: "Erro ao carregar mensagens anteriores", variant: "destructive" });
    } finally {
      setLoadingOlder(false);
    }
  }, [conversationId, offset, loadingOlder, hasMore, toast]);

  const handleSend = async () => {
    if (!newMessage.trim() || sendMessage.isPending) return;

    const messageText = newMessage.trim();
    setNewMessage("");
    if (inputRef.current) inputRef.current.style.height = "auto";

    try {
      await sendMessage.mutateAsync({
        conversationId,
        message: messageText,
      });
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: error instanceof Error ? error.message : "Não foi possível enviar a mensagem",
        variant: "destructive",
      });
      setNewMessage(messageText); // Restore message on error
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loadingConversation || loadingMessages) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!conversation) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Instagram className="h-12 w-12 mb-4 opacity-20" />
        <p>Selecione uma conversa</p>
      </div>
    );
  }

  const displayName = conversation.participant_name || conversation.participant_username || "Usuário";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b bg-background">
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.participant_profile_pic || undefined} />
          <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
            {displayName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium truncate">{displayName}</h3>
          {conversation.participant_username && (
            <p className="text-sm text-muted-foreground">
              @{conversation.participant_username}
            </p>
          )}
        </div>
        {syncMessages.isPending && (
          <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
        <a
          href={`https://instagram.com/${conversation.participant_username}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-3">
          {/* Load more button */}
          {hasMore && allMessages.length > 0 && (
            <div className="flex justify-center pb-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadOlder}
                disabled={loadingOlder}
                className="text-xs text-muted-foreground"
              >
                {loadingOlder ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <ChevronUp className="h-3 w-3 mr-1.5" />
                )}
                Carregar mensagens anteriores
              </Button>
            </div>
          )}

          {allMessages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Instagram className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhuma mensagem ainda</p>
            </div>
          ) : (
            allMessages.map((message, index) => {
              const messageDate = new Date(message.sent_at);
              const prevMessage = index > 0 ? allMessages[index - 1] : null;
              const showDateSeparator = !prevMessage || !isSameDay(messageDate, new Date(prevMessage.sent_at));

              return (
                <div key={message.id}>
                  {showDateSeparator && (
                    <div className="flex items-center gap-3 py-2">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground font-medium">
                        {formatDateSeparator(messageDate)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  )}
                  <MessageBubble
                    message={message}
                    isOwn={message.is_from_me}
                  />
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t bg-background">
        <div className="flex items-end gap-2">
          <Textarea
            ref={inputRef}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={handleKeyDown}
            placeholder="Digite sua mensagem..."
            disabled={sendMessage.isPending}
            rows={1}
            className="flex-1 min-h-[44px] max-h-[120px] resize-none overflow-y-auto"
          />
          <Button
            onClick={handleSend}
            disabled={!newMessage.trim() || sendMessage.isPending}
            size="icon"
            className="bg-gradient-to-br from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 shrink-0"
          >
            {sendMessage.isPending ? (
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
