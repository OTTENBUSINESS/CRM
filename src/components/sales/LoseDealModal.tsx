import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLoseDeal, useCreateDeal } from "@/hooks/useSalesDeals";
import { useUpdateLeadPipelineStage } from "@/hooks/useSalesLeads";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { XCircle, Plus, Loader2, Check, Sparkles, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deal } from "@/types/sales.types";

interface LoseDealModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: (Deal & { _isLeadOnly?: boolean; _lostStageId?: string }) | null;
}

export function LoseDealModal({ open, onOpenChange, deal }: LoseDealModalProps) {
  const { toast } = useToast();
  const { teamMember } = useAuth();
  const queryClient = useQueryClient();
  const loseDeal = useLoseDeal();
  const createDeal = useCreateDeal();
  const updateLeadStage = useUpdateLeadPipelineStage();

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newReasonLabel, setNewReasonLabel] = useState("");
  const [savingNewReason, setSavingNewReason] = useState(false);

  // Nova oportunidade
  const [wantsNewOpportunity, setWantsNewOpportunity] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Buscar motivos pré-cadastrados
  const { data: reasons = [] } = useQuery({
    queryKey: ["deal-loss-reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deal_loss_reasons")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  // Buscar produtos ativos
  const { data: products = [] } = useQuery({
    queryKey: ["products-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, price")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open && wantsNewOpportunity,
  });

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setSelectedReason(null);
      setCustomReason("");
      setAdditionalNotes("");
      setIsAddingNew(false);
      setNewReasonLabel("");
      setWantsNewOpportunity(false);
      setSelectedProductId(null);
    }
  }, [open]);

  // Adicionar novo motivo à lista
  const handleAddNewReason = async () => {
    if (!newReasonLabel.trim()) return;

    setSavingNewReason(true);
    try {
      const { data, error } = await supabase
        .from("deal_loss_reasons")
        .insert({
          label: newReasonLabel.trim(),
          position: reasons.length + 1,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Motivo ja existe", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["deal-loss-reasons"] });
        setSelectedReason(data.label);
        setNewReasonLabel("");
        setIsAddingNew(false);
        toast({ title: "Motivo adicionado" });
      }
    } catch {
      toast({ title: "Erro ao salvar motivo", variant: "destructive" });
    } finally {
      setSavingNewReason(false);
    }
  };

  const handleConfirm = async () => {
    if (!deal) return;

    const reason = selectedReason === "__custom__"
      ? customReason.trim()
      : selectedReason;

    if (!reason) {
      toast({ title: "Selecione um motivo", variant: "destructive" });
      return;
    }

    if (wantsNewOpportunity && !selectedProductId) {
      toast({ title: "Selecione um produto para a nova oportunidade", variant: "destructive" });
      return;
    }

    const fullReason = additionalNotes.trim()
      ? `${reason} — ${additionalNotes.trim()}`
      : reason;

    try {
      if ((deal as any)?._isLeadOnly && (deal as any)?._lostStageId) {
        // Lead without deal — move lead to lost stage and save reason
        const leadId = deal.lead_id || deal.id?.replace('lead-', '');
        await updateLeadStage.mutateAsync({ leadId: leadId!, stageId: (deal as any)._lostStageId });
        // Save lost reason on the lead
        await supabase
          .from('leads')
          .update({ lost_reason: fullReason, lost_at: new Date().toISOString() })
          .eq('id', leadId);
        toast({
          title: "Lead marcado como perdido",
          description: `Motivo: ${reason}`,
        });
      } else {
        // Perder o deal (keepLeadAlive se vai criar nova oportunidade)
        await loseDeal.mutateAsync({
          dealId: deal.id,
          reason: fullReason,
          keepLeadAlive: wantsNewOpportunity,
        });

        // Criar nova oportunidade se solicitado
        if (wantsNewOpportunity && selectedProductId) {
          const product = products.find((p: any) => p.id === selectedProductId);
          const leadId = deal.lead_id || (deal as any).contact_id;

          if (leadId && product) {
            // Buscar o pipeline_id do deal atual para manter no mesmo pipeline
            const pipelineId = (deal as any).pipeline_id || (deal as any).pipeline_stage?.pipeline_id;

            await createDeal.mutateAsync({
              lead_id: leadId,
              product_id: selectedProductId,
              pipeline_id: pipelineId,
              sales_rep_id: (deal as any).sales_rep_id,
              sdr_id: (deal as any).sdr_id,
              original_price: product.price || 0,
              negotiated_price: product.price || 0,
              notes: `Nova oportunidade após perda do deal anterior. Motivo da perda: ${reason}`,
            });

            toast({
              title: "Deal perdido + nova oportunidade criada",
              description: `${product.name} — R$ ${(product.price || 0).toLocaleString("pt-BR")}`,
            });
          }
        } else {
          toast({
            title: "Deal marcado como perdido",
            description: `Motivo: ${reason}`,
          });
        }
      }
      // Registrar na timeline
      const leadId = deal.lead_id || deal.lead?.id || (deal as any).id?.replace('lead-', '');
      if (leadId) {
        await supabase.from('company_activities').insert({
          lead_id: leadId,
          team: 'sales',
          task_type: 'deal_lost',
          name: `❌ Deal marcado como PERDIDO por ${teamMember?.name || 'vendedor'}`,
          description: `${deal.title || 'Deal'} — Motivo: ${fullReason}${wantsNewOpportunity ? ' (nova oportunidade criada)' : ''}`,
          status: 'completed',
          completed: true,
          metadata: { deal_id: deal.id, deal_title: deal.title, reason: fullReason, lost_by: teamMember?.name, new_opportunity: wantsNewOpportunity },
        }).catch(() => {});
      }

      onOpenChange(false);
    } catch {
      toast({ title: "Erro ao processar", variant: "destructive" });
    }
  };

  const leadName = deal?.lead?.name || deal?.contact?.name || "Deal";
  const isLeadOnly = !!(deal as any)?._isLeadOnly;
  const isSubmitting = loseDeal.isPending || createDeal.isPending || updateLeadStage.isPending;

  if (!deal) {
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><div /></DialogContent></Dialog>;
  }

  const cleanupPointerEvents = () => { document.body.style.pointerEvents = ''; setTimeout(() => { document.body.style.pointerEvents = ''; }, 100); };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) cleanupPointerEvents(); }}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => { e.preventDefault(); cleanupPointerEvents(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            Marcar como Perdido
          </DialogTitle>
          <DialogDescription>
            Informe o motivo da perda de <span className="font-semibold text-foreground">{leadName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Motivos pré-cadastrados */}
          <div>
            <p className="text-sm font-medium mb-2">Motivo da perda:</p>
            <div className="flex flex-wrap gap-2">
              {reasons.map((r: any) => (
                <button
                  key={r.id}
                  onClick={() => {
                    setSelectedReason(r.label);
                    setCustomReason("");
                  }}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-sm border transition-colors",
                    selectedReason === r.label
                      ? "border-red-400 bg-red-50 text-red-700 font-medium"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  {selectedReason === r.label && (
                    <Check className="h-3 w-3 inline mr-1" />
                  )}
                  {r.label}
                </button>
              ))}

              {/* Botão "Outro" */}
              <button
                onClick={() => {
                  setSelectedReason("__custom__");
                  setCustomReason("");
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  selectedReason === "__custom__"
                    ? "border-red-400 bg-red-50 text-red-700 font-medium"
                    : "border-border hover:bg-muted/50"
                )}
              >
                Outro...
              </button>
            </div>
          </div>

          {/* Campo custom quando "Outro" selecionado */}
          {selectedReason === "__custom__" && (
            <Input
              placeholder="Descreva o motivo..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              autoFocus
            />
          )}

          {/* Adicionar novo motivo à lista */}
          {!isAddingNew ? (
            <button
              onClick={() => setIsAddingNew(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <Plus className="h-3 w-3" />
              Cadastrar novo motivo na lista
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Nome do novo motivo..."
                value={newReasonLabel}
                onChange={(e) => setNewReasonLabel(e.target.value)}
                className="text-sm h-8"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddNewReason();
                  if (e.key === "Escape") setIsAddingNew(false);
                }}
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={handleAddNewReason}
                disabled={!newReasonLabel.trim() || savingNewReason}
              >
                {savingNewReason ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Plus className="h-3 w-3" />
                )}
              </Button>
            </div>
          )}

          {/* Observações adicionais */}
          <div>
            <p className="text-sm font-medium mb-1">Observações (opcional):</p>
            <Textarea
              placeholder="Detalhes adicionais sobre a perda..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>

          {/* Toggle nova oportunidade (só para deals reais, não lead-only) */}
          {!isLeadOnly && (
            <div className="border rounded-lg p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="new-opportunity" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <Sparkles className="h-4 w-4 text-amber-500" />
                  Lead tem potencial para nova oportunidade?
                </Label>
                <Switch
                  id="new-opportunity"
                  checked={wantsNewOpportunity}
                  onCheckedChange={setWantsNewOpportunity}
                />
              </div>

              {wantsNewOpportunity && (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    O deal atual será perdido, mas um novo deal será criado para este lead.
                  </p>
                  <div className="grid gap-1.5 max-h-40 overflow-y-auto">
                    {products.map((p: any) => (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProductId(p.id)}
                        className={cn(
                          "flex items-center justify-between px-3 py-2 rounded-md border text-sm transition-colors text-left",
                          selectedProductId === p.id
                            ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30"
                            : "border-border hover:bg-muted/50"
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <Package className="h-3.5 w-3.5 text-muted-foreground" />
                          {p.name}
                        </span>
                        {p.price > 0 && (
                          <span className="text-xs text-muted-foreground font-mono">
                            R$ {p.price.toLocaleString("pt-BR")}
                          </span>
                        )}
                      </button>
                    ))}
                    {products.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        Nenhum produto ativo encontrado.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={wantsNewOpportunity ? "default" : "destructive"}
            onClick={handleConfirm}
            disabled={
              isSubmitting ||
              !selectedReason ||
              (selectedReason === "__custom__" && !customReason.trim()) ||
              (wantsNewOpportunity && !selectedProductId)
            }
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : wantsNewOpportunity ? (
              <Sparkles className="h-4 w-4 mr-2" />
            ) : (
              <XCircle className="h-4 w-4 mr-2" />
            )}
            {wantsNewOpportunity ? "Perder e Criar Nova" : "Confirmar Perda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
