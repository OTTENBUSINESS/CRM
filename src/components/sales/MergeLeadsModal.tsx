import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Merge,
  Search,
  Loader2,
  Phone,
  Mail,
  Instagram,
  ArrowRight,
  MessageSquare,
  Briefcase,
  PhoneCall,
  Video,
  AlertTriangle,
  Check,
  Building2,
  UserPlus,
  User,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useMergeLeads,
  useLeadDuplicates,
  useSearchLeadsForMerge,
  useLinkedOrganizations,
} from "@/hooks/useMergeLeads";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

interface MergeLeadsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    instagram?: string | null;
    sales_stage?: string | null;
    etapa_funil?: string | null;
    sales_score?: number;
    company_name?: string | null;
    created_at?: string;
  };
}

const STAGE_RANK: Record<string, number> = {
  novo: 1,
  new: 1,
  captura: 2,
  qualificacao: 3,
  agendamento: 4,
  negociacao: 5,
  fechado: 6,
};

const STAGE_LABELS: Record<string, string> = {
  novo: "Novo",
  new: "Novo",
  captura: "Captura",
  qualificacao: "Qualificação",
  agendamento: "Agendamento",
  negociacao: "Negociação",
  fechado: "Fechado",
  perdido: "Perdido",
};

function getStageRank(stage?: string | null): number {
  return STAGE_RANK[stage || "novo"] || 0;
}

function getStageLabel(stage?: string | null): string {
  return STAGE_LABELS[stage || "novo"] || stage || "Novo";
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function getStageBadge(stage?: string | null) {
  const colors: Record<string, string> = {
    novo: "bg-blue-100 text-blue-700",
    new: "bg-blue-100 text-blue-700",
    captura: "bg-purple-100 text-purple-700",
    qualificacao: "bg-yellow-100 text-yellow-700",
    agendamento: "bg-orange-100 text-orange-700",
    negociacao: "bg-pink-100 text-pink-700",
    fechado: "bg-green-100 text-green-700",
    perdido: "bg-red-100 text-red-700",
  };
  const color = colors[stage || "novo"] || "bg-gray-100 text-gray-700";
  return (
    <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", color)}>
      {getStageLabel(stage)}
    </span>
  );
}

export function MergeLeadsModal({ open, onOpenChange, lead }: MergeLeadsModalProps) {
  const [step, setStep] = useState<"select" | "confirm">("select");
  const [mode, setMode] = useState<"merge" | "newlead" | "unlink">("merge");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // New lead form state
  const relationshipTypes = [
    { value: "socio", label: "Sócio(a)" },
    { value: "responsavel", label: "Responsável de área" },
    { value: "indicacao", label: "Indicação" },
    { value: "decisor", label: "Decisor" },
    { value: "outro", label: "Outro" },
  ];

  const [newLeadForm, setNewLeadForm] = useState({
    name: "",
    phone: "",
    email: "",
    company_name: "",
    job_title: "",
    relationship: "responsavel",
    notes: "",
  });

  const { data: duplicates, isLoading: loadingDuplicates } = useLeadDuplicates(lead.id);
  const { data: searchResults, isLoading: isSearching } = useSearchLeadsForMerge(searchQuery, lead.id);
  const { data: linkedOrgs, isLoading: loadingLinkedOrgs } = useLinkedOrganizations(lead.id);
  const mergeMutation = useMergeLeads();

  // Mutation para desvincular organização
  const unlinkOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const { error } = await supabase
        .from("organizations")
        .update({ primary_contact_id: null })
        .eq("id", orgId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Organização desvinculada", description: `O lead ${lead.name} não é mais contato principal desta organização.` });
      queryClient.invalidateQueries({ queryKey: ["linked-organizations"] });
      queryClient.invalidateQueries({ queryKey: ["organizations"] });
    },
    onError: (error: any) => {
      toast({ title: "Erro ao desvincular", description: error.message, variant: "destructive" });
    },
  });

  // Mutation para criar lead associado
  const createAssociatedLead = useMutation({
    mutationFn: async () => {
      const relLabel = relationshipTypes.find(r => r.value === newLeadForm.relationship)?.label || newLeadForm.relationship;
      const contextParts = [
        `${relLabel} de: ${lead.name}${lead.phone ? ` (${lead.phone})` : ""}`,
        newLeadForm.notes,
      ].filter(Boolean);

      const { data: newLead, error } = await supabase
        .from("leads")
        .insert({
          name: newLeadForm.name,
          phone: newLeadForm.phone || null,
          email: newLeadForm.email || null,
          company_name: newLeadForm.company_name || lead.company_name || null,
          job_title: newLeadForm.job_title || null,
          utm_source: newLeadForm.relationship === "indicacao" ? "indicacao" : undefined,
          sales_stage: lead.sales_stage || "new",
          status: lead.status || "new",
          pipeline_stage_id: lead.pipeline_stage_id || null,
          context: contextParts.join("\n"),
          partner_lead_id: lead.id,
        })
        .select()
        .single();
      if (error) throw error;

      // Auto-link new lead as deal_contact on parent's open deals
      const { data: parentDeals } = await supabase
        .from("deals")
        .select("id")
        .eq("lead_id", lead.id)
        .not("status", "in", '("won","lost")');

      if (parentDeals?.length) {
        const roleMap: Record<string, string> = {
          socio: "decisor",
          responsavel: "tecnico",
          decisor: "decisor",
          indicacao: "influenciador",
          outro: "outro",
        };
        const role = roleMap[newLeadForm.relationship] || "outro";
        for (const deal of parentDeals) {
          await supabase.from("deal_contacts").insert({
            deal_id: deal.id,
            lead_id: newLead.id,
            role,
            is_primary: false,
          }).select(); // ignore errors (e.g. unique constraint)
        }
      }

      return newLead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["salesLeads"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline"] });
      const relLabel = relationshipTypes.find(r => r.value === newLeadForm.relationship)?.label || "";
      toast({
        title: "Lead criado!",
        description: `${newLeadForm.name} vinculado como ${relLabel.toLowerCase()} de ${lead.name}`,
      });
      onOpenChange(false);
      resetState();
    },
    onError: () => {
      toast({ title: "Erro ao criar lead", variant: "destructive" });
    },
  });

  // Determine which is primary (most advanced stage)
  const currentStageRank = getStageRank(lead.etapa_funil || lead.sales_stage);
  const selectedStageRank = selectedLead
    ? getStageRank(selectedLead.etapa_funil || selectedLead.sales_stage)
    : 0;

  const primaryLead = selectedStageRank > currentStageRank ? selectedLead : lead;
  const secondaryLead = selectedStageRank > currentStageRank ? lead : selectedLead;

  const handleMerge = () => {
    if (!selectedLead) return;
    setShowConfirmDialog(true);
  };

  const executeMerge = () => {
    if (!selectedLead) return;
    mergeMutation.mutate(
      {
        primaryId: primaryLead.id,
        secondaryId: secondaryLead.id,
      },
      {
        onSuccess: () => {
          setShowConfirmDialog(false);
          onOpenChange(false);
          resetState();
        },
      }
    );
  };

  const resetState = () => {
    setStep("select");
    setMode("merge");
    setSearchQuery("");
    setSelectedLead(null);
    setNewLeadForm({ name: "", phone: "", email: "", company_name: "", job_title: "", relationship: "responsavel", notes: "" });
  };

  const displayLeads = searchQuery.length >= 2 ? searchResults : duplicates;
  const isLoadingList = searchQuery.length >= 2 ? isSearching : loadingDuplicates;

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) resetState();
          onOpenChange(v);
        }}
      >
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Merge className="h-5 w-5" />
              Mesclar Lead
            </DialogTitle>
            <DialogDescription>
              {step === "select"
                ? "Selecione o lead duplicado para mesclar com " + lead.name
                : "Confirme os dados que serão unificados"}
            </DialogDescription>
          </DialogHeader>

          {/* Step 1: Select lead to merge OR create referral */}
          {step === "select" && (
            <div className="space-y-4">
              {/* Current lead card */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="bg-primary/10 text-primary text-sm">
                        {getInitials(lead.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{lead.name}</p>
                        {getStageBadge(lead.etapa_funil || lead.sales_stage)}
                        <Badge variant="outline" className="text-xs">Lead atual</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {lead.phone}
                          </span>
                        )}
                        {lead.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" /> {lead.email}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Mode tabs */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg">
                <button
                  onClick={() => setMode("merge")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    mode === "merge"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Merge className="h-4 w-4" />
                  Mesclar
                </button>
                <button
                  onClick={() => setMode("newlead")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    mode === "newlead"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <UserPlus className="h-4 w-4" />
                  Novo Lead
                </button>
                <button
                  onClick={() => setMode("unlink")}
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    mode === "unlink"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Unlink className="h-4 w-4" />
                  Desvincular
                </button>
              </div>

              {mode === "unlink" ? (
                <>
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <p className="text-xs text-amber-700">
                      Desvincule <strong>{lead.name}</strong> como contato principal de uma organização. Isso remove apenas o vínculo — nenhum dado é apagado.
                    </p>
                  </div>

                  {loadingLinkedOrgs ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : linkedOrgs && linkedOrgs.length > 0 ? (
                    <div className="space-y-2">
                      {linkedOrgs.map((org) => (
                        <Card key={org.id}>
                          <CardContent className="p-3 flex items-center gap-3">
                            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm">{org.name}</p>
                              <p className="text-xs text-muted-foreground">
                                Contato principal
                                {org.status && ` · ${org.status}`}
                              </p>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-amber-600 border-amber-300 hover:bg-amber-50"
                              onClick={() => unlinkOrgMutation.mutate(org.id)}
                              disabled={unlinkOrgMutation.isPending}
                            >
                              {unlinkOrgMutation.isPending ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              Desvincular
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <Building2 className="h-8 w-8 mb-2 opacity-40" />
                      <p className="text-sm">Nenhuma organização vinculada</p>
                      <p className="text-xs">Este lead não é contato principal de nenhuma organização.</p>
                    </div>
                  )}

                  <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Fechar
                    </Button>
                  </DialogFooter>
                </>
              ) : mode === "merge" ? (
                <>
                  {/* Search */}
                  <div className="space-y-2">
                    <Label>Buscar lead para mesclar</Label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar por nome, telefone ou email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {/* Duplicates / Search results */}
                  <div>
                    {searchQuery.length < 2 && duplicates && duplicates.length > 0 && (
                      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-500" />
                        {duplicates.length} duplicata(s) encontrada(s) automaticamente
                      </p>
                    )}
                    <ScrollArea className="h-[250px] border rounded-lg">
                      {isLoadingList ? (
                        <div className="flex items-center justify-center h-full">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                        </div>
                      ) : displayLeads && displayLeads.length > 0 ? (
                        <div className="p-2 space-y-1">
                          {displayLeads.map((dup: any) => (
                            <div
                              key={dup.id}
                              className={cn(
                                "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all",
                                selectedLead?.id === dup.id
                                  ? "bg-primary/10 border-2 border-primary"
                                  : "hover:bg-muted border-2 border-transparent"
                              )}
                              onClick={() => setSelectedLead(dup)}
                            >
                              <Avatar className="h-10 w-10">
                                <AvatarFallback className="bg-muted text-muted-foreground text-sm">
                                  {getInitials(dup.name)}
                                </AvatarFallback>
                              </Avatar>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-sm truncate">{dup.name}</p>
                                  {getStageBadge(dup.etapa_funil || dup.sales_stage)}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                                  {dup.phone && (
                                    <span className="flex items-center gap-1">
                                      <Phone className="h-3 w-3" /> {dup.phone}
                                    </span>
                                  )}
                                  {dup.email && (
                                    <span className="flex items-center gap-1 truncate">
                                      <Mail className="h-3 w-3" /> {dup.email}
                                    </span>
                                  )}
                                </div>
                                {/* Counts row */}
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  {(dup.deals_count ?? 0) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Briefcase className="h-3 w-3" /> {dup.deals_count} deals
                                    </span>
                                  )}
                                  {(dup.messages_count ?? 0) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" /> {dup.messages_count} msgs
                                    </span>
                                  )}
                                  {(dup.calls_count ?? 0) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <PhoneCall className="h-3 w-3" /> {dup.calls_count} calls
                                    </span>
                                  )}
                                  {(dup.meetings_count ?? 0) > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Video className="h-3 w-3" /> {dup.meetings_count} reuniões
                                    </span>
                                  )}
                                </div>
                              </div>
                              {selectedLead?.id === dup.id && (
                                <Check className="h-5 w-5 text-primary shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                          {searchQuery.length >= 2
                            ? "Nenhum lead encontrado"
                            : "Nenhuma duplicata detectada. Use a busca acima."}
                        </div>
                      )}
                    </ScrollArea>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => setStep("confirm")}
                      disabled={!selectedLead}
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4 ml-2" />
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                /* New associated lead form */
                <>
                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-xs text-blue-700">
                      Crie um novo lead vinculado a <strong>{lead.name}</strong> — pode ser um sócio, responsável de área, indicação ou outro contato relacionado.
                    </p>
                  </div>

                  {/* Relationship type pills */}
                  <div className="space-y-1">
                    <Label className="text-xs">Relação com {lead.name}</Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {relationshipTypes.map(({ value, label }) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setNewLeadForm({ ...newLeadForm, relationship: value })}
                          className={cn(
                            "text-xs px-3 py-1 rounded-full border transition-colors",
                            newLeadForm.relationship === value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background text-muted-foreground border-border hover:bg-muted"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome *</Label>
                      <div className="relative">
                        <User className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Nome completo"
                          value={newLeadForm.name}
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                          className="h-9 pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Telefone</Label>
                      <div className="relative">
                        <Phone className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="5548991372996"
                          value={newLeadForm.phone}
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, phone: e.target.value })}
                          className="h-9 pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cargo / Função</Label>
                      <Input
                        placeholder="Ex: Gestor de Tráfego"
                        value={newLeadForm.job_title}
                        onChange={(e) => setNewLeadForm({ ...newLeadForm, job_title: e.target.value })}
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Empresa</Label>
                      <div className="relative">
                        <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="Nome da empresa"
                          value={newLeadForm.company_name}
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, company_name: e.target.value })}
                          className="h-9 pl-8"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          placeholder="email@exemplo.com"
                          value={newLeadForm.email}
                          onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                          className="h-9 pl-8"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Observações</Label>
                    <Textarea
                      placeholder="Ex: Vai participar da call no lugar do Alex, responsável pelo tráfego pago..."
                      value={newLeadForm.notes}
                      onChange={(e) => setNewLeadForm({ ...newLeadForm, notes: e.target.value })}
                      rows={2}
                    />
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => createAssociatedLead.mutate()}
                      disabled={!newLeadForm.name.trim() || createAssociatedLead.isPending}
                    >
                      {createAssociatedLead.isPending && (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      )}
                      <UserPlus className="h-4 w-4 mr-2" />
                      Criar Lead
                    </Button>
                  </DialogFooter>
                </>
              )}
            </div>
          )}

          {/* Step 2: Confirm merge */}
          {step === "confirm" && selectedLead && (
            <div className="space-y-4">
              {/* Side by side comparison */}
              <div className="grid grid-cols-2 gap-4">
                {/* Primary (will be kept) */}
                <Card className="border-green-300 bg-green-50/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-green-100 text-green-700 border-green-300">
                        Mantido
                      </Badge>
                      {getStageBadge(primaryLead.etapa_funil || primaryLead.sales_stage)}
                    </div>
                    <p className="font-semibold">{primaryLead.name}</p>
                    <div className="space-y-1.5 text-xs">
                      {primaryLead.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {primaryLead.phone}
                        </div>
                      )}
                      {primaryLead.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {primaryLead.email}
                        </div>
                      )}
                      {primaryLead.instagram && (
                        <div className="flex items-center gap-2">
                          <Instagram className="h-3 w-3 text-muted-foreground" />
                          {primaryLead.instagram}
                        </div>
                      )}
                      {primaryLead.company_name && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {primaryLead.company_name}
                        </div>
                      )}
                      <div className="text-muted-foreground pt-1">
                        Score: {primaryLead.sales_score || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Secondary (will be absorbed) */}
                <Card className="border-red-300 bg-red-50/50">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-red-100 text-red-700 border-red-300">
                        Absorvido
                      </Badge>
                      {getStageBadge(secondaryLead.etapa_funil || secondaryLead.sales_stage)}
                    </div>
                    <p className="font-semibold">{secondaryLead.name}</p>
                    <div className="space-y-1.5 text-xs">
                      {secondaryLead.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {secondaryLead.phone}
                        </div>
                      )}
                      {secondaryLead.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {secondaryLead.email}
                        </div>
                      )}
                      {secondaryLead.instagram && (
                        <div className="flex items-center gap-2">
                          <Instagram className="h-3 w-3 text-muted-foreground" />
                          {secondaryLead.instagram}
                        </div>
                      )}
                      {secondaryLead.company_name && (
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {secondaryLead.company_name}
                        </div>
                      )}
                      <div className="text-muted-foreground pt-1">
                        Score: {secondaryLead.sales_score || 0}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* What will happen */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium text-sm mb-3">O que acontecerá:</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      O lead <strong className="text-foreground">{primaryLead.name}</strong> será mantido com a etapa mais avançada
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-0.5 shrink-0" />
                      Campos vazios serão preenchidos com dados de{" "}
                      <strong className="text-foreground">{secondaryLead.name}</strong>
                    </li>
                    <li className="flex items-start gap-2">
                      <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                      Todos os deals, mensagens, chamadas, reuniões e transações serão movidos
                    </li>
                    <li className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                      O lead <strong className="text-foreground">{secondaryLead.name}</strong> será excluído permanentemente
                    </li>
                  </ul>
                </CardContent>
              </Card>

              <DialogFooter>
                <Button variant="outline" onClick={() => setStep("select")}>
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleMerge}
                  disabled={mergeMutation.isPending}
                >
                  {mergeMutation.isPending && (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  )}
                  <Merge className="h-4 w-4 mr-2" />
                  Mesclar Leads
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirmation dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar mesclagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O lead{" "}
              <strong>{secondaryLead?.name}</strong> será permanentemente excluído e
              todos os seus dados serão movidos para{" "}
              <strong>{primaryLead?.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeMerge}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {mergeMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Sim, mesclar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
