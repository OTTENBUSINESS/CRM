import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import {
  useAllProducts,
  useToggleProductActive,
  useProductCategories,
  type Product,
} from "@/hooks/useProducts";
import { useToast } from "@/hooks/use-toast";
import { ProductFormModal } from "./ProductFormModal";
import {
  Plus,
  Search,
  MoreHorizontal,
  Pencil,
  Power,
  PowerOff,
  Package,
  Loader2,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function ProductsTable() {
  const { toast } = useToast();
  const { data: products, isLoading } = useAllProducts();
  const { data: categories } = useProductCategories();
  const toggleActive = useToggleProductActive();

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [toggleConfirm, setToggleConfirm] = useState<Product | null>(null);

  const filteredProducts = products?.filter((product) => {
    // Search filter
    if (
      search &&
      !product.name.toLowerCase().includes(search.toLowerCase()) &&
      !product.sku?.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }

    // Category filter
    if (categoryFilter !== "all" && product.category !== categoryFilter) {
      return false;
    }

    // Status filter
    if (statusFilter === "active" && !product.is_active) return false;
    if (statusFilter === "inactive" && product.is_active) return false;

    return true;
  });

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    setIsFormOpen(true);
  };

  const handleToggleActive = async () => {
    if (!toggleConfirm) return;

    try {
      await toggleActive.mutateAsync({
        id: toggleConfirm.id,
        is_active: !toggleConfirm.is_active,
      });
      toast({
        title: "Sucesso",
        description: toggleConfirm.is_active
          ? "Produto desativado"
          : "Produto ativado",
      });
    } catch {
      toast({
        title: "Erro",
        description: "Erro ao alterar status do produto",
        variant: "destructive",
      });
    } finally {
      setToggleConfirm(null);
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (!value) return "-";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <div className="flex flex-1 gap-2">
          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome ou SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas Categorias</SelectItem>
              {categories?.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Add Button */}
        <Button
          onClick={() => {
            setEditingProduct(null);
            setIsFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </div>

      {/* Table */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produto</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead className="text-right">Preco</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-center">Onboarding</TableHead>
              <TableHead className="w-[70px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredProducts?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Package className="h-8 w-8" />
                    <p>Nenhum produto encontrado</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts?.map((product) => (
                <TableRow
                  key={product.id}
                  className={cn(!product.is_active && "opacity-60")}
                >
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center"
                        style={{
                          backgroundColor:
                            product.primary_color || "#e5e7eb",
                        }}
                      >
                        {product.logo_url ? (
                          <img
                            src={product.logo_url}
                            alt={product.name}
                            className="h-6 w-6 object-contain"
                          />
                        ) : (
                          <Package className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">
                            {product.description}
                          </p>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {product.category ? (
                      <Badge variant="outline">{product.category}</Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {product.sku || "-"}
                    </code>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge
                      variant={product.is_active ? "default" : "secondary"}
                      className={cn(
                        product.is_active
                          ? "bg-green-100 text-green-800 hover:bg-green-100"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {product.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    {product.onboarding_required ? (
                      <Badge
                        variant="outline"
                        className="bg-blue-50 text-blue-700 border-blue-200"
                      >
                        Sim
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">Nao</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(product)}>
                          <Pencil className="h-4 w-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setToggleConfirm(product)}
                          className={
                            product.is_active
                              ? "text-red-600"
                              : "text-green-600"
                          }
                        >
                          {product.is_active ? (
                            <>
                              <PowerOff className="h-4 w-4 mr-2" />
                              Desativar
                            </>
                          ) : (
                            <>
                              <Power className="h-4 w-4 mr-2" />
                              Ativar
                            </>
                          )}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Form Modal */}
      <ProductFormModal
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        product={editingProduct}
      />

      {/* Toggle Confirm Dialog */}
      <AlertDialog
        open={!!toggleConfirm}
        onOpenChange={() => setToggleConfirm(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toggleConfirm?.is_active
                ? "Desativar Produto"
                : "Ativar Produto"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toggleConfirm?.is_active
                ? `Deseja desativar o produto "${toggleConfirm?.name}"? Ele nao aparecera mais para selecao em novos deals.`
                : `Deseja ativar o produto "${toggleConfirm?.name}"? Ele voltara a aparecer para selecao.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleToggleActive}
              className={
                toggleConfirm?.is_active
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-green-600 hover:bg-green-700"
              }
            >
              {toggleActive.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {toggleConfirm?.is_active ? "Desativar" : "Ativar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
