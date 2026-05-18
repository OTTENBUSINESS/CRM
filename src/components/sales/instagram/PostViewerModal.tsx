import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Play,
  ExternalLink,
} from "lucide-react";
import type { InstagramPost } from "@/hooks/useInstagramProfile";

interface PostViewerModalProps {
  posts: InstagramPost[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function PostViewerModal({
  posts,
  initialIndex,
  open,
  onClose,
}: PostViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const post = posts[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < posts.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }, [currentIndex, posts.length]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((i) => i - 1);
    }
  }, [currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, goNext, goPrev, onClose]);

  if (!open || !post) return null;

  const imgUrl = post.stored_thumbnail_url || post.thumbnail_url;
  const isVideo = post.media_type === 2;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
    >
      <div
        className="relative bg-background rounded-xl overflow-hidden max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Navigation - Left */}
        {currentIndex > 0 && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}

        {/* Navigation - Right */}
        {currentIndex < posts.length - 1 && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        )}

        {/* Image */}
        <div className="relative bg-black flex items-center justify-center min-h-[300px] max-h-[60vh]">
          <img
            src={imgUrl}
            alt={post.caption?.substring(0, 50) || "Post"}
            className="w-full h-full object-contain max-h-[60vh]"
          />
          {isVideo && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-black/40 rounded-full p-3">
                <Play className="h-8 w-8 text-white fill-white" />
              </div>
            </div>
          )}
        </div>

        {/* Info section */}
        <div className="p-4 space-y-3 overflow-y-auto max-h-[30vh]">
          {/* Metrics + date */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Heart className="h-4 w-4" />
                {(post.like_count || 0).toLocaleString()}
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MessageCircle className="h-4 w-4" />
                {(post.comment_count || 0).toLocaleString()}
              </span>
              {post.play_count > 0 && (
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Play className="h-4 w-4" />
                  {post.play_count.toLocaleString()}
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground">
              {format(new Date(post.taken_at), "dd/MM/yyyy 'às' HH:mm", {
                locale: ptBR,
              })}
            </span>
          </div>

          {/* Caption */}
          {post.caption && (
            <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">
              {post.caption}
            </p>
          )}

          {/* Link to Instagram */}
          <a
            href={`https://instagram.com/p/${post.code}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            Ver no Instagram
          </a>
        </div>

        {/* Counter */}
        <div className="text-center pb-3 text-xs text-muted-foreground">
          {currentIndex + 1} / {posts.length}
        </div>
      </div>
    </div>
  );
}
