import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  useTaskBotConfig,
  useSaveTaskBotConfig,
  useWhatsAppGroups,
  useTaskBotLogs,
  useToggleTaskBot,
  useTestTaskBot,
  useSyncWhatsAppGroups,
} from "@/hooks/useWhatsAppTaskBot";
import { useWhatsAppInstances } from "@/hooks/useWhatsAppInbox";
import {
  Bot,
  Save,
  Power,
  PowerOff,
  MessageSquare,
  Users,
  Settings2,
  History,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  XCircle,
  Loader2,
  TestTube,
  Sparkles,
  RefreshCw,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

const DEFAULT_PROMPT = `Você é um assistente de criação de tarefas. Analise as mensagens do grupo WhatsApp e extraia informações para criar tarefas.

TIPOS DE TAREFA DISPONÍVEIS (detecte automaticamente baseado no contexto):
- "call" → Ligações, telefonemas (ex: "ligar para", "fazer ligação", "retornar ligação")
- "meeting" → Reuniões, encontros (ex: "agendar reunião", "marcar call", "fazer uma call")
- "whatsapp" → Contato via WhatsApp (ex: "mandar mensagem", "falar no whats", "enviar zap")
- "follow_up" → Acompanhamento geral (ex: "verificar", "checar", "acompanhar", "lembrar")
- "onboarding" → Onboarding de cliente (ex: "fazer onboarding", "treinar", "apresentar sistema")
- "internal" → Tarefas internas (ex: "organizar", "preparar", "documentar", "atualizar sistema")

PRIORIDADES:
- "urgent" → Urgente, agora, imediato, ASAP
- "high" → Importante, prioritário, hoje
- "medium" → Normal, padrão (default)
- "low" → Pode esperar, quando puder

RESPONDA APENAS em JSON:

Se conseguir identificar uma tarefa:
{
  "action": "create_task",
  "task": {
    "name": "título curto e claro da tarefa",
    "notes": "detalhes adicionais se houver",
    "task_type": "tipo detectado automaticamente",
    "priority": "prioridade detectada",
    "responsavel_name": "nome do responsável se mencionado",
    "due_date": "YYYY-MM-DD se mencionado",
    "due_time": "HH:MM se mencionado"
  },
  "message": "mensagem de confirmação para o grupo"
}

Se precisar de mais informações:
{
  "action": "ask_question",
  "question": "pergunta específica para esclarecer"
}

Se não for uma solicitação de tarefa:
{
  "action": "ignore",
  "reason": "motivo"
}

REGRAS:
- Detecte automaticamente o task_type mais apropriado
- Se não conseguir determinar o tipo, use "follow_up"
- Extraia datas relativas: "amanhã" = data de amanhã, "hoje" = data de hoje, "segunda" = próxima segunda
- Se mencionar horário, inclua due_time
- Seja conciso nas mensagens de confirmação`;

const TASK_TYPES = [
  { value: "call", label: "Ligação" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "meeting", label: "Reunião" },
  { value: "follow_up", label: "Follow-up" },
  { value: "onboarding", label: "Onboarding" },
  { value: "internal", label: "Interna" },
];

export function WhatsAppTaskBotConfig() {
  const { toast } = useToast();
  const { data: config, isLoading: loadingConfig } = useTaskBotConfig();
  const { data: instances } = useWhatsAppInstances();
  const { data: groups, isLoading: loadingGroups } = useWhatsAppGroups();
  const { data: logs } = useTaskBotLogs(30);
  const saveConfig = useSaveTaskBotConfig();
  const toggleBot = useToggleTaskBot();
  const testBot = useTestTaskBot();
  const syncGroups = useSyncWhatsAppGroups();

  // Form state
  const [name, setName] = useState("Bot de Tarefas");
  const [instanceId, setInstanceId] = useState<string>("");
  const [botMentionId, setBotMentionId] = useState("");
  const [enabledGroups, setEnabledGroups] = useState<string[]>([]);
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_PROMPT);
  const [contextCount, setContextCount] = useState(20);
  const [autoAssign, setAutoAssign] = useState(true);
  const [defaultTaskType, setDefaultTaskType] = useState("follow_up");
  const [notifyOnCreation, setNotifyOnCreation] = useState(true);

  // Test state
  const [testMessage, setTestMessage] = useState("");
  const [testGroupId, setTestGroupId] = useState("");
  const [testResult, setTestResult] = useState<any>(null);

  // Load config into form
  useEffect(() => {
    if (config) {
      setName(config.name || "Bot de Tarefas");
      setInstanceId(config.instance_id || "");
      setBotMentionId(config.bot_mention_id || "");
      setEnabledGroups(config.enabled_group_ids || []);
      setAiPrompt(config.ai_prompt || DEFAULT_PROMPT);
      setContextCount(config.context_messages_count || 20);
      setAutoAssign(config.auto_assign_to_sender ?? true);
      setDefaultTaskType(config.default_task_type || "follow_up");
      setNotifyOnCreation(config.notify_on_creation ?? true);
    }
  }, [config]);

  const handleSave = async () => {
    if (!botMentionId) {
      toast({ title: "ID do bot é obrigatório", variant: "destructive" });
      return;
    }

    try {
      await saveConfig.mutateAsync({
        name,
        instance_id: instanceId || null,
        bot_mention_id: botMentionId,
        enabled_group_ids: enabledGroups,
        ai_prompt: aiPrompt,
        context_messages_count: contextCount,
        auto_assign_to_sender: autoAssign,
        default_task_type: defaultTaskType,
        notify_on_creation: notifyOnCreation,
      });
      toast({ title: "Configuração salva com sucesso!" });
    } catch (error) {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
  };

  const handleToggle = async () => {
    if (!config) return;
    try {
      await toggleBot.mutateAsync({ id: config.id, is_active: !config.is_active });
      toast({
        title: config.is_active ? "Bot desativado" : "Bot ativado",
      });
    } catch (error) {
      toast({ title: "Erro ao alterar status", variant: "destructive" });
    }
  };

  const handleTest = async () => {
    if (!testMessage || !testGroupId) {
      toast({ title: "Preencha mensagem e grupo para testar", variant: "destructive" });
      return;
    }

    try {
      const result = await testBot.mutateAsync({
        message: testMessage,
        groupId: testGroupId,
      });
      setTestResult(result);
      toast({ title: "Teste executado!" });
    } catch (error: any) {
      toast({ title: error.message || "Erro no teste", variant: "destructive" });
    }
  };

  const toggleGroup = (groupId: string) => {
    setEnabledGroups((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSyncGroups = async () => {
    if (!instanceId) {
      toast({ title: "Selecione uma instância primeiro", variant: "destructive" });
      return;
    }
    try {
      const result = await syncGroups.mutateAsync(instanceId);
      toast({
        title: "Grupos sincronizados!",
        description: `${result.created} novos, ${result.updated} atualizados`,
      });
    } catch (error: any) {
      toast({ title: error.message || "Erro ao sincronizar", variant: "destructive" });
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "task_created":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "question_asked":
        return <HelpCircle className="h-4 w-4 text-blue-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case "task_created":
        return "Tarefa criada";
      case "question_asked":
        return "Perguntou";
      case "error":
        return "Erro";
      default:
        return "Ignorado";
    }
  };

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600">
            <Bot className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Bot de Tarefas via WhatsApp</h2>
            <p className="text-sm text-muted-foreground">
              Mencione o bot no grupo para criar tarefas automaticamente
            </p>
          </div>
        </div>
        {config && (
          <Button
            variant={config.is_active ? "destructive" : "default"}
            onClick={handleToggle}
            disabled={toggleBot.isPending}
          >
            {config.is_active ? (
              <>
                <PowerOff className="h-4 w-4 mr-2" />
                Desativar
              </>
            ) : (
              <>
                <Power className="h-4 w-4 mr-2" />
                Ativar
              </>
            )}
          </Button>
        )}
      </div>

      {/* Status */}
      {config && (
        <div
          className={cn(
            "flex items-center gap-2 p-3 rounded-lg border",
            config.is_active
              ? "bg-green-50 border-green-200 text-green-700"
              : "bg-gray-50 border-gray-200 text-gray-600"
          )}
        >
          {config.is_active ? (
            <>
              <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="font-medium">Bot ativo</span>
              <span className="text-sm">
                - Monitorando {enabledGroups.length} grupo(s)
              </span>
            </>
          ) : (
            <>
              <div className="h-2 w-2 rounded-full bg-gray-400" />
              <span className="font-medium">Bot inativo</span>
            </>
          )}
        </div>
      )}

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings2 className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="groups" className="gap-2">
            <Users className="h-4 w-4" />
            Grupos ({enabledGroups.length})
          </TabsTrigger>
          <TabsTrigger value="prompt" className="gap-2">
            <Sparkles className="h-4 w-4" />
            Prompt IA
          </TabsTrigger>
          <TabsTrigger value="test" className="gap-2">
            <TestTube className="h-4 w-4" />
            Testar
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <History className="h-4 w-4" />
            Histórico
          </TabsTrigger>
        </TabsList>

        {/* Configuração Geral */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Configurações Gerais</CardTitle>
              <CardDescription>
                Configure como o bot deve funcionar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Bot</Label>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Bot de Tarefas"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instância WhatsApp</Label>
                  <Select value={instanceId} onValueChange={setInstanceId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      {instances?.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          {inst.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>ID de Menção do Bot (mentionedJID)</Label>
                <Input
                  value={botMentionId}
                  onChange={(e) => setBotMentionId(e.target.value)}
                  placeholder="130176734224583"
                />
                <p className="text-xs text-muted-foreground">
                  Este é o ID que aparece quando alguém menciona o bot no grupo.
                  Você pode encontrar esse ID nas mensagens recebidas no campo
                  mentionedJID.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mensagens de Contexto</Label>
                  <Input
                    type="number"
                    value={contextCount}
                    onChange={(e) => setContextCount(parseInt(e.target.value) || 20)}
                    min={5}
                    max={50}
                  />
                  <p className="text-xs text-muted-foreground">
                    Quantas mensagens anteriores enviar para a IA analisar
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Tarefa Padrão</Label>
                  <Select value={defaultTaskType} onValueChange={setDefaultTaskType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Atribuir automaticamente ao remetente</Label>
                    <p className="text-xs text-muted-foreground">
                      Se a tarefa não tiver responsável definido, atribuir a quem
                      mencionou o bot
                    </p>
                  </div>
                  <Switch
                    checked={autoAssign}
                    onCheckedChange={setAutoAssign}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Notificar no grupo ao criar tarefa</Label>
                    <p className="text-xs text-muted-foreground">
                      Enviar mensagem de confirmação quando a tarefa for criada
                    </p>
                  </div>
                  <Switch
                    checked={notifyOnCreation}
                    onCheckedChange={setNotifyOnCreation}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending}>
            {saveConfig.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Configurações
          </Button>
        </TabsContent>

        {/* Grupos */}
        <TabsContent value="groups" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Grupos Habilitados</CardTitle>
                  <CardDescription>
                    Selecione em quais grupos o bot deve responder quando mencionado
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  onClick={handleSyncGroups}
                  disabled={syncGroups.isPending || !instanceId}
                >
                  {syncGroups.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Sincronizar Grupos
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingGroups ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : groups?.length === 0 ? (
                <p className="text-center text-muted-foreground p-4">
                  Nenhum grupo encontrado
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {groups?.map((group) => (
                    <div
                      key={group.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        enabledGroups.includes(group.id)
                          ? "bg-green-50 border-green-200"
                          : "hover:bg-gray-50"
                      )}
                      onClick={() => toggleGroup(group.id)}
                    >
                      <Checkbox
                        checked={enabledGroups.includes(group.id)}
                        onCheckedChange={() => toggleGroup(group.id)}
                      />
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <p className="font-medium">{group.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {group.group_jid}
                        </p>
                      </div>
                      {enabledGroups.includes(group.id) && (
                        <Badge variant="secondary" className="bg-green-100 text-green-700">
                          Ativo
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending} className="mt-4">
            {saveConfig.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Grupos
          </Button>
        </TabsContent>

        {/* Prompt IA */}
        <TabsContent value="prompt" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Prompt da IA</CardTitle>
              <CardDescription>
                Configure as instruções que serão enviadas para a IA processar as
                mensagens
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setAiPrompt(DEFAULT_PROMPT)}
                >
                  Restaurar Padrão
                </Button>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSave} disabled={saveConfig.isPending} className="mt-4">
            {saveConfig.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar Prompt
          </Button>
        </TabsContent>

        {/* Testar */}
        <TabsContent value="test" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Testar o Bot</CardTitle>
              <CardDescription>
                Simule uma menção ao bot para testar o funcionamento
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Grupo</Label>
                <Select value={testGroupId} onValueChange={setTestGroupId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um grupo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {groups?.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mensagem de Teste</Label>
                <Textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  placeholder="@bot cria uma tarefa para ligar pro cliente X amanhã às 14h"
                  rows={3}
                />
              </div>

              <Button
                onClick={handleTest}
                disabled={testBot.isPending || !testMessage || !testGroupId}
              >
                {testBot.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <TestTube className="h-4 w-4 mr-2" />
                )}
                Executar Teste
              </Button>

              {testResult && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium mb-2">Resultado:</h4>
                  <pre className="text-xs overflow-auto max-h-60 bg-white p-3 rounded border">
                    {JSON.stringify(testResult, null, 2)}
                  </pre>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Histórico */}
        <TabsContent value="logs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Histórico de Interações</CardTitle>
              <CardDescription>
                Últimas interações do bot com os grupos
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!logs || logs.length === 0 ? (
                <p className="text-center text-muted-foreground p-4">
                  Nenhuma interação registrada ainda
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Data</TableHead>
                      <TableHead>Grupo</TableHead>
                      <TableHead>Remetente</TableHead>
                      <TableHead>Mensagem</TableHead>
                      <TableHead>Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs">
                          {format(new Date(log.created_at), "dd/MM HH:mm", {
                            locale: ptBR,
                          })}
                        </TableCell>
                        <TableCell>{log.group?.name || "-"}</TableCell>
                        <TableCell>{log.sender_name}</TableCell>
                        <TableCell className="max-w-xs truncate">
                          {log.trigger_content}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {getActionIcon(log.action_taken)}
                            <span className="text-xs">
                              {getActionLabel(log.action_taken)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
