import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import {
  usePipelines,
  useCreatePipeline,
  useUpdatePipeline,
  useDeletePipeline,
  usePipelineStagesByPipeline,
  useCreatePipelineStageForPipeline,
  useUpdatePipelineStageConfig,
  useDeletePipelineStageConfig,
  useReorderPipelineStagesConfig,
  usePipelineTransitions,
  useCreateTransition,
  useDeleteTransition,
} from "@/hooks/usePipelineConfig";
import { useTeamMembers } from "@/hooks/useTeamMembers";
import type { SalesPipeline, PipelineStage, PipelineTransition } from "@/types/sales.types";
import {
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  ArrowRight,
  Loader2,
  Shield,
  Trophy,
  XCircle,
  UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGE_COLORS = [
  { value: "slate", label: "Cinza", class: "bg-slate-500" },
  { value: "blue", label: "Azul", class: "bg-blue-500" },
  { value: "cyan", label: "Ciano", class: "bg-cyan-500" },
  { value: "indigo", label: "Indigo", class: "bg-indigo-500" },
  { value: "purple", label: "Roxo", class: "bg-purple-500" },
  { value: "pink", label: "Rosa", class: "bg-pink-500" },
  { value: "amber", label: "Âmbar", class: "bg-amber-500" },
  { value: "orange", label: "Laranja", class: "bg-orange-500" },
  { value: "green", label: "Verde", class: "bg-green-500" },
  { value: "emerald", label: "Esmeralda", class: "bg-emerald-500" },
  { value: "red", label: "Vermelho", class: "bg-red-500" },
  { value: "yellow", label: "Amarelo", class: "bg-yellow-500" },
];

function getColorClass(color: string): string {
  return STAGE_COLORS.find((c) => c.value === color)?.class || "bg-slate-500";
}

// =====================================================
// PIPELINE CONFIG TAB (main)
// =====================================================

export function PipelineConfigTab() {
  const { toast } = useToast();
  const { data: pipelines, isLoading } = usePipelines();
  const { data: transitions } = usePipelineTransitions();
  const createPipeline = useCreatePipeline();
  const deletePipeline = useDeletePipeline();

  const [isPipelineModalOpen, setIsPipelineModalOpen] = useState(false);
  const [isTransitionModalOpen, setIsTransitionModalOpen] = useState(false);

  const handleCreatePipeline = async (name: string, description: string) => {
    try {
      await createPipeline.mutateAsync({ name, description });
      toast({ title: "Pipeline criado!" });
      setIsPipelineModalOpen(false);
    } catch {
      toast({ title: "Erro ao criar pipeline", variant: "destructive" });
    }
  };

  const handleDeletePipeline = async (pipeline: SalesPipeline) => {
    if (pipeline.is_default) {
      toast({ title: "Não é possível deletar o pipeline padrão", variant: "destructive" });
      return;
    }
    try {
      await deletePipeline.mutateAsync(pipeline.id);
      toast({ title: "Pipeline deletado!" });
    } catch (error) {
      toast({
        title: "Erro ao deletar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
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
    <div className="space-y-6">
      {/* Pipelines Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Pipelines</CardTitle>
            <CardDescription>
              Gerencie seus pipelines de vendas e suas etapas
            </CardDescription>
          </div>
          <Button onClick={() => setIsPipelineModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Pipeline
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {pipelines?.map((pipeline) => (
            <PipelineCard
              key={pipeline.id}
              pipeline={pipeline}
              onDelete={() => handleDeletePipeline(pipeline)}
            />
          ))}

          {(!pipelines || pipelines.length === 0) && (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum pipeline encontrado.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transitions Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Transições entre Pipelines</CardTitle>
            <CardDescription>
              Configure como deals se movem entre pipelines diferentes
            </CardDescription>
          </div>
          <Button onClick={() => setIsTransitionModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Transição
          </Button>
        </CardHeader>
        <CardContent>
          {transitions && transitions.length > 0 ? (
            <div className="space-y-2">
              {transitions.map((transition) => (
                <TransitionRow
                  key={transition.id}
                  transition={transition}
                  pipelines={pipelines || []}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhuma transição configurada. Transições permitem mover deals automaticamente entre pipelines.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modals */}
      <CreatePipelineModal
        open={isPipelineModalOpen}
        onOpenChange={setIsPipelineModalOpen}
        onSubmit={handleCreatePipeline}
      />
      <CreateTransitionModal
        open={isTransitionModalOpen}
        onOpenChange={setIsTransitionModalOpen}
        pipelines={pipelines || []}
      />
    </div>
  );
}

// =====================================================
// PIPELINE CARD (expandable with stages)
// =====================================================

function PipelineCard({
  pipeline,
  onDelete,
}: {
  pipeline: SalesPipeline;
  onDelete: () => void;
}) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(pipeline.is_default);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editName, setEditName] = useState(pipeline.name);
  const [isStageModalOpen, setIsStageModalOpen] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);

  const { data: stages } = usePipelineStagesByPipeline(pipeline.id);
  const updatePipeline = useUpdatePipeline();
  const reorderStages = useReorderPipelineStagesConfig();

  const handleSaveName = async () => {
    if (!editName.trim()) return;
    try {
      await updatePipeline.mutateAsync({ id: pipeline.id, name: editName.trim() });
      toast({ title: "Nome atualizado!" });
      setIsEditingName(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  const handleMoveStage = async (stageIndex: number, direction: 'up' | 'down') => {
    if (!stages) return;
    const newStages = [...stages];
    const targetIndex = direction === 'up' ? stageIndex - 1 : stageIndex + 1;
    if (targetIndex < 0 || targetIndex >= newStages.length) return;

    [newStages[stageIndex], newStages[targetIndex]] = [newStages[targetIndex], newStages[stageIndex]];

    try {
      await reorderStages.mutateAsync(newStages.map((s) => s.id));
    } catch {
      toast({ title: "Erro ao reordenar", variant: "destructive" });
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="border rounded-lg">
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50">
            <div className="flex items-center gap-3">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              {isEditingName ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-8 w-48"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") setIsEditingName(false);
                    }}
                    autoFocus
                  />
                  <Button size="sm" variant="ghost" onClick={handleSaveName}>
                    Salvar
                  </Button>
                </div>
              ) : (
                <span className="font-semibold">{pipeline.name}</span>
              )}
              {pipeline.is_default && (
                <Badge variant="secondary" className="text-xs">
                  <Shield className="h-3 w-3 mr-1" />
                  Padrão
                </Badge>
              )}
              <span className="text-sm text-muted-foreground">
                {stages?.length || 0} etapas
              </span>
            </div>
            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setEditName(pipeline.name);
                  setIsEditingName(true);
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              {!pipeline.is_default && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-500 hover:text-red-600"
                  onClick={onDelete}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-3 space-y-4">
            {/* Responsável automático */}
            <SalesRepSelector pipeline={pipeline} />

            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Etapas (arraste para reordenar)
            </div>
            {stages?.map((stage, index) => (
              <div
                key={stage.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-background hover:bg-muted/30 group"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveStage(index, 'up')}
                    disabled={index === 0}
                  >
                    <ChevronRight className="h-3 w-3 -rotate-90" />
                  </button>
                  <button
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                    onClick={() => handleMoveStage(index, 'down')}
                    disabled={index === (stages?.length || 0) - 1}
                  >
                    <ChevronRight className="h-3 w-3 rotate-90" />
                  </button>
                </div>

                <GripVertical className="h-4 w-4 text-muted-foreground/40" />

                <span className="text-sm font-medium text-muted-foreground w-6">
                  {index + 1}.
                </span>

                <div className={cn("w-3 h-3 rounded-full", getColorClass(stage.color))} />

                <span className="font-medium flex-1">{stage.name}</span>

                {stage.is_won && (
                  <Badge variant="outline" className="text-xs text-green-600 border-green-200 bg-green-50">
                    <Trophy className="h-3 w-3 mr-1" />
                    Won
                  </Badge>
                )}
                {stage.is_lost && (
                  <Badge variant="outline" className="text-xs text-red-600 border-red-200 bg-red-50">
                    <XCircle className="h-3 w-3 mr-1" />
                    Lost
                  </Badge>
                )}

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => {
                      setEditingStage(stage);
                      setIsStageModalOpen(true);
                    }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <DeleteStageButton stageId={stage.id} />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={() => {
                setEditingStage(null);
                setIsStageModalOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Nova Etapa
            </Button>
          </div>
        </CollapsibleContent>
      </div>

      <StageModal
        open={isStageModalOpen}
        onOpenChange={setIsStageModalOpen}
        pipelineId={pipeline.id}
        editingStage={editingStage}
      />
    </Collapsible>
  );
}

// =====================================================
// SALES REP SELECTOR (per pipeline)
// =====================================================

function SalesRepSelector({ pipeline }: { pipeline: SalesPipeline }) {
  const { toast } = useToast();
  const { data: teamMembers } = useTeamMembers();
  const updatePipeline = useUpdatePipeline();

  const currentRep = teamMembers?.find((m) => m.id === pipeline.default_sales_rep_id);

  const handleChange = async (value: string) => {
    const repId = value === "__none__" ? null : value;
    try {
      await updatePipeline.mutateAsync({ id: pipeline.id, default_sales_rep_id: repId });
      toast({ title: repId ? "Responsável atribuído!" : "Responsável removido!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 border border-blue-200">
      <UserCheck className="h-4 w-4 text-blue-600 flex-shrink-0" />
      <div className="flex-1">
        <Label className="text-sm font-medium text-blue-800">Responsável automático</Label>
        <p className="text-xs text-blue-600">
          Novos deals neste pipeline serão atribuídos automaticamente
        </p>
      </div>
      <Select
        value={pipeline.default_sales_rep_id || "__none__"}
        onValueChange={handleChange}
      >
        <SelectTrigger className="w-[180px] h-9 bg-white">
          <SelectValue placeholder="Nenhum" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Nenhum</SelectItem>
          {teamMembers?.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// =====================================================
// DELETE STAGE BUTTON
// =====================================================

function DeleteStageButton({ stageId }: { stageId: string }) {
  const { toast } = useToast();
  const deleteStage = useDeletePipelineStageConfig();

  const handleDelete = async () => {
    try {
      await deleteStage.mutateAsync(stageId);
      toast({ title: "Etapa deletada!" });
    } catch (error) {
      toast({
        title: "Erro ao deletar",
        description: error instanceof Error ? error.message : "Erro desconhecido",
        variant: "destructive",
      });
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-red-500 hover:text-red-600"
      onClick={handleDelete}
      disabled={deleteStage.isPending}
    >
      <Trash2 className="h-3 w-3" />
    </Button>
  );
}

// =====================================================
// TRANSITION ROW
// =====================================================

function TransitionRow({
  transition,
  pipelines,
}: {
  transition: PipelineTransition;
  pipelines: SalesPipeline[];
}) {
  const { toast } = useToast();
  const deleteTransition = useDeleteTransition();

  const sourcePipeline = pipelines.find((p) => p.id === transition.source_pipeline_id);
  const targetPipeline = pipelines.find((p) => p.id === transition.target_pipeline_id);

  const handleDelete = async () => {
    try {
      await deleteTransition.mutateAsync(transition.id);
      toast({ title: "Transição removida!" });
    } catch {
      toast({ title: "Erro ao remover", variant: "destructive" });
    }
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{sourcePipeline?.name || "?"}</span>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <span className="font-medium">{targetPipeline?.name || "?"}</span>
        <Badge variant="outline" className="text-xs ml-2">
          {transition.action === "move" ? "Mover" : "Duplicar"}
        </Badge>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-red-500 hover:text-red-600"
        onClick={handleDelete}
        disabled={deleteTransition.isPending}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

// =====================================================
// CREATE PIPELINE MODAL
// =====================================================

function CreatePipelineModal({
  open,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (name: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    onSubmit(name, description);
    setName("");
    setDescription("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo Pipeline</DialogTitle>
          <DialogDescription>
            Crie um novo pipeline de vendas com etapas personalizadas
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: SDR, Upsell, Enterprise..."
            />
          </div>
          <div className="space-y-2">
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição do pipeline"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name.trim()}>
            Criar Pipeline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// STAGE MODAL (Create/Edit)
// =====================================================

function StageModal({
  open,
  onOpenChange,
  pipelineId,
  editingStage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  editingStage: PipelineStage | null;
}) {
  const { toast } = useToast();
  const createStage = useCreatePipelineStageForPipeline();
  const updateStage = useUpdatePipelineStageConfig();

  const [name, setName] = useState("");
  const [color, setColor] = useState("slate");
  const [isWon, setIsWon] = useState(false);
  const [isLost, setIsLost] = useState(false);

  // Reset form when opening
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      if (editingStage) {
        setName(editingStage.name);
        setColor(editingStage.color);
        setIsWon(editingStage.is_won);
        setIsLost(editingStage.is_lost);
      } else {
        setName("");
        setColor("slate");
        setIsWon(false);
        setIsLost(false);
      }
    }
    onOpenChange(newOpen);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    try {
      if (editingStage) {
        await updateStage.mutateAsync({
          id: editingStage.id,
          name: name.trim(),
          color,
          is_won: isWon,
          is_lost: isLost,
        });
        toast({ title: "Etapa atualizada!" });
      } else {
        await createStage.mutateAsync({
          pipeline_id: pipelineId,
          name: name.trim(),
          color,
          is_won: isWon,
          is_lost: isLost,
        });
        toast({ title: "Etapa criada!" });
      }
      onOpenChange(false);
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editingStage ? "Editar Etapa" : "Nova Etapa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Novo, Qualificado, Call Agendada..."
            />
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <div className="flex flex-wrap gap-2">
              {STAGE_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={cn(
                    "w-8 h-8 rounded-full border-2 transition-all",
                    c.class,
                    color === c.value ? "border-foreground scale-110" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                  onClick={() => setColor(c.value)}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200">
            <div>
              <Label className="text-green-800">Etapa de Vitória (Won)</Label>
              <p className="text-xs text-green-600">Deal marcado como ganho nesta etapa</p>
            </div>
            <Switch
              checked={isWon}
              onCheckedChange={(v) => {
                setIsWon(v);
                if (v) setIsLost(false);
              }}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
            <div>
              <Label className="text-red-800">Etapa de Perda (Lost)</Label>
              <p className="text-xs text-red-600">Deal marcado como perdido nesta etapa</p>
            </div>
            <Switch
              checked={isLost}
              onCheckedChange={(v) => {
                setIsLost(v);
                if (v) setIsWon(false);
              }}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || createStage.isPending || updateStage.isPending}
          >
            {(createStage.isPending || updateStage.isPending) && (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            )}
            {editingStage ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =====================================================
// CREATE TRANSITION MODAL
// =====================================================

function CreateTransitionModal({
  open,
  onOpenChange,
  pipelines,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelines: SalesPipeline[];
}) {
  const { toast } = useToast();
  const createTransition = useCreateTransition();

  const [sourcePipelineId, setSourcePipelineId] = useState("");
  const [sourceStageId, setSourceStageId] = useState("");
  const [targetPipelineId, setTargetPipelineId] = useState("");
  const [targetStageId, setTargetStageId] = useState("");
  const [action, setAction] = useState<'move' | 'duplicate'>('move');

  const { data: sourceStages } = usePipelineStagesByPipeline(sourcePipelineId || undefined);
  const { data: targetStages } = usePipelineStagesByPipeline(targetPipelineId || undefined);

  const handleSave = async () => {
    if (!sourcePipelineId || !sourceStageId || !targetPipelineId || !targetStageId) return;
    try {
      await createTransition.mutateAsync({
        source_pipeline_id: sourcePipelineId,
        source_stage_id: sourceStageId,
        target_pipeline_id: targetPipelineId,
        target_stage_id: targetStageId,
        action,
      });
      toast({ title: "Transição criada!" });
      onOpenChange(false);
      // Reset
      setSourcePipelineId("");
      setSourceStageId("");
      setTargetPipelineId("");
      setTargetStageId("");
      setAction('move');
    } catch {
      toast({ title: "Erro ao criar transição", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Nova Transição</DialogTitle>
          <DialogDescription>
            Configure como deals se movem entre pipelines ao chegar em uma etapa específica
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* Source */}
          <div className="space-y-3 p-3 border rounded-lg">
            <Label className="text-xs font-medium uppercase text-muted-foreground">Origem</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pipeline</Label>
                <Select value={sourcePipelineId} onValueChange={(v) => { setSourcePipelineId(v); setSourceStageId(""); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pipeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Etapa</Label>
                <Select value={sourceStageId} onValueChange={setSourceStageId} disabled={!sourcePipelineId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Etapa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sourceStages?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <ArrowRight className="h-5 w-5 text-muted-foreground rotate-90" />
          </div>

          {/* Target */}
          <div className="space-y-3 p-3 border rounded-lg">
            <Label className="text-xs font-medium uppercase text-muted-foreground">Destino</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Pipeline</Label>
                <Select value={targetPipelineId} onValueChange={(v) => { setTargetPipelineId(v); setTargetStageId(""); }}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Pipeline..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Etapa</Label>
                <Select value={targetStageId} onValueChange={setTargetStageId} disabled={!targetPipelineId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Etapa..." />
                  </SelectTrigger>
                  <SelectContent>
                    {targetStages?.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-2">
            <Label>Ação</Label>
            <Select value={action} onValueChange={(v) => setAction(v as 'move' | 'duplicate')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="move">Mover deal (remove do pipeline original)</SelectItem>
                <SelectItem value="duplicate">Duplicar deal (mantém no original)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={!sourcePipelineId || !sourceStageId || !targetPipelineId || !targetStageId || createTransition.isPending}
          >
            {createTransition.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Criar Transição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
