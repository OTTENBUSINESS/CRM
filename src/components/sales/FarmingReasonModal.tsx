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
import { useUpdateLeadPipelineStage } from "@/hooks/useSalesLeads";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Sprout, Plus, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface FarmingReasonModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId: string;
  leadName: string;
  farmingStageId: string;
}

export function FarmingReasonModal({ open, onOpenChange, leadId, leadName, farmingStageId }: FarmingReasonModalProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateLeadStage = useUpdateLeadPipelineStage();

  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newReasonLabel, setNewReasonLabel] = useState("");
  const [savingNewReason, setSavingNewReason] = useState(false);

  const { data: reasons = [] } = useQuery({
    queryKey: ["farming-reasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("farming_reasons")
        .select("*")
        .eq("is_active", true)
        .order("position", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setSelectedReason(null);
      setCustomReason("");
      setAdditionalNotes("");
      setIsAddingNew(false);
      setNewReasonLabel("");
    }
  }, [open]);

  const handleAddNewReason = async () => {
    if (!newReasonLabel.trim()) return;

    setSavingNewReason(true);
    try {
      const { data, error } = await supabase
        .from("farming_reasons")
        .insert({
          label: newReasonLabel.trim(),
          position: reasons.length + 1,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          toast({ title: "Motivo já existe", variant: "destructive" });
        } else {
          throw error;
        }
      } else {
        queryClient.invalidateQueries({ queryKey: ["farming-reasons"] });
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
    const reason = selectedReason === "__custom__"
      ? customReason.trim()
      : selectedReason;

    if (!reason) {
      toast({ title: "Selecione um motivo", variant: "destructive" });
      return;
    }

    const fullReason = additionalNotes.trim()
      ? `${reason} — ${additionalNotes.trim()}`
      : reason;

    try {
      // Move lead to farming stage
      await updateLeadStage.mutateAsync({ leadId, stageId: farmingStageId });

      // Save farming reason on the lead
      await supabase
        .from("leads")
        .update({ farming_reason: fullReason, farming_at: new Date().toISOString() })
        .eq("id", leadId);

      // Also update active deals if any
      await supabase
        .from("deals")
        .update({ pipeline_stage_id: farmingStageId })
        .eq("lead_id", leadId)
        .in("status", ["open", "negotiation"]);

      queryClient.invalidateQueries({ queryKey: ["pipeline-deals"] });
      queryClient.invalidateQueries({ queryKey: ["contact-deals", leadId] });

      toast({
        title: "Lead movido para Farming",
        description: `Motivo: ${reason}`,
      });
      onOpenChange(false);
    } catch {
      toast({ title: "Erro ao mover para farming", variant: "destructive" });
    }
  };

  const cleanupPointerEvents = () => {
    document.body.style.pointerEvents = "";
    setTimeout(() => { document.body.style.pointerEvents = ""; }, 100);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) cleanupPointerEvents(); }}>
      <DialogContent className="sm:max-w-md" onCloseAutoFocus={(e) => { e.preventDefault(); cleanupPointerEvents(); }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <Sprout className="h-5 w-5" />
            Mover para Farming
          </DialogTitle>
          <DialogDescription>
            Informe o motivo do farming de <span className="font-semibold text-foreground">{leadName}</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <p className="text-sm font-medium mb-2">Motivo do farming:</p>
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
                      ? "border-amber-400 bg-amber-50 text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  {selectedReason === r.label && (
                    <Check className="h-3 w-3 inline mr-1" />
                  )}
                  {r.label}
                </button>
              ))}

              <button
                onClick={() => {
                  setSelectedReason("__custom__");
                  setCustomReason("");
                }}
                className={cn(
                  "px-3 py-1.5 rounded-full text-sm border transition-colors",
                  selectedReason === "__custom__"
                    ? "border-amber-400 bg-amber-50 text-amber-700 font-medium dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-600"
                    : "border-border hover:bg-muted/50"
                )}
              >
                Outro...
              </button>
            </div>
          </div>

          {selectedReason === "__custom__" && (
            <Input
              placeholder="Descreva o motivo..."
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              autoFocus
            />
          )}

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

          <div>
            <p className="text-sm font-medium mb-1">Observações (opcional):</p>
            <Textarea
              placeholder="Detalhes adicionais sobre o farming..."
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={2}
              className="text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            className="bg-amber-600 hover:bg-amber-700 text-white"
            onClick={handleConfirm}
            disabled={
              updateLeadStage.isPending ||
              !selectedReason ||
              (selectedReason === "__custom__" && !customReason.trim())
            }
          >
            {updateLeadStage.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sprout className="h-4 w-4 mr-2" />
            )}
            Confirmar Farming
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
