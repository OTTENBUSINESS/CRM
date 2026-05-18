import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateBlock } from "@/hooks/useCalendarSettings";
import { Lock, ListTodo } from "lucide-react";

interface CreateBlockPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  anchorRect?: { x: number; y: number };
  defaultStart: Date;
  defaultEnd: Date;
  onCreateTask?: (start: Date) => void;
  children?: React.ReactNode;
}

export function CreateBlockPopover({
  open,
  onOpenChange,
  defaultStart,
  defaultEnd,
  onCreateTask,
  children,
}: CreateBlockPopoverProps) {
  const [title, setTitle] = useState("Bloqueio");
  const [mode, setMode] = useState<"choose" | "block">("choose");
  const createBlock = useCreateBlock();

  const formatTime = (d: Date) =>
    `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const formatDate = (d: Date) => {
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}`;
  };

  const handleCreateBlock = () => {
    createBlock.mutate(
      {
        title,
        block_type: "one_time",
        start_datetime: defaultStart.toISOString(),
        end_datetime: defaultEnd.toISOString(),
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setMode("choose");
          setTitle("Bloqueio");
        },
      }
    );
  };

  return (
    <Popover open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setMode("choose"); setTitle("Bloqueio"); } }}>
      <PopoverTrigger asChild>{children || <span />}</PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="start" side="right">
        {mode === "choose" ? (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-2">
              {formatDate(defaultStart)} {formatTime(defaultStart)} – {formatTime(defaultEnd)}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2"
              onClick={() => setMode("block")}
            >
              <Lock className="h-4 w-4" />
              Bloquear horário
            </Button>
            {onCreateTask && (
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() => {
                  onOpenChange(false);
                  onCreateTask(defaultStart);
                }}
              >
                <ListTodo className="h-4 w-4" />
                Criar tarefa
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Motivo do bloqueio</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Compromisso pessoal, médico..."
                className="h-8 text-sm mt-1"
                autoFocus
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(defaultStart)} {formatTime(defaultStart)} – {formatDate(defaultEnd)} {formatTime(defaultEnd)}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setMode("choose")}>
                Voltar
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={handleCreateBlock}
                disabled={createBlock.isPending}
              >
                {createBlock.isPending ? "Salvando..." : "Criar"}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
