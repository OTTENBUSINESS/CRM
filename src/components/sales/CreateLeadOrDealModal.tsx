import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useProducts } from "@/hooks/useProducts";
import { useAuth } from "@/contexts/AuthContext";
import {
  Search,
  UserPlus,
  Loader2,
  Check,
  Phone,
  Mail,
  Instagram,
  Briefcase,
  User,
  MessageSquare,
  AlertCircle,
  ChevronDown,
  Megaphone,
  FileText,
  ImagePlus,
  X,
  Sparkles,
  UserCog,
  Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { triggerNotificationEvent, getDealNotificationContext, getLeadNotificationContext } from "@/hooks/useNotificationEvents";
import { useDropdownOptions } from "@/hooks/useDropdownOptions";
import { useCheckLeadDuplicate, useRegisterConversion } from "@/hooks/useMergeLeads";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface LeadDefaultValues {
  name?: string;
  email?: string;
  phone?: string;
  instagram?: string;
  utm_source?: string;
  utm_campaign?: string;
  utm_content?: string;
  context?: string;
}

interface CreateLeadOrDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "lead" | "deal";
  defaultStageId?: string;
  pipelineId?: string;
  defaultValues?: LeadDefaultValues;
  onLeadCreated?: (leadId: string) => void;
}

interface LeadSearchResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  instagram?: string | null;
  sales_stage?: string;
  created_at: string;
}

// Combobox com texto livre
interface ComboboxFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  icon?: React.ReactNode;
  onAddOption?: (value: string, label: string) => void;
}

function ComboboxField({ label, value, onChange, options, placeholder, icon, onAddOption }: ComboboxFieldProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const displayLabel = options.find(o => o.value === value)?.label || value;

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              {icon}
              {value ? displayLabel : placeholder || "Selecione..."}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" sideOffset={4} align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar ou digitar..."
              value={search}
              onValueChange={setSearch}
              onKeyDown={(e) => {
                if (e.key === "Enter" && search) {
                  const exists = options.find(o => o.value === search || o.label.toLowerCase() === search.toLowerCase());
                  if (!exists) {
                    onChange(search);
                    if (onAddOption) onAddOption(search, search);
                    setOpen(false);
                    setSearch("");
                  }
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {search ? (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-accent/50 rounded-sm cursor-pointer"
                    onClick={() => {
                      onChange(search);
                      if (onAddOption) onAddOption(search, search);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    Usar &ldquo;{search}&rdquo;
                  </button>
                ) : (
                  <span className="text-muted-foreground">Nenhuma opção</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {(search
                  ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
                  : options
                ).map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.label}
                    onSelect={() => {
                      onChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check className={cn("mr-2 h-3.5 w-3.5 shrink-0", value === option.value ? "opacity-100" : "opacity-0")} />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Referral field — uses Radix Popover modal + Command
function ReferralField({
  value,
  referralSearch,
  onSearchChange,
  referralLeads,
  onSelect,
  onAddOption,
}: {
  value: string;
  referralSearch: string;
  onSearchChange: (v: string) => void;
  referralLeads: { id: string; name: string; phone: string | null }[];
  onSelect: (val: string) => void;
  onAddOption: (value: string, label: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-1.5">
      <Label>Indicado por</Label>
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
          >
            <span className="flex items-center gap-2 truncate">
              <User className="h-4 w-4 text-muted-foreground" />
              {value || "Quem indicou?"}
            </span>
            <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" sideOffset={4} align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="Buscar lead ou digitar nome..."
              value={referralSearch}
              onValueChange={onSearchChange}
              onKeyDown={(e) => {
                if (e.key === "Enter" && referralSearch) {
                  onSelect(referralSearch);
                  onAddOption(referralSearch, referralSearch);
                  setOpen(false);
                }
              }}
            />
            <CommandList>
              <CommandEmpty>
                {referralSearch ? (
                  <button
                    type="button"
                    className="w-full text-left px-2 py-1.5 text-sm text-primary hover:bg-accent/50 rounded-sm cursor-pointer"
                    onClick={() => {
                      onSelect(referralSearch);
                      onAddOption(referralSearch, referralSearch);
                      setOpen(false);
                    }}
                  >
                    Usar &ldquo;{referralSearch}&rdquo;
                  </button>
                ) : (
                  <span className="text-muted-foreground">Digite para buscar...</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {referralLeads.map((lead) => (
                  <CommandItem
                    key={lead.id}
                    value={lead.name}
                    onSelect={() => {
                      onSelect(`Indicação: ${lead.name} (id: ${lead.id})`);
                      setOpen(false);
                    }}
                  >
                    <User className="mr-2 h-3.5 w-3.5 shrink-0" />
                    <span className="font-medium">{lead.name}</span>
                    {lead.phone && <span className="ml-2 text-xs text-muted-foreground">{lead.phone}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CreateLeadOrDealModal({
  open,
  onOpenChange,
  mode,
  defaultStageId,
  pipelineId,
  defaultValues,
  onLeadCreated,
}: CreateLeadOrDealModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { teamMember } = useAuth();

  // Dropdown options from DB
  const { options: canalOptions, addOption: addCanalOption } = useDropdownOptions('canal');
  const { options: campanhaOptions, addOption: addCampanhaOption } = useDropdownOptions('campanha');
  const { options: conteudoOptions, addOption: addConteudoOption } = useDropdownOptions('conteudo');

  // Estados principais
  const [searchInput, setSearchInput] = useState("");
  const [selectedLead, setSelectedLead] = useState<LeadSearchResult | null>(null);
  const [step, setStep] = useState<"search" | "create-lead" | "create-deal">("search");

  // Form para novo lead
  const [newLeadForm, setNewLeadForm] = useState({
    name: "",
    email: "",
    phone: "",
    instagram: "",
    company_name: "",        // Nome da Empresa
    // UTMs simplificados
    utm_source: "instagram", // Canal
    utm_campaign: "",        // Campanha
    utm_content: "",         // Conteúdo/Tipo
    context: "",             // Informação/contexto adicional
  });

  // Dedup check state
  const [foundDuplicates, setFoundDuplicates] = useState<LeadSearchResult[]>([]);
  const checkDuplicate = useCheckLeadDuplicate();
  const registerConversion = useRegisterConversion();

  // Busca de leads para indicação (quando canal = parceiro)
  const [referralSearch, setReferralSearch] = useState("");
  const { data: referralLeads } = useQuery({
    queryKey: ["referral-leads-search", referralSearch],
    queryFn: async () => {
      if (referralSearch.length < 2) return [];
      const { data } = await supabase
        .from("leads")
        .select("id, name, phone")
        .or(`name.ilike.%${referralSearch}%,phone.ilike.%${referralSearch}%`)
        .limit(10);
      return data || [];
    },
    enabled: referralSearch.length >= 2,
  });

  // Estado para prints/imagens coladas
  const [pastedImages, setPastedImages] = useState<string[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);

  // Handler para colar imagens (Ctrl+V)
  const handlePasteImage = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const base64 = event.target?.result as string;
            setPastedImages(prev => [...prev, base64]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  // Remover imagem
  const removeImage = (index: number) => {
    setPastedImages(prev => prev.filter((_, i) => i !== index));
  };

  // Extrair dados do print com IA e buscar lead automaticamente
  const extractFromImage = async (imageBase64: string) => {
    setIsExtracting(true);
    try {
      const { data: result, error: invokeError } = await supabase.functions.invoke('extract-lead-from-image', {
        body: { image_base64: imageBase64 },
      });
      if (invokeError) throw invokeError;
      
      if (result.success && result.data) {
        const { name, phone, email, instagram, context, confidence } = result.data;

        // Preencher form com dados extraídos
        setNewLeadForm(prev => ({
          ...prev,
          name: name || prev.name,
          phone: phone || prev.phone,
          email: email || prev.email,
          instagram: instagram || prev.instagram,
          context: context || prev.context,
        }));

        // Buscar se lead já existe (por email ou telefone)
        let existingLead = null;
        
        if (email) {
          const { data } = await supabase
            .from("leads")
            .select("id, name, email, phone, instagram, sales_stage, created_at")
            .ilike("email", email)
            .limit(1)
            .single();
          if (data) existingLead = data;
        }
        
        if (!existingLead && phone) {
          const cleanPhone = phone.replace(/\D/g, "");
          const last8 = cleanPhone.slice(-8);
          const { data } = await supabase
            .from("leads")
            .select("id, name, email, phone, instagram, sales_stage, created_at")
            .like("phone", `%${last8}%`)
            .limit(1)
            .single();
          if (data) existingLead = data;
        }

        if (existingLead) {
          // Lead encontrado! Selecionar e mostrar
          setSelectedLead(existingLead as LeadSearchResult);
          toast({
            title: '✨ Lead encontrado!',
            description: `${existingLead.name} já está cadastrado.`,
          });
        } else {
          // Lead não existe, ir para cadastro com dados preenchidos
          toast({
            title: '✨ Dados extraídos!',
            description: `Confiança: ${confidence === 'high' ? 'Alta' : confidence === 'medium' ? 'Média' : 'Baixa'}. Lead não encontrado, preencha o cadastro.`,
          });
          setStep("create-lead");
        }
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao extrair',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsExtracting(false);
    }
  };

  // Handler para colar print na tela de busca
  const handlePasteInSearch = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const base64 = event.target?.result as string;
            setPastedImages([base64]); // Guardar a imagem
            await extractFromImage(base64); // Extrair automaticamente
          };
          reader.readAsDataURL(file);
        }
        break; // Só processar a primeira imagem
      }
    }
  };

  // Form para deal
  const [dealForm, setDealForm] = useState({
    stageId: defaultStageId || "",
    productId: "",
    notes: "",
    expectedValue: "",
    salesRepId: teamMember?.id || "", // Responsável pelo deal
    // UTMs do deal (origem desta venda específica)
    utm_source: "instagram",
    utm_campaign: "",
    utm_content: "",
  });

  // Buscar todos os membros do time (mesma query do LeadDetail)
  const { data: salesTeam } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('team_members')
        .select('id, name, email')
        .eq('is_active', true)
        .order('name');
      return data || [];
    },
  });

  // Carregar etapas do pipeline (filtradas pelo pipeline selecionado)
  const { data: pipelineStages } = usePipelineStages(pipelineId);
  const { data: products } = useProducts();

  // Filtrar etapas (excluir ganho/perdido para criação)
  const availableStages = useMemo(() =>
    (pipelineStages || []).filter(s => !s.is_won && !s.is_lost),
    [pipelineStages]
  );

  // Definir stage padrão quando carregar
  useEffect(() => {
    if (availableStages.length > 0 && !dealForm.stageId) {
      setDealForm(f => ({ ...f, stageId: defaultStageId || availableStages[0].id }));
    }
  }, [availableStages, defaultStageId]);

  // Aplicar defaultValues e pular para create-lead quando fornecidos
  useEffect(() => {
    if (open && defaultValues) {
      setNewLeadForm(prev => ({
        ...prev,
        name: defaultValues.name || prev.name,
        email: defaultValues.email || prev.email,
        phone: defaultValues.phone || prev.phone,
        instagram: defaultValues.instagram || prev.instagram,
        utm_source: defaultValues.utm_source || prev.utm_source,
        utm_campaign: defaultValues.utm_campaign || prev.utm_campaign,
        utm_content: defaultValues.utm_content || prev.utm_content,
        context: defaultValues.context || prev.context,
      }));
      setStep("create-lead");
    }
  }, [open, defaultValues]);

  // Busca inteligente - email exato OU últimos 8 dígitos do telefone
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["lead-smart-search", searchInput],
    queryFn: async () => {
      if (searchInput.length < 3) return [];

      // Detectar se é email ou telefone
      const isEmail = searchInput.includes("@");
      const cleanPhone = searchInput.replace(/\D/g, "");
      const isPhone = cleanPhone.length >= 8;

      let query = supabase
        .from("leads")
        .select("id, name, email, phone, instagram, sales_stage, created_at");

      if (isEmail) {
        // Busca por email (case insensitive)
        query = query.ilike("email", `%${searchInput}%`);
      } else if (isPhone) {
        // Busca pelos últimos 8 dígitos do telefone
        const last8 = cleanPhone.slice(-8);
        query = query.like("phone", `%${last8}%`);
      } else {
        // Busca por nome ou instagram
        query = query.or(`name.ilike.%${searchInput}%,instagram.ilike.%${searchInput}%`);
      }

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) throw error;
      return (data || []) as LeadSearchResult[];
    },
    enabled: searchInput.length >= 3,
    staleTime: 500,
  });

  // Função para fazer upload de imagens
  const uploadImages = async (leadId: string): Promise<string[]> => {
    if (pastedImages.length === 0) return [];
    
    const uploadedUrls: string[] = [];
    
    for (let i = 0; i < pastedImages.length; i++) {
      const base64 = pastedImages[i];
      // Converter base64 para blob
      const response = await fetch(base64);
      const blob = await response.blob();
      
      const fileName = `${leadId}/print_${Date.now()}_${i}.png`;
      
      const { data, error } = await supabase.storage
        .from('lead-attachments')
        .upload(fileName, blob, {
          contentType: 'image/png',
          upsert: true,
        });
      
      if (!error && data) {
        const { data: urlData } = await supabase.storage
          .from('lead-attachments')
          .createSignedUrl(fileName, 31536000); // 1 year
        if (urlData?.signedUrl) uploadedUrls.push(urlData.signedUrl);
      }
    }
    
    return uploadedUrls;
  };

  // Mutation: Criar lead
  const createLeadMutation = useMutation({
    mutationFn: async () => {
      const { data: lead, error } = await supabase
        .from("leads")
        .insert({
          name: newLeadForm.name,
          email: newLeadForm.email || null,
          phone: newLeadForm.phone || null,
          instagram: newLeadForm.instagram || null,
          company_name: newLeadForm.company_name || null,
          // UTMs
          utm_source: newLeadForm.utm_source || null,
          utm_campaign: newLeadForm.utm_campaign || null,
          utm_content: newLeadForm.utm_content || null,
          context: newLeadForm.context || null,
          sales_stage: "new",
        })
        .select()
        .single();

      if (error) throw error;
      
      // Upload das imagens e salvar URLs
      if (pastedImages.length > 0 && lead) {
        const imageUrls = await uploadImages(lead.id);
        if (imageUrls.length > 0) {
          // Atualizar lead com as URLs das imagens
          await supabase
            .from("leads")
            .update({ 
              attachments: imageUrls,
              context: newLeadForm.context 
                ? `${newLeadForm.context}\n\n📎 ${imageUrls.length} print(s) anexado(s)`
                : `📎 ${imageUrls.length} print(s) anexado(s)`
            })
            .eq("id", lead.id);
        }
      }
      
      return lead;
    },
  });

  // Mutation: Criar deal
  const createDealMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const product = products?.find(p => p.id === dealForm.productId);
      const expectedValue = dealForm.expectedValue
        ? parseFloat(dealForm.expectedValue)
        : product?.price || 0;

      const salesRepId = dealForm.salesRepId || teamMember?.id || null;

      // Resolver pipeline_id: do prop, do stage selecionado, ou buscar no banco
      let resolvedPipelineId = pipelineId || null;
      if (!resolvedPipelineId && dealForm.stageId) {
        const selectedStage = pipelineStages?.find(s => s.id === dealForm.stageId);
        if (selectedStage?.pipeline_id) {
          resolvedPipelineId = selectedStage.pipeline_id;
        } else {
          // Fallback: buscar pipeline_id do stage no banco
          const { data: stageData } = await supabase
            .from('sales_pipeline_stages')
            .select('pipeline_id')
            .eq('id', dealForm.stageId)
            .single();
          if (stageData?.pipeline_id) {
            resolvedPipelineId = stageData.pipeline_id;
          }
        }
      }

      const { data: deal, error } = await supabase
        .from("deals")
        .insert({
          lead_id: leadId,
          pipeline_id: resolvedPipelineId,
          pipeline_stage_id: dealForm.stageId,
          product_id: dealForm.productId || null,
          sales_rep_id: salesRepId,
          original_price: product?.price || expectedValue,
          negotiated_price: expectedValue,
          status: "open",
          notes: dealForm.notes || null,
          // UTMs do deal (origem desta venda específica)
          utm_source: dealForm.utm_source || null,
          utm_campaign: dealForm.utm_campaign || null,
          utm_content: dealForm.utm_content || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Atualizar o lead com o mesmo responsável do deal
      if (salesRepId) {
        await supabase
          .from("leads")
          .update({ sales_rep_id: salesRepId })
          .eq("id", leadId);
      }

      return deal;
    },
  });

  // Handler: Selecionar lead encontrado
  const handleSelectLead = (lead: LeadSearchResult) => {
    setSelectedLead(lead);
    if (mode === "deal") {
      setStep("create-deal");
    }
  };

  // Handler: Ir para criar novo lead
  const handleGoToCreateLead = () => {
    // Pré-preencher com o que foi digitado
    const isEmail = searchInput.includes("@");
    const cleanPhone = searchInput.replace(/\D/g, "");

    setNewLeadForm((prev) => ({
      ...prev,
      email: isEmail ? searchInput : prev.email,
      phone: !isEmail && cleanPhone.length >= 8 ? cleanPhone : prev.phone,
      name: !isEmail && cleanPhone.length < 8 ? searchInput : prev.name,
    }));
    setStep("create-lead");
  };

  // Dedup handlers
  const handleOpenDuplicate = (dupId: string) => {
    handleClose();
    navigate(`/comercial/leads/${dupId}`);
  };

  const handleRegisterConversion = (dupId: string) => {
    registerConversion.mutate(
      {
        leadId: dupId,
        source: newLeadForm.utm_source,
        utm_source: newLeadForm.utm_source || undefined,
        utm_campaign: newLeadForm.utm_campaign || undefined,
        utm_content: newLeadForm.utm_content || undefined,
      },
      {
        onSuccess: () => {
          handleClose();
          navigate(`/comercial/leads/${dupId}`);
        },
      }
    );
  };

  const handleForceCreate = async () => {
    setFoundDuplicates([]);
    await executeCreateLeadAndDeal();
  };

  // Handler: Criar lead e opcionalmente deal
  const handleCreateLeadAndDeal = async () => {
    if (!newLeadForm.name) {
      toast({
        title: "Nome obrigatório",
        description: "Preencha o nome do lead",
        variant: "destructive",
      });
      return;
    }

    if (!newLeadForm.phone && !newLeadForm.email) {
      toast({
        title: "Contato obrigatório",
        description: "Preencha pelo menos email ou telefone",
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
        return;
      }
    }

    setFoundDuplicates([]);
    await executeCreateLeadAndDeal();
  };

  const executeCreateLeadAndDeal = async () => {
    try {
      const lead = await createLeadMutation.mutateAsync();

      // Disparar notificação de lead criado
      if (lead?.id) {
        getLeadNotificationContext(lead.id).then(ctx => {
          if (ctx) triggerNotificationEvent('lead_created', ctx);
        }).catch(() => {});
      }

      if (mode === "deal") {
        const deal = await createDealMutation.mutateAsync(lead.id);
        toast({
          title: "Deal criado!",
          description: `Deal para ${lead.name} foi criado com sucesso.`,
        });
        // Disparar notificação de deal criado
        if (deal?.id) {
          getDealNotificationContext(deal.id).then(ctx => {
            if (ctx) triggerNotificationEvent('deal_created', ctx);
          }).catch(() => {});
        }
      } else {
        toast({
          title: "Lead criado!",
          description: `${lead.name} foi adicionado ao comercial.`,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["sales-leads"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });

      handleClose();

      if (onLeadCreated) {
        onLeadCreated(lead.id);
      } else {
        navigate(`/comercial/leads/${lead.id}`);
      }
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Handler: Criar deal para lead existente
  const handleCreateDealForExisting = async () => {
    if (!selectedLead) return;

    if (!dealForm.stageId) {
      toast({
        title: "Etapa obrigatória",
        description: "Selecione a etapa do pipeline",
        variant: "destructive",
      });
      return;
    }

    try {
      const deal = await createDealMutation.mutateAsync(selectedLead.id);

      toast({
        title: "Deal criado!",
        description: `Deal para ${selectedLead.name} foi criado.`,
      });

      // Disparar notificação de deal criado
      if (deal?.id) {
        getDealNotificationContext(deal.id).then(ctx => {
          if (ctx) triggerNotificationEvent('deal_created', ctx);
        }).catch(() => {});
      }

      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["deals"] });

      handleClose();
      navigate(`/comercial/leads/${selectedLead.id}`);
    } catch (error: any) {
      toast({
        title: "Erro",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  // Handler: Abrir lead existente (mode = "lead")
  const handleOpenLead = () => {
    if (selectedLead) {
      handleClose();
      navigate(`/comercial/leads/${selectedLead.id}`);
    }
  };

  // Reset e fechar
  const handleClose = () => {
    setSearchInput("");
    setSelectedLead(null);
    setStep("search");
    setPastedImages([]);
    setReferralSearch("");
    setFoundDuplicates([]);
    setNewLeadForm({
      name: "",
      email: "",
      phone: "",
      instagram: "",
      company_name: "",
      utm_source: "instagram",
      utm_campaign: "",
      utm_content: "",
      context: "",
    });
    setDealForm({
      stageId: defaultStageId || availableStages[0]?.id || "",
      productId: "",
      notes: "",
      expectedValue: "",
      utm_source: "instagram",
      utm_campaign: "",
      utm_content: "",
    });
    onOpenChange(false);
  };

  const getInitials = (name: string) =>
    name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);

  const isLoading = createLeadMutation.isPending || createDealMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className="sm:max-w-[650px] max-h-[85vh] flex flex-col overflow-hidden"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === "deal" ? (
              <>
                <Briefcase className="h-5 w-5" />
                Novo Deal
              </>
            ) : (
              <>
                <UserPlus className="h-5 w-5" />
                Novo Lead
              </>
            )}
          </DialogTitle>
          <DialogDescription>
            {step === "search" && "Busque por email/telefone ou cole um print para extrair com IA"}
            {step === "create-lead" && "Preencha os dados do novo lead"}
            {step === "create-deal" && `Configurar deal para ${selectedLead?.name}`}
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Buscar Lead */}
        {step === "search" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4" onPaste={handlePasteInSearch}>
              {/* Campo de busca OU área para colar print */}
              <div className="space-y-2">
                <Label>Email, Telefone ou Print</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Digite email/telefone ou cole um print (Ctrl+V)..."
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Busca por email/telefone ou <span className="font-medium text-primary">cole um print</span> para extrair dados com IA
                </p>
              </div>

              {/* Preview do print colado + loading */}
              {(pastedImages.length > 0 || isExtracting) && (
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border">
                  {pastedImages.length > 0 && (
                    <img
                      src={pastedImages[0]}
                      alt="Print"
                      className="w-16 h-16 object-cover rounded-md border"
                    />
                  )}
                  <div className="flex-1">
                    {isExtracting ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        <span className="text-sm">Extraindo dados com IA...</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-primary" />
                        <span className="text-sm">Print analisado</span>
                      </div>
                    )}
                  </div>
                  {!isExtracting && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setPastedImages([])}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}

              {/* Resultados da busca */}
              <div className="min-h-[200px] border rounded-lg p-2">
                {isSearching ? (
                  <div className="flex items-center justify-center h-[180px]">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : searchResults && searchResults.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground px-2">
                      {searchResults.length} lead(s) encontrado(s)
                    </p>
                    {searchResults.map((lead) => (
                      <div
                        key={lead.id}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
                          selectedLead?.id === lead.id
                            ? "bg-primary/10 border-2 border-primary"
                            : "hover:bg-muted border-2 border-transparent"
                        )}
                        onClick={() => handleSelectLead(lead)}
                      >
                        <Avatar className="h-10 w-10">
                          <AvatarFallback className="bg-primary/10 text-primary text-sm">
                            {getInitials(lead.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{lead.name}</p>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
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
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    ))}
                  </div>
                ) : searchInput.length >= 3 ? (
                  <div className="flex flex-col items-center justify-center h-[180px] text-center">
                    <AlertCircle className="h-8 w-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">Nenhum lead encontrado</p>
                    <Button
                      variant="link"
                      size="sm"
                      className="mt-2"
                      onClick={handleGoToCreateLead}
                    >
                      <UserPlus className="h-4 w-4 mr-1" />
                      Criar novo lead
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-[180px] text-muted-foreground text-sm">
                    <User className="h-5 w-5 mr-2 opacity-50" />
                    Digite para buscar...
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="shrink-0 border-t pt-4 gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                variant="outline"
                onClick={handleGoToCreateLead}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Criar Novo
              </Button>
              {mode === "lead" && selectedLead && (
                <Button onClick={handleOpenLead}>
                  Abrir Lead
                </Button>
              )}
              {mode === "deal" && selectedLead && (
                <Button onClick={() => setStep("create-deal")}>
                  Criar Deal
                  <Briefcase className="h-4 w-4 ml-2" />
                </Button>
              )}
            </DialogFooter>
          </>
        )}

        {/* Step 2: Criar Novo Lead */}
        {step === "create-lead" && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-3 pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 space-y-1.5">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    placeholder="Nome completo"
                    value={newLeadForm.name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                    autoFocus
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="phone">Telefone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      placeholder="11999999999"
                      value={newLeadForm.phone}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      placeholder="email@exemplo.com"
                      value={newLeadForm.email}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="company_name">Empresa</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="company_name"
                      placeholder="Nome da empresa"
                      value={newLeadForm.company_name}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, company_name: e.target.value })}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="instagram">Instagram</Label>
                  <div className="relative">
                    <Instagram className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="instagram"
                      placeholder="@usuario"
                      value={newLeadForm.instagram}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, instagram: e.target.value })}
                      className="pl-9"
                    />
                  </div>
                </div>

                <ComboboxField
                  label="Canal *"
                  value={newLeadForm.utm_source}
                  onChange={(v) => setNewLeadForm({ ...newLeadForm, utm_source: v })}
                  options={canalOptions}
                  placeholder="De onde veio?"
                  icon={<Search className="h-4 w-4 text-muted-foreground" />}
                  onAddOption={addCanalOption}
                />

                <ComboboxField
                  label="Campanha"
                  value={newLeadForm.utm_campaign}
                  onChange={(v) => setNewLeadForm({ ...newLeadForm, utm_campaign: v })}
                  options={campanhaOptions}
                  placeholder="Ex: reels, stories..."
                  icon={<Megaphone className="h-4 w-4 text-muted-foreground" />}
                  onAddOption={addCampanhaOption}
                />

              {/* Conteudo: modo especial quando canal = parceiro */}
              {newLeadForm.utm_source === "parceiro" ? (
                <ReferralField
                  value={newLeadForm.utm_content}
                  referralSearch={referralSearch}
                  onSearchChange={setReferralSearch}
                  referralLeads={referralLeads || []}
                  onSelect={(val) => setNewLeadForm({ ...newLeadForm, utm_content: val })}
                  onAddOption={addConteudoOption}
                />
              ) : (
                <ComboboxField
                  label="Conteúdo/Tipo"
                  value={newLeadForm.utm_content}
                  onChange={(v) => setNewLeadForm({ ...newLeadForm, utm_content: v })}
                  options={conteudoOptions}
                  placeholder="Ex: direct, comentário..."
                  icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                  onAddOption={addConteudoOption}
                />
              )}

              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="context">
                  <MessageSquare className="h-4 w-4 inline mr-1" />
                  Contexto / Primeira Mensagem
                </Label>
                <Textarea
                  id="context"
                  placeholder="Ex: Lead veio pelo direct perguntando sobre mentoria..."
                  value={newLeadForm.context}
                  onChange={(e) => setNewLeadForm({ ...newLeadForm, context: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>

              {/* Campo para colar prints */}
              <div className="col-span-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>
                    <ImagePlus className="h-4 w-4 inline mr-1" />
                    Prints / Screenshots
                  </Label>
                  {pastedImages.length > 0 && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => extractFromImage(pastedImages[0])}
                      disabled={isExtracting}
                      className="h-7 text-xs"
                    >
                      {isExtracting ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="h-3 w-3 mr-1" />
                      )}
                      Extrair com IA
                    </Button>
                  )}
                </div>
                <div
                  className="border-2 border-dashed rounded-lg p-3 min-h-[60px] cursor-pointer hover:border-primary/50 transition-colors focus-within:border-primary"
                  onPaste={handlePasteImage}
                  tabIndex={0}
                >
                  {pastedImages.length === 0 ? (
                    <div className="flex items-center justify-center gap-2 text-muted-foreground text-sm py-2">
                      <ImagePlus className="h-5 w-5 opacity-50" />
                      <span>Cole prints aqui (Ctrl+V)</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {pastedImages.map((img, index) => (
                        <div key={index} className="relative group">
                          <img
                            src={img}
                            alt={`Print ${index + 1}`}
                            className="w-full h-16 object-cover rounded-md border"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(index)}
                            className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      <div
                        className="flex items-center justify-center h-16 border-2 border-dashed rounded-md text-muted-foreground hover:border-primary/50 cursor-pointer"
                        onPaste={handlePasteImage}
                        tabIndex={0}
                      >
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Se for deal, mostrar campos do deal */}
            {mode === "deal" && (
              <div className="border-t pt-4 space-y-3">
                <h4 className="font-medium text-sm flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Configuração do Deal
                </h4>

                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Etapa *</Label>
                    <Select
                      value={dealForm.stageId}
                      onValueChange={(v) => setDealForm({ ...dealForm, stageId: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableStages.map((stage) => (
                          <SelectItem key={stage.id} value={stage.id}>
                            {stage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Produto</Label>
                    <Select
                      value={dealForm.productId}
                      onValueChange={(v) => setDealForm({ ...dealForm, productId: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Opcional" />
                      </SelectTrigger>
                      <SelectContent>
                        {(products || []).map((product) => (
                          <SelectItem key={product.id} value={product.id}>
                            {product.name} - R$ {product.price?.toLocaleString('pt-BR')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      <UserCog className="h-3 w-3" />
                      Responsável
                    </Label>
                    <Select
                      value={dealForm.salesRepId}
                      onValueChange={(v) => setDealForm({ ...dealForm, salesRepId: v })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(salesTeam || []).map((member: any) => (
                          <SelectItem key={member.id} value={member.id}>
                            {member.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="notes" className="text-xs">Observações</Label>
                  <Textarea
                    id="notes"
                    placeholder="Notas sobre a negociação..."
                    value={dealForm.notes}
                    onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>
            )}

              {/* Duplicate alert */}
              {foundDuplicates.length > 0 && (
                <Alert variant="destructive" className="border-amber-300 bg-amber-50 text-amber-900">
                  <AlertCircle className="h-4 w-4 !text-amber-600" />
                  <AlertDescription className="space-y-3">
                    <p className="font-medium">Lead já existe com este telefone/email!</p>
                    <div className="space-y-2">
                      {foundDuplicates.map((dup) => (
                        <div key={dup.id} className="flex items-center justify-between p-2 bg-white rounded border">
                          <div className="text-sm">
                            <span className="font-medium">{dup.name}</span>
                            <span className="text-muted-foreground ml-2">{dup.phone || dup.email}</span>
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
            </div>

            <DialogFooter className="shrink-0 border-t pt-4 gap-2">
              <Button variant="outline" onClick={() => setStep("search")}>
                Voltar
              </Button>
              <Button onClick={handleCreateLeadAndDeal} disabled={isLoading || checkDuplicate.isPending}>
                {(isLoading || checkDuplicate.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "deal" ? "Criar Lead e Deal" : "Criar Lead"}
              </Button>
            </DialogFooter>
          </>
        )}

        {/* Step 3: Criar Deal para Lead Existente */}
        {step === "create-deal" && selectedLead && (
          <>
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {/* Card do lead selecionado */}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border">
              <Avatar className="h-12 w-12">
                <AvatarFallback className="bg-primary/10 text-primary">
                  {getInitials(selectedLead.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-semibold">{selectedLead.name}</p>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  {selectedLead.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedLead.phone}
                    </span>
                  )}
                  {selectedLead.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedLead.email}
                    </span>
                  )}
                </div>
              </div>
              <Badge variant="secondary">Lead existente</Badge>
            </div>

            {/* Campos do deal */}
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">Etapa *</Label>
                  <Select
                    value={dealForm.stageId}
                    onValueChange={(v) => setDealForm({ ...dealForm, stageId: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          {stage.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Produto</Label>
                  <Select
                    value={dealForm.productId}
                    onValueChange={(v) => setDealForm({ ...dealForm, productId: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Opcional" />
                    </SelectTrigger>
                    <SelectContent>
                      {(products || []).map((product) => (
                        <SelectItem key={product.id} value={product.id}>
                          {product.name} - R$ {product.price?.toLocaleString('pt-BR')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <UserCog className="h-3 w-3" />
                    Responsável
                  </Label>
                  <Select
                    value={dealForm.salesRepId}
                    onValueChange={(v) => setDealForm({ ...dealForm, salesRepId: v })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {(salesTeam || []).map((member: any) => (
                        <SelectItem key={member.id} value={member.id}>
                          {member.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* UTMs - Origem desta venda */}
              <div className="border-t pt-3 mt-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">
                  Origem desta venda
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <ComboboxField
                    label="Canal"
                    value={dealForm.utm_source}
                    onChange={(v) => setDealForm({ ...dealForm, utm_source: v })}
                    options={canalOptions}
                    placeholder="De onde?"
                    onAddOption={addCanalOption}
                  />
                  <ComboboxField
                    label="Campanha"
                    value={dealForm.utm_campaign}
                    onChange={(v) => setDealForm({ ...dealForm, utm_campaign: v })}
                    options={campanhaOptions}
                    placeholder="Tipo"
                    onAddOption={addCampanhaOption}
                  />
                  <ComboboxField
                    label="Conteúdo"
                    value={dealForm.utm_content}
                    onChange={(v) => setDealForm({ ...dealForm, utm_content: v })}
                    options={conteudoOptions}
                    placeholder="Detalhe"
                    onAddOption={addConteudoOption}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deal-notes" className="text-xs">Observações</Label>
                <Textarea
                  id="deal-notes"
                  placeholder="Notas sobre a negociação..."
                  value={dealForm.notes}
                  onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            </div>

            <DialogFooter className="shrink-0 border-t pt-4 gap-2">
              <Button variant="outline" onClick={() => {
                setSelectedLead(null);
                setStep("search");
              }}>
                Voltar
              </Button>
              <Button onClick={handleCreateDealForExisting} disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Criar Deal
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
