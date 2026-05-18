import { useState, useEffect } from "react";
import { Target, Pencil, Check, X, ChevronDown, ChevronUp, Flame, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface FocusData {
  phrase: string;
  tasks: [string, string, string];
  monthGoal: string;
  collapsed: boolean;
}

const STORAGE_KEY = "focus-banner-data";

const defaultData: FocusData = {
  phrase: "",
  tasks: ["", "", ""],
  monthGoal: "",
  collapsed: false,
};

function load(): FocusData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData;
    const parsed = JSON.parse(raw);
    // Migrar de 2 tarefas para 3
    if (parsed.tasks && parsed.tasks.length === 2) {
      parsed.tasks = [parsed.tasks[0], parsed.tasks[1], ""];
    }
    return { ...defaultData, ...parsed };
  } catch {
    return defaultData;
  }
}

function save(data: FocusData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

// Neon orange palette
const NEON = {
  bg: "from-[#ff6b00]/12 via-[#ff8c00]/10 to-[#ff6b00]/12",
  bgCollapsed: "from-[#ff6b00]/8 via-[#ff8c00]/6 to-[#ff6b00]/8",
  border: "border-[#ff6b00]/30",
  borderCollapsed: "border-[#ff6b00]/20",
  borderDashed: "border-[#ff6b00]/40",
  text: "text-[#ff6b00]",
  textDark: "text-[#e65100]",
  textPhrase: "text-[#ff6b00]",
  btnBg: "bg-[#ff6b00] hover:bg-[#e65100]",
  inputBorder: "border-[#ff6b00]/40 focus-visible:ring-[#ff6b00]/30",
  setupBg: "bg-[#ff6b00]/5 hover:bg-[#ff6b00]/10",
};

export function FocusBanner() {
  const [data, setData] = useState<FocusData>(load);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<FocusData>(data);

  const isEmpty = !data.phrase && !data.tasks[0] && !data.tasks[1] && !data.tasks[2] && !data.monthGoal;

  useEffect(() => {
    save(data);
  }, [data]);

  const startEdit = () => {
    setDraft({ ...data });
    setEditing(true);
  };

  const confirmEdit = () => {
    setData({ ...draft, collapsed: data.collapsed });
    setEditing(false);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const toggleCollapse = () => {
    setData(d => ({ ...d, collapsed: !d.collapsed }));
  };

  // First time - show setup prompt
  if (isEmpty && !editing) {
    return (
      <div
        className={cn(
          "border-b border-dashed px-4 py-2 flex items-center justify-center gap-2 cursor-pointer transition-colors",
          NEON.borderDashed, NEON.setupBg
        )}
        onClick={startEdit}
      >
        <Target className={cn("h-4 w-4", NEON.text)} />
        <span className={cn("text-sm", NEON.textDark)}>Clique para definir sua frase de foco, meta do mês e 3 tarefas macro</span>
      </div>
    );
  }

  // Editing mode
  if (editing) {
    return (
      <div className={cn("border-b bg-gradient-to-r px-4 py-3 space-y-2", NEON.border, NEON.bg)}>
        {/* Frase */}
        <div className="flex items-center gap-2">
          <Flame className={cn("h-4 w-4 shrink-0", NEON.text)} />
          <Input
            value={draft.phrase}
            onChange={e => setDraft(d => ({ ...d, phrase: e.target.value }))}
            placeholder="Sua frase de foco (ex: FOQUE NO 80/20 - O QUE VC FEZ NOS ÚLTIMOS 20 MIN PARA DAR ROI?)"
            className={cn("h-8 text-sm font-semibold bg-white/60", NEON.inputBorder)}
            autoFocus
          />
        </div>
        {/* Meta do mês */}
        <div className="flex items-center gap-2 pl-6">
          <Trophy className={cn("h-3.5 w-3.5 shrink-0", NEON.text)} />
          <span className={cn("text-xs font-medium shrink-0", NEON.textDark)}>Meta:</span>
          <Input
            value={draft.monthGoal}
            onChange={e => setDraft(d => ({ ...d, monthGoal: e.target.value }))}
            placeholder="Meta do mês (ex: Fechar 150k em vendas)"
            className={cn("h-7 text-sm bg-white/60", NEON.inputBorder)}
          />
        </div>
        {/* 3 Tarefas */}
        {[0, 1, 2].map(i => (
          <div key={i} className="flex items-center gap-2 pl-6">
            <span className={cn("text-xs font-medium shrink-0", NEON.textDark)}>Foco {i + 1}:</span>
            <Input
              value={draft.tasks[i]}
              onChange={e => {
                const newTasks = [...draft.tasks] as [string, string, string];
                newTasks[i] = e.target.value;
                setDraft(d => ({ ...d, tasks: newTasks }));
              }}
              placeholder={`Tarefa macro #${i + 1} - largo tudo e foco nisso`}
              className={cn("h-7 text-sm bg-white/60", NEON.inputBorder)}
            />
          </div>
        ))}
        <div className="flex justify-end gap-2 pl-6">
          <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 text-xs">
            <X className="h-3 w-3 mr-1" /> Cancelar
          </Button>
          <Button size="sm" onClick={confirmEdit} className={cn("h-7 text-xs text-white", NEON.btnBg)}>
            <Check className="h-3 w-3 mr-1" /> Salvar
          </Button>
        </div>
      </div>
    );
  }

  // Collapsed
  if (data.collapsed) {
    return (
      <div className={cn("border-b bg-gradient-to-r px-4 py-1 flex items-center justify-between", NEON.borderCollapsed, NEON.bgCollapsed)}>
        <div className="flex items-center gap-2 min-w-0">
          <Flame className={cn("h-3.5 w-3.5 shrink-0", NEON.text)} />
          <span className={cn("text-xs font-black uppercase tracking-wide truncate", NEON.textPhrase)}>
            {data.phrase || "Foco definido"}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={startEdit}>
            <Pencil className={cn("h-3 w-3", NEON.text)} />
          </Button>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={toggleCollapse}>
            <ChevronDown className={cn("h-3 w-3", NEON.text)} />
          </Button>
        </div>
      </div>
    );
  }

  const hasTasks = data.tasks[0] || data.tasks[1] || data.tasks[2];

  // Expanded (default view)
  return (
    <div className={cn("border-b bg-gradient-to-r px-4 py-2", NEON.borderCollapsed, NEON.bg)}>
      {/* Phrase */}
      {data.phrase && (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Flame className={cn("h-4 w-4 shrink-0 animate-pulse", NEON.text)} />
            <span className={cn("text-xs font-black uppercase tracking-wider truncate", NEON.textPhrase)}>
              {data.phrase}
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEdit}>
              <Pencil className={cn("h-3 w-3", NEON.text)} />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleCollapse}>
              <ChevronUp className={cn("h-3 w-3", NEON.text)} />
            </Button>
          </div>
        </div>
      )}

      {/* Meta do mês + Tasks — inline */}
      {(data.monthGoal || hasTasks) && (
        <div className={cn("flex flex-wrap gap-x-6 gap-y-1", data.phrase && "mt-1 pl-6")}>
          {data.monthGoal && (
            <div className="flex items-center gap-1.5">
              <Trophy className={cn("h-3.5 w-3.5 shrink-0", NEON.text)} />
              <span className={cn("text-xs font-bold", NEON.textDark)}>{data.monthGoal}</span>
            </div>
          )}
          {data.tasks.map((task, i) => task ? (
            <div key={i} className="flex items-center gap-1.5">
              <Target className={cn("h-3.5 w-3.5 shrink-0", NEON.text)} />
              <span className="text-xs font-semibold text-foreground">{task}</span>
            </div>
          ) : null)}
        </div>
      )}

      {/* Edit/collapse buttons when no phrase (only tasks/meta) */}
      {!data.phrase && (
        <div className="flex justify-end gap-1 mt-1">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEdit}>
            <Pencil className={cn("h-3 w-3", NEON.text)} />
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={toggleCollapse}>
            <ChevronUp className={cn("h-3 w-3", NEON.text)} />
          </Button>
        </div>
      )}
    </div>
  );
}
