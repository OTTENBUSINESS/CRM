import { useMemo, useRef, useEffect, useState, useCallback } from "react";
import { format, startOfWeek, addDays, isSameDay, isToday, differenceInMinutes } from "date-fns";
import { ptBR } from "date-fns/locale";
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

interface WeekViewGridProps {
  selectedDate: Date;
  tasks: Task[];
  quickTasks?: Task[];
  blocks: CalendarBlock[];
  googleEvents: CalendarEvent[];
  workingHours: WorkingHours;
  onTaskClick?: (task: Task) => void;
  onCreateTask?: (start: Date) => void;
}

const HOUR_HEIGHT = 60; // px per hour
const START_HOUR = 6;
const END_HOUR = 22;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function timeToTop(date: Date): number {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h - START_HOUR) * HOUR_HEIGHT + (m / 60) * HOUR_HEIGHT;
}

function durationToPx(startDate: Date, endDate: Date): number {
  const mins = differenceInMinutes(endDate, startDate);
  return (mins / 60) * HOUR_HEIGHT;
}

export function WeekViewGrid({
  selectedDate,
  tasks,
  quickTasks = [],
  blocks,
  googleEvents,
  workingHours,
  onTaskClick,
  onCreateTask,
}: WeekViewGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [popoverState, setPopoverState] = useState<{
    open: boolean;
    dayIndex: number;
    startDate: Date;
    endDate: Date;
  }>({ open: false, dayIndex: 0, startDate: new Date(), endDate: new Date() });

  const weekStart = startOfWeek(selectedDate);
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart.toISOString()]);

  // Scroll to ~8am on mount
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = (8 - START_HOUR) * HOUR_HEIGHT - 20;
    }
  }, []);

  // Expand recurring blocks for this week
  const expandedBlocks = useMemo(
    () => expandRecurringBlocks(blocks.filter(b => b.block_type === "recurring"), weekDays[0], weekDays[6]),
    [blocks, weekDays[0].toISOString()]
  );

  const oneTimeBlocks = useMemo(
    () => blocks.filter(b => b.block_type === "one_time" && b.start_datetime && b.end_datetime),
    [blocks]
  );

  const handleSlotClick = useCallback((dayIndex: number, hour: number, quarter: number) => {
    const day = weekDays[dayIndex];
    const startDate = new Date(day);
    startDate.setHours(hour, quarter * 15, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(hour + 1, quarter * 15, 0, 0);
    setPopoverState({ open: true, dayIndex, startDate, endDate });
  }, [weekDays]);

  // Current time line
  const now = new Date();
  const nowTop = timeToTop(now);
  const showNowLine = nowTop >= 0 && nowTop <= TOTAL_HOURS * HOUR_HEIGHT;

  return (
    <div className="flex flex-col h-full border rounded-lg bg-background overflow-hidden">
      {/* Header with day names */}
      <div className="flex border-b bg-muted/30 sticky top-0 z-20">
        <div className="w-14 shrink-0 border-r" />
        {weekDays.map((day, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 text-center py-2 border-r last:border-r-0",
              isToday(day) && "bg-primary/5",
            )}
          >
            <div className="text-[10px] uppercase text-muted-foreground font-medium">
              {format(day, "EEE", { locale: ptBR })}
            </div>
            <div
              className={cn(
                "text-lg font-semibold leading-tight",
                isToday(day) && "bg-primary text-primary-foreground rounded-full w-8 h-8 flex items-center justify-center mx-auto",
                isSameDay(day, selectedDate) && !isToday(day) && "text-primary",
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* Quick tasks chips row */}
      {quickTasks.length > 0 && (
        <div className="flex border-b bg-muted/10">
          <div className="w-14 shrink-0 border-r" />
          {weekDays.map((day, i) => {
            const dayQuickTasks = quickTasks.filter(t => {
              const d = t.scheduled_at ? new Date(t.scheduled_at) : null;
              return d && isSameDay(d, day);
            });
            if (dayQuickTasks.length === 0) return <div key={i} className="flex-1 border-r last:border-r-0 py-1 px-0.5" />;
            return (
              <div key={i} className="flex-1 border-r last:border-r-0 py-1 px-0.5 flex flex-wrap gap-0.5">
                {dayQuickTasks.map(task => {
                  const cfg = QUICK_TASK_CONFIG[task.task_type] || QUICK_TASK_CONFIG.internal;
                  const time = task.scheduled_at ? format(new Date(task.scheduled_at), "HH:mm") : "";
                  return (
                    <button
                      key={task.id}
                      onClick={() => onTaskClick?.(task)}
                      className={cn(
                        "flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] leading-tight",
                        "bg-background border border-border/60 hover:bg-accent transition-colors cursor-pointer",
                        "max-w-full truncate",
                        task.completed && "opacity-50 line-through",
                      )}
                      title={`${cfg.label}: ${task.name} (${time})`}
                    >
                      <div className={cn("w-1.5 h-1.5 rounded-full shrink-0", cfg.dotColor)} />
                      <span className="text-muted-foreground font-mono">{time}</span>
                      <span className="truncate">{task.name}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Scrollable time grid */}
      <div ref={scrollRef} className="flex-1 overflow-auto relative">
        <div className="flex" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {/* Time labels column */}
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

          {/* Day columns */}
          {weekDays.map((day, dayIndex) => {
            const dayTasks = tasks.filter(t => {
              const d = t.scheduled_at ? new Date(t.scheduled_at) : null;
              return d && isSameDay(d, day);
            });

            const dayOneTimeBlocks = oneTimeBlocks.filter(b => {
              const s = new Date(b.start_datetime!);
              const e = new Date(b.end_datetime!);
              return isSameDay(s, day) || isSameDay(e, day) || (s < day && e > day);
            });

            const dayRecurringBlocks = expandedBlocks.filter(b => isSameDay(b.start, day));

            const dayGoogleEvents = googleEvents.filter(e => {
              const s = new Date(e.start_datetime);
              return isSameDay(s, day);
            });

            return (
              <div key={dayIndex} className={cn("flex-1 border-r last:border-r-0 relative", isToday(day) && "bg-primary/[0.02]")}>
                {/* Hour lines + working hours background */}
                {Array.from({ length: TOTAL_HOURS }, (_, i) => {
                  const hour = START_HOUR + i;
                  const hourMin = hour * 60;
                  const inWorkingHours = isWithinWorkingHours(day.getDay(), hourMin, workingHours);
                  return (
                    <div
                      key={i}
                      className={cn(
                        "absolute left-0 right-0 border-t border-border/40",
                        !inWorkingHours && "bg-gray-50/60",
                      )}
                      style={{
                        top: i * HOUR_HEIGHT,
                        height: HOUR_HEIGHT,
                        ...((!inWorkingHours) ? {
                          backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(0,0,0,0.03) 4px, rgba(0,0,0,0.03) 5px)",
                        } : {}),
                      }}
                    >
                      {/* 4 clickable quarter-hour slots */}
                      {[0, 1, 2, 3].map(q => (
                        <div
                          key={q}
                          className="absolute left-0 right-0 hover:bg-primary/5 transition-colors cursor-pointer"
                          style={{ top: q * (HOUR_HEIGHT / 4), height: HOUR_HEIGHT / 4 }}
                          onClick={() => handleSlotClick(dayIndex, hour, q)}
                        />
                      ))}
                      {/* Half-hour dashed line */}
                      <div className="absolute left-0 right-0 border-t border-dashed border-border/20" style={{ top: HOUR_HEIGHT / 2 }} />
                    </div>
                  );
                })}

                {/* Task events */}
                {dayTasks.map(task => {
                  const start = new Date(task.scheduled_at!);
                  const end = task.end_datetime
                    ? new Date(task.end_datetime)
                    : new Date(start.getTime() + 60 * 60 * 1000);
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
                  // Clamp to this day
                  const dayStart = new Date(day); dayStart.setHours(START_HOUR, 0, 0, 0);
                  const dayEnd = new Date(day); dayEnd.setHours(END_HOUR, 0, 0, 0);
                  const clampedStart = s < dayStart ? dayStart : s;
                  const clampedEnd = e > dayEnd ? dayEnd : e;
                  const top = timeToTop(clampedStart);
                  const height = durationToPx(clampedStart, clampedEnd);
                  return (
                    <EventCard
                      key={block.id}
                      title={block.title}
                      startTime={format(clampedStart, "HH:mm")}
                      endTime={format(clampedEnd, "HH:mm")}
                      type="block"
                      topPx={top}
                      heightPx={height}
                    />
                  );
                })}

                {/* Recurring blocks */}
                {dayRecurringBlocks.map((block, idx) => {
                  const top = timeToTop(block.start);
                  const height = durationToPx(block.start, block.end);
                  return (
                    <EventCard
                      key={`rec-${block.blockId}-${idx}`}
                      title={block.title}
                      startTime={format(block.start, "HH:mm")}
                      endTime={format(block.end, "HH:mm")}
                      type="block"
                      topPx={top}
                      heightPx={height}
                    />
                  );
                })}

                {/* Google Calendar events */}
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
                      onClick={() => {
                        if (evt.html_link) window.open(evt.html_link, "_blank");
                      }}
                    />
                  );
                })}

                {/* Current time line */}
                {isToday(day) && showNowLine && (
                  <div
                    className="absolute left-0 right-0 z-30 pointer-events-none"
                    style={{ top: nowTop }}
                  >
                    <div className="flex items-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 shrink-0" />
                      <div className="flex-1 h-[2px] bg-red-500" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Popover for creating block/task */}
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
