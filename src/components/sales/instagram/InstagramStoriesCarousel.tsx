import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Play } from "lucide-react";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { StoryViewerModal } from "./StoryViewerModal";
import type { InstagramStory } from "@/hooks/useInstagramProfile";

interface InstagramStoriesCarouselProps {
  stories: InstagramStory[];
}

export function InstagramStoriesCarousel({
  stories,
}: InstagramStoriesCarouselProps) {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(0);

  if (!stories || stories.length === 0) return null;

  const handleStoryClick = (index: number) => {
    setViewerIndex(index);
    setViewerOpen(true);
  };

  return (
    <>
      <ScrollArea className="w-full whitespace-nowrap">
        <div className="flex gap-3 p-1">
          {stories.map((story, index) => {
            const thumbUrl =
              story.stored_thumbnail_url ||
              story.stored_media_url ||
              story.thumbnail_url ||
              story.media_url;
            const isVideo = story.media_type === 2;
            const timeAgo = formatDistanceToNow(new Date(story.taken_at), {
              addSuffix: false,
              locale: ptBR,
            });

            return (
              <button
                key={story.id}
                onClick={() => handleStoryClick(index)}
                className="flex flex-col items-center gap-1 flex-shrink-0"
              >
                {/* Gradient ring */}
                <div className="rounded-full p-[2.5px] bg-gradient-to-tr from-yellow-400 via-pink-500 to-purple-600 hover:scale-105 transition-transform">
                  <div className="rounded-full p-[2px] bg-background">
                    <div className="relative w-16 h-16 rounded-full overflow-hidden">
                      <img
                        src={thumbUrl}
                        alt="Story"
                        className="w-full h-full object-cover"
                      />
                      {isVideo && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <Play className="h-4 w-4 text-white fill-white" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-[10px] text-muted-foreground max-w-[72px] truncate text-center">
                  {timeAgo}
                </span>
              </button>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <StoryViewerModal
        stories={stories}
        initialIndex={viewerIndex}
        open={viewerOpen}
        onClose={() => setViewerOpen(false)}
      />
    </>
  );
}
