/**
 * AgentAvatar — sigla + cor (paleta IAP).
 */

import { cn } from '@/lib/utils';

const COLOR_GRADIENTS: Record<string, string> = {
  amber:  'from-amber-400 to-amber-600',
  blue:   'from-blue-400 to-blue-600',
  green:  'from-emerald-400 to-emerald-600',
  red:    'from-red-400 to-red-600',
  purple: 'from-purple-400 to-purple-600',
  pink:   'from-pink-400 to-pink-600',
  teal:   'from-teal-400 to-teal-600',
  gray:   'from-gray-400 to-gray-600',
};

const SIZES = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-base',
  xl: 'h-20 w-20 text-xl',
};

export function AgentAvatar({
  name,
  color = 'amber',
  emoji,
  size = 'md',
  className,
}: {
  name: string;
  color?: string;
  emoji?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const gradient = COLOR_GRADIENTS[color] || COLOR_GRADIENTS.amber;
  const initials = emoji || name.slice(0, 2).toUpperCase();
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-xl bg-gradient-to-br text-white font-semibold shadow-md shrink-0',
        gradient,
        SIZES[size],
        className,
      )}
    >
      {initials}
    </div>
  );
}

export const AVATAR_COLORS = Object.keys(COLOR_GRADIENTS) as Array<keyof typeof COLOR_GRADIENTS>;
