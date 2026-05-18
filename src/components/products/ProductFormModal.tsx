import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateProduct,
  useUpdateProduct,
  useProductCategories,
  type Product,
} from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Package, DollarSign, Tag, Hash } from "lucide-react";

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSuccess?: () => void;
}

const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
};

const generateId = (name: string): string => {
  const slug = generateSlug(name);
  const random = Math.random().toString(36).substring(2, 8);
  return `${slug}-${random}`;
};

export function ProductFormModal({
  open,
  onOpenChange,
  product,
  onSuccess,
}: ProductFormModalProps) {
  const { toast } = useToast();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const { data: existingCategories } = useProductCategories();

  const isEditing = !!product;

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "",
    category: "",
    sku: "",
    is_active: true,
    onboarding_required: false,
  });

  const [newCategory, setNewCategory] = useState("");
  const [useNewCategory, setUseNewCategory] = useState(false);

  useEffect(() => {
    if (product) {
      setFormData({
        name: product.name || "",
        description: product.description || "",
        price: product.price?.toString() || "",
        category: product.category || "",
        sku: product.sku || "",
        is_active: product.is_active ?? true,
        onboarding_required: product.onboarding_required ?? false,
      });
    } else {
      setFormData({
        name: "",
        description: "",
        price: "",
        category: "",
        sku: "",
        is_active: true,
        onboarding_required: false,
      });
    }
    setNewCategory("");
    setUseNewCategory(false);
  }, [product, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Erro",
        description: "Nome do produto e obrigatorio",
        variant: "destructive",
      });
      return;
    }

    const category = useNewCategory ? newCategory : formData.category;

    try {
      if (isEditing) {
        await updateProduct.mutateAsync({
          id: product.id,
          name: formData.name,
          description: formData.description || null,
          price: formData.price ? parseFloat(formData.price) : null,
          category: category || null,
          sku: formData.sku || null,
          is_active: formData.is_active,
          onboarding_required: formData.onboarding_required,
        });
        toast({ title: "Sucesso", description: "Produto atualizado!" });
      } else {
        await createProduct.mutateAsync({
          id: generateId(formData.name),
          name: formData.name,
          slug: generateSlug(formData.name),
          description: formData.description || null,
          price: formData.price ? parseFloat(formData.price) : null,
          category: category || null,
          sku: formData.sku || null,
          is_active: formData.is_active,
          onboarding_required: formData.onboarding_required,
        });
        toast({ title: "Sucesso", description: "Produto criado!" });
      }

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error("Erro ao salvar produto:", error);
      toast({
        title: "Erro",
        description: "Erro ao salvar produto",
        variant: "destructive",
      });
    }
  };

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5 text-blue-600" />
            {isEditing ? "Editar Produto" : "Novo Produto"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <div className="space-y-2">
            <Label htmlFor="name">Nome do Produto *</Label>
            <Input
              id="name"
              placeholder="Ex: Mentoria Premium"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
            />
          </div>

          {/* Descricao */}
          <div className="space-y-2">
            <Label htmlFor="description">Descricao</Label>
            <Textarea
              id="description"
              placeholder="Descricao do produto..."
              value={formData.description}
              onChange={(e) =>
                setFormData({ ...formData, description: e.target.value })
              }
              rows={3}
            />
          </div>

          {/* Preco e SKU */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="price" className="flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Preco (R$)
              </Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={formData.price}
                onChange={(e) =>
                  setFormData({ ...formData, price: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sku" className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                SKU
              </Label>
              <Input
                id="sku"
                placeholder="PROD-001"
                value={formData.sku}
                onChange={(e) =>
                  setFormData({ ...formData, sku: e.target.value })
                }
              />
            </div>
          </div>

          {/* Categoria */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Categoria
            </Label>

            {!useNewCategory ? (
              <div className="flex gap-2">
                <Select
                  value={formData.category}
                  onValueChange={(value) =>
                    setFormData({ ...formData, category: value })
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione ou crie nova..." />
                  </SelectTrigger>
                  <SelectContent>
                    {existingCategories?.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setUseNewCategory(true)}
                >
                  Nova
                </Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input
                  placeholder="Nome da nova categoria"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUseNewCategory(false);
                    setNewCategory("");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            )}
          </div>

          {/* Switches */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="is_active">Produto Ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Produtos inativos nao aparecem para selecao
                </p>
              </div>
              <Switch
                id="is_active"
                checked={formData.is_active}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, is_active: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="onboarding_required">Requer Onboarding</Label>
                <p className="text-xs text-muted-foreground">
                  Cliente passara pelo processo de onboarding
                </p>
              </div>
              <Switch
                id="onboarding_required"
                checked={formData.onboarding_required}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, onboarding_required: checked })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar Produto"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
