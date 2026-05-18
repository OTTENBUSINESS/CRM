import { cn } from "@/lib/utils";
import { Phone, Video, MessageSquare, Mail, Clock, Building2, Settings2, Calendar, Lock } from "lucide-react";

export type EventCardType = "task" | "block" | "google";

interface EventCardProps {
  title: string;
  subtitle?: string;
  startTime: string;
  endTime?: string;
  type: EventCardType;
  taskType?: string;
  color?: string;
  topPx: number;
  heightPx: number;
  onClick?: () => void;
}

const TASK_ICONS: Record<string, React.ElementType> = {
  call: Phone,
  meeting: Video,
  whatsapp: MessageSquare,
  email: Mail,
  follow_up: Clock,
  onboarding: Building2,
  internal: Settings2,
};

const TASK_STYLES: Record<string, string> = {
  call: "bg-blue-50 dark:bg-blue-950/60 border-l-blue-500 text-blue-900 dark:text-blue-200",
  meeting: "bg-indigo-50 dark:bg-indigo-950/60 border-l-indigo-500 text-indigo-900 dark:text-indigo-200",
  whatsapp: "bg-green-50 dark:bg-green-950/60 border-l-green-500 text-green-900 dark:text-green-200",
  email: "bg-purple-50 dark:bg-purple-950/60 border-l-purple-500 text-purple-900 dark:text-purple-200",
  follow_up: "bg-yellow-50 dark:bg-yellow-950/60 border-l-yellow-500 text-yellow-900 dark:text-yellow-200",
  onboarding: "bg-orange-50 dark:bg-orange-950/60 border-l-orange-500 text-orange-900 dark:text-orange-200",
  internal: "bg-gray-50 dark:bg-gray-900/60 border-l-gray-400 text-gray-900 dark:text-gray-200",
  checkin: "bg-teal-50 dark:bg-teal-950/60 border-l-teal-500 text-teal-900 dark:text-teal-200",
};

export function EventCard({
  title,
  subtitle,
  startTime,
  endTime,
  type,
  taskType,
  topPx,
  heightPx,
  onClick,
}: EventCardProps) {
  const isSmall = heightPx < 36;
  const isTiny = heightPx < 24;

  if (type === "block") {
    return (
      <div
        className="absolute left-1 right-1 rounded border border-slate-200 cursor-pointer overflow-hidden z-10 group"
        style={{
          top: topPx,
          height: Math.max(heightPx, 18),
          background: "repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(148,163,184,0.15) 3px, rgba(148,163,184,0.15) 6px)",
          backgroundColor: "rgb(241 245 249 / 0.9)",
        }}
        onClick={onClick}
      >
        <div className="flex items-center gap-1 px-1.5 py-0.5 h-full">
          <Lock className="h-3 w-3 text-slate-400 shrink-0" />
          {!isTiny && <span className="text-[10px] font-medium text-slate-500 truncate">{title}</span>}
        </div>
      </div>
    );
  }

  if (type === "google") {
    return (
      <div
        className="absolute left-1 right-1 rounded border-l-4 border-l-amber-400 bg-amber-50/90 cursor-pointer overflow-hidden z-10 group hover:bg-amber-100/90 transition-colors"
        style={{ top: topPx, height: Math.max(heightPx, 18) }}
        onClick={onClick}
      >
        <div className="flex items-center gap-1 px-1.5 py-0.5 h-full">
          <Calendar className="h-3 w-3 text-amber-500 shrink-0" />
          {!isTiny && (
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-medium text-amber-900 truncate block">{title}</span>
              {!isSmall && endTime && (
                <span className="text-[9px] text-amber-600">{startTime} – {endTime}</span>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Task event
  const style = TASK_STYLES[taskType || "internal"] || TASK_STYLES.internal;
  const Icon = TASK_ICONS[taskType || "internal"] || Settings2;

  return (
    <div
      className={cn(
        "absolute left-1 right-1 rounded border-l-4 cursor-pointer overflow-hidden z-10 group hover:brightness-95 dark:hover:brightness-125 hover:ring-1 hover:ring-primary/30 transition-all",
        style,
      )}
      style={{ top: topPx, height: Math.max(heightPx, 18) }}
      onClick={onClick}
    >
      <div className="px-1.5 py-0.5 h-full flex flex-col justify-center">
        <div className="flex items-center gap-1">
          <Icon className="h-3 w-3 shrink-0 opacity-70" />
          <span className="text-[10px] font-semibold truncate">{title}</span>
        </div>
        {!isSmall && (
          <div className="text-[9px] opacity-70 truncate">
            {startTime}{endTime ? ` – ${endTime}` : ""}
            {subtitle ? ` · ${subtitle}` : ""}
          </div>
        )}
      </div>
    </div>
  );
}
