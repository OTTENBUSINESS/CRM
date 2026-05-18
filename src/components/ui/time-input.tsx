import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface TimeInputProps {
  value: string;
  onChange: (time: string) => void;
  className?: string;
}

// Generate time slots every 30 minutes
const TIME_SLOTS = Array.from({ length: 24 }, (_, h) =>
  ["00", "30"].map((m) => `${h.toString().padStart(2, "0")}:${m}`)
).flat();

function isValidTime(value: string): boolean {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return false;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return h >= 0 && h <= 23 && m >= 0 && m <= 59;
}

function normalizeTime(value: string): string {
  const match = value.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return value;
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function TimeInput({ value, onChange, className }: TimeInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value || "09:00");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    if (value && value !== inputValue) {
      setInputValue(value);
    }
  }, [value]);

  // Scroll to selected time when dropdown opens
  useEffect(() => {
    if (isOpen && listRef.current && inputValue) {
      const normalized = normalizeTime(inputValue);
      const selectedEl = listRef.current.querySelector(`[data-time="${normalized}"]`) as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "center", behavior: "instant" });
      }
    }
  }, [isOpen]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d:]/g, "");

    // Auto-insert colon after 2 digits if user hasn't typed one
    if (raw.length === 2 && !raw.includes(":")) {
      raw = raw + ":";
    }

    // Limit to 5 chars (HH:MM)
    if (raw.length > 5) raw = raw.slice(0, 5);

    setInputValue(raw);

    if (isValidTime(raw)) {
      onChange(normalizeTime(raw));
    }
  }, [onChange]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      if (isValidTime(inputValue)) {
        const normalized = normalizeTime(inputValue);
        setInputValue(normalized);
        onChange(normalized);
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIsOpen(true);
    }
  }, [inputValue, onChange]);

  const handleInputBlur = useCallback(() => {
    // On blur, normalize the value if valid, otherwise revert
    if (isValidTime(inputValue)) {
      const normalized = normalizeTime(inputValue);
      setInputValue(normalized);
      onChange(normalized);
    } else {
      // Revert to last valid value
      setInputValue(value || "09:00");
    }
  }, [inputValue, value, onChange]);

  const handleSelectTime = useCallback((time: string) => {
    setInputValue(time);
    onChange(time);
    setIsOpen(false);
    inputRef.current?.focus();
  }, [onChange]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex h-9 w-full items-center rounded-md border border-input bg-background text-sm ring-offset-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
        )}
      >
        <Clock className="ml-3 mr-2 h-4 w-4 text-muted-foreground flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          placeholder="HH:MM"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
          onFocus={() => setIsOpen(true)}
          className="flex-1 bg-transparent outline-none placeholder:text-muted-foreground h-full py-2 pr-1"
          maxLength={5}
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setIsOpen(!isOpen)}
          className="px-2 h-full flex items-center text-muted-foreground hover:text-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      {isOpen && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95"
        >
          {TIME_SLOTS.map((time) => {
            const isSelected = normalizeTime(inputValue) === time;
            return (
              <button
                key={time}
                type="button"
                data-time={time}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur before click registers
                  handleSelectTime(time);
                }}
                className={cn(
                  "w-full text-left px-3 py-1.5 text-sm cursor-pointer hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-primary text-primary-foreground font-medium"
                )}
              >
                {time}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
