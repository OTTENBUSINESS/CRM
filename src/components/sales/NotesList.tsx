import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import {
  SalesNote,
  NOTE_TYPES,
  useLeadNotes,
  useDealNotes,
  useLeadAndDealNotes,
  useDeleteNote,
} from "@/hooks/useSalesNotes";
import { AddNoteModal } from "./AddNoteModal";
import {
  StickyNote,
  Plus,
  MoreVertical,
  Trash2,
  Edit,
  Search,
  Phone,
  AlertTriangle,
  RefreshCw,
  FileText,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotesListProps {
  leadId?: string;
  dealId?: string;
  showAllFromLead?: boolean; // Se true, mostra notas do lead + deals
  maxHeight?: string;
  compact?: boolean;
}

const getNoteTypeInfo = (type: string) => {
  return NOTE_TYPES.find((t) => t.value === type) || NOTE_TYPES[0];
};

const getNoteIcon = (type: string) => {
  switch (type) {
    case "research":
      return <Search className="h-4 w-4" />;
    case "call_summary":
      return <Phone className="h-4 w-4" />;
    case "objection":
      return <AlertTriangle className="h-4 w-4" />;
    case "follow_up":
      return <RefreshCw className="h-4 w-4" />;
    case "meeting_notes":
      return <FileText className="h-4 w-4" />;
    default:
      return <MessageSquare className="h-4 w-4" />;
  }
};

const getNoteColor = (type: string) => {
  switch (type) {
    case "research":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "call_summary":
      return "bg-green-100 text-green-700 border-green-200";
    case "objection":
      return "bg-red-100 text-red-700 border-red-200";
    case "follow_up":
      return "bg-purple-100 text-purple-700 border-purple-200";
    case "meeting_notes":
      return "bg-orange-100 text-orange-700 border-orange-200";
    default:
      return "bg-amber-100 text-amber-700 border-amber-200";
  }
};

export function NotesList({
  leadId,
  dealId,
  showAllFromLead = false,
  maxHeight = "400px",
  compact = false,
}: NotesListProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const deleteNote = useDeleteNote();

  const [isAddNoteOpen, setIsAddNoteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SalesNote | null>(null);

  // Escolher qual hook usar baseado nos props
  const leadNotesQuery = useLeadNotes(showAllFromLead ? undefined : leadId);
  const dealNotesQuery = useDealNotes(dealId);
  const allNotesQuery = useLeadAndDealNotes(showAllFromLead ? leadId : undefined);

  const notes = showAllFromLead
    ? allNotesQuery.data
    : dealId
    ? dealNotesQuery.data
    : leadNotesQuery.data;

  const isLoading = showAllFromLead
    ? allNotesQuery.isLoading
    : dealId
    ? dealNotesQuery.isLoading
    : leadNotesQuery.isLoading;

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteNote.mutateAsync(deleteConfirm.id);
      toast({ title: "Nota excluída" });
      setDeleteConfirm(null);
    } catch (error) {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  };

  const getInitials = (name: string) =>
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??";

  if (compact) {
    return (
      <>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <StickyNote className="h-4 w-4 text-amber-500" />
              Notas ({notes?.length || 0})
            </h4>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setIsAddNoteOpen(true)}
            >
              <Plus className="h-3 w-3 mr-1" />
              Nota
            </Button>
          </div>

          {isLoading ? (
            <div className="text-sm text-muted-foreground py-4 text-center">
              Carregando...
            </div>
          ) : notes && notes.length > 0 ? (
            <div className="space-y-2">
              {notes.slice(0, 3).map((note) => {
                const typeInfo = getNoteTypeInfo(note.note_type);
                return (
                  <div
                    key={note.id}
                    className={cn(
                      "p-2 rounded-lg border text-sm",
                      getNoteColor(note.note_type)
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {getNoteIcon(note.note_type)}
                      <div className="flex-1 min-w-0">
                        <p className="line-clamp-2">{note.content}</p>
                        <p className="text-xs opacity-70 mt-1">
                          {format(new Date(note.created_at), "dd/MM HH:mm", {
                            locale: ptBR,
                          })}
                          {note.creator?.name && ` • ${note.creator.name}`}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {notes.length > 3 && (
                <p className="text-xs text-muted-foreground text-center">
                  +{notes.length - 3} notas
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2 text-center">
              Nenhuma nota
            </p>
          )}
        </div>

        <AddNoteModal
          open={isAddNoteOpen}
          onOpenChange={setIsAddNoteOpen}
          leadId={leadId}
          dealId={dealId}
        />
      </>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-amber-500" />
              Notas & Interações
            </CardTitle>
            <Button size="sm" onClick={() => setIsAddNoteOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar Nota
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Carregando notas...
            </div>
          ) : notes && notes.length > 0 ? (
            <ScrollArea style={{ maxHeight }}>
              <div className="space-y-3 pr-4">
                {notes.map((note) => {
                  const typeInfo = getNoteTypeInfo(note.note_type);
                  const isOwner = note.created_by === teamMember?.id;

                  return (
                    <div
                      key={note.id}
                      className={cn(
                        "p-3 rounded-lg border",
                        getNoteColor(note.note_type)
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-3 flex-1">
                          <div className="mt-0.5">{getNoteIcon(note.note_type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant="outline"
                                className={cn("text-xs", getNoteColor(note.note_type))}
                              >
                                {typeInfo.icon} {typeInfo.label}
                              </Badge>
                              {note.deal_id && !note.lead_id && (
                                <Badge variant="secondary" className="text-xs">
                                  Deal
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm whitespace-pre-wrap">
                              {note.content}
                            </p>
                            <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                              {note.creator && (
                                <div className="flex items-center gap-1">
                                  <Avatar className="h-4 w-4">
                                    <AvatarFallback className="text-[8px]">
                                      {getInitials(note.creator.name)}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span>{note.creator.name}</span>
                                </div>
                              )}
                              <span>•</span>
                              <span>
                                {format(
                                  new Date(note.created_at),
                                  "dd 'de' MMM 'às' HH:mm",
                                  { locale: ptBR }
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {isOwner && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => setDeleteConfirm(note)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Excluir
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="text-center py-8">
              <StickyNote className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">
                Nenhuma nota registrada
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => setIsAddNoteOpen(true)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Adicionar primeira nota
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <AddNoteModal
        open={isAddNoteOpen}
        onOpenChange={setIsAddNoteOpen}
        leadId={leadId}
        dealId={dealId}
      />

      <AlertDialog
        open={!!deleteConfirm}
        onOpenChange={() => setDeleteConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir nota?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
