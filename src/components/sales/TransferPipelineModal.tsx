import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { usePipelines } from "@/hooks/usePipelineConfig";
import { usePipelineStages } from "@/hooks/useSalesPipeline";
import { useTransferDealPipeline } from "@/hooks/useSalesDeals";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, GitBranch, Loader2, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Deal } from "@/types/sales.types";

interface TransferPipelineModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deal: Deal | null;
}

export function TransferPipelineModal({
  open,
  onOpenChange,
  deal,
}: TransferPipelineModalProps) {
  const { teamMember } = useAuth();
  const { toast } = useToast();
  const { data: pipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);

  const { data: stages } = usePipelineStages(selectedPipelineId || undefined);
  const transferMutation = useTransferDealPipeline();

  const PRE_VENDAS_PIPELINE_ID = 'fabb8cee-ca6c-4980-9b88-919c85e0b12f';
  const CLOSER_PIPELINE_ID = '9c21bd06-a898-44a1-88db-ad3c6ec7140c';

  const currentPipelineId = deal?.pipeline_stage?.pipeline_id || deal?.pipeline_id;

  // Filter out current pipeline
  const availablePipelines = pipelines?.filter(
    (p) => p.id !== currentPipelineId && p.is_active
  );

  // Available stages (exclude won/lost)
  const availableStages = stages?.filter((s) => !s.is_won && !s.is_lost) || [];

  // Auto-select Closer when coming from Pré-Vendas (only on modal open)
  useEffect(() => {
    if (open && currentPipelineId === PRE_VENDAS_PIPELINE_ID && !selectedPipelineId) {
      const closerPipeline = availablePipelines?.find(p => p.id === CLOSER_PIPELINE_ID);
      if (closerPipeline) {
        setSelectedPipelineId(CLOSER_PIPELINE_ID);
      }
    }
  }, [open, currentPipelineId, selectedPipelineId, availablePipelines?.length]);

  // Auto-select first stage when pipeline changes
  useEffect(() => {
    if (availableStages.length > 0 && !selectedStageId) {
      setSelectedStageId(availableStages[0].id);
    }
  }, [availableStages.length, selectedStageId]);

  // Reset stage when pipeline changes
  const handleSelectPipeline = (pipelineId: string) => {
    setSelectedPipelineId(pipelineId);
    setSelectedStageId(null);
  };

  const selectedStage = stages?.find((s) => s.id === selectedStageId);

  const handleTransfer = async () => {
    if (!deal || !selectedPipelineId || !selectedStageId) return;

    try {
      await transferMutation.mutateAsync({
        dealId: deal.id,
        targetPipelineId: selectedPipelineId,
        targetStageId: selectedStageId,
        transferredByName: teamMember?.name,
      });

      const targetName = pipelines?.find((p) => p.id === selectedPipelineId)?.name;
      const stageName = selectedStage?.name;
      toast({
        title: "Deal transferido",
        description: `Movido para ${targetName} - ${stageName}`,
      });
      onOpenChange(false);
      setSelectedPipelineId(null);
      setSelectedStageId(null);
    } catch {
      toast({
        title: "Erro ao transferir",
        description: "Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const currentPipelineName =
    pipelines?.find((p) => p.id === currentPipelineId)?.name || "Pipeline atual";

  if (!deal) {
    return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent><div /></DialogContent></Dialog>;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setSelectedPipelineId(null);
          setSelectedStageId(null);
          document.body.style.pointerEvents = '';
          setTimeout(() => { document.body.style.pointerEvents = ''; }, 100);
        }
      }}
    >
      <DialogContent className="sm:max-w-lg" onCloseAutoFocus={(e) => { e.preventDefault(); document.body.style.pointerEvents = ''; }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitBranch className="h-5 w-5" />
            Transferir para outro Pipeline
          </DialogTitle>
          <DialogDescription>
            Mover deal de{" "}
            <span className="font-semibold text-foreground">
              {currentPipelineName}
            </span>{" "}
            para outro pipeline. O historico sera mantido.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Step 1: Pipeline selection */}
          <div>
            <p className="text-sm font-medium mb-2">1. Pipeline destino:</p>
            <div className="space-y-2">
              {availablePipelines && availablePipelines.length > 0 ? (
                availablePipelines.map((pipeline) => (
                  <button
                    key={pipeline.id}
                    onClick={() => handleSelectPipeline(pipeline.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors",
                      selectedPipelineId === pipeline.id
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:bg-muted/50"
                    )}
                  >
                    <GitBranch
                      className={cn(
                        "h-4 w-4 shrink-0",
                        selectedPipelineId === pipeline.id
                          ? "text-primary"
                          : "text-muted-foreground"
                      )}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{pipeline.name}</p>
                      {pipeline.description && (
                        <p className="text-xs text-muted-foreground truncate">
                          {pipeline.description}
                        </p>
                      )}
                    </div>
                    {selectedPipelineId === pipeline.id && (
                      <ChevronRight className="h-4 w-4 text-primary shrink-0" />
                    )}
                  </button>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Nenhum outro pipeline disponivel
                </p>
              )}
            </div>
          </div>

          {/* Step 2: Stage selection */}
          {selectedPipelineId && availableStages.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">2. Etapa de destino:</p>
              <div className="flex flex-wrap gap-2">
                {availableStages.map((stage) => (
                  <button
                    key={stage.id}
                    onClick={() => setSelectedStageId(stage.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                      selectedStageId === stage.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:bg-muted/50 text-foreground"
                    )}
                  >
                    {stage.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transfer preview */}
          {selectedPipelineId && selectedStageId && selectedStage && (
            <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg text-sm flex-wrap">
              <Badge variant="outline">{currentPipelineName}</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
              <Badge variant="outline" className="border-primary text-primary">
                {pipelines?.find((p) => p.id === selectedPipelineId)?.name} -{" "}
                {selectedStage.name}
              </Badge>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleTransfer}
            disabled={!selectedPipelineId || !selectedStageId || transferMutation.isPending}
          >
            {transferMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4 mr-2" />
            )}
            Transferir
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
