import { useState, useEffect, useCallback } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { X, ChevronLeft, ChevronRight, Play, Clock, Sparkles } from "lucide-react";
import type { InstagramStory } from "@/hooks/useInstagramProfile";

interface StoryViewerModalProps {
  stories: InstagramStory[];
  initialIndex: number;
  open: boolean;
  onClose: () => void;
}

export function StoryViewerModal({
  stories,
  initialIndex,
  open,
  onClose,
}: StoryViewerModalProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const story = stories[currentIndex];

  const goNext = useCallback(() => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onClose();
    }
  }, [currentIndex, stories.length, onClose]);

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

  if (!open || !story) return null;

  const mediaUrl =
    story.stored_media_url || story.media_url;
  const thumbUrl =
    story.stored_thumbnail_url || story.thumbnail_url;
  const isVideo = story.media_type === 2;
  const timeAgo = formatDistanceToNow(new Date(story.taken_at), {
    addSuffix: true,
    locale: ptBR,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      {/* Progress bars */}
      <div className="absolute top-3 left-4 right-4 flex gap-1 z-10">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                i < currentIndex
                  ? "bg-white w-full"
                  : i === currentIndex
                  ? "bg-white w-full"
                  : "w-0"
              }`}
            />
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="absolute top-6 left-4 right-4 flex items-center justify-between z-10">
        <div className="flex items-center gap-2 text-white text-xs">
          <Clock className="h-3 w-3" />
          <span>{timeAgo}</span>
          {isVideo && (
            <span className="flex items-center gap-1 bg-white/20 px-1.5 py-0.5 rounded">
              <Play className="h-3 w-3 fill-white" /> Vídeo
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="text-white hover:bg-white/20 rounded-full p-1 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation - Left */}
      {currentIndex > 0 && (
        <button
          onClick={goPrev}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 rounded-full p-2 transition-colors"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}

      {/* Navigation - Right */}
      {currentIndex < stories.length - 1 && (
        <button
          onClick={goNext}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 text-white hover:bg-white/20 rounded-full p-2 transition-colors"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Media content */}
      <div className="max-w-md w-full max-h-[80vh] flex flex-col items-center">
        {isVideo && mediaUrl ? (
          <video
            key={story.id}
            src={mediaUrl}
            controls
            autoPlay
            playsInline
            className="max-h-[65vh] w-full rounded-lg object-contain"
          />
        ) : (
          <img
            src={thumbUrl}
            alt="Story"
            className="max-h-[65vh] w-full rounded-lg object-contain"
          />
        )}

        {/* AI Description */}
        {story.ai_description && (
          <div className="mt-3 w-full px-2">
            <div className="bg-white/10 backdrop-blur-sm rounded-lg p-3 text-white">
              <div className="flex items-center gap-1.5 mb-1.5">
                <Sparkles className="h-3 w-3 text-amber-400" />
                <span className="text-[10px] font-medium text-amber-400 uppercase tracking-wider">
                  Análise IA
                </span>
              </div>
              <p className="text-xs leading-relaxed opacity-90">
                {story.ai_description}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs">
        {currentIndex + 1} / {stories.length}
      </div>
    </div>
  );
}
