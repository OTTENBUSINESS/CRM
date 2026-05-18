import { useState } from 'react';
import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRateCall } from '@/hooks/useWavoip';
import { useToast } from '@/hooks/use-toast';

interface CallRatingProps {
  callId: string;
  currentRating: number | null;
  size?: 'sm' | 'md';
  showLabel?: boolean;
}

export function CallRating({ callId, currentRating, size = 'md', showLabel = true }: CallRatingProps) {
  const [hovered, setHovered] = useState(0);
  const rateCall = useRateCall();
  const { toast } = useToast();
  const iconSize = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';

  const handleRate = (rating: number) => {
    const newRating = rating === currentRating ? null : rating;
    rateCall.mutate(
      { callId, rating: newRating },
      {
        onSuccess: () => {
          toast({ title: newRating ? `Avaliada com ${newRating} estrela${newRating > 1 ? 's' : ''}` : 'Avaliacao removida' });
        },
      }
    );
  };

  return (
    <div className="flex items-center gap-1.5">
      {showLabel && <span className="text-xs text-muted-foreground">Avaliar:</span>}
      <div className="flex items-center" onMouseLeave={() => setHovered(0)}>
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = hovered ? star <= hovered : star <= (currentRating || 0);
          return (
            <button
              key={star}
              onClick={() => handleRate(star)}
              onMouseEnter={() => setHovered(star)}
              className="p-0.5 transition-colors"
            >
              <Star
                className={cn(
                  iconSize,
                  'transition-colors',
                  filled ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-400 hover:text-yellow-300'
                )}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
