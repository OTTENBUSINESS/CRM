import { useState } from "react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Search,
  UserPlus,
  Loader2,
  Check,
  Phone,
  Mail,
  Instagram,
  ChevronDown,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useCheckLeadDuplicate, useRegisterConversion } from "@/hooks/useMergeLeads";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface CreateSalesLeadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface LeadSearchResult {
  id: string;
  name: string;
  email: string;
  phone: string;
  instagram?: string;
  sales_stage?: string;
  created_at: string;
}

interface NewLeadForm {
  name: string;
  email: string;
  phone: string;
  instagram: string;
  origin: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
}

const origins = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "instagram", label: "Instagram" },
  { value: "indicacao", label: "Indicação" },
  { value: "site", label: "Site" },
  { value: "evento", label: "Evento" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "telefone", label: "Telefone" },
  { value: "outro", label: "Outro" },
];

export function CreateSalesLeadModal({
  open,
  onOpenChange,
}: CreateSalesLeadModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<"search" | "new">("search");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [showUtms, setShowUtms] = useState(false);

  const [newLeadForm, setNewLeadForm] = useState<NewLeadForm>({
    name: "",
    email: "",
    phone: "",
    instagram: "",
    origin: "whatsapp",
    utm_source: "",
    utm_medium: "",
    utm_campaign: "",
    utm_term: "",
    utm_content: "",
  });

  // Dedup check state
  const [foundDuplicates, setFoundDuplicates] = useState<LeadSearchResult[]>([]);
  const checkDuplicate = useCheckLeadDuplicate();
  const registerConversion = useRegisterConversion();

  // Buscar leads existentes
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["lead-search-sales", searchQuery],
    queryFn: async () => {
      if (searchQuery.length < 2) return [];

      const { data, error } = await supabase
        .from("leads")
        .select("id, name, email, phone, instagram, sales_stage, created_at")
        .or(
          `name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%,instagram.ilike.%${searchQuery}%`
        )
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) throw error;
      return (data || []) as LeadSearchResult[];
    },
    enabled: searchQuery.length >= 2,
  });

  // Mutation para criar novo lead
  const createLead = useMutation({
    mutationFn: async (form: NewLeadForm) => {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          name: form.name,
          email: form.email || null,
          phone: form.phone || null,
          instagram: form.instagram || null,
          origin: form.origin,
          utm_source: form.utm_source || null,
          utm_medium: form.utm_medium || null,
          utm_campaign: form.utm_campaign || null,
          utm_term: form.utm_term || null,
          utm_content: form.utm_content || null,
          sales_stage: "new",
          status: "new",
        })
        .select()
        .single();

      if (leadError) throw leadError;
      return lead;
    },
    onSuccess: (lead) => {
      toast({
        title: "Lead criado!",
        description: `${lead.name} foi adicionado ao comercial.`,
      });
      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      queryClient.invalidateQueries({ queryKey: ["leads-count-by-stage"] });
      onOpenChange(false);
      resetForm();
      // Navegar para o detalhe do lead
      navigate(`/comercial/leads/${lead.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar lead",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSearchQuery("");
    setSelectedLead(null);
    setShowUtms(false);
    setFoundDuplicates([]);
    setNewLeadForm({
      name: "",
      email: "",
      phone: "",
      instagram: "",
      origin: "whatsapp",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_term: "",
      utm_content: "",
    });
    setActiveTab("search");
  };

  const handleSelectExisting = () => {
    if (!selectedLead) {
      toast({
        title: "Selecione um lead",
        description: "Escolha um lead da lista para continuar",
        variant: "destructive",
      });
      return;
    }
    onOpenChange(false);
    navigate(`/comercial/leads/${selectedLead.id}`);
  };

  const handleCreateNew = async () => {
    if (!newLeadForm.name) {
      toast({
        title: "Nome obrigatório",
        description: "Preencha pelo menos o nome do lead",
        variant: "destructive",
      });
      return;
    }
    if (!newLeadForm.phone && !newLeadForm.email && !newLeadForm.instagram) {
      toast({
        title: "Contato obrigatório",
        description: "Preencha pelo menos um meio de contato (telefone, email ou instagram)",
        variant: "destructive",
      });
      return;
    }

    // Check for duplicates before creating
    if (foundDuplicates.length === 0 && (newLeadForm.phone || newLeadForm.email)) {
      const duplicates = await checkDuplicate.mutateAsync({
        phone: newLeadForm.phone || undefined,
        email: newLeadForm.email || undefined,
      });
      if (duplicates.length > 0) {
        setFoundDuplicates(duplicates as LeadSearchResult[]);
        return; // Show duplicates alert, don't create yet
      }
    }

    // No duplicates or user confirmed creation
    setFoundDuplicates([]);
    createLead.mutate(newLeadForm);
  };

  const handleOpenDuplicate = (dupId: string) => {
    onOpenChange(false);
    resetForm();
    navigate(`/comercial/leads/${dupId}`);
  };

  const handleRegisterConversion = (dupId: string) => {
    registerConversion.mutate(
      {
        leadId: dupId,
        source: newLeadForm.origin,
        utm_source: newLeadForm.utm_source || undefined,
        utm_medium: newLeadForm.utm_medium || undefined,
        utm_campaign: newLeadForm.utm_campaign || undefined,
        utm_content: newLeadForm.utm_content || undefined,
        utm_term: newLeadForm.utm_term || undefined,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          resetForm();
          navigate(`/comercial/leads/${dupId}`);
        },
      }
    );
  };

  const handleForceCreate = () => {
    setFoundDuplicates([]);
    createLead.mutate(newLeadForm);
  };

  const getInitials = (name: string) =>
    name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

  const getStageBadge = (stage?: string) => {
    const stages: Record<string, { label: string; color: string }> = {
      new: { label: "Novo", color: "bg-blue-100 text-blue-700" },
      captura: { label: "Captura", color: "bg-purple-100 text-purple-700" },
      qualificacao: { label: "Qualificação", color: "bg-yellow-100 text-yellow-700" },
      agendamento: { label: "Agendamento", color: "bg-orange-100 text-orange-700" },
      negociacao: { label: "Negociação", color: "bg-pink-100 text-pink-700" },
      fechado: { label: "Fechado", color: "bg-green-100 text-green-700" },
      perdido: { label: "Perdido", color: "bg-red-100 text-red-700" },
    };
    const s = stages[stage || "new"] || stages.new;
    return <span className={cn("text-xs px-2 py-0.5 rounded-full", s.color)}>{s.label}</span>;
  };

  const isLoading = createLead.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Novo Lead Comercial
          </DialogTitle>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "search" | "new")}
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Buscar Existente
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Criar Novo
            </TabsTrigger>
          </TabsList>

          {/* Tab: Buscar Lead Existente */}
          <TabsContent value="search" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label>Buscar por nome, email, telefone ou instagram</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Digite para buscar..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            {/* Resultados da busca */}
            <ScrollArea className="h-[250px] border rounded-lg">
              {isSearching ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : searchResults && searchResults.length > 0 ? (
                <div className="p-2 space-y-1">
                  {searchResults.map((lead) => (
                    <div
                      key={lead.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
                        selectedLead?.id === lead.id
                          ? "bg-accent/20 border border-accent"
                          : "hover:bg-muted"
                      )}
                      onClick={() => setSelectedLead(lead)}
                    >
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-accent/10 text-accent text-sm">
                          {getInitials(lead.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm truncate">
                            {lead.name}
                          </p>
                          {getStageBadge(lead.sales_stage)}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </span>
                          )}
                          {lead.email && (
                            <span className="flex items-center gap-1 truncate">
                              <Mail className="h-3 w-3" />
                              {lead.email}
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedLead?.id === lead.id && (
                        <Check className="h-5 w-5 text-accent" />
                      )}
                    </div>
                  ))}
                </div>
              ) : searchQuery.length >= 2 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <p className="text-sm">Nenhum lead encontrado</p>
                  <Button
                    variant="link"
                    size="sm"
                    onClick={() => {
                      setActiveTab("new");
                      setNewLeadForm({ ...newLeadForm, name: searchQuery });
                    }}
                  >
                    Criar novo lead "{searchQuery}"
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  Digite pelo menos 2 caracteres
                </div>
              )}
            </ScrollArea>

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSelectExisting} disabled={!selectedLead}>
                Abrir Lead
              </Button>
            </DialogFooter>
          </TabsContent>

          {/* Tab: Criar Novo Lead */}
          <TabsContent value="new" className="space-y-4 mt-4">
            <div className="space-y-4">
              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="name">Nome *</Label>
                <Input
                  id="name"
                  placeholder="Nome completo"
                  value={newLeadForm.name}
                  onChange={(e) =>
                    setNewLeadForm({ ...newLeadForm, name: e.target.value })
                  }
                />
              </div>

              {/* Telefone e Email */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      placeholder="11999999999"
                      value={newLeadForm.phone}
                      onChange={(e) =>
                        setNewLeadForm({ ...newLeadForm, phone: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={newLeadForm.email}
                      onChange={(e) =>
                        setNewLeadForm({ ...newLeadForm, email: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>

              {/* Instagram e Origem */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="instagram">Instagram</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="instagram"
                      placeholder="@usuario"
                      value={newLeadForm.instagram}
                      onChange={(e) =>
                        setNewLeadForm({ ...newLeadForm, instagram: e.target.value })
                      }
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Origem *</Label>
                  <Select
                    value={newLeadForm.origin}
                    onValueChange={(v) =>
                      setNewLeadForm({ ...newLeadForm, origin: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {origins.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* UTMs (Collapsible) */}
              <Collapsible open={showUtms} onOpenChange={setShowUtms}>
                <CollapsibleTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Tag className="h-4 w-4" />
                      UTMs (opcional)
                    </span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 transition-transform",
                        showUtms && "rotate-180"
                      )}
                    />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-4 pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="utm_source">UTM Source</Label>
                      <Input
                        id="utm_source"
                        placeholder="instagram, google, etc"
                        value={newLeadForm.utm_source}
                        onChange={(e) =>
                          setNewLeadForm({
                            ...newLeadForm,
                            utm_source: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="utm_medium">UTM Medium</Label>
                      <Input
                        id="utm_medium"
                        placeholder="cpc, organic, etc"
                        value={newLeadForm.utm_medium}
                        onChange={(e) =>
                          setNewLeadForm({
                            ...newLeadForm,
                            utm_medium: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="utm_campaign">UTM Campaign</Label>
                    <Input
                      id="utm_campaign"
                      placeholder="lancamento-jan-2026"
                      value={newLeadForm.utm_campaign}
                      onChange={(e) =>
                        setNewLeadForm({
                          ...newLeadForm,
                          utm_campaign: e.target.value,
                        })
                      }
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="utm_term">UTM Term</Label>
                      <Input
                        id="utm_term"
                        placeholder="palavra-chave"
                        value={newLeadForm.utm_term}
                        onChange={(e) =>
                          setNewLeadForm({
                            ...newLeadForm,
                            utm_term: e.target.value,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="utm_content">UTM Content</Label>
                      <Input
                        id="utm_content"
                        placeholder="banner-topo"
                        value={newLeadForm.utm_content}
                        onChange={(e) =>
                          setNewLeadForm({
                            ...newLeadForm,
                            utm_content: e.target.value,
                          })
                        }
                      />
                    </div>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>

            {/* Duplicate alert */}
            {foundDuplicates.length > 0 && (
              <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
                <AlertTriangle className="h-4 w-4 !text-amber-600" />
                <AlertDescription className="space-y-3">
                  <p className="font-medium">Lead já existe com este telefone/email!</p>
                  <div className="space-y-2">
                    {foundDuplicates.map((dup) => (
                      <div key={dup.id} className="flex items-center justify-between p-2 bg-white rounded border">
                        <div className="text-sm">
                          <span className="font-medium">{dup.name}</span>
                          <span className="text-muted-foreground ml-2">{dup.phone || dup.email}</span>
                          {dup.sales_stage && (
                            <span className="ml-2 text-xs bg-gray-100 px-1.5 py-0.5 rounded">{dup.sales_stage}</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleOpenDuplicate(dup.id)}>
                            Abrir
                          </Button>
                          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => handleRegisterConversion(dup.id)}>
                            Nova Conversão
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" variant="ghost" className="text-xs text-amber-700" onClick={handleForceCreate}>
                    Criar mesmo assim (duplicata)
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCreateNew} disabled={isLoading || checkDuplicate.isPending}>
                {(isLoading || checkDuplicate.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Lead
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
