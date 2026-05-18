import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/lib/supabase";
import { usePipelines } from "@/hooks/usePipelineConfig";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useCreateDeal } from "@/hooks/useSalesDeals";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  X,
  Upload,
  Loader2,
  User,
  Phone,
  Mail,
} from "lucide-react";

interface BatchImportDealsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultPipelineId?: string;
}

interface LeadOption {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
}

export function BatchImportDealsModal({
  open,
  onOpenChange,
  defaultPipelineId,
}: BatchImportDealsModalProps) {
  const { toast } = useToast();
  const { data: pipelines } = usePipelines();
  const createDeal = useCreateDeal();

  const [selectedPipelineId, setSelectedPipelineId] = useState<string>(
    defaultPipelineId || ""
  );
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<LeadOption[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const activePipelines = pipelines?.filter((p) => p.is_active) || [];

  const { data: stages } = usePipelineStages(selectedPipelineId || undefined);
  const availableStages =
    stages?.filter((s) => !s.is_won && !s.is_lost) || [];

  // Set default stage when pipeline changes
  const effectiveStageId =
    selectedStageId && availableStages.some((s) => s.id === selectedStageId)
      ? selectedStageId
      : availableStages[0]?.id || "";

  // Search leads
  const { data: searchResults, isLoading: isSearching } = useQuery({
    queryKey: ["lead-search-batch", searchQuery, selectedPipelineId],
    queryFn: async () => {
      if (!searchQuery || searchQuery.length < 2) return [];

      const q = searchQuery.trim();
      let query = supabase
        .from("leads")
        .select("id, name, email, phone, company")
        .order("name")
        .limit(20);

      // Search by name, email, or phone
      query = query.or(
        `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`
      );

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as LeadOption[];
    },
    enabled: open && searchQuery.length >= 2,
  });

  // Get leads that already have active deals in the selected pipeline
  const { data: existingDealLeadIds } = useQuery({
    queryKey: ["existing-deal-leads", selectedPipelineId],
    queryFn: async () => {
      if (!selectedPipelineId) return [];
      const { data } = await supabase
        .from("deals")
        .select("lead_id")
        .eq("pipeline_id", selectedPipelineId)
        .neq("status", "won")
        .neq("status", "lost");
      return (data || []).map((d) => d.lead_id);
    },
    enabled: open && !!selectedPipelineId,
  });

  const existingSet = useMemo(
    () => new Set(existingDealLeadIds || []),
    [existingDealLeadIds]
  );
  const selectedIds = useMemo(
    () => new Set(selectedLeads.map((l) => l.id)),
    [selectedLeads]
  );

  // Filter out already selected and already-have-deal leads
  const filteredResults = useMemo(() => {
    if (!searchResults) return [];
    return searchResults.filter(
      (lead) => !selectedIds.has(lead.id) && !existingSet.has(lead.id)
    );
  }, [searchResults, selectedIds, existingSet]);

  const handleSelectLead = (lead: LeadOption) => {
    setSelectedLeads((prev) => [...prev, lead]);
    setSearchQuery("");
  };

  const handleRemoveLead = (leadId: string) => {
    setSelectedLeads((prev) => prev.filter((l) => l.id !== leadId));
  };

  const handleCreate = async () => {
    if (!selectedPipelineId || !effectiveStageId || selectedLeads.length === 0)
      return;

    setIsCreating(true);
    let successCount = 0;
    let errorCount = 0;

    // Get a default product (first available) for the deals
    const { data: defaultProduct } = await supabase
      .from("products")
      .select("id, price")
      .eq("is_active", true)
      .order("name")
      .limit(1)
      .maybeSingle();

    for (const lead of selectedLeads) {
      try {
        await createDeal.mutateAsync({
          lead_id: lead.id,
          product_id: defaultProduct?.id || "",
          pipeline_id: selectedPipelineId,
          pipeline_stage_id: effectiveStageId,
          original_price: defaultProduct?.price || 0,
          negotiated_price: defaultProduct?.price || 0,
          notes: "Criado via importação em batch",
        });
        successCount++;
      } catch {
        errorCount++;
      }
    }

    setIsCreating(false);

    toast({
      title: `${successCount} deal${successCount !== 1 ? "s" : ""} criado${successCount !== 1 ? "s" : ""}`,
      description: errorCount > 0 ? `${errorCount} erro(s) ao criar.` : undefined,
      variant: errorCount > 0 ? "destructive" : "default",
    });

    if (successCount > 0) {
      setSelectedLeads([]);
      setSearchQuery("");
      onOpenChange(false);
    }
  };

  const handleClose = (v: boolean) => {
    if (!v) {
      setSelectedLeads([]);
      setSearchQuery("");
      setSelectedStageId("");
    }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar Leads no Pipeline
          </DialogTitle>
          <DialogDescription>
            Selecione leads existentes para criar deals em batch.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Pipeline selector */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium mb-1 block">Pipeline</label>
              <Select
                value={selectedPipelineId}
                onValueChange={(v) => {
                  setSelectedPipelineId(v);
                  setSelectedStageId("");
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {activePipelines.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Estágio</label>
              <Select
                value={effectiveStageId}
                onValueChange={setSelectedStageId}
                disabled={!selectedPipelineId}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {availableStages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Lead search */}
          <div>
            <label className="text-sm font-medium mb-1 block">
              Buscar leads
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Nome, email ou telefone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9 text-sm"
                disabled={!selectedPipelineId}
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>

            {/* Search results dropdown */}
            {searchQuery.length >= 2 && filteredResults.length > 0 && (
              <div className="mt-1 border rounded-lg max-h-40 overflow-y-auto bg-white shadow-sm">
                {filteredResults.map((lead) => (
                  <button
                    key={lead.id}
                    onClick={() => handleSelectLead(lead)}
                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-slate-50 text-left text-sm border-b last:border-b-0"
                  >
                    <User className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{lead.name}</p>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        {lead.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="h-3 w-3" />
                            {lead.email}
                          </span>
                        )}
                        {lead.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {lead.phone}
                          </span>
                        )}
                      </div>
                    </div>
                    {existingSet.has(lead.id) && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        Já no pipeline
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 &&
              !isSearching &&
              filteredResults.length === 0 && (
                <p className="text-xs text-slate-500 mt-1 px-1">
                  Nenhum lead encontrado.
                </p>
              )}
          </div>

          {/* Selected leads */}
          {selectedLeads.length > 0 && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <p className="text-sm font-medium mb-2">
                {selectedLeads.length} lead{selectedLeads.length !== 1 ? "s" : ""}{" "}
                selecionado{selectedLeads.length !== 1 ? "s" : ""}
              </p>
              <div className="space-y-1">
                {selectedLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-lg text-sm"
                  >
                    <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <span className="flex-1 truncate font-medium">
                      {lead.name}
                    </span>
                    {lead.phone && (
                      <span className="text-xs text-slate-500">{lead.phone}</span>
                    )}
                    <button
                      onClick={() => handleRemoveLead(lead.id)}
                      className="text-slate-400 hover:text-red-500 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button variant="outline" onClick={() => handleClose(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleCreate}
            disabled={
              !selectedPipelineId ||
              !effectiveStageId ||
              selectedLeads.length === 0 ||
              isCreating
            }
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Criar {selectedLeads.length || ""} Deal
            {selectedLeads.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
