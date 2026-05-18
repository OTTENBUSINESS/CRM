import { useState, useRef, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpdateLeadInfo } from "@/hooks/useSalesLeads";
import { supabase } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";

const PREDEFINED_TAGS = [
  "Evento Presencial",
  "Webinário",
  "Instagram",
  "Indicação",
];

const TAG_COLORS: Record<string, string> = {
  "Evento Presencial": "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-700",
  "Webinário": "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700",
  "Instagram": "bg-pink-100 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-400 dark:border-pink-700",
  "Indicação": "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-700",
};

const AUTO_TAG_CLASS = "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700";
const DEFAULT_TAG_CLASS = "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";

function getTagClass(tag: string) {
  return TAG_COLORS[tag] || DEFAULT_TAG_CLASS;
}

function isNewLead(createdAt?: string | null): boolean {
  if (!createdAt) return false;
  const diff = Date.now() - new Date(createdAt).getTime();
  return diff < 7 * 24 * 60 * 60 * 1000;
}

// Fetch all unique tags used across leads
function useExistingTags() {
  return useQuery({
    queryKey: ["lead-tags-autocomplete"],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("tags")
        .not("tags", "is", null);
      if (!data) return [];
      const set = new Set<string>();
      data.forEach((row: any) => {
        if (Array.isArray(row.tags)) {
          row.tags.forEach((t: string) => set.add(t));
        }
      });
      return Array.from(set).sort();
    },
    staleTime: 60_000,
  });
}

// Display-only tags (for cards)
export function LeadTagsBadges({
  tags,
  createdAt,
  max = 3,
  size = "sm",
}: {
  tags?: string[] | null;
  createdAt?: string | null;
  max?: number;
  size?: "sm" | "xs";
}) {
  const isNew = isNewLead(createdAt);
  const allTags = tags || [];
  const shown = allTags.slice(0, max);
  const extra = allTags.length - max;
  const sizeClass = size === "xs" ? "text-[10px] px-1.5 py-0" : "text-xs px-2 py-0.5";

  if (!allTags.length && !isNew) return null;

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {isNew && (
        <span className={cn("inline-flex items-center rounded-full border font-medium", sizeClass, AUTO_TAG_CLASS)}>
          &lt;7D
        </span>
      )}
      {shown.map((tag) => (
        <span
          key={tag}
          className={cn("inline-flex items-center rounded-full border font-medium truncate max-w-[120px]", sizeClass, getTagClass(tag))}
        >
          {tag}
        </span>
      ))}
      {extra > 0 && (
        <span className={cn("inline-flex items-center rounded-full border font-medium text-muted-foreground", sizeClass, "bg-muted border-transparent")}>
          +{extra}
        </span>
      )}
    </div>
  );
}

// Full editable tags input
export function LeadTagsInput({
  leadId,
  tags: initialTags,
  createdAt,
}: {
  leadId: string;
  tags?: string[] | null;
  createdAt?: string | null;
}) {
  const tags = initialTags || [];
  const isNew = isNewLead(createdAt);
  const [isAdding, setIsAdding] = useState(false);
  const [input, setInput] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const updateLeadInfo = useUpdateLeadInfo();
  const { data: existingTags } = useExistingTags();

  const suggestions = useMemo(() => {
    const all = new Set([...PREDEFINED_TAGS, ...(existingTags || [])]);
    // Remove tags already on this lead
    tags.forEach((t) => all.delete(t));
    if (!input.trim()) return Array.from(all).slice(0, 8);
    const lower = input.toLowerCase();
    return Array.from(all).filter((t) => t.toLowerCase().includes(lower)).slice(0, 8);
  }, [input, tags, existingTags]);

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    setHighlightIdx(-1);
  }, [input]);

  const saveTags = (newTags: string[]) => {
    updateLeadInfo.mutate({ leadId, data: { tags: newTags } as any });
  };

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed || tags.includes(trimmed)) return;
    saveTags([...tags, trimmed]);
    setInput("");
    setHighlightIdx(-1);
  };

  const removeTag = (tag: string) => {
    saveTags(tags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && suggestions[highlightIdx]) {
        addTag(suggestions[highlightIdx]);
      } else if (input.trim()) {
        addTag(input);
      }
    } else if (e.key === "Escape") {
      setIsAdding(false);
      setInput("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, -1));
    }
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {isNew && (
        <span className={cn("inline-flex items-center rounded-full border font-medium text-xs px-2 py-0.5", AUTO_TAG_CLASS)}>
          &lt;7D
        </span>
      )}
      {tags.map((tag) => (
        <span
          key={tag}
          className={cn("inline-flex items-center gap-1 rounded-full border font-medium text-xs px-2 py-0.5 group", getTagClass(tag))}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-500"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {isAdding ? (
        <div className="relative">
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Delay to allow click on suggestion
              setTimeout(() => {
                setIsAdding(false);
                setInput("");
              }, 200);
            }}
            placeholder="Nova tag..."
            className="h-6 w-32 text-xs px-2 rounded-full border border-dashed border-slate-300 bg-transparent outline-none focus:border-blue-400 dark:border-slate-600"
          />
          {(suggestions.length > 0 || input.trim().length > 0) ? (
            <div className="absolute top-7 left-0 z-50 w-48 bg-popover border rounded-lg shadow-lg p-1 max-h-48 overflow-y-auto">
              {/* Opção de criar nova tag quando o texto não existe */}
              {input.trim().length > 0 && !suggestions.some(s => s.toLowerCase() === input.trim().toLowerCase()) && !tags.includes(input.trim()) && (
                <button
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(input.trim());
                  }}
                  className={cn(
                    "w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors font-medium text-blue-600 dark:text-blue-400",
                    highlightIdx === -1 && suggestions.length === 0 && "bg-muted"
                  )}
                >
                  <Plus className="inline h-3 w-3 mr-1.5" />
                  Criar "{input.trim()}"
                </button>
              )}
              {suggestions.map((s, i) => (
                <button
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addTag(s);
                  }}
                  className={cn(
                    "w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted transition-colors",
                    i === highlightIdx && "bg-muted"
                  )}
                >
                  <span className={cn("inline-block w-2 h-2 rounded-full mr-2", TAG_COLORS[s] ? TAG_COLORS[s].split(" ")[0] : "bg-slate-300")} />
                  {s}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded-full border border-dashed border-slate-300 hover:border-slate-400 dark:border-slate-600"
        >
          <Plus className="h-3 w-3" />
          Tag
        </button>
      )}
    </div>
  );
}
