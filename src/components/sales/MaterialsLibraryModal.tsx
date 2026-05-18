import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSalesMaterials, type SalesMaterial } from "@/hooks/useSalesMaterials";
import {
  Search,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Loader2,
  FolderOpen,
  Send,
  Info,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const typeIcons = {
  image: ImageIcon,
  video: Video,
  document: FileText,
  audio: Music,
};

const typeLabels = {
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  audio: "Áudio",
};

const typeColors = {
  image: "bg-blue-100 text-blue-700",
  video: "bg-purple-100 text-purple-700",
  document: "bg-orange-100 text-orange-700",
  audio: "bg-green-100 text-green-700",
};

interface MaterialsLibraryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectMaterial: (materials: SalesMaterial | SalesMaterial[]) => void;
}

export function MaterialsLibraryModal({
  open,
  onOpenChange,
  onSelectMaterial,
}: MaterialsLibraryModalProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { data: materials = [], isLoading } = useSalesMaterials();

  // Filtrar materiais
  const filteredMaterials = materials.filter((m) => {
    const matchesType = filterType === "all" || m.type === filterType;
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedMaterials = materials.filter(m => selectedIds.has(m.id));

  const handleSend = () => {
    if (selectedMaterials.length === 0) return;
    if (selectedMaterials.length === 1) {
      onSelectMaterial(selectedMaterials[0]);
    } else {
      onSelectMaterial(selectedMaterials);
    }
    onOpenChange(false);
    setSelectedIds(new Set());
    setSearchTerm("");
    setFilterType("all");
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  // Last selected material for preview
  const previewMaterial = selectedMaterials.length > 0 ? selectedMaterials[selectedMaterials.length - 1] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Biblioteca de Materiais
            {selectedIds.size > 0 && (
              <Badge variant="secondary" className="ml-2">
                {selectedIds.size} selecionado{selectedIds.size > 1 ? 's' : ''}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-32 h-9">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="image">Imagens</SelectItem>
              <SelectItem value="video">Vídeos</SelectItem>
              <SelectItem value="document">Documentos</SelectItem>
              <SelectItem value="audio">Áudios</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Lista de materiais */}
        <ScrollArea className="flex-1 -mx-6 px-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium">Nenhum material encontrado</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchTerm || filterType !== "all"
                  ? "Tente ajustar os filtros"
                  : "Adicione materiais em Configurações > Materiais"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4">
              {filteredMaterials.map((material) => {
                const Icon = typeIcons[material.type];
                const isSelected = selectedIds.has(material.id);

                return (
                  <div
                    key={material.id}
                    className={cn(
                      "border rounded-lg overflow-hidden cursor-pointer transition-all hover:shadow-md relative",
                      isSelected && "ring-2 ring-primary border-primary"
                    )}
                    onClick={() => toggleSelect(material.id)}
                  >
                    {/* Checkbox indicator */}
                    {isSelected && (
                      <div className="absolute top-1.5 right-1.5 z-10 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </div>
                    )}

                    {/* Preview */}
                    <div className="aspect-video bg-muted relative">
                      {material.type === 'image' ? (
                        <img
                          src={material.file_url}
                          alt={material.name}
                          className="w-full h-full object-cover"
                        />
                      ) : material.type === 'video' ? (
                        <video
                          src={material.file_url}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon className="h-10 w-10 text-muted-foreground" />
                        </div>
                      )}
                      <Badge className={cn("absolute top-1.5 left-1.5 text-[10px] px-1.5 py-0", typeColors[material.type])}>
                        {typeLabels[material.type]}
                      </Badge>
                    </div>

                    {/* Info */}
                    <div className="p-2">
                      <h4 className="font-medium text-sm truncate">{material.name}</h4>
                      {material.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {material.tags.slice(0, 2).map((tag) => (
                            <Badge key={tag} variant="outline" className="text-[10px] px-1 py-0">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Preview do selecionado + botão enviar */}
        {selectedMaterials.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            {/* Preview: show last selected or summary for multiple */}
            {selectedMaterials.length === 1 && previewMaterial ? (
              <div className="flex items-start gap-3">
                <div className="w-20 h-14 bg-muted rounded overflow-hidden flex-shrink-0">
                  {previewMaterial.type === 'image' ? (
                    <img
                      src={previewMaterial.file_url}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : previewMaterial.type === 'video' ? (
                    <video src={previewMaterial.file_url} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {previewMaterial.type === 'document' ? <FileText className="h-6 w-6" /> : <Music className="h-6 w-6" />}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium">{previewMaterial.name}</h4>
                  {previewMaterial.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{previewMaterial.description}</p>
                  )}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <span>{typeLabels[previewMaterial.type]}</span>
                    <span>•</span>
                    <span>{formatFileSize(previewMaterial.file_size)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedMaterials.map((m) => (
                  <Badge key={m.id} variant="secondary" className="gap-1 text-xs">
                    {typeLabels[m.type] === 'Vídeo' ? '🎬' : typeLabels[m.type] === 'Imagem' ? '🖼' : typeLabels[m.type] === 'Documento' ? '📄' : '🎵'}
                    <span className="truncate max-w-[120px]">{m.name}</span>
                  </Badge>
                ))}
              </div>
            )}

            {selectedMaterials.length === 1 && previewMaterial?.usage_hint && (
              <div className="flex items-start gap-2 p-2 bg-blue-50 rounded-lg text-xs">
                <Info className="h-4 w-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-blue-700">{previewMaterial.usage_hint}</p>
              </div>
            )}

            <Button onClick={handleSend} className="w-full gap-2">
              <Send className="h-4 w-4" />
              Enviar {selectedMaterials.length > 1 ? `${selectedMaterials.length} Materiais` : 'Material'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
