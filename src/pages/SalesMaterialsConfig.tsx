import { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  useSalesMaterials,
  useCreateSalesMaterial,
  useUpdateSalesMaterial,
  useDeleteSalesMaterial,
  useUploadMaterialFile,
  type SalesMaterial,
} from "@/hooks/useSalesMaterials";
import {
  Plus,
  Upload,
  Image as ImageIcon,
  Video,
  FileText,
  Music,
  Trash2,
  Edit,
  Eye,
  X,
  Loader2,
  FolderOpen,
  Search,
  Tag,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Bot } from "lucide-react";
import { cn } from "@/lib/utils";

const AI_TAG = 'agente-ia';

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

// Componente exportável para usar como aba nas configurações
export function MaterialsTab() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SalesMaterial | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<SalesMaterial | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "image" as 'image' | 'video' | 'document' | 'audio',
    file_url: "",
    thumbnail_url: "",
    tags: [] as string[],
    usage_hint: "",
    file_size: 0,
    mime_type: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: materials = [], isLoading } = useSalesMaterials();
  const createMaterial = useCreateSalesMaterial();
  const updateMaterial = useUpdateSalesMaterial();
  const deleteMaterial = useDeleteSalesMaterial();
  const uploadFile = useUploadMaterialFile();

  // Filtrar materiais
  const filteredMaterials = materials.filter((m) => {
    const matchesType = filterType === "all" || m.type === filterType;
    const matchesSearch = 
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      type: "image",
      file_url: "",
      thumbnail_url: "",
      tags: [],
      usage_hint: "",
      file_size: 0,
      mime_type: "",
    });
    setTagInput("");
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const processFile = (file: File) => {
    setSelectedFile(file);

    let type: 'image' | 'video' | 'document' | 'audio' = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    setFormData(prev => ({
      ...prev,
      type,
      mime_type: file.type,
      file_size: file.size,
      name: prev.name || file.name.split('.')[0],
    }));

    if (type === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    } else if (type === 'video') {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const handleCreate = async () => {
    if (!selectedFile) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    if (!formData.name.trim()) {
      toast({ title: "Digite um nome", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Upload do arquivo
      const uploadResult = await uploadFile.mutateAsync({ 
        file: selectedFile,
        folder: formData.type + 's',
      });

      // Criar material
      await createMaterial.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        file_url: uploadResult.url,
        file_size: uploadResult.size,
        mime_type: uploadResult.mimeType,
        tags: formData.tags,
        usage_hint: formData.usage_hint || undefined,
      });

      toast({ title: "Material criado com sucesso!" });
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Erro ao criar material:', error);
      toast({ 
        title: "Erro ao criar material", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: SalesMaterial) => {
    setSelectedMaterial(material);
    setFormData({
      name: material.name,
      description: material.description || "",
      type: material.type,
      file_url: material.file_url,
      thumbnail_url: material.thumbnail_url || "",
      tags: material.tags || [],
      usage_hint: material.usage_hint || "",
      file_size: material.file_size || 0,
      mime_type: material.mime_type || "",
    });
    setPreviewUrl(material.file_url);
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedMaterial) return;

    try {
      await updateMaterial.mutateAsync({
        id: selectedMaterial.id,
        name: formData.name,
        description: formData.description || null,
        tags: formData.tags,
        usage_hint: formData.usage_hint || null,
      });

      toast({ title: "Material atualizado!" });
      setIsEditOpen(false);
      setSelectedMaterial(null);
      resetForm();
    } catch (error: any) {
      toast({ 
        title: "Erro ao atualizar", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteMaterial.mutateAsync(deleteConfirm.id);
      toast({ title: "Material removido!" });
      setDeleteConfirm(null);
    } catch (error: any) {
      toast({ 
        title: "Erro ao remover", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const handlePreview = (material: SalesMaterial) => {
    setSelectedMaterial(material);
    setIsPreviewOpen(true);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <FolderOpen className="h-6 w-6 text-primary" />
              Materiais de Vendas
            </h1>
            <p className="text-muted-foreground">
              Biblioteca de mídia para envio rápido no WhatsApp
            </p>
          </div>
          <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Material
          </Button>
        </div>

        {/* Filtros */}
        <div className="flex gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, descrição ou tag..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
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
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredMaterials.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="font-medium text-lg">Nenhum material encontrado</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {searchTerm || filterType !== "all" 
                  ? "Tente ajustar os filtros"
                  : "Clique em 'Novo Material' para adicionar"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredMaterials.map((material) => {
              const Icon = typeIcons[material.type];
              return (
                <Card key={material.id} className="overflow-hidden hover:shadow-md transition-shadow">
                  {/* Preview */}
                  <div 
                    className="aspect-video bg-muted relative cursor-pointer group"
                    onClick={() => handlePreview(material)}
                  >
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
                        <Icon className="h-16 w-16 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Eye className="h-8 w-8 text-white" />
                    </div>
                    <Badge className={cn("absolute top-2 left-2", typeColors[material.type])}>
                      {typeLabels[material.type]}
                    </Badge>
                  </div>

                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{material.name}</h3>
                        {material.description && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {material.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {material.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {material.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="outline" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {material.tags.length > 3 && (
                          <Badge variant="outline" className="text-xs">
                            +{material.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {formatFileSize(material.file_size)}
                      </span>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7"
                          onClick={() => handleEdit(material)}
                        >
                          <Edit className="h-3.5 w-3.5" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-7 w-7 text-red-500 hover:text-red-600"
                          onClick={() => setDeleteConfirm(material)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Modal de criação */}
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Novo Material
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Upload */}
              <div>
                <Label>Arquivo</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleFileSelect}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  className="hidden"
                />
                {!selectedFile ? (
                  <div
                    className={`mt-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                  >
                    <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <p className="text-sm text-muted-foreground">
                      {isDragging ? 'Solte o arquivo aqui' : 'Clique para selecionar ou arraste o arquivo'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Imagens, vídeos, áudios ou documentos
                    </p>
                  </div>
                ) : (
                  <div className="mt-1 border rounded-lg p-3 flex items-center gap-3">
                    {previewUrl && formData.type === 'image' && (
                      <img src={previewUrl} alt="" className="h-16 w-16 object-cover rounded" />
                    )}
                    {previewUrl && formData.type === 'video' && (
                      <video src={previewUrl} className="h-16 w-16 object-cover rounded" />
                    )}
                    {(formData.type === 'document' || formData.type === 'audio') && (
                      <div className="h-16 w-16 bg-muted rounded flex items-center justify-center">
                        {formData.type === 'document' ? <FileText className="h-8 w-8" /> : <Music className="h-8 w-8" />}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(selectedFile.size)} • {typeLabels[formData.type]}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon"
                      onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              {/* Nome */}
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ex: Apresentação Comercial"
                />
              </div>

              {/* Descrição */}
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Breve descrição do material..."
                  rows={2}
                />
              </div>

              {/* Quando usar */}
              <div>
                <Label>Quando usar</Label>
                <Textarea
                  value={formData.usage_hint}
                  onChange={(e) => setFormData(prev => ({ ...prev, usage_hint: e.target.value }))}
                  placeholder="Ex: Enviar após primeira conversa para apresentar a empresa..."
                  rows={2}
                />
              </div>

              {/* Tags */}
              <div>
                <Label>Tags</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Digite uma tag..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    <Tag className="h-4 w-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreate} disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Criar Material"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de edição */}
        <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5" />
                Editar Material
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              {/* Preview */}
              {previewUrl && (
                <div className="border rounded-lg overflow-hidden">
                  {formData.type === 'image' ? (
                    <img src={previewUrl} alt="" className="w-full max-h-48 object-contain" />
                  ) : formData.type === 'video' ? (
                    <video src={previewUrl} controls className="w-full max-h-48" />
                  ) : null}
                </div>
              )}

              {/* Nome */}
              <div>
                <Label>Nome *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                />
              </div>

              {/* Descrição */}
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Quando usar */}
              <div>
                <Label>Quando usar</Label>
                <Textarea
                  value={formData.usage_hint}
                  onChange={(e) => setFormData(prev => ({ ...prev, usage_hint: e.target.value }))}
                  rows={2}
                />
              </div>

              {/* Tags */}
              <div>
                <Label>Tags</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Digite uma tag..."
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                  />
                  <Button type="button" variant="outline" onClick={handleAddTag}>
                    <Tag className="h-4 w-4" />
                  </Button>
                </div>
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {formData.tags.map((tag) => (
                      <Badge key={tag} variant="secondary" className="gap-1">
                        {tag}
                        <X 
                          className="h-3 w-3 cursor-pointer" 
                          onClick={() => handleRemoveTag(tag)}
                        />
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleUpdate} disabled={updateMaterial.isPending}>
                {updateMaterial.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Modal de preview */}
        <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>{selectedMaterial?.name}</DialogTitle>
            </DialogHeader>

            {selectedMaterial && (
              <div className="space-y-4">
                {/* Preview */}
                <div className="border rounded-lg overflow-hidden bg-muted">
                  {selectedMaterial.type === 'image' ? (
                    <img 
                      src={selectedMaterial.file_url} 
                      alt={selectedMaterial.name}
                      className="w-full max-h-[400px] object-contain"
                    />
                  ) : selectedMaterial.type === 'video' ? (
                    <video 
                      src={selectedMaterial.file_url}
                      controls
                      className="w-full max-h-[400px]"
                    />
                  ) : selectedMaterial.type === 'audio' ? (
                    <div className="p-8 flex flex-col items-center">
                      <Music className="h-16 w-16 text-muted-foreground mb-4" />
                      <audio src={selectedMaterial.file_url} controls className="w-full" />
                    </div>
                  ) : (
                    <div className="p-8 flex flex-col items-center">
                      <FileText className="h-16 w-16 text-muted-foreground mb-4" />
                      <a 
                        href={selectedMaterial.file_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        Abrir documento
                      </a>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="space-y-2">
                  {selectedMaterial.description && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Descrição</Label>
                      <p className="text-sm">{selectedMaterial.description}</p>
                    </div>
                  )}
                  {selectedMaterial.usage_hint && (
                    <div>
                      <Label className="text-xs text-muted-foreground">Quando usar</Label>
                      <p className="text-sm">{selectedMaterial.usage_hint}</p>
                    </div>
                  )}
                  {selectedMaterial.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {selectedMaterial.tags.map((tag) => (
                        <Badge key={tag} variant="outline">{tag}</Badge>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                    <span>{typeLabels[selectedMaterial.type]}</span>
                    <span>{formatFileSize(selectedMaterial.file_size)}</span>
                    {selectedMaterial.creator?.name && (
                      <span>Por {selectedMaterial.creator.name}</span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirmação de exclusão */}
        <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remover material?</AlertDialogTitle>
              <AlertDialogDescription>
                O material "{deleteConfirm?.name}" será removido da biblioteca.
                Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Remover
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// Componente interno sem AppLayout para usar como aba
export function MaterialsTabContent() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<SalesMaterial | null>(null);
  const [selectedMaterial, setSelectedMaterial] = useState<SalesMaterial | null>(null);
  const [filterType, setFilterType] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "image" as 'image' | 'video' | 'document' | 'audio',
    file_url: "",
    thumbnail_url: "",
    tags: [] as string[],
    usage_hint: "",
    file_size: 0,
    mime_type: "",
  });
  const [tagInput, setTagInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { data: materials = [], isLoading } = useSalesMaterials();
  const createMaterial = useCreateSalesMaterial();
  const updateMaterial = useUpdateSalesMaterial();
  const deleteMaterial = useDeleteSalesMaterial();
  const uploadFile = useUploadMaterialFile();

  const filteredMaterials = materials.filter((m) => {
    const matchesType = filterType === "all" || (filterType === "ai" ? m.tags.includes(AI_TAG) : m.type === filterType);
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesType && matchesSearch;
  });

  const aiMaterialsCount = materials.filter(m => m.tags.includes(AI_TAG)).length;

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      type: "image",
      file_url: "",
      thumbnail_url: "",
      tags: [],
      usage_hint: "",
      file_size: 0,
      mime_type: "",
    });
    setTagInput("");
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  const processFile = (file: File) => {
    setSelectedFile(file);

    let type: 'image' | 'video' | 'document' | 'audio' = 'document';
    if (file.type.startsWith('image/')) type = 'image';
    else if (file.type.startsWith('video/')) type = 'video';
    else if (file.type.startsWith('audio/')) type = 'audio';

    setFormData(prev => ({
      ...prev,
      type,
      mime_type: file.type,
      file_size: file.size,
      name: prev.name || file.name.split('.')[0],
    }));

    if (type === 'image') {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    } else if (type === 'video') {
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()],
      }));
      setTagInput("");
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag),
    }));
  };

  const handleCreate = async () => {
    if (!selectedFile) {
      toast({ title: "Selecione um arquivo", variant: "destructive" });
      return;
    }
    if (!formData.name.trim()) {
      toast({ title: "Digite um nome", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const uploadResult = await uploadFile.mutateAsync({ 
        file: selectedFile,
        folder: formData.type + 's',
      });

      await createMaterial.mutateAsync({
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        file_url: uploadResult.url,
        file_size: uploadResult.size,
        mime_type: uploadResult.mimeType,
        tags: formData.tags,
        usage_hint: formData.usage_hint || undefined,
      });

      toast({ title: "Material criado com sucesso!" });
      setIsCreateOpen(false);
      resetForm();
    } catch (error: any) {
      console.error('Erro ao criar material:', error);
      toast({ 
        title: "Erro ao criar material", 
        description: error.message,
        variant: "destructive" 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = (material: SalesMaterial) => {
    setSelectedMaterial(material);
    setFormData({
      name: material.name,
      description: material.description || "",
      type: material.type,
      file_url: material.file_url,
      thumbnail_url: material.thumbnail_url || "",
      tags: material.tags || [],
      usage_hint: material.usage_hint || "",
      file_size: material.file_size || 0,
      mime_type: material.mime_type || "",
    });
    setPreviewUrl(material.file_url);
    setIsEditOpen(true);
  };

  const handleUpdate = async () => {
    if (!selectedMaterial) return;

    try {
      await updateMaterial.mutateAsync({
        id: selectedMaterial.id,
        name: formData.name,
        description: formData.description || null,
        tags: formData.tags,
        usage_hint: formData.usage_hint || null,
      });

      toast({ title: "Material atualizado!" });
      setIsEditOpen(false);
      setSelectedMaterial(null);
      resetForm();
    } catch (error: any) {
      toast({ 
        title: "Erro ao atualizar", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    try {
      await deleteMaterial.mutateAsync(deleteConfirm.id);
      toast({ title: "Material removido!" });
      setDeleteConfirm(null);
    } catch (error: any) {
      toast({ 
        title: "Erro ao remover", 
        description: error.message,
        variant: "destructive" 
      });
    }
  };

  const handlePreview = (material: SalesMaterial) => {
    setSelectedMaterial(material);
    setIsPreviewOpen(true);
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Materiais de Vendas
          </h2>
          <p className="text-sm text-muted-foreground">
            Biblioteca de mídia para envio rápido no WhatsApp
            {aiMaterialsCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-violet-600">
                <Bot className="h-3 w-3" />
                {aiMaterialsCount} disponivel(is) para IA
              </span>
            )}
          </p>
        </div>
        <Button onClick={() => { resetForm(); setIsCreateOpen(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Novo Material
        </Button>
      </div>

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, descrição ou tag..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="ai">Agente IA</SelectItem>
            <SelectItem value="image">Imagens</SelectItem>
            <SelectItem value="video">Vídeos</SelectItem>
            <SelectItem value="document">Documentos</SelectItem>
            <SelectItem value="audio">Áudios</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista de materiais */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="font-medium text-lg">Nenhum material encontrado</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {searchTerm || filterType !== "all" 
                ? "Tente ajustar os filtros"
                : "Clique em 'Novo Material' para adicionar"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredMaterials.map((material) => {
            const Icon = typeIcons[material.type];
            return (
              <Card key={material.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div 
                  className="aspect-video bg-muted relative cursor-pointer group"
                  onClick={() => handlePreview(material)}
                >
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
                      <Icon className="h-16 w-16 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Eye className="h-8 w-8 text-white" />
                  </div>
                  <Badge className={cn("absolute top-2 left-2", typeColors[material.type])}>
                    {typeLabels[material.type]}
                  </Badge>
                  {material.tags.includes(AI_TAG) && (
                    <Badge className="absolute top-2 right-2 bg-violet-600 text-white gap-1">
                      <Bot className="h-3 w-3" />
                      IA
                    </Badge>
                  )}
                </div>

                <CardContent className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-medium truncate">{material.name}</h3>
                      {material.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {material.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {material.tags.filter(t => t !== AI_TAG).length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {material.tags.filter(t => t !== AI_TAG).slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                      {material.tags.filter(t => t !== AI_TAG).length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{material.tags.filter(t => t !== AI_TAG).length - 3}
                        </Badge>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-muted-foreground">
                      {formatFileSize(material.file_size)}
                    </span>
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        onClick={() => handleEdit(material)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7 text-red-500 hover:text-red-600"
                        onClick={() => setDeleteConfirm(material)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de criação */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Novo Material
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Arquivo</Label>
              <input
                ref={fileInputRef}
                type="file"
                onChange={handleFileSelect}
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                className="hidden"
              />
              {!selectedFile ? (
                <div
                  className={`mt-1 border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-primary bg-primary/5' : 'hover:border-primary'}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    {isDragging ? 'Solte o arquivo aqui' : 'Clique para selecionar ou arraste o arquivo'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Imagens, vídeos, áudios ou documentos
                  </p>
                </div>
              ) : (
                <div className="mt-1 border rounded-lg p-3 flex items-center gap-3">
                  {previewUrl && formData.type === 'image' && (
                    <img src={previewUrl} alt="" className="h-16 w-16 object-cover rounded" />
                  )}
                  {previewUrl && formData.type === 'video' && (
                    <video src={previewUrl} className="h-16 w-16 object-cover rounded" />
                  )}
                  {(formData.type === 'document' || formData.type === 'audio') && (
                    <div className="h-16 w-16 bg-muted rounded flex items-center justify-center">
                      {formData.type === 'document' ? <FileText className="h-8 w-8" /> : <Music className="h-8 w-8" />}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Nome do material"
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Descrição do material..."
                rows={2}
              />
            </div>

            <div>
              <Label>Quando usar</Label>
              <Textarea
                value={formData.usage_hint}
                onChange={(e) => setFormData(prev => ({ ...prev, usage_hint: e.target.value }))}
                placeholder="Dica de quando usar este material..."
                rows={2}
              />
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Adicionar tag..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.filter(t => t !== AI_TAG).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.filter(t => t !== AI_TAG).map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => handleRemoveTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle Agente IA */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-violet-50 dark:bg-violet-900/20">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-600" />
                <div>
                  <Label className="text-sm font-medium">Disponivel para Agente IA</Label>
                  <p className="text-xs text-muted-foreground">O agente pode enviar este material automaticamente na cadencia</p>
                </div>
              </div>
              <Switch
                checked={formData.tags.includes(AI_TAG)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setFormData(prev => ({ ...prev, tags: [...prev.tags.filter(t => t !== AI_TAG), AI_TAG] }));
                  } else {
                    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== AI_TAG) }));
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={uploading}>
              {uploading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar Material
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de edição */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" />
              Editar Material
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {previewUrl && (
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                {formData.type === 'image' ? (
                  <img src={previewUrl} alt="" className="w-full h-full object-contain" />
                ) : formData.type === 'video' ? (
                  <video src={previewUrl} controls className="w-full h-full" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    {formData.type === 'document' ? <FileText className="h-16 w-16" /> : <Music className="h-16 w-16" />}
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Nome *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <Label>Quando usar</Label>
              <Textarea
                value={formData.usage_hint}
                onChange={(e) => setFormData(prev => ({ ...prev, usage_hint: e.target.value }))}
                rows={2}
              />
            </div>

            <div>
              <Label>Tags</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  placeholder="Adicionar tag..."
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              {formData.tags.filter(t => t !== AI_TAG).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {formData.tags.filter(t => t !== AI_TAG).map((tag) => (
                    <Badge key={tag} variant="secondary" className="gap-1">
                      {tag}
                      <X className="h-3 w-3 cursor-pointer" onClick={() => handleRemoveTag(tag)} />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Toggle Agente IA */}
            <div className="flex items-center justify-between rounded-lg border p-3 bg-violet-50 dark:bg-violet-900/20">
              <div className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-violet-600" />
                <div>
                  <Label className="text-sm font-medium">Disponivel para Agente IA</Label>
                  <p className="text-xs text-muted-foreground">O agente pode enviar este material automaticamente na cadencia</p>
                </div>
              </div>
              <Switch
                checked={formData.tags.includes(AI_TAG)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    setFormData(prev => ({ ...prev, tags: [...prev.tags.filter(t => t !== AI_TAG), AI_TAG] }));
                  } else {
                    setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== AI_TAG) }));
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleUpdate} disabled={updateMaterial.isPending}>
              {updateMaterial.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de preview */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>{selectedMaterial?.name}</DialogTitle>
          </DialogHeader>
          
          {selectedMaterial && (
            <div className="space-y-4">
              <div className="aspect-video bg-muted rounded-lg overflow-hidden">
                {selectedMaterial.type === 'image' ? (
                  <img 
                    src={selectedMaterial.file_url} 
                    alt={selectedMaterial.name}
                    className="w-full h-full object-contain"
                  />
                ) : selectedMaterial.type === 'video' ? (
                  <video 
                    src={selectedMaterial.file_url}
                    controls
                    className="w-full h-full"
                  />
                ) : selectedMaterial.type === 'audio' ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <audio src={selectedMaterial.file_url} controls />
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                    <FileText className="h-16 w-16 text-muted-foreground" />
                    <Button asChild>
                      <a href={selectedMaterial.file_url} target="_blank" rel="noopener noreferrer">
                        Abrir documento
                      </a>
                    </Button>
                  </div>
                )}
              </div>

              {selectedMaterial.description && (
                <p className="text-muted-foreground">{selectedMaterial.description}</p>
              )}

              {selectedMaterial.usage_hint && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">Quando usar:</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">{selectedMaterial.usage_hint}</p>
                </div>
              )}

              {selectedMaterial.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {selectedMaterial.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover material?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover "{deleteConfirm?.name}"? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Wrapper com AppLayout para rota standalone
export default function SalesMaterialsConfig() {
  return (
    <AppLayout>
      <div className="container mx-auto py-6">
        <MaterialsTabContent />
      </div>
    </AppLayout>
  );
}
