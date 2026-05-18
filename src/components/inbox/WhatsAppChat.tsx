import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Send, Paperclip, Mic, Loader2, CheckCheck, Check, Clock, Square, Users, Play, Pause, Image as ImageIcon, FileText, FolderOpen, Smile, MoreVertical, Pencil, Trash2, Ban, X, FileVideo, File, Bot, AlertCircle, RotateCcw, Forward, Reply, Copy, Phone, ChevronDown, MessageSquare } from 'lucide-react';
import { Card, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useSignedUrl } from '@/hooks/useSignedUrl';
import { useConversationMessages } from '@/hooks/useWhatsAppInbox';
import { WhatsAppMessage, WhatsAppReaction } from '@/hooks/useWhatsAppEngagement';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialsLibraryModal } from '@/components/sales/MaterialsLibraryModal';
import { type SalesMaterial } from '@/hooks/useSalesMaterials';
import EmojiPicker, { Theme, EmojiClickData } from 'emoji-picker-react';
import { InstanceHealthInlineBanner } from '@/components/inbox/InstanceHealthBanner';
// @ts-ignore - opus-media-recorder doesn't have types
import OpusMediaRecorder from 'opus-media-recorder';
// @ts-ignore
import encoderWorker from 'opus-media-recorder/encoderWorker.umd?url';
// @ts-ignore
import OggOpusWasm from 'opus-media-recorder/OggOpusEncoder.wasm?url';

interface WhatsAppInstance {
  id: string;
  name: string;
  status?: string;
}

interface WhatsAppChatProps {
  contactName: string;
  contactPhone?: string | null;
  leadId?: string | null;
  groupId?: string | null;
  instanceId?: string | null;
  isGroup?: boolean;
  className?: string;
  initialMessage?: string;
  onMessageSent?: () => void;
  hideHeader?: boolean;
  availableInstances?: WhatsAppInstance[];
}

const getTeamBadge = (team?: string, instanceName?: string) => {
  const teamConfig: Record<string, { label: string; color: string }> = {
    cs: { label: 'CS', color: 'bg-purple-500' },
    suporte: { label: 'Suporte', color: 'bg-blue-500' },
    comercial: { label: 'Comercial', color: 'bg-orange-500' },
  };
  const base = teamConfig[team || ''] || { label: team || '', color: 'bg-gray-500' };
  // Se tem nome da instância, mostrar nome curto (ex: "EMPRESA - COMERCIAL" → "COMERCIAL")
  if (instanceName) {
    const shortName = instanceName.replace(/^[A-Z]+\s*[-–]\s*/i, '').trim();
    return { ...base, label: shortName || base.label };
  }
  return base;
};

// Reações rápidas disponíveis
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// Componente para player de áudio
const AudioPlayer: React.FC<{ url: string; isFromMe: boolean }> = ({ url, isFromMe }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const formatTime = (time: number) => {
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[150px] sm:min-w-[200px]">
      <audio
        ref={audioRef}
        src={url}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        onClick={togglePlay}
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          isFromMe ? "bg-green-600" : "bg-green-500"
        )}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4 text-white" />
        ) : (
          <Play className="h-4 w-4 text-white ml-0.5" />
        )}
      </button>
      <div className="flex-1">
        <div className={cn("h-1 rounded-full", isFromMe ? "bg-green-600" : "bg-gray-300")}>
          <div
            className={cn("h-1 rounded-full", isFromMe ? "bg-white" : "bg-green-500")}
            style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}
          />
        </div>
        <span className={cn("text-[10px]", isFromMe ? "text-green-100" : "text-muted-foreground")}>
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </span>
      </div>
    </div>
  );
};

// Componente para badges de reações
const ReactionBadges: React.FC<{ reactions: WhatsAppReaction[] }> = ({ reactions }) => {
  if (!reactions || reactions.length === 0) return null;

  // Agrupar reações por emoji
  const grouped = reactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.emoji] = (acc[r.emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex gap-1 mt-1 flex-wrap">
      {Object.entries(grouped).map(([emoji, count]) => (
        <span
          key={emoji}
          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-white/80 dark:bg-zinc-700/80 text-xs shadow-sm border border-gray-200 dark:border-zinc-600"
        >
          {emoji} {count > 1 && <span className="text-[10px] text-gray-500">{count}</span>}
        </span>
      ))}
    </div>
  );
};

const MessageBubble: React.FC<{
  message: WhatsAppMessage & { _optimistic?: 'pending' | 'failed' };
  onReact?: (messageId: string, emoji: string) => void;
  onEdit?: (messageId: string, currentContent: string) => void;
  onDelete?: (messageId: string) => void;
  onRetry?: (msg: WhatsAppMessage & { _optimistic?: string }) => void;
}> = ({ message, onReact, onEdit, onDelete, onRetry }) => {
  const isFromMe = message.is_from_me;
  const isAIMessage = isFromMe && message.metadata?.sent_by === 'ai_agent';
  const isOptimistic = !!message._optimistic;
  const isFailed = message._optimistic === 'failed';
  const isToolCall = message.message_type === 'ai_tool_call';
  const msgDate = new Date(message.sent_at);

  // Quoted message (reply) detection from metadata.content.contextInfo
  const contextInfo = message.metadata?.content?.contextInfo;
  const quotedStanzaId = contextInfo?.stanzaID || contextInfo?.stanzaId;
  const quotedMessage = contextInfo?.quotedMessage;
  const quotedText = quotedMessage?.conversation
    || quotedMessage?.extendedTextMessage?.text
    || (quotedMessage?.imageMessage ? '📷 Foto' : null)
    || (quotedMessage?.videoMessage ? '🎥 Vídeo' : null)
    || (quotedMessage?.audioMessage || quotedMessage?.pttMessage ? '🎤 Áudio' : null)
    || (quotedMessage?.documentMessage ? `📄 ${quotedMessage.documentMessage.fileName || 'Documento'}` : null)
    || (quotedMessage?.stickerMessage ? '🏷️ Figurinha' : null);
  const hasQuotedMessage = !!quotedStanzaId && !!quotedText;

  // Forwarded message detection
  const isForwarded = contextInfo?.isForwarded === true || (contextInfo?.forwardingScore && contextInfo.forwardingScore > 0);

  // Message delivery status (sent → delivered → read)
  const messageStatus = message.status || 'sent';
  const now = new Date();
  const isToday = msgDate.toDateString() === now.toDateString();
  const isYesterday = new Date(now.getTime() - 86400000).toDateString() === msgDate.toDateString();
  const time = isToday
    ? format(msgDate, 'HH:mm')
    : isYesterday
    ? `Ontem ${format(msgDate, 'HH:mm')}`
    : format(msgDate, 'dd/MM HH:mm');
  const teamBadge = getTeamBadge(message.instance_team, message.instance_name);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [actionsLocked, setActionsLocked] = useState(false);

  // Resolver URL assinada para buckets privados
  const signedMediaUrl = useSignedUrl(message.media_url);

  // Detectar tipo de mídia pelo message_type ou pela URL
  const msgType = message.message_type?.toLowerCase() || '';
  const mediaUrl = signedMediaUrl || message.media_url || '';

  const isAudio = msgType.includes('audio') || msgType.includes('ptt') || mediaUrl.includes('.ogg') || mediaUrl.includes('.mp3');
  const isImage = msgType.includes('image') || mediaUrl.includes('.jpg') || mediaUrl.includes('.jpeg') || mediaUrl.includes('.png') || mediaUrl.includes('.webp');
  const isVideo = msgType.includes('video') || mediaUrl.includes('.mp4') || mediaUrl.includes('.mov');
  const isDocument = msgType.includes('document') || msgType.includes('pdf');
  const isSticker = msgType.includes('sticker');
  const hasMedia = message.media_url && (isAudio || isImage || isVideo || isDocument || isSticker);

  // Verifica se o conteúdo é uma transcrição de áudio (não é [Mídia] ou 🎤 [Áudio])
  const isTranscription = isAudio && message.content &&
    !message.content.includes('[Mídia]') &&
    !message.content.includes('[Áudio]') &&
    !message.content.includes('[Imagem]');

  // Mensagem interna de tool call da IA
  if (isToolCall) {
    const toolSuccess = message.metadata?.tool_success !== false;
    return (
      <div className="flex justify-center mb-2">
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <Bot className="h-3 w-3 text-violet-500" />
            <span className="font-medium text-violet-600 dark:text-violet-400">
              {message.metadata?.agent_name || 'IA'}
            </span>
            <span className="text-muted-foreground">{time}</span>
          </div>
          <p className="whitespace-pre-wrap text-violet-700 dark:text-violet-300">{message.content}</p>
        </div>
      </div>
    );
  }

  // Erro de sistema do agente IA
  if (message.message_type === 'ai_system_error') {
    return (
      <div className="flex justify-center mb-2">
        <div className="max-w-[85%] rounded-lg px-3 py-2 text-xs bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertCircle className="h-3 w-3 text-red-500" />
            <span className="font-medium text-red-600 dark:text-red-400">
              {message.metadata?.agent_name || 'Agente IA'}
            </span>
            <span className="text-muted-foreground">{time}</span>
          </div>
          <p className="whitespace-pre-wrap text-red-700 dark:text-red-300">{message.content}</p>
        </div>
      </div>
    );
  }

  // Mensagem apagada
  if (message.is_deleted) {
    return (
      <div className={cn("flex mb-2", isFromMe ? "justify-end" : "justify-start")}>
        <div className={cn(
          "max-w-[80%] rounded-lg px-3 py-2 text-sm opacity-60",
          isFromMe ? "bg-green-500/50 text-white rounded-br-none" : "bg-white/50 dark:bg-zinc-800/50 rounded-bl-none shadow-sm"
        )}>
          <p className="italic flex items-center gap-1.5 text-xs">
            <Ban className="h-3 w-3" />
            Mensagem apagada
          </p>
          <div className={cn("flex items-center justify-end gap-1 mt-1", isFromMe ? "text-green-200" : "text-muted-foreground")}>
            <span className="text-[10px]">{time}</span>
          </div>
        </div>
      </div>
    );
  }

  // Sticker - renderizar sem bolha
  if (isSticker && message.media_url) {
    return (
      <div className={cn("flex mb-2", isFromMe ? "justify-end" : "justify-start")}>
        <div className="relative group/msg">
          {!isFromMe && message.sender_name && (
            <span className="text-[10px] font-medium text-green-700 ml-1">{message.sender_name}</span>
          )}
          <img
            src={message.media_url}
            alt="Sticker"
            className="w-36 h-36 object-contain"
            referrerPolicy="no-referrer"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <span className="text-[10px] block text-right mt-0.5 text-muted-foreground">{time}</span>
          <ReactionBadges reactions={message.reactions || []} />
          {onReact && (
            <div className={cn(
              "absolute -top-9 z-10 opacity-0 group-hover/msg:opacity-100 pointer-events-none group-hover/msg:pointer-events-auto transition-opacity duration-100",
              isFromMe ? "right-0" : "left-0"
            )}>
              {/* Ponte invisível para manter hover contínuo */}
              <div className="absolute top-full left-0 right-0 h-3" />
              <div className="flex gap-0.5 bg-white dark:bg-zinc-800 rounded-full shadow-lg border px-1.5 py-1">
                {QUICK_REACTIONS.map(emoji => (
                  <button key={emoji} className="hover:scale-125 transition-transform text-base cursor-pointer px-0.5"
                    onClick={(e) => { e.stopPropagation(); onReact(message.message_id, emoji); }}>
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Check if message can be edited (own messages with text content, sent within 15 min)
  // Allow editing media messages that have a caption (images, videos, documents)
  // Audio and stickers don't support caption editing in WhatsApp
  const hasEditableCaption = hasMedia && !isAudio && !isSticker && message.content;
  const canEdit = isFromMe && (hasEditableCaption || (!hasMedia && message.content)) &&
    (Date.now() - new Date(message.sent_at).getTime()) < 15 * 60 * 1000;
  const canDelete = isFromMe;

  return (
    <div className={cn("flex mb-2", isFromMe ? "justify-end" : "justify-start")}>
      <div className="relative max-w-[80%] min-w-0 group/msg">
        <div className={cn(
          "rounded-lg px-3 py-2 text-sm overflow-hidden",
          isAIMessage
            ? "bg-violet-500 text-white rounded-br-none"
            : isFromMe
            ? "bg-green-500 text-white rounded-br-none"
            : "bg-white dark:bg-zinc-800 rounded-bl-none shadow-sm"
        )}>
          {!isFromMe && (
            <div className="flex items-center gap-2 mb-1">
              {message.sender_name && (
                <span className="text-xs font-medium text-green-600">{message.sender_name}</span>
              )}
              {message.instance_team && (
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded text-white", teamBadge.color)}>
                  {teamBadge.label}
                </span>
              )}
            </div>
          )}
          {isFromMe && !isOptimistic && (
            <div className="flex justify-end gap-1 mb-1">
              {isAIMessage ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-white/20 text-white">
                  <Bot className="h-3 w-3" />
                  {message.metadata?.agent_name || 'IA'}
                </span>
              ) : message.metadata?.sent_by !== 'ai_agent' && !isToolCall ? (
                <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded bg-white/20 text-white">
                  <Users className="h-3 w-3" />
                  {message.metadata?.sent_by_name || 'Vendedor'}
                </span>
              ) : null}
              {message.instance_team && (
                <span className={cn("text-[9px] px-1.5 py-0.5 rounded text-white opacity-80", teamBadge.color)}>
                  {teamBadge.label}
                </span>
              )}
            </div>
          )}

          {/* Encaminhada */}
          {isForwarded && (
            <div className={cn(
              "flex items-center gap-1 text-[10px] italic mb-1",
              isAIMessage ? "text-violet-200" : isFromMe ? "text-green-200" : "text-muted-foreground"
            )}>
              <Forward className="h-3 w-3" />
              Encaminhada
            </div>
          )}

          {/* Mensagem citada (reply) */}
          {hasQuotedMessage && (
            <div className={cn(
              "rounded px-2 py-1.5 mb-2 border-l-[3px] text-xs",
              isFromMe
                ? "bg-green-600/40 border-green-300/60"
                : "bg-gray-100 dark:bg-zinc-700/60 border-green-500/60"
            )}>
              <p className={cn(
                "line-clamp-2 break-words",
                isFromMe ? "text-green-100" : "text-muted-foreground"
              )}>
                {quotedText}
              </p>
            </div>
          )}

          {/* Renderizar mídia */}
          {isImage && message.media_url && (() => {
            let encodedUrl = message.media_url;
            try {
              const url = new URL(message.media_url);
              const pathParts = url.pathname.split('/');
              const fileName = pathParts.pop() || '';
              const encodedFileName = encodeURIComponent(fileName);
              encodedUrl = `${url.origin}${pathParts.join('/')}/${encodedFileName}`;
            } catch {
              // mantém URL original
            }

            return (
              <div className="mb-2">
                <img
                  src={encodedUrl}
                  alt="Imagem"
                  className="max-w-full rounded-lg max-h-64 object-cover cursor-pointer"
                  onClick={() => window.open(message.media_url, '_blank')}
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = 'none';
                    const fallback = document.createElement('div');
                    fallback.className = 'p-3 rounded-lg bg-gray-100 dark:bg-zinc-700 flex items-center gap-2 cursor-pointer';
                    fallback.textContent = '📷 Clique para ver imagem';
                    fallback.addEventListener('click', () => {
                      if (message.media_url) window.open(message.media_url, '_blank', 'noopener,noreferrer');
                    });
                    img.parentElement?.appendChild(fallback);
                  }}
                  referrerPolicy="no-referrer"
                />
              </div>
            );
          })()}

          {isVideo && message.media_url && (
            <div className="mb-2">
              <video
                src={message.media_url}
                controls
                className="max-w-full rounded-lg max-h-64"
              />
            </div>
          )}

          {isAudio && message.media_url && (
            <div className="mb-2">
              <AudioPlayer url={message.media_url} isFromMe={isFromMe} />
            </div>
          )}

          {isDocument && message.media_url && (
            <a
              href={message.media_url}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                "flex items-center gap-2 p-2 rounded mb-2",
                isFromMe ? "bg-green-600" : "bg-gray-100 dark:bg-zinc-700"
              )}
            >
              <FileText className="h-5 w-5" />
              <span className="text-xs">Documento</span>
            </a>
          )}

          {/* Conteúdo de texto ou transcrição */}
          {isTranscription ? (
            <div>
              <p className={cn(
                "text-[10px] mb-1 flex items-center gap-1",
                isAIMessage ? "text-violet-200" : isFromMe ? "text-green-200" : "text-muted-foreground"
              )}>
                <FileText className="h-3 w-3" /> Transcrição:
              </p>
              <p className="whitespace-pre-wrap break-words italic">{message.content}</p>
            </div>
          ) : !hasMedia || (hasMedia && message.content && !message.content.includes('[Mídia]') && !message.content.includes('[Áudio]') && !message.content.includes('[Sticker]')) ? (
            <p className="whitespace-pre-wrap break-words">{message.content || '[mídia]'}</p>
          ) : null}

          <div className={cn("flex items-center justify-end gap-1 mt-1", isAIMessage ? "text-violet-200" : isFromMe ? "text-green-100" : "text-muted-foreground")}>
            {message.is_edited && (
              <span className="text-[10px] italic">editada</span>
            )}
            {isAIMessage && <Bot className="h-2.5 w-2.5" />}
            <span className="text-[10px]">{time}</span>
            {isFromMe && (
              isFailed ? (
                <AlertCircle className="h-3 w-3 text-red-500" />
              ) : isOptimistic ? (
                <Clock className="h-3 w-3 text-gray-400" />
              ) : messageStatus === 'read' ? (
                <CheckCheck className="h-3 w-3 text-blue-400" />
              ) : messageStatus === 'delivered' ? (
                <CheckCheck className="h-3 w-3" />
              ) : (
                <Check className="h-3 w-3" />
              )
            )}
          </div>
        </div>

        {/* Falha no envio - botão de reenviar */}
        {isFailed && onRetry && (
          <button
            onClick={() => onRetry(message)}
            className="flex items-center gap-1 mt-1 text-[11px] text-red-500 hover:text-red-600 transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            Reenviar
          </button>
        )}

        {/* Reaction badges below bubble */}
        <ReactionBadges reactions={message.reactions || []} />

        {/* Hover actions: quick reactions + edit/delete menu */}
        {!isOptimistic && <div className={cn(
          "absolute -top-9 flex items-center gap-0.5 z-10 transition-opacity duration-100",
          isFromMe ? "right-0" : "left-0",
          actionsLocked
            ? "opacity-100 pointer-events-auto"
            : "opacity-0 group-hover/msg:opacity-100 pointer-events-none group-hover/msg:pointer-events-auto"
        )}>
          {/* Ponte invisível: conecta a barra à bolha para o mouse não perder o hover */}
          <div className="absolute top-full left-0 right-0 h-3" />
          {onReact && (
            <div className="flex gap-0.5 bg-white dark:bg-zinc-800 rounded-full shadow-lg border px-1.5 py-1">
              {QUICK_REACTIONS.map(emoji => (
                <button key={emoji} className="hover:scale-125 transition-transform text-base cursor-pointer px-0.5"
                  onClick={(e) => { e.stopPropagation(); onReact(message.message_id, emoji); }}>
                  {emoji}
                </button>
              ))}
            </div>
          )}
          {isFromMe && (canEdit || canDelete) && (
            <DropdownMenu onOpenChange={setActionsLocked}>
              <DropdownMenuTrigger asChild>
                <button className="bg-white dark:bg-zinc-800 rounded-full shadow-lg border p-1.5 ml-0.5 cursor-pointer">
                  <MoreVertical className="h-3.5 w-3.5 text-gray-500" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={isFromMe ? "end" : "start"} className="w-40">
                {canEdit && onEdit && (
                  <DropdownMenuItem onClick={() => onEdit(message.message_id, message.content)}>
                    <Pencil className="h-3.5 w-3.5 mr-2" />
                    Editar
                  </DropdownMenuItem>
                )}
                {canDelete && onDelete && (
                  <DropdownMenuItem onClick={() => setDeleteConfirmId(message.message_id)} className="text-red-600">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Apagar para todos
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>}

        {/* Confirmação de exclusão */}
        <AlertDialog open={deleteConfirmId === message.message_id} onOpenChange={(open) => { if (!open) setDeleteConfirmId(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar mensagem?</AlertDialogTitle>
              <AlertDialogDescription>
                Essa mensagem será apagada para todos na conversa. Essa ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                className="bg-red-600 hover:bg-red-700"
                onClick={() => { onDelete?.(message.message_id); setDeleteConfirmId(null); }}
              >
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export const WhatsAppChat: React.FC<WhatsAppChatProps> = ({
  contactName,
  contactPhone,
  leadId,
  groupId,
  instanceId,
  isGroup = false,
  className,
  initialMessage,
  onMessageSent,
  hideHeader = false,
  availableInstances = [],
}) => {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const senderName = teamMember?.name?.split(' ')[0] || 'Vendedor';

  // Instance selector — qual número enviar
  const [sendingInstanceId, setSendingInstanceId] = useState<string | null>(instanceId || null);
  // Sync when instanceId prop changes (ex: user selects different conversation)
  useEffect(() => {
    if (instanceId) setSendingInstanceId(instanceId);
  }, [instanceId]);

  // Auto-detect: se nenhuma instância selecionada, pegar da última msg do lead
  useEffect(() => {
    if (sendingInstanceId || !leadId) return;
    const detectInstance = async () => {
      const { data } = await supabase
        .from('whatsapp_messages')
        .select('instance_id')
        .eq('lead_id', leadId)
        .not('instance_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data?.instance_id) {
        setSendingInstanceId(data.instance_id);
      } else {
        // Fallback: instância Cloud API (OFICIAL)
        const cloudInst = availableInstances.find(i => (i as any).metadata?.type === 'cloud_api');
        if (cloudInst) setSendingInstanceId(cloudInst.id);
        else if (availableInstances.length > 0) setSendingInstanceId(availableInstances[0].id);
      }
    };
    detectInstance();
  }, [leadId, sendingInstanceId, availableInstances]);

  // Draft persistence (like WhatsApp Web)
  const draftKey = `whatsapp-draft:${leadId || groupId || 'unknown'}`;
  const [message, setMessage] = useState(() => {
    if (initialMessage) return initialMessage;
    try { return localStorage.getItem(draftKey) || ''; } catch { return ''; }
  });

  // Save draft on every keystroke
  const setMessageWithDraft = useCallback((value: string | ((prev: string) => string)) => {
    setMessage(prev => {
      const next = typeof value === 'function' ? value(prev) : value;
      try {
        if (next) {
          localStorage.setItem(draftKey, next);
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch { /* quota exceeded - ignore */ }
      return next;
    });
  }, [draftKey]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
  }, [draftKey]);

  // When conversation changes (inbox switching), load the new draft
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
      return;
    }
    try {
      setMessage(localStorage.getItem(draftKey) || '');
    } catch {
      setMessage('');
    }
  }, [draftKey]);

  // initialMessage (from CallContext/templates) takes priority
  useEffect(() => {
    if (initialMessage) {
      setMessage(initialMessage);
    }
  }, [initialMessage]);

  // Resize textarea when message changes externally (conversation switch, send, initialMessage)
  useLayoutEffect(() => {
    if (textareaRef.current) {
      const el = textareaRef.current;
      el.style.height = 'auto';
      const newHeight = Math.min(el.scrollHeight, 120);
      el.style.height = newHeight + 'px';
      el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
    }
  }, [message]);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isMaterialsOpen, setIsMaterialsOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [templates, setTemplates] = useState<any[]>([]);
  const [windowClosed, setWindowClosed] = useState(false);
  const [selectedInstanceIsCloudAPI, setSelectedInstanceIsCloudAPI] = useState(false);

  // Detectar se instância selecionada é Cloud API e se janela de 24h está fechada
  useEffect(() => {
    const checkCloudAPIWindow = async () => {
      const resolvedId = sendingInstanceId || instanceId;
      if (!resolvedId) { setSelectedInstanceIsCloudAPI(false); setWindowClosed(false); return; }

      const { data: inst } = await supabase
        .from('whatsapp_instances')
        .select('metadata')
        .eq('id', resolvedId)
        .maybeSingle();

      const isCloud = inst?.metadata?.type === 'cloud_api';
      setSelectedInstanceIsCloudAPI(isCloud);

      if (!isCloud || !leadId) { setWindowClosed(false); return; }

      // Checar última msg RECEBIDA do lead (qualquer instância — lead pode ter respondido em outra)
      const { data: lastInbound } = await supabase
        .from('whatsapp_messages')
        .select('created_at')
        .eq('lead_id', leadId)
        .eq('is_from_me', false)
        .is('group_id', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastInbound) {
        setWindowClosed(true); // Nunca recebeu msg — janela fechada
      } else {
        const diff = Date.now() - new Date(lastInbound.created_at).getTime();
        setWindowClosed(diff > 24 * 60 * 60 * 1000);
      }
    };
    checkCloudAPIWindow();
  }, [sendingInstanceId, instanceId, leadId]);

  // Carregar templates aprovados quando janela fechada
  useEffect(() => {
    if (!selectedInstanceIsCloudAPI || !windowClosed) return;
    const loadTemplates = async () => {
      const { data } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('status', 'APPROVED')
        .eq('source', 'platform')
        .order('name');
      setTemplates(data || []);
    };
    loadTemplates();
  }, [selectedInstanceIsCloudAPI, windowClosed]);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // Staged files (drag & drop or file picker - not sent yet)
  const [stagedFiles, setStagedFiles] = useState<{ file: File; preview: string | null; mediaType: string }[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [fileInputKey, setFileInputKey] = useState(0);

  // Mensagens otimistas (aparecem instantaneamente antes da API confirmar)
  const [optimisticMessages, setOptimisticMessages] = useState<(WhatsAppMessage & { _optimistic?: 'pending' | 'failed' })[]>([]);
  const [messageLimit, setMessageLimit] = useState(50);

  // Limpar otimistas ao trocar de conversa
  useEffect(() => {
    setOptimisticMessages([]);
    setMessageLimit(50);
  }, [leadId, groupId]);

  // Buscar mensagens: grupos filtra por instância, individual mostra TODAS (conversa completa)
  const { data: rawMessages, isFetching, isPlaceholderData, refetch } = useConversationMessages(
    isGroup ? null : leadId,
    isGroup ? groupId : null,
    isGroup ? (instanceId || null) : null,
    messageLimit
  );

  // Handler pra carregar todas as mensagens anteriores
  const handleLoadAllMessages = useCallback(() => {
    setMessageLimit(10000);
  }, []);

  // Mesclar mensagens reais com otimistas (remover otimistas que já chegaram do banco)
  const messages = useMemo(() => {
    const real = rawMessages || [];
    // Match otimistas com reais por conteúdo + is_from_me + timestamp próximo (30s)
    const pendingOptimistic = optimisticMessages.filter(om => {
      return !real.some(r =>
        r.is_from_me &&
        r.content === om.content &&
        Math.abs(new Date(r.sent_at).getTime() - new Date(om.sent_at).getTime()) < 30000
      );
    });
    // Limpar otimistas confirmadas do state
    if (pendingOptimistic.length !== optimisticMessages.length) {
      setTimeout(() => setOptimisticMessages(pendingOptimistic), 0);
    }
    return [...real, ...pendingOptimistic];
  }, [rawMessages, optimisticMessages]);

  // Auto-scroll: só rola pra baixo em mensagens novas, não ao carregar anteriores
  const prevMessageCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const isLoadingOlderRef = useRef(false);

  // Capturar scrollHeight ANTES do DOM atualizar (pré-render)
  // Quando messageLimit muda, marcamos que estamos carregando mais antigas
  useEffect(() => {
    if (messageLimit > 50) {
      isLoadingOlderRef.current = true;
      prevScrollHeightRef.current = scrollRef.current?.scrollHeight || 0;
    }
  }, [messageLimit]);

  // useLayoutEffect roda sincronicamente APÓS o DOM atualizar mas ANTES do paint
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const prevCount = prevMessageCountRef.current;
    const currentCount = messages?.length || 0;

    if (isLoadingOlderRef.current && currentCount > prevCount && prevCount > 0) {
      // Mantém posição: mensagens antigas adicionadas no TOPO
      const prevHeight = prevScrollHeightRef.current;
      el.scrollTop = el.scrollHeight - prevHeight;
      isLoadingOlderRef.current = false;
    } else if (!isLoadingOlderRef.current) {
      // Scroll normal pra baixo (msg nova chegou ou troca de conversa)
      el.scrollTop = el.scrollHeight;
    }

    prevMessageCountRef.current = currentCount;
  }, [messages]);

  // Realtime subscription para novas mensagens + updates (reactions, edits, deletes)
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    const channelId = isGroup ? groupId : leadId;
    if (!channelId) return;

    let debounceTimer: NodeJS.Timeout | null = null;
    const debouncedRefetch = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        refetchRef.current();
      }, 500);
    };

    const filterColumn = isGroup ? 'group_id' : 'lead_id';

    const channel = supabase
      .channel(`whatsapp-chat-${channelId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `${filterColumn}=eq.${channelId}`,
      }, (payload) => {
        console.log('[RT] Nova msg recebida via Realtime:', payload?.new?.id);
        debouncedRefetch();
        // Re-checar janela 24h se msg recebida do lead (abre o input)
        if (payload?.new && !payload.new.is_from_me) {
          setWindowClosed(false);
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `${filterColumn}=eq.${channelId}`,
      }, (payload) => {
        console.log('[RT] Msg atualizada via Realtime:', payload?.new?.id);
        debouncedRefetch();
      })
      .subscribe((status) => {
        console.log(`[RT] Subscription status (${channelId}):`, status);
      });

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [leadId, groupId, isGroup]);

  // Helper para buscar instância - usa sendingInstanceId (seletor) > instanceId (prop) > fallback CS
  const getInstance = async () => {
    const resolvedId = sendingInstanceId || instanceId;
    if (resolvedId) {
      const { data: instance } = await supabase
        .from('whatsapp_instances')
        .select('id, name, api_key, api_url, webhook_url, metadata')
        .eq('id', resolvedId)
        .single();
      if (!instance) throw new Error('Instância não encontrada');
      return instance;
    }

    const { data: instance } = await supabase
      .from('whatsapp_instances')
      .select('id, name, api_key, api_url, webhook_url, metadata')
      .contains('teams', ['cs'])
      .eq('status', 'connected')
      .order('name', { ascending: true })
      .limit(1)
      .single();
    if (!instance) throw new Error('Instância não encontrada ou desconectada');
    return instance;
  };

  // Helper para obter a UAZAPI URL e token
  const getUazapiConfig = async () => {
    const instance = await getInstance();
    const metadata = instance.metadata as Record<string, any> || {};
    const uazapiUrl = instance.api_url || metadata.uazapi_url;
    return { instance, uazapiUrl, apiKey: instance.api_key };
  };

  // Helper: checar se instância é Cloud API
  const isCloudAPI = (instance: any): boolean => {
    const metadata = instance.metadata as Record<string, any> || {};
    return metadata.type === 'cloud_api';
  };

  // Enviar template via Cloud API
  const sendTemplate = async (template: any) => {
    setSending(true);
    try {
      const resolvedPhone = await resolveWhatsAppPhone();
      const firstName = contactName?.split(' ')[0] || contactPhone || '';

      const { data, error } = await supabase.functions.invoke('send-whatsapp-cloud', {
        body: {
          action: 'send_template',
          phone: resolvedPhone,
          template_name: template.name,
          template_params: [firstName],
          lead_id: leadId,
          sent_by: 'human', sent_by_name: senderName,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);

      toast({ title: 'Template enviado!' });
      setShowTemplateModal(false);
      // Recheck janela — template abre conversa mas não abre janela de texto livre
      setTimeout(() => refetch(), 1500);
      onMessageSent?.();
    } catch (err: any) {
      toast({ title: 'Erro ao enviar template', description: err.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Helper: enviar via Cloud API (edge function send-whatsapp-cloud)
  const sendViaCloudAPI = async (params: {
    action: 'send_text' | 'send_image' | 'send_document' | 'send_video';
    phone: string;
    text?: string;
    media_url?: string;
    caption?: string;
    filename?: string;
  }) => {
    const { data, error } = await supabase.functions.invoke('send-whatsapp-cloud', {
      body: { ...params, lead_id: leadId, sent_by: 'human', sent_by_name: senderName },
    });
    if (error) throw new Error(error.message || 'Falha ao enviar via Cloud API');
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // Helper: upload file to Supabase Storage e retornar URL pública
  const uploadToStorage = async (file: Blob, filename: string): Promise<string> => {
    const ext = filename.split('.').pop() || 'bin';
    const path = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from('whatsapp-media').upload(path, file, { contentType: file.type });
    if (error) throw new Error(`Upload falhou: ${error.message}`);
    const { data: urlData } = supabase.storage.from('whatsapp-media').getPublicUrl(path);
    return urlData.publicUrl;
  };

  // Helper: resolver o número real do WhatsApp usando remote_jid das mensagens existentes
  const resolveWhatsAppPhone = async (): Promise<string> => {
    // 1. Tentar buscar remote_jid de mensagem individual recebida do lead (mais confiável)
    if (leadId) {
      const { data: existingMsg } = await supabase
        .from('whatsapp_messages')
        .select('remote_jid')
        .eq('lead_id', leadId)
        .eq('is_from_me', false)
        .not('remote_jid', 'is', null)
        .like('remote_jid', '%@s.whatsapp.net')
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingMsg?.remote_jid) {
        return existingMsg.remote_jid.replace('@s.whatsapp.net', '');
      }
    }

    // 2. Fallback: formatar o telefone do cadastro
    if (!contactPhone) throw new Error('Telefone não disponível');
    const cleanPhone = contactPhone.replace(/\D/g, '');
    // Só adiciona 55 se parecer BR sem código (até 11 dígitos)
    if (cleanPhone.startsWith('55') || cleanPhone.length >= 12) {
      return cleanPhone;
    }
    return `55${cleanPhone}`;
  };

  // ===== Emoji picker =====
  const onEmojiClick = useCallback((emojiData: EmojiClickData) => {
    setMessageWithDraft(prev => prev + emojiData.emoji);
  }, [setMessageWithDraft]);

  // ===== Enviar reação =====
  const handleReact = useCallback(async (messageId: string, emoji: string) => {
    try {
      const { instance, uazapiUrl, apiKey } = await getUazapiConfig();

      // Buscar o whatsapp message_id original (não o UUID do banco)
      const { data: msgData } = await supabase
        .from('whatsapp_messages')
        .select('message_id, remote_jid')
        .eq('id', messageId)
        .single();

      if (!msgData?.message_id) {
        toast({ title: 'Não foi possível reagir', variant: 'destructive' });
        return;
      }

      const response = await fetch(`${uazapiUrl}/message/react`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': apiKey,
        },
        body: JSON.stringify({
          id: msgData.message_id,
          text: emoji,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao enviar reação');
      }

      // Atualizar localmente no banco
      const { data: currentMsg } = await supabase
        .from('whatsapp_messages')
        .select('reactions')
        .eq('id', messageId)
        .single();

      const currentReactions: WhatsAppReaction[] = (currentMsg?.reactions as WhatsAppReaction[]) || [];
      const newReaction: WhatsAppReaction = {
        emoji,
        sender: 'me',
        sender_name: 'Eu',
        timestamp: new Date().toISOString(),
      };

      await supabase
        .from('whatsapp_messages')
        .update({ reactions: [...currentReactions, newReaction] })
        .eq('id', messageId);

      refetch();
    } catch (error: any) {
      console.error('Error sending reaction');
      toast({ title: 'Erro ao enviar reação', description: error.message, variant: 'destructive' });
    }
  }, [toast, refetch]);

  // ===== Editar mensagem =====
  const handleStartEdit = useCallback((messageId: string, currentContent: string) => {
    setEditingMessageId(messageId);
    setEditText(currentContent);
  }, []);

  const handleConfirmEdit = useCallback(async () => {
    if (!editingMessageId || !editText.trim()) return;

    try {
      const { uazapiUrl, apiKey } = await getUazapiConfig();

      // Buscar o whatsapp message_id original
      const { data: msgData } = await supabase
        .from('whatsapp_messages')
        .select('message_id')
        .eq('id', editingMessageId)
        .single();

      if (!msgData?.message_id) {
        toast({ title: 'Não foi possível editar', variant: 'destructive' });
        return;
      }

      const response = await fetch(`${uazapiUrl}/message/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': apiKey,
        },
        body: JSON.stringify({
          id: msgData.message_id,
          text: editText,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao editar mensagem');
      }

      // Atualizar no banco local
      await supabase
        .from('whatsapp_messages')
        .update({
          content: editText,
          is_edited: true,
          edited_at: new Date().toISOString(),
        })
        .eq('id', editingMessageId);

      setEditingMessageId(null);
      setEditText('');
      toast({ title: 'Mensagem editada' });
      refetch();
    } catch (error: any) {
      console.error('Error editing message');
      toast({ title: 'Erro ao editar mensagem', description: error.message, variant: 'destructive' });
    }
  }, [editingMessageId, editText, toast, refetch]);

  const handleCancelEdit = useCallback(() => {
    setEditingMessageId(null);
    setEditText('');
  }, []);

  // Auto-resize and focus edit textarea only on mount (when editingMessageId changes)
  useEffect(() => {
    if (editingMessageId && editTextareaRef.current) {
      const el = editTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = Math.min(el.scrollHeight, 120) + 'px';
      el.focus();
      el.selectionStart = el.selectionEnd = el.value.length;
    }
  }, [editingMessageId]);

  // ===== Apagar mensagem =====
  const handleDelete = useCallback(async (messageId: string) => {
    try {
      // Buscar msg + instância da msg (não a instância selecionada)
      const { data: msgData } = await supabase
        .from('whatsapp_messages')
        .select('message_id, instance_id')
        .eq('id', messageId)
        .single();

      if (!msgData?.message_id) {
        toast({ title: 'Não foi possível apagar', variant: 'destructive' });
        return;
      }

      // Buscar instância da msg pra usar o token/url correto
      const { data: msgInstance } = await supabase
        .from('whatsapp_instances')
        .select('api_key, api_url, metadata')
        .eq('id', msgData.instance_id)
        .single();

      if (!msgInstance) {
        toast({ title: 'Instância não encontrada', variant: 'destructive' });
        return;
      }

      const metadata = msgInstance.metadata as Record<string, any> || {};

      // Cloud API não suporta delete de msg enviada
      if (metadata.type === 'cloud_api') {
        toast({ title: 'Não é possível apagar mensagens da API oficial', variant: 'destructive' });
        return;
      }

      const uazapiUrl = msgInstance.api_url || metadata.uazapi_url;

      const response = await fetch(`${uazapiUrl}/message/delete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': msgInstance.api_key,
        },
        body: JSON.stringify({
          id: msgData.message_id,
        }),
      });

      if (!response.ok) {
        throw new Error('Falha ao apagar mensagem');
      }

      // Marcar como deletada no banco local
      await supabase
        .from('whatsapp_messages')
        .update({ is_deleted: true })
        .eq('id', messageId);

      toast({ title: 'Mensagem apagada' });
      refetch();
    } catch (error: any) {
      console.error('Error deleting message');
      toast({ title: 'Erro ao apagar mensagem', description: error.message, variant: 'destructive' });
    }
  }, [toast, refetch]);

  // Reenviar mensagem que falhou
  const handleRetry = useCallback((failedMsg: WhatsAppMessage & { _optimistic?: string }) => {
    // Remover a mensagem falhada
    setOptimisticMessages(prev => prev.filter(m => m.message_id !== failedMsg.message_id));
    // Reenviar com o conteúdo original
    setMessage(failedMsg.content || '');
    setTimeout(() => {
      const sendBtn = document.querySelector('[data-send-btn]') as HTMLButtonElement;
      if (sendBtn) sendBtn.click();
    }, 100);
  }, []);

  // Enviar mensagem de texto (or staged files + text)
  const handleSend = async () => {
    // If we have staged files, send them (with text as caption)
    if (stagedFiles.length > 0) {
      return sendStagedFiles();
    }

    if (!message.trim()) return;

    if (isGroup) {
      toast({ title: 'Envio para grupos ainda não suportado', variant: 'destructive' });
      return;
    }

    if (!contactPhone) {
      toast({ title: 'Telefone não disponível', variant: 'destructive' });
      return;
    }

    // Gerar ID temporário para a mensagem otimista
    const tempId = `optimistic_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const messageText = message.trim();

    // OPTIMISTIC: Adicionar mensagem instantaneamente na UI
    const optimisticMsg: WhatsAppMessage & { _optimistic: 'pending' | 'failed' } = {
      id: tempId,
      message_id: tempId,
      content: messageText,
      is_from_me: true,
      sent_at: new Date().toISOString(),
      sender_name: null,
      sender_phone: contactPhone || null,
      message_type: 'Conversation',
      media_url: null,
      instance_id: sendingInstanceId || instanceId || null,
      instance_team: null,
      lead_id: leadId || null,
      remote_jid: null,
      is_deleted: false,
      metadata: null,
      reactions: [],
      _optimistic: 'pending',
    };
    setOptimisticMessages(prev => [...prev, optimisticMsg]);

    // Limpar input IMEDIATAMENTE (UX responsiva)
    setMessage('');
    clearDraft();

    // BACKGROUND: Enviar via API
    try {
      const instance = await getInstance();
      const resolvedPhone = await resolveWhatsAppPhone();

      if (isCloudAPI(instance)) {
        // Cloud API: enviar via edge function
        await sendViaCloudAPI({ action: 'send_text', phone: resolvedPhone, text: messageText });
      } else {
        // UAZAPI: envio direto
        const metadata = instance.metadata as Record<string, any> || {};
        const uazapiUrl = instance.api_url || metadata.uazapi_url;

        const response = await fetch(`${uazapiUrl}/send/text`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'token': instance.api_key
          },
          body: JSON.stringify({
            number: resolvedPhone,
            text: messageText
          }),
        });

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseData.message || responseData.error || 'Falha ao enviar');
        }

        // Montar message_id no formato do webhook: "owner:messageid" pra dedup funcionar
        const rawId = responseData.id || '';
        const keyId = responseData.key?.id || '';
        const owner = responseData.key?.remoteJid?.replace('@s.whatsapp.net', '') || responseData.owner || '';
        // Se id já tem ":", tá completo. Senão, montar owner:keyId
        const uazapiMessageId = rawId.includes(':') ? rawId
          : (owner && keyId) ? `${owner}:${keyId}`
          : rawId || keyId || `local_${Date.now()}`;

        const { error: saveError } = await supabase.from('whatsapp_messages').insert({
          instance_id: instance.id,
          remote_jid: `${resolvedPhone}@s.whatsapp.net`,
          message_id: uazapiMessageId,
          message_type: 'Conversation',
          content: messageText,
          is_from_me: true,
          sent_at: new Date().toISOString(),
          lead_id: leadId || null,
          metadata: { sent_by: 'human', sent_by_name: senderName },
        });

        if (saveError) {
          console.error('Error saving message');
        }
      }

      onMessageSent?.();
    } catch (error: any) {
      console.error('Error sending message:', error.message);
      toast({ title: 'Erro ao enviar mensagem', description: error.message, variant: 'destructive' });
      // Marcar mensagem otimista como falha
      setOptimisticMessages(prev => prev.map(m =>
        m.message_id === tempId || m.id === tempId ? { ...m, _optimistic: 'failed' as const } : m
      ));
    }
  };

  // Converter blob para base64
  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        resolve(base64.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  // Iniciar gravação de áudio
  const startRecording = async () => {
    try {
      const instance = await getInstance();
      const useOgg = isCloudAPI(instance);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      let recorder: MediaRecorder;
      if (useOgg) {
        // Cloud API: gravar em OGG Opus (formato nativo WhatsApp PTT)
        const workerOptions = {
          encoderWorkerFactory: () => new Worker(encoderWorker),
          OggOpusEncoderWasmPath: OggOpusWasm,
        };
        recorder = new OpusMediaRecorder(stream, { mimeType: 'audio/ogg;codecs=opus' }, workerOptions);
      } else {
        // UAZAPI: webm funciona direto
        recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      }

      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => audioChunksRef.current.push(e.data);
      recorder.onstop = () => stream.getTracks().forEach(track => track.stop());

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordingTime(0);

      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch (error) {
      toast({ title: 'Erro ao acessar microfone', variant: 'destructive' });
    }
  };

  // Parar gravação e enviar áudio
  const stopRecording = async () => {
    if (!mediaRecorderRef.current || !recording) return;

    if (recordingIntervalRef.current) {
      clearInterval(recordingIntervalRef.current);
    }

    mediaRecorderRef.current.stop();
    setRecording(false);

    if (isGroup) {
      toast({ title: 'Envio para grupos ainda não suportado', variant: 'destructive' });
      setRecordingTime(0);
      return;
    }

    if (!contactPhone) {
      toast({ title: 'Telefone não disponível', variant: 'destructive' });
      setRecordingTime(0);
      return;
    }

    setSending(true);

    await new Promise(resolve => setTimeout(resolve, 100));

    try {
      const recorderMime = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const isOgg = recorderMime.includes('ogg');
      const ext = isOgg ? 'ogg' : 'webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: recorderMime });
      const instance = await getInstance();
      const resolvedPhone = await resolveWhatsAppPhone();

      if (isCloudAPI(instance)) {
        // Cloud API: upload pro Storage e enviar como áudio nativo
        const mediaUrl = await uploadToStorage(audioBlob, `audio_${Date.now()}.${ext}`);
        await sendViaCloudAPI({ action: 'send_audio', phone: resolvedPhone, media_url: mediaUrl });
      } else {
        // UAZAPI: envio direto via base64
        const base64Audio = await blobToBase64(audioBlob);
        const metadata = instance.metadata as Record<string, any> || {};
        const uazapiUrl = instance.api_url || metadata.uazapi_url;
        const response = await fetch(`${uazapiUrl}/send/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'token': instance.api_key
          },
          body: JSON.stringify({
            number: resolvedPhone,
            type: 'ptt',
            file: `data:${recorderMime};base64,${base64Audio}`
          }),
        });

        const responseData = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(responseData.message || responseData.error || 'Falha ao enviar áudio');
        }
      }

      toast({ title: 'Áudio enviado!' });
      setTimeout(() => refetch(), 1500);
      onMessageSent?.();
    } catch (error: any) {
      console.error('Error sending audio');
      toast({ title: 'Erro ao enviar áudio', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
      setRecordingTime(0);
    }
  };

  // Cancelar gravação
  const cancelRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current);
      setRecording(false);
      setRecordingTime(0);
    }
  };

  // Formatar tempo de gravação
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- File staging (drag & drop + file picker) ---
  const stageFiles = useCallback((files: File[]) => {
    const newStaged = files.map(file => {
      const mimeType = file.type;
      let mediaType = 'document';
      if (mimeType.startsWith('image/')) mediaType = 'image';
      else if (mimeType.startsWith('video/')) mediaType = 'video';
      else if (mimeType.startsWith('audio/')) mediaType = 'audio';

      let preview: string | null = null;
      if (mediaType === 'image') {
        preview = URL.createObjectURL(file);
      }
      return { file, preview, mediaType };
    });
    setStagedFiles(prev => [...prev, ...newStaged]);
  }, []);

  const removeStagedFile = useCallback((index: number) => {
    setStagedFiles(prev => {
      const removed = prev[index];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const clearStagedFiles = useCallback(() => {
    stagedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    setStagedFiles([]);
  }, [stagedFiles]);

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
      stagedFiles.forEach(f => { if (f.preview) URL.revokeObjectURL(f.preview); });
    };
  }, []);

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only leave if we're leaving the chat area entirely
    const rect = chatAreaRef.current?.getBoundingClientRect();
    if (rect) {
      const { clientX, clientY } = e;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
        setIsDragOver(false);
      }
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      stageFiles(droppedFiles);
    }
  }, [stageFiles]);

  // File picker now stages instead of sending immediately
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList);
    stageFiles(files);
    // Reset input via key change (avoids FileList invalidation from clearing value)
    setFileInputKey(k => k + 1);
  };

  // Send staged files (called from handleSend when there are staged files)
  const sendStagedFiles = async () => {
    if (stagedFiles.length === 0) return;

    if (isGroup) {
      toast({ title: 'Envio para grupos ainda nao suportado', variant: 'destructive' });
      return;
    }

    if (!contactPhone) {
      toast({ title: 'Telefone nao disponivel', variant: 'destructive' });
      return;
    }

    setSending(true);

    try {
      const instance = await getInstance();
      const resolvedPhone = await resolveWhatsAppPhone();
      const useCloudAPI = isCloudAPI(instance);

      const metadata = instance.metadata as Record<string, any> || {};
      const uazapiUrl = instance.api_url || metadata.uazapi_url;

      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < stagedFiles.length; i++) {
        const { file, mediaType } = stagedFiles[i];
        const fileSizeMB = file.size / (1024 * 1024);

        try {
          if (useCloudAPI) {
            // Cloud API: upload pro Storage e enviar URL
            const mediaUrl = await uploadToStorage(file, file.name);
            const action = mediaType === 'image' ? 'send_image' : mediaType === 'video' ? 'send_video' : 'send_document';
            const caption = (i === 0 && message.trim()) ? message.trim() : undefined;
            await sendViaCloudAPI({ action, phone: resolvedPhone, media_url: mediaUrl, caption, filename: file.name });
          } else {
            // UAZAPI: envio direto via base64
            const base64 = await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = () => reject(new Error('Falha ao ler arquivo'));
              reader.readAsDataURL(file);
            });

            const payload: Record<string, any> = {
              number: resolvedPhone,
              type: mediaType,
              file: base64
            };

            if (mediaType === 'document') payload.docName = file.name;
            if (i === 0 && message.trim()) payload.text = message;

            const controller = new AbortController();
            const timeoutMs = fileSizeMB > 50 ? 180000 : fileSizeMB > 20 ? 120000 : 60000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(`${uazapiUrl}/send/media`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'token': instance.api_key
              },
              body: JSON.stringify(payload),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            const responseText = await response.text();
            let responseData: any = {};
            try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

            if (!response.ok) {
              throw new Error(responseData.message || responseData.error || responseText || `HTTP ${response.status}`);
            }
          }

          successCount++;
          if (i < stagedFiles.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
        } catch (fileError: any) {
          let errorMsg = fileError.message || 'Erro desconhecido';
          if (fileError.name === 'AbortError') errorMsg = 'Timeout - arquivo muito grande ou conexao lenta';
          toast({ title: `Erro ao enviar ${file.name}`, description: errorMsg, variant: 'destructive' });
          errorCount++;
        }
      }

      setMessage('');
      clearDraft();
      clearStagedFiles();
      if (errorCount === 0) {
        toast({ title: `${successCount} arquivo${successCount > 1 ? 's' : ''} enviado${successCount > 1 ? 's' : ''}!` });
      } else if (successCount > 0) {
        toast({ title: `${successCount} enviado${successCount > 1 ? 's' : ''}, ${errorCount} falhou`, variant: 'destructive' });
      } else {
        toast({ title: 'Falha ao enviar arquivos', variant: 'destructive' });
      }

      setTimeout(() => refetch(), 1500);
      onMessageSent?.();
    } catch (error: any) {
      console.error('Error sending files');
      toast({ title: 'Erro ao enviar arquivos', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  // Enviar um material individual via WhatsApp
  const sendSingleMaterial = async (material: SalesMaterial, instance: any, resolvedPhone: string) => {
    if (isCloudAPI(instance)) {
      // Cloud API: material já tem URL pública (file_url)
      const action = material.type === 'image' ? 'send_image' : material.type === 'video' ? 'send_video' : 'send_document';
      await sendViaCloudAPI({ action, phone: resolvedPhone, media_url: material.file_url, filename: material.name });
      return;
    }

    // UAZAPI: envio direto via base64
    const metadata = instance.metadata as Record<string, any> || {};
    const uazapiUrl = instance.api_url || metadata.uazapi_url;

    const fileResponse = await fetch(material.file_url);
    if (!fileResponse.ok) throw new Error(`Falha ao baixar ${material.name}`);
    const blob = await fileResponse.blob();

    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    let mediaType = material.type;
    if (material.type === 'audio') mediaType = 'audio';
    else if (material.type === 'video') mediaType = 'video';
    else if (material.type === 'document') mediaType = 'document';
    else mediaType = 'image';

    const payload: Record<string, any> = {
      number: resolvedPhone,
      type: mediaType,
      file: base64,
    };

    if (material.type === 'document') payload.docName = material.name;

    const response = await fetch(`${uazapiUrl}/send/media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'token': instance.api_key
      },
      body: JSON.stringify(payload),
    });

    const responseData = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(responseData.message || responseData.error || `Falha ao enviar ${material.name}`);
    }
  };

  // Enviar material(is) da biblioteca
  const handleSendMaterial = async (input: SalesMaterial | SalesMaterial[]) => {
    if (!contactPhone && !leadId) {
      toast({ title: 'Telefone não disponível', variant: 'destructive' });
      return;
    }

    const materialsToSend = Array.isArray(input) ? input : [input];
    setSending(true);

    try {
      const instance = await getInstance();
      const resolvedPhone = await resolveWhatsAppPhone();

      let successCount = 0;
      let errorCount = 0;

      for (const material of materialsToSend) {
        try {
          await sendSingleMaterial(material, instance, resolvedPhone);
          successCount++;
        } catch {
          errorCount++;
        }
      }

      if (errorCount === 0) {
        toast({ title: `${successCount} material${successCount > 1 ? 'is' : ''} enviado${successCount > 1 ? 's' : ''}!` });
      } else if (successCount > 0) {
        toast({ title: `${successCount} enviado${successCount > 1 ? 's' : ''}, ${errorCount} falhou`, variant: 'destructive' });
      } else {
        toast({ title: 'Falha ao enviar materiais', variant: 'destructive' });
      }

      setTimeout(() => refetch(), 1500);
      onMessageSent?.();
    } catch (error: any) {
      console.error('Error sending materials');
      toast({ title: 'Erro ao enviar material', description: error.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const handleCopyConversation = useCallback(() => {
    if (!messages || messages.length === 0) return;
    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
    const strip = (t: string) => t.replace(emojiRegex, '').replace(/\s{2,}/g, ' ').trim();
    let lastDate = '';
    const lines = messages.map((msg) => {
      const parts: string[] = [];
      const d = format(new Date(msg.sent_at), 'dd/MM/yyyy');
      if (d !== lastDate) { lastDate = d; parts.push(`--- ${d} ---`); }
      const time = format(new Date(msg.sent_at), 'HH:mm');
      const name = strip(msg.sender_name || (msg.is_from_me ? 'Eu' : contactName));
      const content = msg.content ? strip(msg.content) : '[Mídia]';
      parts.push(`[${time}] ${name}: ${content}`);
      return parts.join('\n');
    }).join('\n');
    navigator.clipboard.writeText(lines);
    toast({ title: 'Conversa copiada!' });
  }, [messages, contactName, toast]);

  // Guard: sem telefone nem lead/grupo → mostrar placeholder
  if (!leadId && !groupId && !contactPhone) {
    return <Card className={cn("flex flex-col h-full items-center justify-center text-muted-foreground", className)}>
      <div className="text-center">
        <p className="text-sm">Nenhum telefone cadastrado</p>
        <p className="text-xs mt-1">Adicione um telefone para enviar mensagens</p>
      </div>
    </Card>;
  }

  return (
    <Card
      ref={chatAreaRef}
      className={cn("flex flex-col h-full overflow-hidden relative min-w-0", hideHeader && "border-0 rounded-none shadow-none", className)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drop overlay */}
      {isDragOver && (
        <div className="absolute inset-0 z-50 bg-primary/10 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg flex items-center justify-center pointer-events-none">
          <div className="bg-background/90 rounded-xl px-6 py-4 shadow-lg text-center">
            <Paperclip className="h-8 w-8 text-primary mx-auto mb-2" />
            <p className="font-semibold text-foreground">Solte os arquivos aqui</p>
            <p className="text-xs text-muted-foreground mt-1">Imagens, videos, documentos...</p>
          </div>
        </div>
      )}

      {!hideHeader && (
        <CardHeader className="py-3 px-4 border-b bg-green-600 text-white flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isGroup && (
                <div className="w-8 h-8 rounded-full bg-green-700 flex items-center justify-center">
                  <Users className="h-4 w-4" />
                </div>
              )}
              <div>
                <h3 className="font-semibold">{contactName}</h3>
                <p className="text-xs text-green-100">
                  {isGroup ? 'Grupo WhatsApp' : 'Conversa Individual'}
                </p>
              </div>
            </div>
            {isGroup && (
              <Badge variant="secondary" className="bg-green-700 text-white text-xs">
                Grupo
              </Badge>
            )}
          </div>
        </CardHeader>
      )}

      <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-[#e5ddd5] dark:bg-zinc-900 relative min-w-0">
        {/* Botão copiar conversa */}
        {messages && messages.length > 0 && (
          <button
            onClick={handleCopyConversation}
            title="Copiar conversa"
            className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/80 dark:bg-zinc-700/80 shadow-sm border border-gray-200 dark:border-zinc-600 hover:bg-white dark:hover:bg-zinc-600 transition-colors"
          >
            <Copy className="h-3.5 w-3.5 text-gray-600 dark:text-gray-300" />
          </button>
        )}
        {/* Loading sutil no topo - não bloqueia a UI */}
        {isFetching && isPlaceholderData && (
          <div className="sticky top-0 z-10 flex items-center justify-center py-2">
            <div className="flex items-center gap-2 bg-white/90 dark:bg-zinc-800/90 px-3 py-1.5 rounded-full shadow-sm">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Carregando mensagens...</span>
            </div>
          </div>
        )}
        {/* Botão para carregar mensagens anteriores */}
        {messages && messages.length >= 50 && messageLimit <= 50 && (
          <div className="flex items-center justify-center py-3">
            <button
              onClick={handleLoadAllMessages}
              disabled={isFetching}
              className="flex items-center gap-2 bg-white/90 dark:bg-zinc-800/90 px-4 py-2 rounded-full shadow-sm hover:bg-white dark:hover:bg-zinc-700 transition-colors text-xs text-muted-foreground hover:text-foreground"
            >
              {isFetching && messageLimit > 50 ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <RotateCcw className="h-3.5 w-3.5" />
                  Carregar mensagens anteriores
                </>
              )}
            </button>
          </div>
        )}
        {messages && messages.length > 0 ? (
          messages.map((msg, idx) => {
            // Separador de dia
            const msgDate = new Date(msg.sent_at);
            const prevDate = idx > 0 ? new Date(messages[idx - 1].sent_at) : null;
            const showDateSep = !prevDate || msgDate.toDateString() !== prevDate.toDateString();

            const now = new Date();
            const isToday = msgDate.toDateString() === now.toDateString();
            const isYesterday = new Date(now.getTime() - 86400000).toDateString() === msgDate.toDateString();
            const dateLabel = isToday ? 'Hoje' : isYesterday ? 'Ontem' : format(msgDate, 'dd/MM/yyyy');

            return (
              <React.Fragment key={msg.message_id}>
                {showDateSep && (
                  <div className="flex items-center justify-center my-3">
                    <span className="bg-white/80 dark:bg-zinc-700/80 text-[11px] text-gray-500 dark:text-gray-300 px-3 py-1 rounded-full shadow-sm">
                      {dateLabel}
                    </span>
                  </div>
                )}
                <MessageBubble
                  message={msg}
                  onReact={handleReact}
                  onEdit={handleStartEdit}
                  onDelete={handleDelete}
                  onRetry={handleRetry}
                />
              </React.Fragment>
            );
          })
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Nenhuma mensagem ainda</div>
        )}
      </div>

      {/* Barra de edição inline */}
      {editingMessageId && (
        <div className="border-t bg-amber-50 dark:bg-amber-900/20">
          {/* Header com indicador */}
          <div className="flex items-center justify-between px-3 pt-2 pb-1">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
              <Pencil className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">Editando mensagem</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-muted-foreground">Esc para cancelar</span>
              <Button size="sm" variant="ghost" onClick={handleCancelEdit} className="h-6 w-6 p-0 text-gray-500 hover:text-red-500">
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {/* Textarea + send */}
          <div className="flex items-end gap-2 px-3 pb-2">
            <textarea
              ref={editTextareaRef}
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleConfirmEdit();
                }
                if (e.key === 'Escape') handleCancelEdit();
              }}
              className="flex-1 bg-white dark:bg-zinc-800 py-2 px-3 rounded-md border text-sm resize-none min-h-[36px] max-h-[120px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              autoFocus
              rows={1}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 120) + 'px';
              }}
            />
            <Button size="icon" className="h-9 w-9 bg-green-500 hover:bg-green-600 shrink-0" onClick={handleConfirmEdit}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Staged files preview */}
      {stagedFiles.length > 0 && (
        <div className="border-t bg-muted/50 px-3 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {stagedFiles.length} arquivo{stagedFiles.length > 1 ? 's' : ''} anexado{stagedFiles.length > 1 ? 's' : ''}
            </span>
            <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive" onClick={clearStagedFiles}>
              <X className="h-3 w-3 mr-1" />
              Limpar
            </Button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {stagedFiles.map((staged, idx) => (
              <div key={idx} className="relative shrink-0 group/file">
                {staged.mediaType === 'image' && staged.preview ? (
                  <div className="w-16 h-16 rounded-lg overflow-hidden border bg-muted">
                    <img src={staged.preview} alt={staged.file.name} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg border bg-muted flex flex-col items-center justify-center gap-1 px-1">
                    {staged.mediaType === 'video' ? (
                      <FileVideo className="h-5 w-5 text-blue-500" />
                    ) : (
                      <File className="h-5 w-5 text-muted-foreground" />
                    )}
                    <span className="text-[9px] text-muted-foreground truncate w-full text-center leading-tight">
                      {staged.file.name.length > 12 ? staged.file.name.slice(0, 10) + '...' : staged.file.name}
                    </span>
                  </div>
                )}
                {/* Remove button */}
                <button
                  onClick={() => removeStagedFile(idx)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover/file:opacity-100 transition-opacity shadow-sm"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Alerta de saúde da instância — acima do input */}
      <InstanceHealthInlineBanner instanceId={sendingInstanceId} />

      <div className="p-3 border-t bg-muted/30 flex items-center gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))' }}>
        {selectedInstanceIsCloudAPI && windowClosed && !isGroup ? (
          <div className="flex-1 flex items-center gap-2">
            {/* Seletor de instância — sempre visível */}
            {availableInstances.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 px-2 text-xs gap-1 shrink-0 max-w-[140px] border-2",
                      sendingInstanceId === '69d283e2-4d60-4f2c-af5a-45f48796c1ab'
                        ? "border-green-500/50 text-green-600 bg-green-500/5"
                        : "border-amber-500/50 text-amber-600 bg-amber-500/5"
                    )}
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">
                      {(availableInstances.find(i => i.id === sendingInstanceId)?.name || 'Selecionar').replace(/^[A-Z]+ - /i, '')}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  {availableInstances.map((inst) => (
                    <DropdownMenuItem
                      key={inst.id}
                      onClick={() => setSendingInstanceId(inst.id)}
                      className={cn('text-xs gap-2', sendingInstanceId === inst.id && 'bg-accent font-medium')}
                    >
                      <div className={cn('h-2 w-2 rounded-full shrink-0', inst.status === 'connected' ? 'bg-green-500' : 'bg-red-400')} />
                      {inst.name.replace(/^[A-Z]+ - /i, '')}
                      {sendingInstanceId === inst.id && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <div className="flex-1 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <Clock className="h-3 w-3 inline mr-1 -mt-0.5" />
              Janela 24h fechada
            </div>
            <Button
              size="sm"
              className="bg-green-500 hover:bg-green-600 text-white shrink-0"
              onClick={() => setShowTemplateModal(true)}
              disabled={sending}
            >
              <Send className="h-3.5 w-3.5 mr-1.5" />
              Enviar Template
            </Button>
          </div>
        ) : recording ? (
          <>
            <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={cancelRecording}>
              <Square className="h-5 w-5" />
            </Button>
            <div className="flex-1 flex items-center justify-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
              <span className="text-sm font-medium text-red-500">{formatTime(recordingTime)}</span>
            </div>
            <Button size="icon" className="h-9 w-9 bg-green-500 hover:bg-green-600" onClick={stopRecording}>
              <Send className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <>
            {/* Emoji Picker */}
            <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 text-muted-foreground hover:text-amber-500"
                  disabled={sending}
                  title="Emoji"
                >
                  <Smile className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="start"
                className="w-auto p-0 border-0 shadow-xl z-[100]"
                sideOffset={8}
                onOpenAutoFocus={(e) => e.preventDefault()}
                onInteractOutside={(e) => {
                  // Não fechar se clicou dentro do emoji picker (portal pode causar false positive)
                  const target = e.target as HTMLElement;
                  if (target?.closest?.('.EmojiPickerReact') || target?.closest?.('[data-radix-popper-content-wrapper]')) {
                    e.preventDefault();
                  }
                }}
              >
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={Theme.LIGHT}
                  width={320}
                  height={400}
                  searchPlaceHolder="Buscar emoji..."
                  previewConfig={{ showPreview: false }}
                  lazyLoadEmojis={true}
                />
              </PopoverContent>
            </Popover>
            <input
              key={fileInputKey}
              type="file"
              ref={fileInputRef}
              onChange={handleFileSelect}
              accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
              className="hidden"
              multiple
            />
            {/* Seletor de instância (qual número enviar) — SEMPRE visível */}
            {availableInstances.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                      "h-9 px-2 text-xs gap-1 shrink-0 max-w-[140px] border-2",
                      sendingInstanceId === '69d283e2-4d60-4f2c-af5a-45f48796c1ab'
                        ? "border-green-500/50 text-green-600 bg-green-500/5"
                        : "border-amber-500/50 text-amber-600 bg-amber-500/5"
                    )}
                    title="Enviar de qual número"
                  >
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate font-medium">
                      {(availableInstances.find(i => i.id === sendingInstanceId)?.name || 'Selecionar').replace(/^[A-Z]+ - /i, '')}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-[160px]">
                  {availableInstances.map((inst) => (
                    <DropdownMenuItem
                      key={inst.id}
                      onClick={() => setSendingInstanceId(inst.id)}
                      className={cn(
                        'text-xs gap-2',
                        sendingInstanceId === inst.id && 'bg-accent font-medium'
                      )}
                    >
                      <div className={cn(
                        'h-2 w-2 rounded-full shrink-0',
                        inst.status === 'connected' ? 'bg-green-500' : 'bg-red-400'
                      )} />
                      {inst.name.replace(/^[A-Z]+ - /i, '')}
                      {sendingInstanceId === inst.id && <Check className="h-3.5 w-3.5 ml-auto" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-green-500"
              onClick={() => fileInputRef.current?.click()}
              disabled={sending}
              title="Anexar arquivo"
            >
              <Paperclip className="h-5 w-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 text-muted-foreground hover:text-primary"
              onClick={() => setIsMaterialsOpen(true)}
              disabled={sending}
              title="Biblioteca de materiais"
            >
              <FolderOpen className="h-5 w-5" />
            </Button>
            <textarea
              ref={textareaRef}
              placeholder={stagedFiles.length > 0 ? "Adicione uma legenda..." : "Digite uma mensagem..."}
              value={message}
              onChange={(e) => {
                setMessageWithDraft(e.target.value);
                // Auto-resize inline to avoid layout shift on re-render
                const target = e.target;
                target.style.height = 'auto';
                const newHeight = Math.min(target.scrollHeight, 120);
                target.style.height = newHeight + 'px';
                target.style.overflowY = target.scrollHeight > 120 ? 'auto' : 'hidden';
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              className="flex-1 bg-white dark:bg-zinc-800 resize-none min-h-[36px] max-h-[120px] py-2 px-3 rounded-md border border-input text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              disabled={sending && stagedFiles.length > 0}
              rows={1}
            />
            {(message.trim() || stagedFiles.length > 0) ? (
              <Button data-send-btn size="icon" className="h-9 w-9 bg-green-500 hover:bg-green-600" onClick={handleSend} disabled={sending && stagedFiles.length > 0}>
                <Send className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 text-muted-foreground hover:text-green-500"
                onClick={startRecording}
                disabled={sending}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-5 w-5" />}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Modal de biblioteca de materiais */}
      <MaterialsLibraryModal
        open={isMaterialsOpen}
        onOpenChange={setIsMaterialsOpen}
        onSelectMaterial={handleSendMaterial}
      />

      {/* Modal de seleção de template (janela fechada) */}
      <AlertDialog open={showTemplateModal} onOpenChange={(open) => { setShowTemplateModal(open); if (!open) { setTemplateSearch(''); setSelectedTemplate(null); } }}>
        <AlertDialogContent className="max-w-md">
          {!selectedTemplate ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Enviar Template
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Janela de 24h fechada. Escolha um template aprovado.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <input
                type="text"
                placeholder="Buscar template..."
                value={templateSearch}
                onChange={(e) => setTemplateSearch(e.target.value)}
                className="w-full h-9 px-3 text-sm border rounded-lg bg-muted/30 focus:outline-none focus:ring-2 focus:ring-green-500/30"
                autoFocus
              />
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {(() => {
                  const filtered = templates.filter(t =>
                    !templateSearch || t.name.toLowerCase().includes(templateSearch.toLowerCase()) ||
                    (t.body_text || '').toLowerCase().includes(templateSearch.toLowerCase())
                  );
                  return filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum template encontrado</p>
                  ) : filtered.map((t) => (
                    <button
                      key={t.id}
                      className="w-full text-left p-3 rounded-lg border hover:border-green-500 hover:bg-green-500/5 transition-colors"
                      onClick={() => setSelectedTemplate(t)}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm capitalize">{t.name.replace(/_/g, ' ')}</span>
                        <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                          {t.category || 'UTILITY'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {(t.body_text || '').replace(/\{\{1\}\}/g, contactName?.split(' ')[0] || 'Nome')}
                      </p>
                    </button>
                  ));
                })()}
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar envio</AlertDialogTitle>
                <AlertDialogDescription>
                  Vai enviar para <strong>{contactName || contactPhone}</strong>:
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
                <p className="text-sm font-medium mb-1 capitalize text-green-800 dark:text-green-300">{selectedTemplate.name.replace(/_/g, ' ')}</p>
                <p className="text-sm whitespace-pre-line">
                  {(selectedTemplate.body_text || '').replace(/\{\{1\}\}/g, contactName?.split(' ')[0] || 'Nome')}
                </p>
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={sending} onClick={() => setSelectedTemplate(null)}>Voltar</AlertDialogCancel>
                <button
                  className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  onClick={() => sendTemplate(selectedTemplate)}
                  disabled={sending}
                >
                  {sending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Send className="h-4 w-4 mr-1.5" />}
                  Enviar
                </button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
