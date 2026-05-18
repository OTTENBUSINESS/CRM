import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCreateNote, NOTE_TYPES } from "@/hooks/useSalesNotes";
import { Loader2, StickyNote } from "lucide-react";

interface AddNoteModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  dealId?: string;
  defaultType?: string;
}

export function AddNoteModal({
  open,
  onOpenChange,
  leadId,
  dealId,
  defaultType = "note",
}: AddNoteModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const createNote = useCreateNote();

  const [content, setContent] = useState("");
  const [noteType, setNoteType] = useState(defaultType);

  const handleSubmit = async () => {
    if (!content.trim()) {
      toast({
        title: "Conteúdo obrigatório",
        description: "Digite o conteúdo da nota",
        variant: "destructive",
      });
      return;
    }

    try {
      await createNote.mutateAsync({
        leadId,
        dealId,
        content: content.trim(),
        noteType,
        createdBy: teamMember?.id,
      });

      toast({
        title: "Nota adicionada",
        description: "A nota foi registrada com sucesso",
      });

      setContent("");
      setNoteType(defaultType);
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro ao adicionar nota",
        variant: "destructive",
      });
    }
  };

  const handleClose = () => {
    setContent("");
    setNoteType(defaultType);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-amber-500" />
            Adicionar Nota
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Tipo de Nota</Label>
            <Select value={noteType} onValueChange={setNoteType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTE_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    <span className="flex items-center gap-2">
                      <span>{type.icon}</span>
                      <span>{type.label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Conteúdo *</Label>
            <Textarea
              placeholder="Digite sua nota aqui..."
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={8}
              className="min-h-[200px] resize-y"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={createNote.isPending}>
            {createNote.isPending && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            Salvar Nota
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
