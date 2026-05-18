import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Bot, Settings, Wrench, Plus, Trash2, Save, ChevronRight, MessageSquare, Brain, Zap, Clock, Database, Copy, Variable, ChevronDown, Eye, Code, ListOrdered, X, GripVertical, Image, Video, AudioLines, Webhook, Sparkles, Type, FileVideo } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  useAIAgents,
  useAIAgent,
  useAIAgentTools,
  useSaveAIAgent,
  useSaveAIAgentTool,
  useDeleteAIAgentTool,
  useToggleAIAgent,
  useAIAgentDashboard,
  DEFAULT_AGENT_SETTINGS,
  useCadenceEnrollments,
  useCancelCadenceEnrollment,
  type AISalesAgent,
  type AIAgentTool,
  type AIAgentSettings,
  type CadenceStep,
  type CadenceStepPostAction,
  type CadenceConfig,
  type CadenceEnrollment,
} from '@/hooks/useAISalesAgent';
import { usePipelines, usePipelineStagesByPipeline } from '@/hooks/usePipelineConfig';
import { useWhatsAppInstances } from '@/hooks/useWhatsAppInbox';



const ACTION_TYPES = [
  { value: 'update_lead', label: 'Atualizar Lead' },
  { value: 'create_task', label: 'Criar Tarefa' },
  { value: 'schedule_meeting', label: 'Agendar Reuniao' },
  { value: 'send_proposal', label: 'Enviar Proposta' },
  { value: 'qualify_bant', label: 'Qualificar BANT' },
  { value: 'change_stage', label: 'Mudar Estagio' },
  { value: 'notify_human', label: 'Notificar Humano' },
  { value: 'query_products', label: 'Consultar Produtos' },
  { value: 'calculate_price', label: 'Calcular Preco' },
  { value: 'send_whatsapp', label: 'Enviar WhatsApp (Notificacao)' },
  { value: 'custom_webhook', label: 'Webhook Customizado' },
];

const TOOL_PRESETS: Record<string, { name: string; description: string; parameters: object }> = {
  qualify_bant: {
    name: 'qualificar_lead',
    description: 'Qualifica o lead com informacoes BANT coletadas na conversa. Chame quando descobrir orcamento, se e decisor, necessidade ou prazo.',
    parameters: {
      type: 'object',
      properties: {
        budget: { type: 'string', description: 'Informacao sobre orcamento (ex: "fatura 1M/mes", "budget de 50k")' },
        authority: { type: 'string', description: 'Se e o decisor ou quem decide (ex: "dono", "gerente", "precisa aprovar com socio")' },
        need: { type: 'string', description: 'Necessidade identificada (ex: "precisa automatizar atendimento")' },
        timeline: { type: 'string', description: 'Prazo/urgencia (ex: "quer comecar mes que vem", "urgente")' },
      },
    },
  },
  schedule_meeting: {
    name: 'agendar_reuniao',
    description: 'Agenda reuniao com o time comercial. Use quando o lead aceitar ou pedir pra agendar.',
    parameters: {
      type: 'object',
      properties: {
        preferred_date: { type: 'string', description: 'Data preferida (YYYY-MM-DD)' },
        preferred_time: { type: 'string', description: 'Horario preferido (HH:MM)' },
        meeting_type: { type: 'string', enum: ['video', 'telefone', 'presencial'], description: 'Tipo da reuniao' },
        notes: { type: 'string', description: 'Observacoes sobre a reuniao' },
      },
      required: ['preferred_date', 'preferred_time'],
    },
  },
  notify_human: {
    name: 'transferir_para_humano',
    description: 'Transfere a conversa para um vendedor humano. Use quando o lead pedir pra falar com alguem ou quando nao souber responder.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Motivo da transferencia' },
        urgency: { type: 'string', enum: ['baixa', 'media', 'alta'], description: 'Urgencia' },
      },
      required: ['reason'],
    },
  },
  change_stage: {
    name: 'mudar_estagio',
    description: 'Muda o estagio do lead no funil. Use quando a conversa evoluir.',
    parameters: {
      type: 'object',
      properties: {
        new_stage: { type: 'string', enum: ['captura', 'qualificacao', 'agendamento', 'negociacao'], description: 'Novo estagio' },
      },
      required: ['new_stage'],
    },
  },
  query_products: {
    name: 'consultar_produtos',
    description: 'Consulta produtos disponiveis. Use quando o lead perguntar sobre produtos, precos ou servicos.',
    parameters: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Termo de busca (nome do produto)' },
        category: { type: 'string', description: 'Categoria do produto' },
      },
    },
  },
  update_lead: {
    name: 'atualizar_lead',
    description: 'Salva informacoes coletadas sobre o lead. Use quando ele disser nome da empresa, email, ou algo relevante.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Nome correto do lead' },
        email: { type: 'string', description: 'Email do lead' },
        context: { type: 'string', description: 'Informacoes relevantes coletadas (empresa, faturamento, area de atuacao, etc)' },
      },
    },
  },
  send_whatsapp: {
    name: 'enviar_whatsapp',
    description: 'Envia mensagem para grupo ou contato no WhatsApp. Use para notificar o time ou vendedor.',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'Numero do contato (5511999...) ou JID do grupo (xxx@g.us)' },
        message: { type: 'string', description: 'Mensagem a enviar' },
      },
      required: ['target', 'message'],
    },
  },
};

const PROMPT_VARIABLES = [
  {
    category: 'Lead',
    variables: [
      { key: '{{nome}}', label: 'Nome do lead' },
      { key: '{{telefone}}', label: 'Telefone' },
      { key: '{{email}}', label: 'Email' },
      { key: '{{empresa}}', label: 'Nome da empresa' },
      { key: '{{cargo}}', label: 'Cargo' },
      { key: '{{estagio}}', label: 'Estagio no funil' },
      { key: '{{score}}', label: 'Score de qualificacao (0-100)' },
      { key: '{{lead_origem}}', label: 'Canal de origem (Instagram, WhatsApp, etc)' },
      { key: '{{lead_campanha}}', label: 'Campanha (Reels, Ads, etc)' },
      { key: '{{lead_contexto}}', label: 'Contexto salvo do lead' },
      { key: '{{tags}}', label: 'Tags do lead' },
    ],
  },
  {
    category: 'BANT',
    variables: [
      { key: '{{bant_orcamento}}', label: 'Budget confirmado? (Sim/Nao)' },
      { key: '{{bant_decisor}}', label: 'Authority confirmado?' },
      { key: '{{bant_necessidade}}', label: 'Need confirmado?' },
      { key: '{{bant_prazo}}', label: 'Timeline confirmado?' },
    ],
  },
];

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Recomendado)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Rapido/Barato)' },
  { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Poderoso)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Rapido/Barato)' },
  { value: 'gpt-4o', label: 'GPT-4o (Equilibrado)' },
  { value: 'gpt-4-turbo', label: 'GPT-4 Turbo (Poderoso)' },
];

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom' },
  { value: 1, label: 'Seg' },
  { value: 2, label: 'Ter' },
  { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' },
  { value: 5, label: 'Sex' },
  { value: 6, label: 'Sab' },
];

export function AIAgentTab() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [isToolDialogOpen, setIsToolDialogOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<AIAgentTool | null>(null);

  const { data: agents, isLoading: loadingAgents } = useAIAgents();
  const { data: agent } = useAIAgent(selectedAgentId);
  const { data: tools } = useAIAgentTools(selectedAgentId);
  const { data: dashboard } = useAIAgentDashboard();

  const saveAgent = useSaveAIAgent();
  const saveTool = useSaveAIAgentTool();
  const deleteTool = useDeleteAIAgentTool();
  const toggleAgent = useToggleAIAgent();

  const handleSaveAgent = async (data: Partial<AISalesAgent>) => {
    try {
      if (!data.model) {
        toast.error('Selecione um modelo de IA');
        return;
      }
      if (!data.instance_id) {
        toast.error('Selecione uma instância WhatsApp');
        return;
      }
      if (!data.pipeline_id) {
        toast.error('Selecione um pipeline');
        return;
      }
      // Remove joined fields before saving
      const { instance_name, instance_status, pipeline_name, instance, pipeline, ...cleanData } = data as any;
      await saveAgent.mutateAsync({
        ...cleanData,
        id: selectedAgentId || undefined,
      });
      toast.success('Agente salvo com sucesso!');
    } catch (error) {
      toast.error('Erro ao salvar agente');
    }
  };

  const handleToggleAgent = async (agentId: string, isActive: boolean) => {
    try {
      await toggleAgent.mutateAsync({ agentId, isActive });
      toast.success(isActive ? 'Agente ativado!' : 'Agente desativado!');
    } catch (error) {
      toast.error('Erro ao alterar status do agente');
    }
  };

  const handleSaveTool = async (data: Partial<AIAgentTool>) => {
    try {
      await saveTool.mutateAsync({
        ...data,
        id: editingTool?.id,
        agent_id: selectedAgentId!,
      });
      toast.success('Ferramenta salva!');
      setIsToolDialogOpen(false);
      setEditingTool(null);
    } catch (error) {
      toast.error('Erro ao salvar ferramenta');
    }
  };

  const handleDeleteTool = async (toolId: string) => {
    if (!confirm('Tem certeza que deseja excluir esta ferramenta?')) return;
    try {
      await deleteTool.mutateAsync({ toolId, agentId: selectedAgentId! });
      toast.success('Ferramenta excluida!');
    } catch (error) {
      toast.error('Erro ao excluir ferramenta');
    }
  };

  // Helper: buscar stats do dashboard para um agente
  const getAgentStats = (agentId: string) => {
    return dashboard?.find((d: any) => d.agent_id === agentId);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      {/* Lista de Agentes */}
      <div className="lg:col-span-1 space-y-3">
        <Button
          size="sm"
          onClick={() => setSelectedAgentId(null)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Novo Agente
        </Button>

        {loadingAgents ? (
          <div className="text-center text-muted-foreground py-4">Carregando...</div>
        ) : agents?.length === 0 ? (
          <div className="text-center text-muted-foreground py-8">
            <Bot className="h-10 w-10 mx-auto mb-2 opacity-30" />
            Nenhum agente criado
          </div>
        ) : (
          <div className="space-y-2">
            {agents?.map((a) => {
              const stats = getAgentStats(a.id);
              const isSelected = selectedAgentId === a.id;
              return (
                <div
                  key={a.id}
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer transition-all",
                    isSelected
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'hover:bg-muted/50'
                  )}
                  onClick={() => setSelectedAgentId(a.id)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm truncate">{a.name || 'Sem nome'}</span>
                    <Switch
                      checked={a.is_active}
                      onCheckedChange={(checked) => handleToggleAgent(a.id, checked)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </div>
                  {(a as any).instance_name && (
                    <div className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                      <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", (a as any).instance_status === 'connected' ? 'bg-emerald-500' : 'bg-red-500')} />
                      {(a as any).instance_name}
                    </div>
                  )}
                  {(a as any).pipeline_name && (
                    <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                      Pipeline: {(a as any).pipeline_name}
                    </div>
                  )}
                  {stats && (stats.active_conversations > 0 || stats.total_messages_sent > 0) && (
                    <div className="flex gap-3 mt-2 text-[10px] text-muted-foreground">
                      {stats.active_conversations > 0 && (
                        <span>{stats.active_conversations} conversa{stats.active_conversations > 1 ? 's' : ''}</span>
                      )}
                      {stats.total_messages_sent > 0 && (
                        <span>{stats.total_messages_sent} msgs</span>
                      )}
                      {stats.pending_in_queue > 0 && (
                        <span className="text-orange-500">{stats.pending_in_queue} na fila</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Editor do Agente */}
      <Card className="lg:col-span-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {selectedAgentId ? (agent?.name || 'Editar Agente') : 'Novo Agente'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AgentForm
            agent={agent}
            tools={tools || []}
            selectedAgentId={selectedAgentId}
            onSave={handleSaveAgent}
            onSaveTool={handleSaveTool}
            onDeleteTool={handleDeleteTool}
            isToolDialogOpen={isToolDialogOpen}
            setIsToolDialogOpen={setIsToolDialogOpen}
            editingTool={editingTool}
            setEditingTool={setEditingTool}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// ==================== AGENT FORM ====================

interface AgentFormProps {
  agent: AISalesAgent | null | undefined;
  tools: AIAgentTool[];
  selectedAgentId: string | null;
  onSave: (data: Partial<AISalesAgent>) => void;
  onSaveTool: (data: Partial<AIAgentTool>) => void;
  onDeleteTool: (toolId: string) => void;
  isToolDialogOpen: boolean;
  setIsToolDialogOpen: (open: boolean) => void;
  editingTool: AIAgentTool | null;
  setEditingTool: (tool: AIAgentTool | null) => void;
}

function AgentForm({
  agent,
  tools,
  selectedAgentId,
  onSave,
  onSaveTool,
  onDeleteTool,
  isToolDialogOpen,
  setIsToolDialogOpen,
  editingTool,
  setEditingTool,
}: AgentFormProps) {
  const { register, handleSubmit, watch, setValue, reset } = useForm<Partial<AISalesAgent>>({
    defaultValues: agent || {
      name: '',
      description: '',
      system_prompt: `Voce e um assistente de vendas simpatico e profissional. Seu objetivo e:
1. Entender as necessidades do cliente
2. Qualificar o lead usando BANT (Budget, Authority, Need, Timeline)
3. Agendar reunioes com o time comercial quando o lead estiver pronto
4. Responder duvidas sobre produtos e servicos

REGRAS:
- Seja natural e humana nas respostas
- Use linguagem informal mas profissional
- Nao seja invasiva ou insistente
- Se o cliente pedir para falar com humano, transfira imediatamente
- Faca uma pergunta por vez
- Respostas curtas (maximo 2-3 frases)`,
      personality_traits: ['simpatica', 'profissional', 'objetiva'],
      target_stages: ['new', 'captura', 'qualificacao'],
      model: 'claude-sonnet-4-6',
      temperature: 0.7,
      max_tokens: 500,
      settings: DEFAULT_AGENT_SETTINGS,
      cadence_steps: {},
    },
  });

  // Reset form quando agent mudar
  useEffect(() => {
    if (agent) {
      // Merge com defaults para garantir que novos campos existam
      const mergedSettings = { ...DEFAULT_AGENT_SETTINGS, ...agent.settings };
      reset({ ...agent, settings: mergedSettings, cadence_steps: agent.cadence_steps || {} });
    }
  }, [agent, reset]);

  const settings = watch('settings') || DEFAULT_AGENT_SETTINGS;
  const targetStages = watch('target_stages') || [];
  const { data: allPipelines } = usePipelines();
  const { data: whatsappInstances } = useWhatsAppInstances();
  const [configPipelineId, setConfigPipelineId] = useState<string>('');
  const { data: configStages } = usePipelineStagesByPipeline(configPipelineId);

  useEffect(() => {
    const agentPipelineId = watch('pipeline_id');
    if (agentPipelineId) {
      setConfigPipelineId(agentPipelineId);
    } else if (allPipelines && allPipelines.length > 0 && !configPipelineId) {
      setConfigPipelineId(allPipelines[0].id);
    }
  }, [allPipelines, configPipelineId, watch('pipeline_id')]);

  const handleStageToggle = (stage: string) => {
    const current = targetStages;
    if (current.includes(stage)) {
      setValue('target_stages', current.filter((s) => s !== stage));
    } else {
      setValue('target_stages', [...current, stage]);
    }
  };

  const handleDayToggle = (day: number) => {
    const current = settings?.working_days || [];
    if (current.includes(day)) {
      setValue('settings.working_days', current.filter((d) => d !== day));
    } else {
      setValue('settings.working_days', [...current, day].sort());
    }
  };

  // Helper para atualizar settings
  const updateSetting = (key: keyof AIAgentSettings, value: any) => {
    setValue(`settings.${key}` as any, value);
  };

  return (
    <form onSubmit={handleSubmit(onSave)}>
      <Tabs defaultValue="basic">
        <TabsList className="mb-4 flex flex-wrap h-auto gap-1">
          <TabsTrigger value="basic" className="flex items-center gap-1">
            <Bot className="h-4 w-4" />
            Basico
          </TabsTrigger>
          <TabsTrigger value="prompt" className="flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Prompt
          </TabsTrigger>
          <TabsTrigger value="schedule" className="flex items-center gap-1">
            <Clock className="h-4 w-4" />
            Horario
          </TabsTrigger>
          <TabsTrigger value="behavior" className="flex items-center gap-1">
            <Zap className="h-4 w-4" />
            Comportamento
          </TabsTrigger>
          <TabsTrigger value="context" className="flex items-center gap-1">
            <Brain className="h-4 w-4" />
            Contexto IA
          </TabsTrigger>
          <TabsTrigger value="advanced" className="flex items-center gap-1">
            <Database className="h-4 w-4" />
            Avancado
          </TabsTrigger>
          <TabsTrigger value="cadence" className="flex items-center gap-1">
            <ListOrdered className="h-4 w-4" />
            Cadencia
          </TabsTrigger>
          <TabsTrigger value="tools" className="flex items-center gap-1">
            <Wrench className="h-4 w-4" />
            Ferramentas
          </TabsTrigger>
        </TabsList>

        {/* ==================== BASICO ==================== */}
        <TabsContent value="basic" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Nome do Agente</Label>
              <Input {...register('name')} placeholder="Ex: Sofia - Vendas" />
            </div>
            <div className="space-y-2">
              <Label>Modelo de IA</Label>
              <Select
                value={watch('model')}
                onValueChange={(v) => setValue('model', v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Instancia WhatsApp <span className="text-red-500">*</span></Label>
              <Select
                value={watch('instance_id') || ''}
                onValueChange={(v) => setValue('instance_id', v || null)}
              >
                <SelectTrigger className={!watch('instance_id') ? 'border-red-300' : ''}>
                  <SelectValue placeholder="Selecione a instancia..." />
                </SelectTrigger>
                <SelectContent>
                  {whatsappInstances?.map((inst) => (
                    <SelectItem key={inst.id} value={inst.id}>
                      <span className="flex items-center gap-2">
                        <span className={cn("w-2 h-2 rounded-full shrink-0", inst.status === 'connected' ? 'bg-emerald-500' : 'bg-red-500')} />
                        {inst.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O agente envia e recebe mensagens SOMENTE por esta instancia.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Pipeline <span className="text-red-500">*</span></Label>
              <Select
                value={watch('pipeline_id') || ''}
                onValueChange={(v) => {
                  setValue('pipeline_id', v || null);
                  setConfigPipelineId(v);
                  setValue('target_stages', []);
                }}
              >
                <SelectTrigger className={!watch('pipeline_id') ? 'border-red-300' : ''}>
                  <SelectValue placeholder="Selecione o pipeline..." />
                </SelectTrigger>
                <SelectContent>
                  {allPipelines?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Pipeline em que este agente atua. Os estagios abaixo sao filtrados por ele.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Instancia WhatsApp</Label>
            <Select
              value={watch('instance_id') || ''}
              onValueChange={(v) => setValue('instance_id', v || null)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a instancia..." />
              </SelectTrigger>
              <SelectContent>
                {whatsappInstances?.filter(i => i.status === 'connected').map((inst) => (
                  <SelectItem key={inst.id} value={inst.id}>
                    {inst.name} {inst.status !== 'connected' ? '(desconectada)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Instancia usada para enviar mensagens. Se nao configurada, usa a da ultima mensagem do lead.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Descricao</Label>
            <Textarea
              {...register('description')}
              placeholder="Descricao do que este agente faz..."
              rows={2}
            />
          </div>

          <div className="space-y-2">
            <Label>Estagios do Funil (quando o agente atua)</Label>
            <p className="text-xs text-muted-foreground mb-2">
              {watch('pipeline_id')
                ? 'Selecione em quais estagios o agente deve responder automaticamente'
                : 'Selecione um pipeline acima para ver os estagios'}
            </p>
            {watch('pipeline_id') && (
              <div className="flex flex-wrap gap-2">
                {(configStages || [])
                  .filter(s => !s.is_won && !s.is_lost)
                  .map((stage) => (
                    <Badge
                      key={stage.id}
                      variant={targetStages.includes(stage.name) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleStageToggle(stage.name)}
                    >
                      {stage.name}
                    </Badge>
                  ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Temperatura ({watch('temperature')})</Label>
            <Slider
              value={[watch('temperature') || 0.7]}
              onValueChange={([v]) => setValue('temperature', v)}
              min={0}
              max={1}
              step={0.1}
            />
            <p className="text-xs text-muted-foreground">
              Menor = mais previsivel, Maior = mais criativo
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max Tokens</Label>
            <Input
              type="number"
              value={watch('max_tokens') || 500}
              onChange={(e) => setValue('max_tokens', parseInt(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Limite de tokens na resposta da IA (1 token ~ 4 caracteres)
            </p>
          </div>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Agente
          </Button>
        </TabsContent>

        {/* ==================== PROMPT ==================== */}
        <TabsContent value="prompt" className="space-y-4">
          <div className="space-y-2">
            <Label>System Prompt</Label>
            <p className="text-xs text-muted-foreground">
              Instrucoes principais para o agente. Use variaveis como <code className="bg-muted px-1 rounded">{'{{nome}}'}</code> para personalizar. O contexto do lead sera adicionado automaticamente.
            </p>
            <Textarea
              {...register('system_prompt')}
              rows={15}
              className="font-mono text-sm"
              placeholder="Instrucoes para o agente..."
            />
          </div>

          {/* Painel de Variaveis Disponiveis */}
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center gap-2">
                  <Variable className="h-4 w-4" />
                  Variaveis Disponiveis
                </div>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Card className="mt-2">
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground mb-3">
                    Clique em uma variavel para copiar. Elas serao substituidas automaticamente pelos dados reais do lead durante a conversa.
                  </p>
                  <div className="space-y-4">
                    {PROMPT_VARIABLES.map((group) => (
                      <div key={group.category}>
                        <h4 className="text-sm font-medium mb-2">{group.category}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                          {group.variables.map((v) => (
                            <button
                              key={v.key}
                              type="button"
                              className="flex items-center gap-2 text-left text-xs p-1.5 rounded hover:bg-muted transition-colors group"
                              onClick={() => {
                                navigator.clipboard.writeText(v.key);
                                toast.success(`Copiado: ${v.key}`);
                              }}
                            >
                              <code className="bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono shrink-0">
                                {v.key}
                              </code>
                              <span className="text-muted-foreground truncate">{v.label}</span>
                              <Copy className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <Separator className="my-3" />
                  <p className="text-xs text-muted-foreground">
                    Exemplo: <code className="bg-muted px-1 rounded">Se o lead veio de {'{{lead_origem}}'}, foque em...</code>
                    {' → '}sera substituido por: <code className="bg-muted px-1 rounded">Se o lead veio de Instagram, foque em...</code>
                  </p>
                </CardContent>
              </Card>
            </CollapsibleContent>
          </Collapsible>

          <div className="space-y-2">
            <Label>Tracos de Personalidade</Label>
            <Input
              value={(watch('personality_traits') || []).join(', ')}
              onChange={(e) =>
                setValue(
                  'personality_traits',
                  e.target.value.split(',').map((s) => s.trim())
                )
              }
              placeholder="simpatica, profissional, objetiva"
            />
            <p className="text-xs text-muted-foreground">
              Separe por virgula. Esses tracos serao incluidos no prompt.
            </p>
          </div>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Prompt
          </Button>
        </TabsContent>

        {/* ==================== HORARIO ==================== */}
        <TabsContent value="schedule" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Horario de Funcionamento</CardTitle>
              <CardDescription>
                O agente so responde dentro desses horarios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Horario Inicio</Label>
                  <Input
                    type="time"
                    value={settings?.working_hours_start || '08:00'}
                    onChange={(e) => updateSetting('working_hours_start', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horario Fim</Label>
                  <Input
                    type="time"
                    value={settings?.working_hours_end || '20:00'}
                    onChange={(e) => updateSetting('working_hours_end', e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dias de Funcionamento</Label>
                <div className="flex gap-2">
                  {DAYS_OF_WEEK.map((day) => (
                    <Badge
                      key={day.value}
                      variant={settings?.working_days?.includes(day.value) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => handleDayToggle(day.value)}
                    >
                      {day.label}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Agenda e Reuniões</CardTitle>
              <CardDescription>
                Configurações de duração de reuniões e slots da agenda
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Duração Padrão de Reunião (minutos)</Label>
                <Input
                  type="number"
                  min={15}
                  max={120}
                  step={15}
                  value={settings?.meeting_duration_minutes || 45}
                  onChange={(e) => updateSetting('meeting_duration_minutes', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Define a duração dos slots na agenda. O agente IA usa esse valor para verificar conflitos de horário ao agendar reuniões.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limites de Conversa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Max Mensagens por Conversa</Label>
                <Input
                  type="number"
                  value={settings?.max_messages_per_conversation || 50}
                  onChange={(e) => updateSetting('max_messages_per_conversation', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Apos este limite, a conversa e encerrada automaticamente
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Pausar ao Humano Responder</Label>
                  <p className="text-xs text-muted-foreground">
                    Pausa o agente quando um humano responde na conversa
                  </p>
                </div>
                <Switch
                  checked={settings?.auto_pause_after_human_reply ?? true}
                  onCheckedChange={(checked) => updateSetting('auto_pause_after_human_reply', checked)}
                />
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Horarios
          </Button>
        </TabsContent>

        {/* ==================== COMPORTAMENTO ==================== */}
        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Debounce de Mensagens</CardTitle>
              <CardDescription>
                Quando o lead envia varias mensagens seguidas, o agente espera antes de responder
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Tempo de Espera (segundos)</Label>
                <Input
                  type="number"
                  value={settings?.debounce_seconds || 3}
                  onChange={(e) => updateSetting('debounce_seconds', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Apos a ultima mensagem do lead, aguarda esse tempo antes de processar.
                  Isso permite combinar multiplas mensagens em uma unica resposta.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Delays de Resposta</CardTitle>
              <CardDescription>
                Simula tempo de leitura e digitacao para parecer mais humano
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Delay Minimo (ms)</Label>
                  <Input
                    type="number"
                    value={settings?.response_delay_min_ms || 2000}
                    onChange={(e) => updateSetting('response_delay_min_ms', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delay Maximo (ms)</Label>
                  <Input
                    type="number"
                    value={settings?.response_delay_max_ms || 5000}
                    onChange={(e) => updateSetting('response_delay_max_ms', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo aleatorio entre esses valores antes de comecar a "digitar"
              </p>

              <div className="space-y-2">
                <Label>Velocidade de Digitacao (caracteres/min)</Label>
                <Input
                  type="number"
                  value={settings?.typing_speed_cpm || 300}
                  onChange={(e) => updateSetting('typing_speed_cpm', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Adiciona delay baseado no tamanho da resposta (simulacao de digitacao)
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quebra de Mensagens Longas</CardTitle>
              <CardDescription>
                Mensagens grandes sao quebradas em partes menores (mais natural no WhatsApp)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Tamanho Maximo por Mensagem (caracteres)</Label>
                <Input
                  type="number"
                  value={settings?.message_split_max_length || 200}
                  onChange={(e) => updateSetting('message_split_max_length', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Mensagens maiores que isso serao quebradas em partes
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Delay Entre Partes Min (ms)</Label>
                  <Input
                    type="number"
                    value={settings?.delay_between_messages_min_ms || 500}
                    onChange={(e) => updateSetting('delay_between_messages_min_ms', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delay Entre Partes Max (ms)</Label>
                  <Input
                    type="number"
                    value={settings?.delay_between_messages_max_ms || 1500}
                    onChange={(e) => updateSetting('delay_between_messages_max_ms', parseInt(e.target.value))}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Tempo entre o envio de cada parte da mensagem quebrada
              </p>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Comportamento
          </Button>
        </TabsContent>

        {/* ==================== CONTEXTO IA ==================== */}
        <TabsContent value="context" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Limites de Contexto</CardTitle>
              <CardDescription>
                Quanto de informacao do lead e enviado para a IA antes de responder.
                Mais contexto = mais custo de tokens, mas respostas mais precisas.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mensagens WhatsApp</Label>
                  <Input
                    type="number"
                    value={settings?.context_messages_limit || 20}
                    onChange={(e) => updateSetting('context_messages_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Ultimas mensagens da conversa
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Historico OpenAI</Label>
                  <Input
                    type="number"
                    value={settings?.conversation_history_limit || 20}
                    onChange={(e) => updateSetting('conversation_history_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mensagens enviadas na API OpenAI
                  </p>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Deals/Oportunidades</Label>
                  <Input
                    type="number"
                    value={settings?.context_deals_limit || 5}
                    onChange={(e) => updateSetting('context_deals_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Negocios do lead no contexto
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Produtos Disponiveis</Label>
                  <Input
                    type="number"
                    value={settings?.context_products_limit || 10}
                    onChange={(e) => updateSetting('context_products_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Produtos que a IA conhece
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tarefas Pendentes</Label>
                  <Input
                    type="number"
                    value={settings?.context_tasks_limit || 5}
                    onChange={(e) => updateSetting('context_tasks_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Follow-ups do lead
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Notas da Equipe</Label>
                  <Input
                    type="number"
                    value={settings?.context_notes_limit || 5}
                    onChange={(e) => updateSetting('context_notes_limit', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Observacoes salvas
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Contexto
          </Button>
        </TabsContent>

        {/* ==================== AVANCADO ==================== */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Processamento</CardTitle>
              <CardDescription>
                Configuracoes avancadas de processamento de mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Duracao do Lock (segundos)</Label>
                  <Input
                    type="number"
                    value={settings?.lock_duration_seconds || 30}
                    onChange={(e) => updateSetting('lock_duration_seconds', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Tempo maximo de processamento antes de liberar para outra instancia
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Tentativas em Erro</Label>
                  <Input
                    type="number"
                    value={settings?.max_retry_attempts || 3}
                    onChange={(e) => updateSetting('max_retry_attempts', parseInt(e.target.value))}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantas vezes tenta reprocessar em caso de falha
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Itens por Lote na Fila</Label>
                <Input
                  type="number"
                  value={settings?.queue_batch_size || 10}
                  onChange={(e) => updateSetting('queue_batch_size', parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  Quantas mensagens processar por vez quando usa modo de fila
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mensagens Padrao</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label>Mensagem de Fallback</Label>
                <Textarea
                  value={settings?.fallback_message || 'Desculpe, nao entendi. Pode repetir?'}
                  onChange={(e) => updateSetting('fallback_message', e.target.value)}
                  rows={2}
                />
                <p className="text-xs text-muted-foreground">
                  Enviada quando a IA nao consegue gerar uma resposta
                </p>
              </div>
            </CardContent>
          </Card>

          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Configuracoes Avancadas
          </Button>
        </TabsContent>

        {/* ==================== CADENCIA ==================== */}
        <TabsContent value="cadence" className="space-y-4">
          {/* Config de reativação */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Reativacao por Silencio
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Se o lead respondeu e a cadencia parou, mas depois ficou em silencio, a cadencia retoma automaticamente de onde parou.
              </p>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <Label className="text-sm whitespace-nowrap">Tempo de silencio:</Label>
                <Input
                  type="number"
                  min={0}
                  className="w-24"
                  value={settings.cadence_silence_timeout_minutes || 120}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setValue('settings', { ...settings, cadence_silence_timeout_minutes: val });
                  }}
                />
                <span className="text-sm text-muted-foreground">minutos</span>
                <span className="text-xs text-muted-foreground ml-2">
                  ({Math.floor((settings.cadence_silence_timeout_minutes || 120) / 60)}h {(settings.cadence_silence_timeout_minutes || 120) % 60}min)
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                0 = desativado. Recomendado: 120 (2h) para leads quentes, 1440 (24h) para leads frios.
              </p>
            </CardContent>
          </Card>

          {/* Config de reativação por estágio */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Zap className="h-4 w-4" />
                Reativacao por Estagio
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Quando o lead responde de um estagio terminal (ex: Perdido), ele e movido automaticamente para outro estagio e a cadencia reinicia.
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {(() => {
                const reactivationMap: Record<string, string> = settings.cadence_reactivation_map || {};
                const terminalStages = configStages?.filter(s => s.is_lost || s.name === 'No-show') || [];

                const updateMap = (stageName: string, targetName: string | null) => {
                  const newMap = { ...reactivationMap };
                  if (targetName) {
                    newMap[stageName] = targetName;
                  } else {
                    delete newMap[stageName];
                  }
                  setValue('settings', { ...settings, cadence_reactivation_map: newMap });
                };

                return terminalStages.length > 0 ? (
                  <div className="space-y-2">
                    {terminalStages.map(stage => (
                      <div key={stage.id} className="flex items-center gap-3">
                        <Badge variant="outline" className="min-w-[100px] justify-center">{stage.name}</Badge>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        <select
                          className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                          value={reactivationMap[stage.name] || ''}
                          onChange={(e) => updateMap(stage.name, e.target.value || null)}
                        >
                          <option value="">Nao mover (desativado)</option>
                          {configStages?.filter(s => s.id !== stage.id && !s.is_won && !s.is_lost).map(s => (
                            <option key={s.id} value={s.name}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Selecione um pipeline acima para configurar.</p>
                );
              })()}
            </CardContent>
          </Card>

          <CadenceEditor
            cadenceSteps={(watch('cadence_steps') || {}) as CadenceConfig}
            onChange={(steps) => setValue('cadence_steps', steps)}
            agentId={selectedAgentId}
          />
          <Button type="submit" className="w-full">
            <Save className="h-4 w-4 mr-2" />
            Salvar Cadencia
          </Button>
        </TabsContent>

        {/* ==================== FERRAMENTAS ==================== */}
        <TabsContent value="tools" className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Ferramentas que o agente pode usar (function calling)
            </p>
            <Dialog open={isToolDialogOpen} onOpenChange={setIsToolDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  onClick={() => setEditingTool(null)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Ferramenta
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>
                    {editingTool ? 'Editar Ferramenta' : 'Nova Ferramenta'}
                  </DialogTitle>
                </DialogHeader>
                <ToolForm tool={editingTool} onSave={onSaveTool} />
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-2">
            {tools.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma ferramenta configurada
              </div>
            ) : (
              tools.map((tool) => (
                <Collapsible key={tool.id}>
                  <div className="flex items-center justify-between p-3 border rounded-lg">
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1">
                      <ChevronRight className="h-4 w-4" />
                      <Wrench className="h-4 w-4" />
                      <span className="font-medium">{tool.name}</span>
                      <Badge variant="outline" className="ml-2">
                        {tool.action_type}
                      </Badge>
                    </CollapsibleTrigger>
                    <div className="flex gap-2">
                      <Switch checked={tool.is_active} />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingTool(tool);
                          setIsToolDialogOpen(true);
                        }}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => onDeleteTool(tool.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <CollapsibleContent className="p-3 border-x border-b rounded-b-lg bg-muted/30">
                    <p className="text-sm text-muted-foreground mb-2">
                      {tool.description}
                    </p>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                      {JSON.stringify(tool.parameters, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>
    </form>
  );
}

// ==================== TOOL FORM ====================

interface ToolFormProps {
  tool: AIAgentTool | null;
  onSave: (data: Partial<AIAgentTool>) => void;
}

function ToolForm({ tool, onSave }: ToolFormProps) {
  const { register, handleSubmit, watch, setValue } = useForm<Partial<AIAgentTool>>({
    defaultValues: tool || {
      name: '',
      description: '',
      action_type: 'update_lead',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
      action_config: {},
      priority: 0,
      is_active: true,
    },
  });

  const [parametersJson, setParametersJson] = useState(
    JSON.stringify(tool?.parameters || { type: 'object', properties: {}, required: [] }, null, 2)
  );
  const [showJsonEditor, setShowJsonEditor] = useState(false);

  const actionType = watch('action_type');

  // Auto-preencher ao trocar action_type (somente se nao esta editando tool existente)
  const handleActionTypeChange = (newType: string) => {
    setValue('action_type', newType);
    const preset = TOOL_PRESETS[newType];
    if (preset && !tool) {
      setValue('name', preset.name);
      setValue('description', preset.description);
      setParametersJson(JSON.stringify(preset.parameters, null, 2));
    }
  };

  // Parse visual dos parametros
  const parsedParams = (() => {
    try {
      const parsed = JSON.parse(parametersJson);
      const properties = parsed?.properties || {};
      const required = parsed?.required || [];
      return Object.entries(properties).map(([key, schema]: [string, any]) => ({
        key,
        type: schema.type || 'string',
        description: schema.description || '',
        enum: schema.enum,
        required: required.includes(key),
      }));
    } catch {
      return [];
    }
  })();

  const onSubmit = (data: Partial<AIAgentTool>) => {
    try {
      data.parameters = JSON.parse(parametersJson);
    } catch {
      toast.error('JSON de parametros invalido');
      return;
    }
    onSave(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label>Tipo de Acao</Label>
        <Select
          value={actionType}
          onValueChange={handleActionTypeChange}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ACTION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {actionType && TOOL_PRESETS[actionType] && !tool && (
          <p className="text-xs text-muted-foreground">
            Campos pre-preenchidos automaticamente. Ajuste conforme necessario.
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome (identificador)</Label>
          <Input {...register('name')} placeholder="qualify_lead" />
        </div>
        <div className="space-y-2">
          <Label>Prioridade</Label>
          <Input
            type="number"
            {...register('priority', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Descricao (para a IA entender quando usar)</Label>
        <Textarea
          {...register('description')}
          placeholder="Descreva quando a IA deve usar esta ferramenta..."
          rows={2}
        />
      </div>

      {/* Exibicao visual dos parametros */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Parametros</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowJsonEditor(!showJsonEditor)}
            className="h-7 text-xs gap-1"
          >
            {showJsonEditor ? (
              <><Eye className="h-3 w-3" /> Visual</>
            ) : (
              <><Code className="h-3 w-3" /> JSON</>
            )}
          </Button>
        </div>

        {showJsonEditor ? (
          <Textarea
            value={parametersJson}
            onChange={(e) => setParametersJson(e.target.value)}
            rows={10}
            className="font-mono text-sm"
          />
        ) : parsedParams.length > 0 ? (
          <div className="border rounded-lg divide-y">
            {parsedParams.map((param) => (
              <div key={param.key} className="p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <code className="text-sm font-mono font-medium">{param.key}</code>
                  <Badge variant="outline" className="text-[10px] h-5">
                    {param.type}
                  </Badge>
                  {param.required && (
                    <Badge variant="destructive" className="text-[10px] h-5">
                      obrigatorio
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">{param.description}</p>
                {param.enum && (
                  <div className="flex gap-1 flex-wrap mt-1">
                    {param.enum.map((v: string) => (
                      <Badge key={v} variant="secondary" className="text-[10px]">
                        {v}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
            Nenhum parametro definido. Selecione um tipo de acao para auto-preencher ou use o modo JSON.
          </div>
        )}
      </div>

      <Button type="submit" className="w-full">
        <Save className="h-4 w-4 mr-2" />
        Salvar Ferramenta
      </Button>
    </form>
  );
}

// ==================== CADENCE EDITOR ====================

const CADENCE_ACTION_TYPES = [
  { value: 'text', label: 'Mensagem Fixa', icon: Type },
  { value: 'ai_message', label: 'Mensagem IA', icon: Sparkles },
  { value: 'ai_media', label: 'Midia Inteligente (IA)', icon: FileVideo },
  { value: 'image', label: 'Imagem', icon: Image },
  { value: 'video', label: 'Video', icon: Video },
  { value: 'audio', label: 'Audio', icon: AudioLines },
  { value: 'webhook', label: 'Webhook', icon: Webhook },
];

const DELAY_PRESETS = [
  { label: 'Imediato', minutes: 0 },
  { label: '5min', minutes: 5 },
  { label: '15min', minutes: 15 },
  { label: '30min', minutes: 30 },
  { label: '1h', minutes: 60 },
  { label: '2h', minutes: 120 },
  { label: '6h', minutes: 360 },
  { label: '12h', minutes: 720 },
  { label: '1 dia', minutes: 1440 },
  { label: '2 dias', minutes: 2880 },
  { label: '3 dias', minutes: 4320 },
  { label: '7 dias', minutes: 10080 },
];

interface CadenceEditorProps {
  cadenceSteps: CadenceConfig;
  onChange: (steps: CadenceConfig) => void;
  agentId: string | null;
}

function CadenceEditor({ cadenceSteps, onChange, agentId }: CadenceEditorProps) {
  const { data: pipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const { data: pipelineStages } = usePipelineStagesByPipeline(selectedPipelineId);
  const [selectedStage, setSelectedStage] = useState<string>('');
  const { data: enrollments } = useCadenceEnrollments(agentId);
  const cancelEnrollment = useCancelCadenceEnrollment();

  // Auto-selecionar primeiro pipeline quando carregar
  useEffect(() => {
    if (pipelines && pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, selectedPipelineId]);

  // Auto-selecionar primeiro estágio quando pipeline mudar
  useEffect(() => {
    if (pipelineStages && pipelineStages.length > 0 && !pipelineStages.find(s => s.name === selectedStage)) {
      setSelectedStage(pipelineStages[0].name);
    }
  }, [pipelineStages, selectedStage]);

  const stageSteps: CadenceStep[] = cadenceSteps[selectedStage] || [];

  const updateStageSteps = (newSteps: CadenceStep[]) => {
    onChange({
      ...cadenceSteps,
      [selectedStage]: newSteps,
    });
  };

  const addStep = () => {
    const newStep: CadenceStep = {
      step_order: stageSteps.length,
      action_type: 'text',
      content: '',
      delay_minutes: stageSteps.length === 0 ? 0 : 60,
      only_if_no_reply: stageSteps.length > 0,
    };
    updateStageSteps([...stageSteps, newStep]);
  };

  const removeStep = (index: number) => {
    const newSteps = stageSteps
      .filter((_, i) => i !== index)
      .map((s, i) => ({ ...s, step_order: i }));
    updateStageSteps(newSteps);
  };

  const updateStep = (index: number, updates: Partial<CadenceStep>) => {
    const newSteps = stageSteps.map((s, i) =>
      i === index ? { ...s, ...updates } : s
    );
    updateStageSteps(newSteps);
  };

  const formatDelay = (minutes: number): string => {
    if (minutes === 0) return 'Imediato';
    if (minutes < 60) return `${minutes}min`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}`;
    const days = Math.floor(minutes / 1440);
    const remaining = minutes % 1440;
    return `${days}d${remaining ? ` ${Math.floor(remaining / 60)}h` : ''}`;
  };

  const getContentPlaceholder = (type: string): string => {
    switch (type) {
      case 'text': return 'Oi {{nome}}! Tudo bem? Vi que voce se interessou pelo nosso produto...';
      case 'ai_message': return 'Gere uma mensagem de follow-up amigavel perguntando se o lead {{nome}} teve tempo de avaliar nossa proposta';
      case 'ai_media': return 'Envie um material relevante sobre automacao de atendimento ou vendas, baseado no contexto da conversa com o lead';
      case 'image': return 'https://example.com/imagem.png';
      case 'video': return 'https://example.com/video.mp4';
      case 'audio': return 'https://example.com/audio.mp3';
      case 'webhook': return 'https://hooks.example.com/cadence-action';
      default: return '';
    }
  };

  const getContentLabel = (type: string): string => {
    switch (type) {
      case 'text': return 'Mensagem (suporta {{variaveis}})';
      case 'ai_message': return 'Instrucao para a IA (contexto do lead e adicionado automaticamente)';
      case 'ai_media': return 'Instrucao para a IA escolher a melhor midia (usa materiais de venda cadastrados)';
      case 'image': return 'URL da imagem';
      case 'video': return 'URL do video';
      case 'audio': return 'URL do audio';
      case 'webhook': return 'URL do webhook (recebe JSON com dados do lead)';
      default: return 'Conteudo';
    }
  };

  const handleCancelEnrollment = async (enrollmentId: string) => {
    if (!agentId) return;
    try {
      await cancelEnrollment.mutateAsync({ enrollmentId, agentId });
      toast.success('Enrollment cancelado');
    } catch {
      toast.error('Erro ao cancelar enrollment');
    }
  };

  // Filtrar enrollments por stage selecionado
  const activeEnrollments = enrollments?.filter(
    (e) => e.stage === selectedStage && e.status === 'active'
  ) || [];

  const stageEnrollments = enrollments?.filter(
    (e) => e.stage === selectedStage
  ) || [];

  return (
    <div className="space-y-4">
      {/* Seletor de Pipeline + Estagio */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Pipeline e Estagio</CardTitle>
          <CardDescription>
            Selecione o pipeline e configure a cadencia para cada estagio
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Seletor de Pipeline */}
          {pipelines && pipelines.length > 1 && (
            <div className="flex gap-2">
              {pipelines.map((p) => (
                <Badge
                  key={p.id}
                  variant={selectedPipelineId === p.id ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => {
                    setSelectedPipelineId(p.id);
                    setSelectedStage('');
                  }}
                >
                  {p.name}
                </Badge>
              ))}
            </div>
          )}
          {pipelines && pipelines.length > 1 && <Separator />}
          {/* Estagios do Pipeline */}
          <div className="flex flex-wrap gap-2">
            {(pipelineStages || [])
              .filter(s => !s.is_won && !s.is_lost)
              .map((stage) => {
                const hasSteps = (cadenceSteps[stage.name] || []).length > 0;
                return (
                  <Badge
                    key={stage.id}
                    variant={selectedStage === stage.name ? 'default' : 'outline'}
                    className="cursor-pointer relative"
                    onClick={() => setSelectedStage(stage.name)}
                  >
                    {stage.name}
                    {hasSteps && (
                      <span className="ml-1 bg-primary-foreground text-primary rounded-full px-1.5 text-[10px] font-bold">
                        {cadenceSteps[stage.name].length}
                      </span>
                    )}
                  </Badge>
                );
              })}
          </div>
        </CardContent>
      </Card>

      {/* Steps do Estagio */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Passos da Cadencia — {selectedStage}
              </CardTitle>
              <CardDescription>
                {stageSteps.length === 0
                  ? 'Nenhum passo configurado. Adicione o primeiro.'
                  : `${stageSteps.length} passo(s) configurado(s)`}
              </CardDescription>
            </div>
            <Button type="button" size="sm" onClick={addStep}>
              <Plus className="h-4 w-4 mr-1" />
              Passo
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-0">
          {stageSteps.map((step, index) => {
            const ActionIcon = CADENCE_ACTION_TYPES.find(a => a.value === step.action_type)?.icon || Type;
            const isPreset = DELAY_PRESETS.some(p => p.minutes === step.delay_minutes);
            return (
              <div key={index} className="relative">
                {/* Conector visual entre steps */}
                {index > 0 && (
                  <div className="flex items-center gap-2 py-2 pl-6">
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-full px-2.5 py-1">
                      <Clock className="h-3 w-3" />
                      Aguardar {formatDelay(step.delay_minutes)}
                      {step.only_if_no_reply && (
                        <span className="text-orange-500 font-medium">• se nao respondeu</span>
                      )}
                    </div>
                  </div>
                )}

                <div className="border rounded-lg p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {index + 1}
                      </div>
                      <Select
                        value={step.action_type}
                        onValueChange={(v) => updateStep(index, { action_type: v as CadenceStep['action_type'] })}
                      >
                        <SelectTrigger className="h-8 w-auto border-dashed gap-1.5 text-sm font-medium">
                          <ActionIcon className="h-3.5 w-3.5" />
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {CADENCE_ACTION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>
                              <div className="flex items-center gap-2">
                                <t.icon className="h-3.5 w-3.5" />
                                {t.label}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => removeStep(index)}
                    >
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>

                  {/* Conteudo */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{getContentLabel(step.action_type)}</Label>
                    {step.action_type === 'text' || step.action_type === 'ai_message' || step.action_type === 'ai_media' ? (
                      <Textarea
                        value={step.content}
                        onChange={(e) => updateStep(index, { content: e.target.value })}
                        placeholder={getContentPlaceholder(step.action_type)}
                        rows={3}
                        className="text-sm"
                      />
                    ) : (
                      <Input
                        value={step.content}
                        onChange={(e) => updateStep(index, { content: e.target.value })}
                        placeholder={getContentPlaceholder(step.action_type)}
                        className="h-9 text-sm"
                      />
                    )}
                  </div>

                  {/* Caption (para image/video) */}
                  {(step.action_type === 'image' || step.action_type === 'video') && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Legenda (opcional, suporta {'{{variaveis}}'})</Label>
                      <Input
                        value={step.caption || ''}
                        onChange={(e) => updateStep(index, { caption: e.target.value })}
                        placeholder="Confira nosso material, {{nome}}!"
                        className="h-9 text-sm"
                      />
                    </div>
                  )}

                  {/* Tempo de espera + condicao */}
                  <div className="space-y-2 pt-1 border-t">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Tempo de espera antes deste passo
                      </Label>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={step.only_if_no_reply}
                          onCheckedChange={(checked) => updateStep(index, { only_if_no_reply: checked })}
                        />
                        <Label className="text-xs text-muted-foreground">
                          So se nao respondeu
                        </Label>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {DELAY_PRESETS.map((preset) => (
                        <button
                          key={preset.minutes}
                          type="button"
                          className={cn(
                            "px-2.5 py-1 rounded-md text-xs font-medium border transition-colors",
                            step.delay_minutes === preset.minutes
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted border-border text-muted-foreground"
                          )}
                          onClick={() => updateStep(index, { delay_minutes: preset.minutes })}
                        >
                          {preset.label}
                        </button>
                      ))}
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={0}
                          className={cn(
                            "h-7 w-16 text-xs text-center",
                            !isPreset && step.delay_minutes > 0 && "ring-2 ring-primary"
                          )}
                          value={step.delay_minutes}
                          onChange={(e) => updateStep(index, { delay_minutes: parseInt(e.target.value) || 0 })}
                          placeholder="min"
                        />
                        <span className="text-xs text-muted-foreground">min</span>
                      </div>
                    </div>
                  </div>

                  {/* Post Action */}
                  <div className="pt-2 border-t">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs text-muted-foreground whitespace-nowrap">Pos-acao:</Label>
                      <Select
                        value={step.post_action?.type || 'none'}
                        onValueChange={(val) => {
                          if (val === 'none') {
                            const { post_action, ...rest } = step;
                            updateStep(index, { post_action: undefined } as any);
                          } else {
                            updateStep(index, { post_action: { type: val as any, target_stage: '', task_title: '' } });
                          }
                        }}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nenhuma</SelectItem>
                          <SelectItem value="move_stage">Mover estagio</SelectItem>
                          <SelectItem value="create_task">Criar tarefa</SelectItem>
                          <SelectItem value="notify_human">Notificar humano</SelectItem>
                        </SelectContent>
                      </Select>

                      {step.post_action?.type === 'move_stage' && (
                        <Select
                          value={step.post_action.target_stage || ''}
                          onValueChange={(val) => updateStep(index, { post_action: { ...step.post_action!, target_stage: val } })}
                        >
                          <SelectTrigger className="h-7 w-40 text-xs">
                            <SelectValue placeholder="Selecionar estagio" />
                          </SelectTrigger>
                          <SelectContent>
                            {pipelineStages?.map((s: any) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      {step.post_action?.type === 'create_task' && (
                        <Input
                          className="h-7 text-xs flex-1"
                          placeholder="Titulo da tarefa (opcional)"
                          value={step.post_action.task_title || ''}
                          onChange={(e) => updateStep(index, { post_action: { ...step.post_action!, task_title: e.target.value } })}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {stageSteps.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <ListOrdered className="h-10 w-10 mx-auto mb-3 opacity-30" />
              Nenhum passo configurado para este estagio.
              <br />
              Clique em "Passo" para criar a primeira acao da cadencia.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Enrollments Ativos (mini dashboard) */}
      {agentId && stageEnrollments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Enrollments — {selectedStage}
            </CardTitle>
            <CardDescription>
              {activeEnrollments.length} ativo(s) de {stageEnrollments.length} total
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg divide-y text-sm">
              {stageEnrollments.slice(0, 10).map((enrollment) => {
                const totalSteps = (cadenceSteps[enrollment.stage] || []).length;
                return (
                  <div key={enrollment.id} className="flex items-center justify-between p-2.5 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium truncate">
                        {enrollment.lead?.name || 'Lead'}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {enrollment.lead?.phone}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline" className="text-[10px]">
                        Passo {enrollment.current_step + 1}/{totalSteps || '?'}
                      </Badge>
                      <Badge
                        variant={
                          enrollment.status === 'active' ? 'default' :
                          enrollment.status === 'replied' ? 'secondary' :
                          enrollment.status === 'completed' ? 'secondary' :
                          'outline'
                        }
                        className="text-[10px]"
                      >
                        {enrollment.status === 'active' ? 'Ativo' :
                         enrollment.status === 'replied' ? 'Respondeu' :
                         enrollment.status === 'completed' ? 'Completo' :
                         enrollment.status === 'cancelled' ? 'Cancelado' :
                         enrollment.status}
                      </Badge>
                      {enrollment.status === 'active' && enrollment.next_action_at && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(enrollment.next_action_at) > new Date()
                            ? `em ${formatTimeUntil(enrollment.next_action_at)}`
                            : 'processando...'
                          }
                        </span>
                      )}
                      {enrollment.status === 'active' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleCancelEnrollment(enrollment.id)}
                        >
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Formata tempo restante de forma legivel
 */
function formatTimeUntil(dateStr: string): string {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return 'agora';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export default AIAgentTab;
