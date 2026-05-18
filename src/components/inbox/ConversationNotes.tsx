import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  StickyNote,
  Plus,
  Pin,
  AlertTriangle,
  Flag,
  CalendarClock,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useConversationNotes,
  useCreateNote,
  type ConversationNote,
} from "@/hooks/useCSInbox";
import { cn } from "@/lib/utils";

interface ConversationNotesProps {
  leadId?: string;
  groupId?: string;
  currentUserId?: string;
}

const noteTypeConfig: Record<
  ConversationNote["note_type"],
  { label: string; icon: typeof StickyNote; color: string }
> = {
  general: {
    label: "Geral",
    icon: StickyNote,
    color: "bg-gray-100 text-gray-700",
  },
  warning: {
    label: "Atenção",
    icon: AlertTriangle,
    color: "bg-amber-100 text-amber-700",
  },
  important: {
    label: "Importante",
    icon: Flag,
    color: "bg-red-100 text-red-700",
  },
  followup: {
    label: "Follow-up",
    icon: CalendarClock,
    color: "bg-blue-100 text-blue-700",
  },
};

export function ConversationNotes({
  leadId,
  groupId,
  currentUserId,
}: ConversationNotesProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [noteType, setNoteType] = useState<ConversationNote["note_type"]>("general");

  const { data: notes, isLoading } = useConversationNotes(leadId, groupId);
  const createNote = useCreateNote();

  const handleCreate = async () => {
    if (!newNote.trim()) return;

    await createNote.mutateAsync({
      leadId,
      groupId,
      content: newNote.trim(),
      noteType,
      createdBy: currentUserId,
    });

    setNewNote("");
    setNoteType("general");
    setIsAdding(false);
  };

  if (!leadId && !groupId) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Selecione uma conversa para ver as notas
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <h4 className="font-medium text-sm flex items-center gap-2">
          <StickyNote className="h-4 w-4" />
          Notas Internas
        </h4>
        {!isAdding && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1"
            onClick={() => setIsAdding(true)}
          >
            <Plus className="h-3 w-3" />
            Nova
          </Button>
        )}
      </div>

      {/* Add Note Form */}
      {isAdding && (
        <div className="p-3 border-b bg-muted/30 space-y-2">
          <Textarea
            placeholder="Escreva uma nota interna (só visível para a equipe)..."
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            rows={3}
            className="resize-none"
          />
          <div className="flex items-center justify-between">
            <Select
              value={noteType}
              onValueChange={(v) => setNoteType(v as ConversationNote["note_type"])}
            >
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(noteTypeConfig).map(([key, config]) => (
                  <SelectItem key={key} value={key}>
                    <span className="flex items-center gap-2">
                      <config.icon className="h-3 w-3" />
                      {config.label}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setIsAdding(false);
                  setNewNote("");
                }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleCreate}
                disabled={!newNote.trim() || createNote.isPending}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Notes List */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            Carregando notas...
          </div>
        ) : notes?.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground text-sm">
            <StickyNote className="h-8 w-8 mx-auto mb-2 opacity-50" />
            Nenhuma nota registrada
            <p className="text-xs mt-1">
              Adicione notas para compartilhar contexto com a equipe
            </p>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {notes?.map((note) => {
              const config = noteTypeConfig[note.note_type];
              return (
                <div
                  key={note.id}
                  className={cn(
                    "p-2.5 rounded-lg border text-sm",
                    note.is_pinned && "border-primary/30 bg-primary/5"
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between mb-1.5">
                    <Badge
                      variant="secondary"
                      className={cn("h-5 text-[10px] gap-1", config.color)}
                    >
                      <config.icon className="h-3 w-3" />
                      {config.label}
                    </Badge>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {note.is_pinned && (
                        <Pin className="h-3 w-3 text-primary" />
                      )}
                      <span>
                        {formatDistanceToNow(new Date(note.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <p className="text-sm whitespace-pre-wrap">{note.content}</p>

                  {/* Author */}
                  {note.created_by_name && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <User className="h-3 w-3" />
                      {note.created_by_name}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
