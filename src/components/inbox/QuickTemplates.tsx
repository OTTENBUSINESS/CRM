import { useState } from "react";
import { Zap, Search, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  useResponseTemplates,
  useUseTemplate,
  useCreateTemplate,
  type ResponseTemplate,
} from "@/hooks/useCSInbox";
import { cn } from "@/lib/utils";

interface QuickTemplatesProps {
  onSelectTemplate: (content: string) => void;
}

export function QuickTemplates({ onSelectTemplate }: QuickTemplatesProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: "", content: "", shortcut: "" });

  const { data: templates, isLoading } = useResponseTemplates();
  const useTemplate = useUseTemplate();
  const createTemplate = useCreateTemplate();

  const filteredTemplates = templates?.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.content.toLowerCase().includes(search.toLowerCase()) ||
      t.shortcut?.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = async (template: ResponseTemplate) => {
    onSelectTemplate(template.content);
    await useTemplate.mutateAsync(template.id);
    setOpen(false);
    setSearch("");
  };

  const handleCreate = async () => {
    if (!newTemplate.name || !newTemplate.content) return;
    await createTemplate.mutateAsync({
      name: newTemplate.name,
      content: newTemplate.content,
      shortcut: newTemplate.shortcut || undefined,
    });
    setNewTemplate({ name: "", content: "", shortcut: "" });
    setCreateOpen(false);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" title="Templates rápidos">
            <Zap className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="end" side="top">
          <div className="p-3 border-b">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-medium text-sm">Templates Rápidos</h4>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1"
                onClick={() => setCreateOpen(true)}
              >
                <Plus className="h-3 w-3" />
                Novo
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar template..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8"
              />
            </div>
          </div>

          <ScrollArea className="h-[280px]">
            {isLoading ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Carregando...
              </div>
            ) : filteredTemplates?.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground text-sm">
                Nenhum template encontrado
              </div>
            ) : (
              <div className="p-1">
                {filteredTemplates?.map((template) => (
                  <button
                    key={template.id}
                    className={cn(
                      "w-full text-left p-2 rounded-md hover:bg-muted transition-colors",
                      "group"
                    )}
                    onClick={() => handleSelect(template)}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-medium text-sm">{template.name}</span>
                      {template.shortcut && (
                        <code className="text-xs bg-muted px-1 rounded text-muted-foreground">
                          {template.shortcut}
                        </code>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {template.content}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </PopoverContent>
      </Popover>

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                placeholder="Ex: Saudação"
                value={newTemplate.name}
                onChange={(e) =>
                  setNewTemplate({ ...newTemplate, name: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                placeholder="Digite a mensagem do template..."
                value={newTemplate.content}
                onChange={(e) =>
                  setNewTemplate({ ...newTemplate, content: e.target.value })
                }
                rows={4}
              />
            </div>
            <div className="space-y-2">
              <Label>Atalho (opcional)</Label>
              <Input
                placeholder="Ex: /oi"
                value={newTemplate.shortcut}
                onChange={(e) =>
                  setNewTemplate({ ...newTemplate, shortcut: e.target.value })
                }
              />
              <p className="text-xs text-muted-foreground">
                Defina um atalho para usar rapidamente, ex: /oi
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!newTemplate.name || !newTemplate.content || createTemplate.isPending}
            >
              Criar Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
