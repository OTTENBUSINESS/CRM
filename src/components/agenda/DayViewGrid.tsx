import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { format, isSameDay, isToday, differenceInMinutes } from "date-fns";
import { cn } from "@/lib/utils";
import { EventCard } from "./EventCard";
import { CreateBlockPopover } from "./CreateBlockPopover";
import type { WorkingHours, CalendarBlock, CalendarEvent } from "@/hooks/useCalendarSettings";
import { expandRecurringBlocks, isWithinWorkingHours } from "@/hooks/useCalendarSettings";
import type { Task } from "@/hooks/useTasks";

const QUICK_TASK_CONFIG: Record<string, { dotColor: string; label: string }> = {
  whatsapp: { dotColor: "bg-green-500", label: "WhatsApp" },
  email: { dotColor: "bg-purple-500", label: "Email" },
  follow_up: { dotColor: "bg-yellow-500", label: "Follow-up" },
  internal: { dotColor: "bg-gray-400", label: "Interna" },
  checkin: { dotColor: "bg-teal-500", label: "Check-in" },
};

interface DayViewGridProps {
  selectedDate: Date;
  tasks: Task[];
  quickTasks?: Task[];
  blocks: CalendarBlock[];
  googleEvents: CalendarEvent[];
  workingHours: WorkingHours;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (start: Date) => void;
}

const HOUR_HEIGHT = 60;
const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function timeToTop(date: Date): number {
  return (date.getHours() - START_HOUR) * HOUR_HEIGHT + (date.getMinutes() / 60) * HOUR_HEIGHT;
}

function durationToPx(start: Date, end: Date): number {
  return (differenceInMinutes(end, start) / 60) * HOUR_HEIGHT;
}

export function DayViewGrid({
  selectedDate,
  tasks,
  quickTasks = [],
  blocks,
  googleEvents,
  workingHours,
  onTaskClick,
  onCreateTask,
}: DayViewGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<{
    open: boolean;
    startDate: Date;
    endDate: Date;
  }>({ open: false, startDate: new Date(), endDate: new Date() });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT - 20;
    }
  }, []);

  const dayTasks = useMemo(
    () => tasks.filter(t => t.scheduled_at && isSameDay(new Date(t.scheduled_at), selectedDate)),
    [tasks, selectedDate.toISOString()]
  );

  const dayOneTimeBlocks = useMemo(
    () => blocks.filter(b => {
      if (b.block_type !== "one_time" || !b.start_datetime || !b.end_datetime) return false;
      const s = new Date(b.start_datetime);
      const e = new Date(b.end_datetime);
      return isSameDay(s, selectedDate) || isSameDay(e, selectedDate) || (s < selectedDate && e > selectedDate);
    }),
    [blocks, selectedDate.toISOString()]
  );

  const dayRecurringBlocks = useMemo(
    () => expandRecurringBlocks(blocks.filter(b => b.block_type === "recurring"), selectedDate, selectedDate),
    [blocks, selectedDate.toISOString()]
  );

  const dayGoogleEvents = useMemo(
    () => googleEvents.filter(e => isSameDay(new Date(e.start_datetime), selectedDate)),
    [googleEvents, selectedDate.toISOString()]
  );

  const handleSlotClick = useCallback((hour: number, quarter: number) => {
    const start = new Date(selectedDate);
    start.setHours(hour, quarter * 15, 0, 0);
    const end = new Date(start);
    end.setHours(hour + 1, quarter * 15, 0, 0);
    setPopoverState({ open: true, startDate: start, endDate: end });
  }, [selectedDate]);

  const now = new Date();
  const nowTop = timeToTop(now);
  const showNowLine = isToday(selectedDate) && nowTop >= 0 && nowTop <= TOTAL_HOURS * HOUR_HEIGHT;

  const dayQuickTasks = useMemo(
    () => quickTasks.filter(t => t.scheduled_at && isSameDay(new Date(t.scheduled_at), selectedDate)),
    [quickTasks, selectedDate.toISOString()]
  );

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background overflow-hidden">
      {/* Quick tasks chips */}
      {dayQuickTasks.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 py-1.5 border-b bg-muted/10">
          {dayQuickTasks.map(task => {
            const cfg = QUICK_TASK_CONFIG[task.task_type] || QUICK_TASK_CONFIG.internal;
            const time = task.scheduled_at ? format(new Date(task.scheduled_at), "HH:mm") : "";
            return (
              <button
                key={task.id}
                onClick={() => onTaskClick?.(task)}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] leading-tight",
                  "bg-background border border-border/60 hover:bg-accent transition-colors cursor-pointer",
                  task.completed && "opacity-50 line-through",
                )}
                title={`${cfg.label}: ${task.name} (${time})`}
              >
                <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotColor)} />
                <span className="text-muted-foreground font-mono">{time}</span>
                <span className="truncate max-w-[200px]">{task.name}</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div className="flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Time labels */}
          <div className="w-14 shrink-0 border-r relative">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => (
              <div
                key={i}
                className="absolute right-2 text-[10px] text-muted-foreground"
                style={{ top: i * HOUR_HEIGHT - 6 }}
              >
                {String(START_HOUR + i).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {/* Day column */}
          <div className="flex-1 relative">
            {Array.from({ length: TOTAL_HOURS }, (_, i) => {
              const hour = START_HOUR + i;
              const inWH = isWithinWorkingHours(selectedDate.getDay(), hour * 60, workingHours);
              return (
                <div
                  key={i}
                  className={cn("absolute left-0 right-0 border-t border-border/40", !inWH && "bg-gray-50/60")}
                  style={{
                    top: i * HOUR_HEIGHT,
                    height: HOUR_HEIGHT,
                    ...(!inWH ? { backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 5px)" } : {}),
                  }}
                >
                  {[0, 1, 2, 3].map(q => (
                    <div
                      key={q}
                      className="absolute left-0 right-0 hover:bg-primary/5 transition-colors cursor-pointer"
                      style={{ top: q * (HOUR_HEIGHT / 4), height: HOUR_HEIGHT / 4 }}
                      onClick={() => handleSlotClick(hour, q)}
                    />
                  ))}
                  <div className="absolute left-0 right-0 border-t border-dashed border-border/20" style={{ top: HOUR_HEIGHT / 2 }} />
                </div>
              );
            })}

            {/* Tasks */}
            {dayTasks.map(task => {
              const start = new Date(task.scheduled_at!);
              const end = task.end_datetime ? new Date(task.end_datetime) : new Date(start.getTime() + 3600000);
              const top = timeToTop(start);
              const height = durationToPx(start, end);
              if (top < 0 || top > TOTAL_HOURS * HOUR_HEIGHT) return null;
              return (
                <EventCard
                  key={task.id}
                  title={task.name}
                  subtitle={task.lead?.name || task.organization?.name || undefined}
                  startTime={format(start, "HH:mm")}
                  endTime={format(end, "HH:mm")}
                  type="task"
                  taskType={task.task_type}
                  topPx={top}
                  heightPx={height}
                  onClick={() => onTaskClick?.(task)}
                />
              );
            })}

            {/* One-time blocks */}
            {dayOneTimeBlocks.map(block => {
              const s = new Date(block.start_datetime!);
              const e = new Date(block.end_datetime!);
              const dayStart = new Date(selectedDate); dayStart.setHours(START_HOUR, 0, 0, 0);
              const dayEnd = new Date(selectedDate); dayEnd.setHours(END_HOUR, 0, 0, 0);
              const cs = s < dayStart ? dayStart : s;
              const ce = e > dayEnd ? dayEnd : e;
              return (
                <EventCard
                  key={block.id}
                  title={block.title}
                  startTime={format(cs, "HH:mm")}
                  endTime={format(ce, "HH:mm")}
                  type="block"
                  topPx={timeToTop(cs)}
                  heightPx={durationToPx(cs, ce)}
                />
              );
            })}

            {/* Recurring blocks */}
            {dayRecurringBlocks.map((block, idx) => (
              <EventCard
                key={`rec-${block.blockId}-${idx}`}
                title={block.title}
                startTime={format(block.start, "HH:mm")}
                endTime={format(block.end, "HH:mm")}
                type="block"
                topPx={timeToTop(block.start)}
                heightPx={durationToPx(block.start, block.end)}
              />
            ))}

            {/* Google events */}
            {dayGoogleEvents.map(evt => {
              const s = new Date(evt.start_datetime);
              const e = new Date(evt.end_datetime);
              const top = timeToTop(s);
              const height = durationToPx(s, e);
              if (top < 0 || top > TOTAL_HOURS * HOUR_HEIGHT) return null;
              return (
                <EventCard
                  key={`g-${evt.id}`}
                  title={evt.title}
                  startTime={format(s, "HH:mm")}
                  endTime={format(e, "HH:mm")}
                  type="google"
                  topPx={top}
                  heightPx={height}
                  onClick={() => evt.html_link && window.open(evt.html_link, "_blank")}
                />
              );
            })}

            {/* Current time line */}
            {showNowLine && (
              <div className="absolute left-0 right-0 z-30 pointer-events-none" style={{ top: nowTop }}>
                <div className="flex items-center">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
                  <div className="flex-1 h-[2px] bg-red-500" />
                </div>
              </div>
            )}
          </div>
        </div>

        {popoverState.open && (
          <div className="absolute" style={{ top: 0, left: 0, width: 0, height: 0 }}>
            <CreateBlockPopover
              open={popoverState.open}
              onOpenChange={(o) => setPopoverState(prev => ({ ...prev, open: o }))}
              defaultStart={popoverState.startDate}
              defaultEnd={popoverState.endDate}
              onCreateTask={onCreateTask}
            >
              <span />
            </CreateBlockPopover>
          </div>
        )}
      </div>
    </div>
  );
}
