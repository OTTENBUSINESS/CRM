import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import DOMPurify from "dompurify";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  useAllAnalysisTemplates,
  useCreateAnalysisTemplate,
  useUpdateAnalysisTemplate,
  useDeleteAnalysisTemplate,
  templateCategoryLabels,
  type AnalysisTemplate,
} from "@/hooks/useAnalysisTemplates";
import { useAllProducts, useCreateProduct, useUpdateProduct, useToggleProductActive } from "@/hooks/useProducts";
import { useSalesPlaybook, useUpdatePlaybook } from "@/hooks/useSalesPlaybook";
import {
  CommissionSummaryCard,
  CommissionsTable,
  CommissionRulesTable,
  GatewayConfigCard,
} from "@/components/sales/commissions";
import {
  Settings,
  Package,
  FileText,
  BookOpen,
  Percent,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  Sparkles,
  Power,
  PowerOff,
  Loader2,
  Save,
  Eye,
  Edit3,
  RefreshCw,
  Users,
  Smartphone,
  Instagram,
  Zap,
  AlertCircle,
  ExternalLink,
  Phone,
  FolderOpen,
  Headphones,
  Bot,
  Kanban,
  KeyRound,
  UserPlus,
  Mail,
  Receipt,
  Crown,
  Palette,
  Star,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useInstagramAccounts,
  useCreateInstagramAccount,
  useUpdateInstagramAccount,
  useDeleteInstagramAccount,
  useSocialSellerStages,
  useSocialSellerRules,
  useCreateSocialSellerRule,
  useUpdateSocialSellerRule,
  useDeleteSocialSellerRule,
  type InstagramAccount,
  type SocialSellerStage,
  type SocialSellerRule,
} from "@/hooks/useInstagram";
import { cn } from "@/lib/utils";
import { AutomationRulesTab } from "@/components/settings/AutomationRulesTab";
import { WavoipDeviceConfig } from "@/components/calls";
import { CoachPlaybooksTab } from "@/components/coach/CoachPlaybooksTab";
import { MaterialsTabContent } from "@/pages/SalesMaterialsConfig";
import { AIAgentTab } from "@/components/sales/ai/AIAgentTab";
import { PipelineConfigTab } from "@/components/settings/PipelineConfigTab";
import { TrainingCallsTab } from "@/components/settings/TrainingCallsTab";
import { useAuth } from "@/contexts/AuthContext";
import {
  useAllTeamMembers,
  useCreateTeamMember,
  useUpdateTeamMember,
  useToggleTeamMember,
  useResetTeamMemberPassword,
  type TeamMember,
} from "@/hooks/useTeamMembers";
import {
  useWavoipDevices,
  useCreateWavoipDevice,
  useUpdateWavoipDevice,
  useDeleteWavoipDevice,
} from "@/hooks/useWavoip";

export default function SalesSettings() {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const isAdmin = teamMember?.role === 'admin' || teamMember?.role === 'diretor';
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get("tab") || "templates";
  const [activeTab, setActiveTab] = useState(tabFromUrl);

  useEffect(() => {
    const tab = searchParams.get("tab") || "templates";
    setActiveTab(tab);
  }, [searchParams]);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    setSearchParams({ tab: value });
  };

  return (
    <AppLayout>
      <div className="space-y-6 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <Settings className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Configurações Comerciais</h1>
            <p className="text-muted-foreground">Gerencie templates, produtos, comissões e playbooks</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="flex flex-wrap gap-1 h-auto p-1.5 w-full">
            <TabsTrigger value="pipeline" className="flex items-center gap-2">
              <Kanban className="h-4 w-4" />
              Pipeline
            </TabsTrigger>
            <TabsTrigger value="templates" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Templates
            </TabsTrigger>
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Produtos
            </TabsTrigger>
            <TabsTrigger value="materials" className="flex items-center gap-2">
              <FolderOpen className="h-4 w-4" />
              Materiais
            </TabsTrigger>
            <TabsTrigger value="commissions" className="flex items-center gap-2">
              <Percent className="h-4 w-4" />
              Comissoes
            </TabsTrigger>
            <TabsTrigger value="playbooks" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Playbooks
            </TabsTrigger>
            <TabsTrigger value="coach" className="flex items-center gap-2">
              <Headphones className="h-4 w-4" />
              Coach
            </TabsTrigger>
            <TabsTrigger value="automations" className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Automacoes
            </TabsTrigger>
            <TabsTrigger value="ai-agent" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              Agente IA
            </TabsTrigger>
            <TabsTrigger value="team" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
            <TabsTrigger value="wavoip" className="flex items-center gap-2">
              <Phone className="h-4 w-4" />
              WaVoIP
            </TabsTrigger>
            <TabsTrigger value="instagram" className="flex items-center gap-2">
              <Instagram className="h-4 w-4" />
              Instagram
            </TabsTrigger>
            <TabsTrigger value="fiscal" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              Fiscal
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="training" className="flex items-center gap-2">
                <Star className="h-4 w-4" />
                Treinamento
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="pipeline" className="mt-6">
            <PipelineConfigTab />
          </TabsContent>

          <TabsContent value="templates" className="mt-6">
            <AnalysisTemplatesTab />
          </TabsContent>

          <TabsContent value="products" className="mt-6">
            <ProductsTab />
          </TabsContent>

          <TabsContent value="materials" className="mt-6">
            <MaterialsTabContent />
          </TabsContent>

          <TabsContent value="commissions" className="mt-6">
            <CommissionsTab />
          </TabsContent>

          <TabsContent value="playbooks" className="mt-6">
            <PlaybooksTab />
          </TabsContent>

          <TabsContent value="coach" className="mt-6">
            <CoachPlaybooksTab />
          </TabsContent>

          <TabsContent value="automations" className="mt-6">
            <AutomationRulesTab />
          </TabsContent>

          <TabsContent value="ai-agent" className="mt-6">
            <AIAgentTab />
          </TabsContent>

          <TabsContent value="team" className="mt-6">
            <TeamTab />
          </TabsContent>

          <TabsContent value="wavoip" className="mt-6">
            <WavoipDeviceConfig />
          </TabsContent>

          <TabsContent value="instagram" className="mt-6">
            <InstagramTab />
          </TabsContent>


          {isAdmin && (
            <TabsContent value="training" className="mt-6">
              <TrainingCallsTab />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </AppLayout>
  );
}

// ============================================
// TEMPLATES TAB
// ============================================
export function AnalysisTemplatesTab() {
  const { toast } = useToast();
  const { data: templates, isLoading } = useAllAnalysisTemplates();
  const createTemplate = useCreateAnalysisTemplate();
  const updateTemplate = useUpdateAnalysisTemplate();
  const deleteTemplate = useDeleteAnalysisTemplate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AnalysisTemplate | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    prompt: "",
    category: "call_analysis" as AnalysisTemplate["category"],
    is_default: false,
  });

  const openCreateModal = () => {
    setEditingTemplate(null);
    setFormData({
      name: "",
      description: "",
      prompt: "",
      category: "call_analysis",
      is_default: false,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (template: AnalysisTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || "",
      prompt: template.prompt,
      category: template.category,
      is_default: template.is_default,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      if (editingTemplate) {
        await updateTemplate.mutateAsync({
          id: editingTemplate.id,
          ...formData,
        });
        toast({ title: "Template atualizado!" });
      } else {
        await createTemplate.mutateAsync(formData);
        toast({ title: "Template criado!" });
      }
      setIsModalOpen(false);
    } catch (error) {
      toast({ title: "Erro ao salvar template", variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTemplate.mutateAsync(id);
      toast({ title: "Template removido!" });
    } catch (error) {
      toast({ title: "Erro ao remover template", variant: "destructive" });
    }
  };

  const groupedTemplates = templates?.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, AnalysisTemplate[]>) || {};

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Templates de Análise IA</CardTitle>
          <CardDescription>
            Prompts personalizados para análise de ligações, insights e geração de mensagens
          </CardDescription>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
              <div key={category}>
                <h3 className="font-semibold text-sm text-muted-foreground mb-3 uppercase tracking-wide">
                  {templateCategoryLabels[category as AnalysisTemplate["category"]]}
                </h3>
                <div className="space-y-2">
                  {categoryTemplates.map((template) => (
                    <div
                      key={template.id}
                      className={cn(
                        "flex items-center justify-between p-4 border rounded-lg",
                        !template.is_active && "opacity-50"
                      )}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{template.name}</span>
                          {template.is_default && (
                            <Badge variant="secondary" className="text-xs">
                              Padrão
                            </Badge>
                          )}
                          {!template.is_active && (
                            <Badge variant="outline" className="text-xs text-red-500">
                              Inativo
                            </Badge>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {template.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(template)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Modal Create/Edit */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Editar Template" : "Novo Template"}
            </DialogTitle>
            <DialogDescription>
              Configure o prompt que será usado pela IA para análise
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ex: Análise Completa"
                />
              </div>
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v as AnalysisTemplate["category"] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call_analysis">Análise de Ligação</SelectItem>
                    <SelectItem value="lead_insights">Insights de Lead</SelectItem>
                    <SelectItem value="message_generation">Geração de Mensagem</SelectItem>
                    <SelectItem value="proposal">Proposta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Breve descrição do template"
              />
            </div>

            <div className="space-y-2">
              <Label>Prompt</Label>
              <Textarea
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                placeholder="Instrução para a IA..."
                className="min-h-[200px] font-mono text-sm"
              />
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.is_default}
                onCheckedChange={(v) => setFormData({ ...formData, is_default: v })}
              />
              <Label>Definir como padrão para esta categoria</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formData.name || !formData.prompt}>
              {editingTemplate ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================
// PRODUCTS TAB
// ============================================
export function ProductsTab() {
  const { toast } = useToast();
  const { data: products, isLoading } = useAllProducts();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const toggleActive = useToggleProductActive();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any>(null);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    description: "",
    sku: "",
    category: "",
  });

  const openCreateModal = () => {
    setEditingProduct(null);
    setFormData({ name: "", price: "", description: "", sku: "", category: "" });
    setIsModalOpen(true);
  };

  const openEditModal = (product: any) => {
    setEditingProduct(product);
    setFormData({
      name: product.name || "",
      price: product.price?.toString() || "",
      description: product.description || "",
      sku: product.sku || "",
      category: product.category || "",
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: formData.name,
        price: parseFloat(formData.price) || 0,
        description: formData.description || null,
        sku: formData.sku || null,
        category: formData.category || null,
      };

      if (editingProduct) {
        await updateProduct.mutateAsync({ id: editingProduct.id, ...data });
        toast({ title: "Produto atualizado!" });
      } else {
        await createProduct.mutateAsync(data);
        toast({ title: "Produto criado!" });
      }
      setIsModalOpen(false);
    } catch (error) {
      toast({ title: "Erro ao salvar produto", variant: "destructive" });
    }
  };

  const handleToggleActive = async (product: any) => {
    try {
      await toggleActive.mutateAsync({
        id: product.id,
        is_active: !product.is_active,
      });
      toast({
        title: product.is_active ? "Produto desativado" : "Produto ativado",
      });
    } catch {
      toast({ title: "Erro ao alterar status", variant: "destructive" });
    }
  };

  const formatCurrency = (value?: number | null) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Produtos</CardTitle>
          <CardDescription>Gerencie os produtos disponíveis para venda</CardDescription>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Produto
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preco</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="w-[120px]">Acoes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products?.map((product) => (
                <TableRow key={product.id} className={cn(!product.is_active && "opacity-60")}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">{product.sku || "-"}</TableCell>
                  <TableCell>{product.category || "-"}</TableCell>
                  <TableCell className="text-right font-semibold">
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
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditModal(product)}
                        title="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleToggleActive(product)}
                        title={product.is_active ? "Desativar" : "Ativar"}
                        className={product.is_active ? "text-red-500 hover:text-red-600" : "text-green-500 hover:text-green-600"}
                      >
                        {product.is_active ? (
                          <PowerOff className="h-4 w-4" />
                        ) : (
                          <Power className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {/* Modal Create/Edit Product */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? "Editar Produto" : "Novo Produto"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Nome do produto"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Preco (R$)</Label>
                <Input
                  type="number"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>SKU</Label>
                <Input
                  value={formData.sku}
                  onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                  placeholder="Codigo do produto"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Categoria</Label>
              <Input
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                placeholder="Ex: Mentoria, Curso, Consultoria"
              />
            </div>

            <div className="space-y-2">
              <Label>Descricao</Label>
              <Textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Descricao do produto"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formData.name}>
              {editingProduct ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ============================================
// COMMISSIONS TAB
// ============================================
export function CommissionsTab() {
  const [activeSubTab, setActiveSubTab] = useState("list");

  return (
    <div className="space-y-6">
      <CommissionSummaryCard />

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Comissoes</CardTitle>
              <CardDescription>
                Gerencie comissoes, regras e gateways de pagamento
              </CardDescription>
            </div>
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList>
                <TabsTrigger value="list">Lista</TabsTrigger>
                <TabsTrigger value="rules">Regras</TabsTrigger>
                <TabsTrigger value="gateways">Gateways</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {activeSubTab === "list" && <CommissionsTable />}
          {activeSubTab === "rules" && <CommissionRulesTable />}
          {activeSubTab === "gateways" && <GatewayConfigCard />}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// TEAM TAB (Gestão de Equipe)
// ============================================
export function TeamTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // --- Team Members CRUD ---
  const { data: allMembers = [], isLoading: loadingMembers } = useAllTeamMembers();
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const toggleMember = useToggleTeamMember();
  const resetPassword = useResetTeamMemberPassword();

  // --- WhatsApp instances (leitura) para vincular na tabela ---
  const [instances, setInstances] = useState<{ id: string; name: string; status: string }[]>([]);
  const [loadingInstances, setLoadingInstances] = useState(true);
  const [savingWAId, setSavingWAId] = useState<string | null>(null);

  // --- WaVoIP devices (leitura + CRUD admin) ---
  const { data: wavoipDevices = [], isLoading: loadingWavoip } = useWavoipDevices();
  const createWavoip = useCreateWavoipDevice();
  const updateWavoip = useUpdateWavoipDevice();
  const deleteWavoip = useDeleteWavoipDevice();
  const [wavoipModalMember, setWavoipModalMember] = useState<TeamMember | null>(null);
  const [wavoipToken, setWavoipToken] = useState("");
  const [wavoipName, setWavoipName] = useState("");

  const getMemberWavoip = (memberId: string) =>
    (wavoipDevices || []).find((d: any) => d.team_member_id === memberId && d.is_active);

  const handleSaveWavoip = async () => {
    if (!wavoipModalMember || !wavoipToken.trim()) {
      toast({ title: "Token é obrigatório", variant: "destructive" });
      return;
    }
    try {
      const existing = getMemberWavoip(wavoipModalMember.id);
      if (existing) {
        await updateWavoip.mutateAsync({
          deviceId: existing.id,
          token: wavoipToken.trim(),
          name: wavoipName.trim() || `WhatsApp ${wavoipModalMember.name}`,
        });
      } else {
        await createWavoip.mutateAsync({
          teamMemberId: wavoipModalMember.id,
          token: wavoipToken.trim(),
          name: wavoipName.trim() || `WhatsApp ${wavoipModalMember.name}`,
        });
      }
      toast({ title: existing ? "WaVoIP atualizado!" : "WaVoIP configurado!" });
      setWavoipModalMember(null);
      setWavoipToken("");
      setWavoipName("");
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const handleRemoveWavoip = async (member: TeamMember) => {
    const existing = getMemberWavoip(member.id);
    if (!existing) return;
    if (!confirm(`Remover WaVoIP de ${member.name}?`)) return;
    try {
      await deleteWavoip.mutateAsync(existing.id);
      toast({ title: "WaVoIP removido" });
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const openWavoipModal = (member: TeamMember) => {
    const existing = getMemberWavoip(member.id);
    setWavoipModalMember(member);
    setWavoipToken(existing?.token || "");
    setWavoipName(existing?.name || "");
  };

  useEffect(() => {
    supabase
      .from("whatsapp_instances")
      .select("id, name, status")
      .order("name")
      .then(({ data, error }) => {
        if (error) console.error("Erro ao buscar instâncias:", error);
        setInstances(data || []);
        setLoadingInstances(false);
      });
  }, []);

  const getInstanceName = (id: string | null) => instances.find((i) => i.id === id)?.name || null;

  const handleAssignInstance = async (memberId: string, instanceId: string | null) => {
    setSavingWAId(memberId);
    try {
      const { error } = await supabase
        .from("team_members")
        .update({ whatsapp_instance_id: instanceId })
        .eq("id", memberId);
      if (error) throw error;
      toast({ title: instanceId ? "Instância vinculada!" : "Instância removida!" });
      queryClient.invalidateQueries({ queryKey: ["team-members-all"] });
    } catch {
      toast({ title: "Erro ao vincular instância", variant: "destructive" });
    } finally {
      setSavingWAId(null);
    }
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [resetMember, setResetMember] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const [createForm, setCreateForm] = useState({
    name: "",
    email: "",
    password: "",
    phone: "",
    role: "comercial",
    team: "comercial",
  });
  const [editForm, setEditForm] = useState({
    name: "",
    phone: "",
    role: "",
    team: "",
  });

  const handleCreate = async () => {
    try {
      await createMember.mutateAsync(createForm);
      toast({ title: "Membro criado com sucesso!" });
      setIsCreateOpen(false);
      setCreateForm({ name: "", email: "", password: "", phone: "", role: "comercial", team: "comercial" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao criar membro", variant: "destructive" });
    }
  };

  const handleEdit = async () => {
    if (!editingMember) return;
    try {
      await updateMember.mutateAsync({ member_id: editingMember.id, ...editForm });
      toast({ title: "Membro atualizado!" });
      setEditingMember(null);
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao atualizar", variant: "destructive" });
    }
  };

  const handleToggle = async (member: TeamMember) => {
    try {
      await toggleMember.mutateAsync({ member_id: member.id, is_active: !member.is_active });
      toast({ title: member.is_active ? "Membro desativado" : "Membro ativado" });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao alterar status", variant: "destructive" });
    }
  };

  const handleResetPassword = async () => {
    if (!resetMember) return;
    try {
      await resetPassword.mutateAsync({ member_id: resetMember.id, new_password: newPassword });
      toast({ title: "Senha alterada com sucesso!" });
      setResetMember(null);
      setNewPassword("");
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : "Erro ao resetar senha", variant: "destructive" });
    }
  };

  const openEditModal = (member: TeamMember) => {
    setEditingMember(member);
    setEditForm({
      name: member.name,
      phone: member.phone || "",
      role: member.role || "comercial",
      team: member.team || "comercial",
    });
  };

  const roleLabels: Record<string, string> = {
    admin: "Admin",
    comercial: "Comercial",
    cs: "CS",
    geral: "Geral",
  };

  const teamLabels: Record<string, string> = {
    comercial: "Comercial",
    cs: "CS",
    marketing: "Marketing",
    suporte: "Suporte",
    admin: "Admin",
  };

    return (
    <div className="space-y-6">
      {/* ===== GESTÃO DE EQUIPE ===== */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Gestão de Equipe
              </CardTitle>
              <CardDescription>
                Crie, edite e gerencie os membros do time
              </CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Novo Membro
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loadingMembers ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Cargo</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>WhatsApp</TableHead>
                  <TableHead>Ligações (WaVoIP)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-[140px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allMembers.map((member) => (
                  <TableRow key={member.id} className={cn(!member.is_active && "opacity-50")}>
                    <TableCell className="font-medium">{member.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      <div className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {member.email}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{member.phone || "-"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {roleLabels[member.role || ""] || member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {teamLabels[member.team || ""] || member.team || "-"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {savingWAId === member.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : loadingInstances ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {member.whatsapp_instance_id && (
                            <Smartphone className="h-3 w-3 text-green-500 shrink-0" />
                          )}
                          <select
                            className="h-8 w-[150px] text-xs rounded-md border border-input bg-background px-2 py-1"
                            value={member.whatsapp_instance_id || ""}
                            onChange={(e) => handleAssignInstance(member.id, e.target.value || null)}
                          >
                            <option value="">Nenhuma</option>
                            {instances.map((inst) => (
                              <option key={inst.id} value={inst.id}>
                                {inst.status === "connected" ? "🟢" : "⚪"} {inst.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      {loadingWavoip ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      ) : (() => {
                        const device = getMemberWavoip(member.id);
                        if (!device) {
                          return (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-xs"
                              onClick={() => openWavoipModal(member)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Configurar
                            </Button>
                          );
                        }
                        const connected = device.status === "connected";
                        return (
                          <div className="flex items-center gap-1">
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs gap-1",
                                connected ? "border-green-500 text-green-700 dark:text-green-400" : "border-yellow-500 text-yellow-700 dark:text-yellow-400"
                              )}
                            >
                              <Phone className="h-3 w-3" />
                              {connected ? "Conectado" : "Desconectado"}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => openWavoipModal(member)}
                              title="Editar token"
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive"
                              onClick={() => handleRemoveWavoip(member)}
                              title="Remover"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={member.is_active}
                        onCheckedChange={() => handleToggle(member)}
                        disabled={toggleMember.isPending}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditModal(member)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {member.auth_user_id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => { setResetMember(member); setNewPassword(""); }}
                            title="Resetar senha"
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* ===== CREATE MEMBER MODAL ===== */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Membro</DialogTitle>
            <DialogDescription>
              Crie uma conta para um novo membro do time. Ele poderá fazer login com email e senha.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome *</Label>
                <Input
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={createForm.phone}
                  onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email *</Label>
              <Input
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="email@empresa.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Senha temporária * (min. 6 caracteres)</Label>
              <Input
                type="password"
                value={createForm.password}
                onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                placeholder="Senha inicial"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select
                  value={createForm.role}
                  onValueChange={(v) => setCreateForm({ ...createForm, role: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="cs">CS</SelectItem>
                    <SelectItem value="geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Select
                  value={createForm.team}
                  onValueChange={(v) => setCreateForm({ ...createForm, team: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="cs">CS</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleCreate}
              disabled={!createForm.name || !createForm.email || createForm.password.length < 6 || createMember.isPending}
            >
              {createMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== EDIT MEMBER MODAL ===== */}
      <Dialog open={!!editingMember} onOpenChange={(open) => !open && setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Membro</DialogTitle>
            <DialogDescription>
              {editingMember?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nome</Label>
                <Input
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Telefone</Label>
                <Input
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="(11) 99999-9999"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Cargo</Label>
                <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="cs">CS</SelectItem>
                    <SelectItem value="geral">Geral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Time</Label>
                <Select value={editForm.team} onValueChange={(v) => setEditForm({ ...editForm, team: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="comercial">Comercial</SelectItem>
                    <SelectItem value="cs">CS</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="suporte">Suporte</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancelar</Button>
            <Button onClick={handleEdit} disabled={!editForm.name || updateMember.isPending}>
              {updateMember.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== RESET PASSWORD MODAL ===== */}
      <Dialog open={!!resetMember} onOpenChange={(open) => !open && setResetMember(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Resetar Senha
            </DialogTitle>
            <DialogDescription>
              {resetMember?.name} ({resetMember?.email})
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nova senha (min. 6 caracteres)</Label>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetMember(null)}>Cancelar</Button>
            <Button
              onClick={handleResetPassword}
              disabled={newPassword.length < 6 || resetPassword.isPending}
            >
              {resetPassword.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Alterar Senha
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== WAVOIP CONFIG MODAL ===== */}
      <Dialog open={!!wavoipModalMember} onOpenChange={(open) => !open && setWavoipModalMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              Configurar Ligações (WaVoIP)
            </DialogTitle>
            <DialogDescription>
              Configurando dispositivo para <strong>{wavoipModalMember?.name}</strong>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900 text-sm space-y-1">
              <p className="font-medium text-blue-900 dark:text-blue-300">Como pegar o token:</p>
              <ol className="text-blue-700 dark:text-blue-400 list-decimal list-inside space-y-0.5">
                <li>
                  Acesse{" "}
                  <a
                    href="https://devices.wavoip.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium inline-flex items-center gap-1"
                  >
                    devices.wavoip.com
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
                <li>Crie um novo device (1 device por vendedor)</li>
                <li>Copie o <strong>token</strong> gerado e cole abaixo</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label>Nome do dispositivo</Label>
              <Input
                placeholder={`WhatsApp ${wavoipModalMember?.name}`}
                value={wavoipName}
                onChange={(e) => setWavoipName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Token WaVoIP *</Label>
              <Input
                placeholder="Cole o token aqui"
                value={wavoipToken}
                onChange={(e) => setWavoipToken(e.target.value)}
                className="font-mono text-sm"
              />
            </div>

            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Depois de salvar, o vendedor precisa escanear o QR Code (aparece em <code>/meu-whatsapp</code>) pra conectar o número dele.
              </AlertDescription>
            </Alert>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setWavoipModalMember(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveWavoip}
              disabled={createWavoip.isPending || updateWavoip.isPending || !wavoipToken.trim()}
            >
              {(createWavoip.isPending || updateWavoip.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

// ============================================
// PLAYBOOKS TAB
// ============================================
export function PlaybooksTab() {
  const { toast } = useToast();
  const { data: playbook, isLoading, refetch } = useSalesPlaybook();
  const updatePlaybook = useUpdatePlaybook();

  const [content, setContent] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [activeView, setActiveView] = useState<"edit" | "preview">("edit");

  // Initialize content when playbook loads
  useEffect(() => {
    if (playbook?.content) {
      setContent(playbook.content);
    }
  }, [playbook]);

  // Track changes
  useEffect(() => {
    if (playbook?.content) {
      setHasChanges(content !== playbook.content);
    }
  }, [content, playbook?.content]);

  const handleSave = async () => {
    if (!playbook?.id) return;

    try {
      await updatePlaybook.mutateAsync({
        id: playbook.id,
        content,
      });

      setHasChanges(false);
      toast({
        title: "Playbook salvo!",
        description: "As alteracoes foram salvas com sucesso.",
      });
    } catch (error) {
      console.error("Error saving playbook:", error);
      toast({
        title: "Erro ao salvar",
        description: "Nao foi possivel salvar o playbook.",
        variant: "destructive",
      });
    }
  };

  const sanitizeHtml = (html: string): string => {
    return DOMPurify.sanitize(html, { ALLOWED_TAGS: ['strong', 'em', 'blockquote', 'li', 'br', 'h1', 'h2', 'h3', 'p', 'ul', 'ol', 'a', 'code', 'pre'], ALLOWED_ATTR: ['class', 'href', 'target'] });
  };

  // Simple Markdown to HTML
  const renderMarkdown = (text: string) => {
    const html = text
      .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-6 mb-2">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-8 mb-3 pb-2 border-b">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4 pb-2 border-b-2">$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/^> (.*$)/gim, '<blockquote class="border-l-4 border-primary/30 pl-4 py-1 my-2 text-muted-foreground italic">$1</blockquote>')
      .replace(/^\- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/\n/g, '<br>');
    return sanitizeHtml(html);
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              Playbook de Vendas
              {playbook?.version && (
                <Badge variant="outline" className="text-xs">
                  v{playbook.version}
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Configure o contexto e diretrizes para a IA de vendas
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as "edit" | "preview")}>
              <TabsList>
                <TabsTrigger value="edit" className="gap-2">
                  <Edit3 className="h-4 w-4" />
                  Editar
                </TabsTrigger>
                <TabsTrigger value="preview" className="gap-2">
                  <Eye className="h-4 w-4" />
                  Visualizar
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSave}
              disabled={!hasChanges || updatePlaybook.isPending}
              className={cn(hasChanges && "bg-green-600 hover:bg-green-700")}
            >
              {updatePlaybook.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar
              {hasChanges && <Badge variant="secondary" className="ml-2">*</Badge>}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {activeView === "edit" ? (
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Escreva o playbook usando Markdown..."
            className="min-h-[400px] font-mono text-sm resize-none"
          />
        ) : (
          <div
            className="min-h-[400px] p-4 bg-muted/30 rounded-lg overflow-auto prose prose-sm max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ============================================
// INSTAGRAM TAB
// ============================================

interface InstagramAccountFormData {
  name: string;
  instagram_username: string;
  access_token: string;
  instagram_business_id?: string;
  facebook_page_id?: string;
}

function InstagramAccountModal({
  open,
  onOpenChange,
  editingAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAccount?: InstagramAccount | null;
}) {
  const { toast } = useToast();
  const createAccount = useCreateInstagramAccount();
  const updateAccount = useUpdateInstagramAccount();

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InstagramAccountFormData>({
    defaultValues: editingAccount
      ? {
          name: editingAccount.name,
          instagram_username: editingAccount.instagram_username,
          access_token: editingAccount.access_token,
          instagram_business_id: editingAccount.instagram_business_id || "",
          facebook_page_id: editingAccount.facebook_page_id || "",
        }
      : {},
  });

  const onSubmit = async (data: InstagramAccountFormData) => {
    try {
      if (editingAccount) {
        await updateAccount.mutateAsync({ id: editingAccount.id, ...data });
        toast({ title: "Conta atualizada!" });
      } else {
        await createAccount.mutateAsync(data);
        toast({ title: "Conta conectada!" });
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar conta",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            {editingAccount ? "Editar Conta" : "Conectar Conta Instagram"}
          </DialogTitle>
          <DialogDescription>
            Configure os dados da sua conta Instagram Business para integração.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta</Label>
            <Input
              id="name"
              placeholder="Ex: Conta Principal"
              {...register("name", { required: "Nome é obrigatório" })}
            />
            {errors.name && (
              <p className="text-xs text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="instagram_username">Username do Instagram</Label>
            <Input
              id="instagram_username"
              placeholder="@seuusuario"
              {...register("instagram_username", { required: "Username é obrigatório" })}
            />
            {errors.instagram_username && (
              <p className="text-xs text-destructive">{errors.instagram_username.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="access_token">Access Token (Meta)</Label>
            <Textarea
              id="access_token"
              placeholder="Cole aqui o access token do Meta Business..."
              className="font-mono text-xs"
              rows={3}
              {...register("access_token", { required: "Token é obrigatório" })}
            />
            {errors.access_token && (
              <p className="text-xs text-destructive">{errors.access_token.message}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Obtenha o token em{" "}
              <a
                href="https://developers.facebook.com/tools/explorer/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                Meta Graph API Explorer
                <ExternalLink className="h-3 w-3 inline ml-1" />
              </a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="instagram_business_id">Instagram Business ID (opcional)</Label>
              <Input
                id="instagram_business_id"
                placeholder="17841400..."
                {...register("instagram_business_id")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="facebook_page_id">Facebook Page ID (opcional)</Label>
              <Input
                id="facebook_page_id"
                placeholder="123456789..."
                {...register("facebook_page_id")}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createAccount.isPending || updateAccount.isPending}>
              {(createAccount.isPending || updateAccount.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface InstagramRuleFormData {
  name: string;
  description?: string;
  trigger_type: string;
  trigger_config: string;
  from_stage_id?: string;
  to_stage_id: string;
  create_alert: boolean;
  alert_message?: string;
  is_active: boolean;
}

function InstagramRuleModal({
  open,
  onOpenChange,
  editingRule,
  stages,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRule?: SocialSellerRule | null;
  stages: SocialSellerStage[];
}) {
  const { toast } = useToast();
  const createRule = useCreateSocialSellerRule();
  const updateRule = useUpdateSocialSellerRule();

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<InstagramRuleFormData>({
    defaultValues: editingRule
      ? {
          name: editingRule.name,
          description: editingRule.description || "",
          trigger_type: editingRule.trigger_type,
          trigger_config: JSON.stringify(editingRule.trigger_config, null, 2),
          from_stage_id: editingRule.from_stage_id || "any",
          to_stage_id: editingRule.to_stage_id,
          create_alert: editingRule.create_alert,
          alert_message: editingRule.alert_message || "",
          is_active: editingRule.is_active,
        }
      : {
          trigger_type: "keyword_detected",
          trigger_config: '{\n  "keywords": [],\n  "match_type": "any"\n}',
          is_active: true,
          create_alert: false,
        },
  });

  const triggerType = watch("trigger_type");

  const triggerTemplates: Record<string, string> = {
    message_count: '{\n  "min_messages": 3\n}',
    interaction_type: '{\n  "types": ["story_reply", "story_mention"],\n  "min_count": 2\n}',
    keyword_detected: '{\n  "keywords": ["preço", "quanto custa", "whatsapp"],\n  "match_type": "any"\n}',
  };

  const onSubmit = async (data: InstagramRuleFormData) => {
    try {
      const ruleData = {
        name: data.name,
        description: data.description || null,
        trigger_type: data.trigger_type as any,
        trigger_config: JSON.parse(data.trigger_config),
        from_stage_id: data.from_stage_id === "any" ? null : data.from_stage_id,
        to_stage_id: data.to_stage_id,
        create_alert: data.create_alert,
        alert_message: data.alert_message || null,
        notify_whatsapp: false,
        notification_template: null,
        is_active: data.is_active,
        priority: 0,
      };

      if (editingRule) {
        await updateRule.mutateAsync({ id: editingRule.id, ...ruleData });
        toast({ title: "Regra atualizada!" });
      } else {
        await createRule.mutateAsync(ruleData);
        toast({ title: "Regra criada!" });
      }
      reset();
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao salvar regra",
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            {editingRule ? "Editar Regra" : "Nova Regra de Automação"}
          </DialogTitle>
          <DialogDescription>
            Configure quando e como os leads avançam automaticamente no funil.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rule_name">Nome da Regra</Label>
              <Input
                id="rule_name"
                placeholder="Ex: Detectar interesse"
                {...register("name", { required: "Nome é obrigatório" })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trigger_type">Tipo de Trigger</Label>
              <Select
                value={triggerType}
                onValueChange={(value) => {
                  setValue("trigger_type", value);
                  setValue("trigger_config", triggerTemplates[value] || "{}");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="message_count">Quantidade de Mensagens</SelectItem>
                  <SelectItem value="interaction_type">Tipo de Interação</SelectItem>
                  <SelectItem value="keyword_detected">Palavras-chave Detectadas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="rule_description">Descrição (opcional)</Label>
            <Input
              id="rule_description"
              placeholder="Descreva o que essa regra faz..."
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="trigger_config">Configuração do Trigger (JSON)</Label>
            <Textarea
              id="trigger_config"
              className="font-mono text-xs"
              rows={5}
              {...register("trigger_config", { required: "Configuração é obrigatória" })}
            />
            <p className="text-xs text-muted-foreground">
              {triggerType === "keyword_detected" && "keywords: lista de palavras | match_type: 'any' ou 'all'"}
              {triggerType === "message_count" && "min_messages: número mínimo de mensagens"}
              {triggerType === "interaction_type" && "types: ['story_reply', 'story_mention', 'post_comment']"}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>De Estágio</Label>
              <Select
                value={watch("from_stage_id") || "any"}
                onValueChange={(value) => setValue("from_stage_id", value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">Qualquer estágio</SelectItem>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Para Estágio</Label>
              <Select
                value={watch("to_stage_id")}
                onValueChange={(value) => setValue("to_stage_id", value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>
                      {stage.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="create_alert_switch">Criar Alerta</Label>
              <p className="text-xs text-muted-foreground">Notificar quando essa regra for acionada</p>
            </div>
            <Switch
              id="create_alert_switch"
              checked={watch("create_alert")}
              onCheckedChange={(checked) => setValue("create_alert", checked)}
            />
          </div>

          {watch("create_alert") && (
            <div className="space-y-2">
              <Label htmlFor="alert_message">Mensagem do Alerta</Label>
              <Input
                id="alert_message"
                placeholder="Ex: Lead demonstrou interesse!"
                {...register("alert_message")}
              />
            </div>
          )}

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
            <div>
              <Label htmlFor="is_active_switch">Regra Ativa</Label>
              <p className="text-xs text-muted-foreground">Desative para pausar temporariamente</p>
            </div>
            <Switch
              id="is_active_switch"
              checked={watch("is_active")}
              onCheckedChange={(checked) => setValue("is_active", checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={createRule.isPending || updateRule.isPending}>
              {(createRule.isPending || updateRule.isPending) ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function InstagramTab() {
  const { toast } = useToast();
  const [activeSubTab, setActiveSubTab] = useState("accounts");
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<InstagramAccount | null>(null);
  const [editingRule, setEditingRule] = useState<SocialSellerRule | null>(null);

  const { data: accounts = [], isLoading: loadingAccounts } = useInstagramAccounts();
  const { data: stages = [], isLoading: loadingStages } = useSocialSellerStages();
  const { data: rules = [], isLoading: loadingRules } = useSocialSellerRules();

  const deleteAccount = useDeleteInstagramAccount();
  const deleteRule = useDeleteSocialSellerRule();
  const updateRule = useUpdateSocialSellerRule();

  const handleDeleteAccount = async (account: InstagramAccount) => {
    if (!confirm(`Tem certeza que deseja remover a conta "${account.name}"?`)) return;
    try {
      await deleteAccount.mutateAsync(account.id);
      toast({ title: "Conta removida!" });
    } catch (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const handleDeleteRule = async (rule: SocialSellerRule) => {
    if (!confirm(`Tem certeza que deseja remover a regra "${rule.name}"?`)) return;
    try {
      await deleteRule.mutateAsync(rule.id);
      toast({ title: "Regra removida!" });
    } catch (error) {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  const handleToggleRule = async (rule: SocialSellerRule) => {
    try {
      await updateRule.mutateAsync({ id: rule.id, is_active: !rule.is_active });
      toast({ title: rule.is_active ? "Regra desativada" : "Regra ativada" });
    } catch (error) {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Instagram className="h-5 w-5" />
                Integração Instagram
              </CardTitle>
              <CardDescription>
                Configure contas, funil Social Seller e automações do Instagram
              </CardDescription>
            </div>
            <Tabs value={activeSubTab} onValueChange={setActiveSubTab}>
              <TabsList>
                <TabsTrigger value="accounts">Contas</TabsTrigger>
                <TabsTrigger value="funnel">Funil</TabsTrigger>
                <TabsTrigger value="rules">Automações</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {/* Accounts SubTab */}
          {activeSubTab === "accounts" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setEditingAccount(null);
                    setAccountModalOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Conectar Conta
                </Button>
              </div>

              {loadingAccounts ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : accounts.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhuma conta conectada. Conecte uma conta Instagram Business para começar.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Conta</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Seguidores</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accounts.map((account) => (
                      <TableRow key={account.id}>
                        <TableCell className="font-medium">{account.name}</TableCell>
                        <TableCell>@{account.instagram_username}</TableCell>
                        <TableCell>
                          <Badge
                            variant={account.status === "connected" ? "default" : "destructive"}
                          >
                            {account.status === "connected" ? "Conectado" : account.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{account.followers_count?.toLocaleString() || "-"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingAccount(account);
                                setAccountModalOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteAccount(account)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {/* Webhook URL */}
              <Card className="bg-muted/30">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Webhook URL para Meta Developer</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Input
                      readOnly
                      value="https://YOUR_PROJECT_REF.supabase.co/functions/v1/instagram-webhook"
                      className="font-mono text-xs"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText(
                          "https://YOUR_PROJECT_REF.supabase.co/functions/v1/instagram-webhook"
                        );
                        toast({ title: "URL copiada!" });
                      }}
                    >
                      Copiar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Verify Token: <code className="bg-background px-1 rounded">instagram_webhook_verify_token_cs</code>
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Funnel SubTab */}
          {activeSubTab === "funnel" && (
            <div className="space-y-4">
              {loadingStages ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-12 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead>Slug</TableHead>
                      <TableHead>Cor</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stages.map((stage) => (
                      <TableRow key={stage.id}>
                        <TableCell>{stage.position}</TableCell>
                        <TableCell className="font-medium">{stage.name}</TableCell>
                        <TableCell className="font-mono text-xs">{stage.slug}</TableCell>
                        <TableCell>
                          <div
                            className="w-6 h-6 rounded-full border"
                            style={{ backgroundColor: stage.color }}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {stage.description || "-"}
                        </TableCell>
                        <TableCell>
                          {stage.is_final ? (
                            <Badge variant="secondary">Final</Badge>
                          ) : stage.is_converted ? (
                            <Badge variant="default">Convertido</Badge>
                          ) : (
                            <Badge variant="outline">Ativo</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}

          {/* Rules SubTab */}
          {activeSubTab === "rules" && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <Button
                  onClick={() => {
                    setEditingRule(null);
                    setRuleModalOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Regra
                </Button>
              </div>

              {loadingRules ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-16 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : rules.length === 0 ? (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Nenhuma regra configurada. Crie regras para automatizar a movimentação de leads no funil.
                  </AlertDescription>
                </Alert>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Regra</TableHead>
                      <TableHead>Trigger</TableHead>
                      <TableHead>De → Para</TableHead>
                      <TableHead>Alerta</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rules.map((rule) => (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{rule.name}</span>
                            {rule.description && (
                              <p className="text-xs text-muted-foreground">{rule.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {rule.trigger_type === "keyword_detected" && "Palavras-chave"}
                            {rule.trigger_type === "message_count" && "Qtd Mensagens"}
                            {rule.trigger_type === "interaction_type" && "Tipo Interação"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-muted-foreground">
                            {(rule.from_stage as any)?.name || "Qualquer"}
                          </span>
                          {" → "}
                          <span
                            className="font-medium"
                            style={{ color: (rule.to_stage as any)?.color }}
                          >
                            {(rule.to_stage as any)?.name}
                          </span>
                        </TableCell>
                        <TableCell>
                          {rule.create_alert ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <X className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={() => handleToggleRule(rule)}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setEditingRule(rule);
                                setRuleModalOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={() => handleDeleteRule(rule)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <InstagramAccountModal
        open={accountModalOpen}
        onOpenChange={setAccountModalOpen}
        editingAccount={editingAccount}
      />
      <InstagramRuleModal
        open={ruleModalOpen}
        onOpenChange={setRuleModalOpen}
        editingRule={editingRule}
        stages={stages}
      />
    </div>
  );
}

// ============================================
// CEO BOT CONFIG TAB
// ============================================
export function CEOBotConfigTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const [isActive, setIsActive] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [maxMessages, setMaxMessages] = useState(100);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, instancesRes] = await Promise.all([
        supabase
          .from("ceo_bot_config")
          .select("*, instance:whatsapp_instances(id, phone_number, api_url)")
          .order("created_at", { ascending: true })
          .limit(1)
          .single(),
        supabase.from("whatsapp_instances").select("id, name, phone_number, api_url").not("metadata->>disabled", "eq", "true").order("created_at"),
      ]);
      if (configRes.data) {
        setConfig(configRes.data);
        setIsActive(configRes.data.is_active ?? true);
        setSelectedInstance(configRes.data.instance_id || "");
        setMaxMessages(configRes.data.max_messages_per_hour ?? 100);
      }
      if (instancesRes.data) {
        setInstances(instancesRes.data);
      }
    } catch (e) {
      console.error("Error loading CEO bot config:", e);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!config?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("ceo_bot_config")
      .update({
        is_active: isActive,
        instance_id: selectedInstance || null,
        max_messages_per_hour: maxMessages,
        updated_at: new Date().toISOString(),
      })
      .eq("id", config.id);
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Configuracao salva" });
      loadData();
    }
  };

  const addPhone = async () => {
    const phone = newPhone.replace(/\D/g, "");
    if (!phone || phone.length < 10) {
      toast({ title: "Numero invalido", description: "Use formato: 5531999999999", variant: "destructive" });
      return;
    }
    if (!config?.id) return;
    const current = config.allowed_phones || [];
    if (current.includes(phone)) {
      toast({ title: "Numero ja adicionado", variant: "destructive" });
      return;
    }
    const updated = [...current, phone];
    const { error } = await supabase
      .from("ceo_bot_config")
      .update({ allowed_phones: updated, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewPhone("");
      setConfig({ ...config, allowed_phones: updated });
      toast({ title: "Numero adicionado" });
    }
  };

  const removePhone = async (phone: string) => {
    if (!config?.id) return;
    const updated = (config.allowed_phones || []).filter((p: string) => p !== phone);
    const { error } = await supabase
      .from("ceo_bot_config")
      .update({ allowed_phones: updated, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setConfig({ ...config, allowed_phones: updated });
      toast({ title: "Numero removido" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!config) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Configuracao do CEO Bot nao encontrada. Verifique se a migration foi aplicada.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5" />
            Configuracao Geral
          </CardTitle>
          <CardDescription>
            Configure a instancia WhatsApp e parametros do CEO Bot
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Bot Ativo</Label>
              <p className="text-sm text-muted-foreground">Ativar/desativar o CEO Bot</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>Instancia WhatsApp</Label>
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma instancia" />
              </SelectTrigger>
              <SelectContent>
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name || inst.phone_number || inst.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Instancia dedicada para o CEO Bot (crie uma nova no UAZAPI e registre aqui)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max mensagens/hora</Label>
            <Input
              type="number"
              value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              min={1}
              max={500}
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Numeros Autorizados
          </CardTitle>
          <CardDescription>
            Apenas estes numeros podem interagir com o CEO Bot via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="5531999999999"
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addPhone()}
            />
            <Button onClick={addPhone} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Adicionar
            </Button>
          </div>

          {(config.allowed_phones || []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum numero autorizado</p>
          ) : (
            <div className="space-y-2">
              {(config.allowed_phones || []).map((phone: string) => (
                <div key={phone} className="flex items-center justify-between p-2 bg-muted rounded-md">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-muted-foreground" />
                    <span className="font-mono text-sm">{phone}</span>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => removePhone(phone)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================
// CONTENT AGENT CONFIG TAB
// ============================================
export function ContentAgentConfigTab() {
  const { toast } = useToast();
  const [config, setConfig] = useState<any>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newPhone, setNewPhone] = useState("");

  const [isActive, setIsActive] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<string>("");
  const [maxMessages, setMaxMessages] = useState(100);
  const [apiKey, setApiKey] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [configRes, instancesRes] = await Promise.all([
        supabase
          .from("content_agent_config")
          .select("*, instance:whatsapp_instances(id, phone_number, api_url)")
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabase.from("whatsapp_instances").select("id, name, phone_number, api_url").not("metadata->>disabled", "eq", "true").order("created_at"),
      ]);
      if (configRes.data) {
        setConfig(configRes.data);
        setIsActive(configRes.data.is_active ?? false);
        setSelectedInstance(configRes.data.instance_id || "");
        setMaxMessages(configRes.data.max_messages_per_hour ?? 100);
        setApiKey(configRes.data.api_key || "");
        setApiBaseUrl(configRes.data.api_base_url || "");
      }
      if (instancesRes.data) {
        setInstances(instancesRes.data);
      }
    } catch (e) {
      console.error("Error loading content agent config:", e);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      is_active: isActive,
      instance_id: selectedInstance || null,
      max_messages_per_hour: maxMessages,
      api_key: apiKey || null,
      api_base_url: apiBaseUrl || null,
      updated_at: new Date().toISOString(),
    };
    if (config?.id) {
      const { error } = await supabase
        .from("content_agent_config")
        .update(payload)
        .eq("id", config.id);
      setSaving(false);
      if (error) {
        toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Configuracao salva" });
        loadData();
      }
    } else {
      const { error } = await supabase
        .from("content_agent_config")
        .insert(payload);
      setSaving(false);
      if (error) {
        toast({ title: "Erro ao criar config", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Configuracao criada" });
        loadData();
      }
    }
  };

  const addPhone = async () => {
    const phone = newPhone.replace(/\D/g, "");
    if (!phone || phone.length < 10) {
      toast({ title: "Numero invalido", description: "Use formato: 5531999999999", variant: "destructive" });
      return;
    }
    if (!config?.id) {
      toast({ title: "Salve a configuracao primeiro", variant: "destructive" });
      return;
    }
    const current = config.allowed_phones || [];
    if (current.includes(phone)) {
      toast({ title: "Numero ja adicionado", variant: "destructive" });
      return;
    }
    const updated = [...current, phone];
    const { error } = await supabase
      .from("content_agent_config")
      .update({ allowed_phones: updated, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setNewPhone("");
      setConfig({ ...config, allowed_phones: updated });
      toast({ title: "Numero adicionado" });
    }
  };

  const removePhone = async (phone: string) => {
    if (!config?.id) return;
    const updated = (config.allowed_phones || []).filter((p: string) => p !== phone);
    const { error } = await supabase
      .from("content_agent_config")
      .update({ allowed_phones: updated, updated_at: new Date().toISOString() })
      .eq("id", config.id);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } else {
      setConfig({ ...config, allowed_phones: updated });
      toast({ title: "Numero removido" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Use <code className="bg-muted px-1 rounded">/conteudo</code> no WhatsApp para ativar o agente de conteudo e{" "}
          <code className="bg-muted px-1 rounded">/ceo</code> para voltar ao CEO Bot. O agente lembra a sessao ativa automaticamente.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="h-5 w-5" />
            Configuracao Geral
          </CardTitle>
          <CardDescription>
            Configure a instancia WhatsApp e parametros do Agente de Conteudo (BoraPostar)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label>Agente Ativo</Label>
              <p className="text-sm text-muted-foreground">Ativar/desativar o Agente de Conteudo</p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          <div className="space-y-2">
            <Label>Instancia WhatsApp</Label>
            <Select value={selectedInstance} onValueChange={setSelectedInstance}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma instancia" />
              </SelectTrigger>
              <SelectContent>
                {instances.map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name || inst.phone_number || inst.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Mesma instancia do CEO Bot (compartilham o mesmo numero)
            </p>
          </div>

          <div className="space-y-2">
            <Label>API Key (BoraPostar)</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_carousel_..."
            />
            <p className="text-xs text-muted-foreground">
              Chave de autenticacao da API BoraPostar para criacao de carrosseis
            </p>
          </div>

          <div className="space-y-2">
            <Label>API Base URL</Label>
            <Input
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://api.borapostar.com"
            />
            <p className="text-xs text-muted-foreground">
              URL base da API (sem barra no final)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max mensagens/hora</Label>
            <Input
              type="number"
              value={maxMessages}
              onChange={(e) => setMaxMessages(Number(e.target.value))}
              min={1}
              max={500}
            />
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Salvar
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            Numeros Autorizados
          </CardTitle>
          <CardDescription>
            Apenas estes numeros podem interagir com o Agente de Conteudo via WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!config?.id ? (
            <p className="text-sm text-muted-foreground">Salve a configuracao primeiro para adicionar numeros</p>
          ) : (
            <>
              <div className="flex gap-2">
                <Input
                  placeholder="5531999999999"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addPhone()}
                />
                <Button onClick={addPhone} size="sm">
                  <Plus className="h-4 w-4 mr-1" />
                  Adicionar
                </Button>
              </div>

              {(config.allowed_phones || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum numero autorizado</p>
              ) : (
                <div className="space-y-2">
                  {(config.allowed_phones || []).map((phone: string) => (
                    <div key={phone} className="flex items-center justify-between p-2 bg-muted rounded-md">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                        <span className="font-mono text-sm">{phone}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => removePhone(phone)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
