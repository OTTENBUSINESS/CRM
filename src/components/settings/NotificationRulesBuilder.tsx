import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { 
  Bell, Plus, Trash2, ArrowRight, Clock, MessageSquare, Users, 
  Calendar, Zap, Edit2, Copy, ChevronRight, Send, User, Building2, PlayCircle, Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NotificationRule {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_event?: string;
  trigger_minutes?: number;
  trigger_time?: string;
  trigger_days?: string[];
  action_channel: string;
  action_target_type?: string;
  action_target_id?: string;
  action_instance_id?: string;
  message_template: string;
  enabled: boolean;
}

interface WhatsAppInstance {
  id: string;
  name: string;
  status: string;
}

interface WhatsAppGroup {
  id: string;
  name: string;
  group_jid: string;
  instance_id: string;
  instance_name: string;
}

const TRIGGER_TYPES = [
  { value: "on_event", label: "Quando acontecer (instantâneo)", icon: Zap },
  { value: "before_event", label: "Antes do evento", icon: Clock },
  { value: "after_event", label: "Depois do evento", icon: Clock },
  { value: "daily_schedule", label: "Horário fixo diário", icon: Calendar },
];

const TRIGGER_EVENTS = [
  // Tarefas
  { value: "task_created", label: "Tarefa criada", category: "tarefas" },
  { value: "task_due", label: "Tarefa com prazo", category: "tarefas" },
  { value: "task_completed", label: "Tarefa concluída", category: "tarefas" },
  // Reuniões
  { value: "meeting_scheduled", label: "Reunião agendada", category: "reunioes" },
  { value: "meeting_rescheduled", label: "Reunião reagendada", category: "reunioes" },
  { value: "meeting_confirmed", label: "Reunião confirmada", category: "reunioes" },
  // Onboarding
  { value: "onboarding_scheduled", label: "Onboarding agendado", category: "onboarding" },
  { value: "onboarding_completed", label: "Onboarding concluído", category: "onboarding" },
  // Comercial - Deals
  { value: "deal_created", label: "Deal criado", category: "comercial" },
  { value: "deal_won", label: "Deal ganho (fechado)", category: "comercial" },
  { value: "deal_lost", label: "Deal perdido", category: "comercial" },
  { value: "deal_proposal_sent", label: "Proposta enviada", category: "comercial" },
  { value: "deal_stage_changed", label: "Deal mudou de etapa", category: "comercial" },
  // Comercial - Leads
  { value: "lead_created", label: "Lead criado", category: "comercial" },
  { value: "lead_qualified", label: "Lead qualificado", category: "comercial" },
  { value: "lead_hot", label: "Lead quente detectado", category: "comercial" },
];

const ACTION_CHANNELS = [
  { value: "whatsapp_group", label: "WhatsApp Grupo", icon: Users },
  { value: "whatsapp_client", label: "WhatsApp Cliente", icon: User },
  { value: "whatsapp_user", label: "WhatsApp Responsável", icon: User },
];

const TIME_OPTIONS = [
  { value: 5, label: "5 minutos" },
  { value: 10, label: "10 minutos" },
  { value: 15, label: "15 minutos" },
  { value: 30, label: "30 minutos" },
  { value: 60, label: "1 hora" },
  { value: 120, label: "2 horas" },
  { value: 1440, label: "1 dia" },
];

const TEMPLATE_VARIABLES = [
  // Gerais
  { var: "{{data}}", desc: "Data do evento", category: "geral" },
  { var: "{{hora}}", desc: "Horário do evento", category: "geral" },
  { var: "{{responsavel}}", desc: "Nome do responsável", category: "geral" },
  // Tarefas
  { var: "{{tarefa}}", desc: "Nome da tarefa", category: "tarefas" },
  { var: "{{tipo}}", desc: "Tipo da tarefa (Ligação, Reunião...)", category: "tarefas" },
  { var: "{{prioridade}}", desc: "Prioridade (Alta, Média, Baixa)", category: "tarefas" },
  { var: "{{notas}}", desc: "Notas/observações da tarefa", category: "tarefas" },
  { var: "{{link_meet}}", desc: "Link da reunião", category: "tarefas" },
  { var: "{{lista_tarefas}}", desc: "Lista de tarefas (resumo diário)", category: "tarefas" },
  // Lead/Cliente
  { var: "{{cliente}}", desc: "Nome do lead/cliente", category: "lead" },
  { var: "{{cliente_telefone}}", desc: "Telefone do lead", category: "lead" },
  { var: "{{cliente_email}}", desc: "Email do lead", category: "lead" },
  { var: "{{cliente_empresa}}", desc: "Empresa do lead", category: "lead" },
  { var: "{{lead_origem}}", desc: "Origem do lead (UTM source)", category: "lead" },
  { var: "{{lead_score}}", desc: "Score do lead", category: "lead" },
  { var: "{{lead_campanha}}", desc: "Campanha do lead (UTM campaign)", category: "lead" },
  { var: "{{lead_conteudo}}", desc: "Conteúdo/tipo do lead (UTM content)", category: "lead" },
  { var: "{{lead_context}}", desc: "Contexto/conversa do lead", category: "lead" },
  // Deals
  { var: "{{deal_titulo}}", desc: "Título do deal", category: "deal" },
  { var: "{{deal_produto}}", desc: "Produto do deal", category: "deal" },
  { var: "{{deal_valor}}", desc: "Valor negociado (R$)", category: "deal" },
  { var: "{{deal_valor_original}}", desc: "Valor original (R$)", category: "deal" },
  { var: "{{deal_desconto}}", desc: "Desconto aplicado (%)", category: "deal" },
  { var: "{{deal_pagamento}}", desc: "Forma de pagamento", category: "deal" },
  { var: "{{deal_parcelas}}", desc: "Número de parcelas", category: "deal" },
  { var: "{{deal_etapa}}", desc: "Etapa atual do pipeline", category: "deal" },
  { var: "{{deal_previsao}}", desc: "Data prevista de fechamento", category: "deal" },
  { var: "{{deal_observacao}}", desc: "Observações do deal", category: "deal" },
  { var: "{{deal_motivo_perda}}", desc: "Motivo da perda (se perdido)", category: "deal" },
  { var: "{{deal_vendedor}}", desc: "Nome do vendedor", category: "deal" },
  { var: "{{deal_probabilidade}}", desc: "Probabilidade de ganho (IA)", category: "deal" },
  { var: "{{deal_utm_source}}", desc: "UTM Source do deal", category: "deal" },
  { var: "{{deal_utm_campaign}}", desc: "UTM Campaign do deal", category: "deal" },
];

export function NotificationRulesBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);
  const [formData, setFormData] = useState<Partial<NotificationRule>>({
    name: "",
    trigger_type: "before_event",
    trigger_event: "onboarding_scheduled",
    trigger_minutes: 60,
    action_channel: "whatsapp_group",
    message_template: "",
    enabled: true,
  });

  // Buscar regras
  const { data: rules, isLoading } = useQuery({
    queryKey: ["notification-rules"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("notification_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as NotificationRule[];
    },
  });

  // Buscar instâncias WhatsApp
  const { data: instances } = useQuery({
    queryKey: ["whatsapp-instances"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_instances")
        .select("id, name, status")
        .order("name");
      if (error) throw error;
      return data as WhatsAppInstance[];
    },
  });

  // Buscar grupos WhatsApp
  const { data: groups } = useQuery({
    queryKey: ["whatsapp-groups"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("whatsapp_groups")
        .select("id, name, group_jid, instance_id, instance:whatsapp_instances(name)")
        .order("name");
      if (error) throw error;
      return (data || []).map((g: any) => ({
        ...g,
        instance_name: g.instance?.name || '',
      })) as WhatsAppGroup[];
    },
  });

  // Criar/Atualizar regra
  const saveMutation = useMutation({
    mutationFn: async (rule: Partial<NotificationRule>) => {
      if (editingRule) {
        const { error } = await (supabase as any)
          .from("notification_rules")
          .update(rule)
          .eq("id", editingRule.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("notification_rules")
          .insert(rule);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      toast({ title: editingRule ? "Regra atualizada!" : "Regra criada!" });
      handleCloseModal();
    },
    onError: (error: any) => {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    },
  });

  // Deletar regra
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("notification_rules")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
      toast({ title: "Regra removida!" });
    },
  });

  // Toggle enabled
  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await (supabase as any)
        .from("notification_rules")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-rules"] });
    },
  });

  // Testar envio
  const [isTesting, setIsTesting] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const handleTestSend = async () => {
    if (!formData.action_channel || !formData.message_template) {
      toast({ title: "Preencha o canal e a mensagem primeiro", variant: "destructive" });
      return;
    }

    if (formData.action_channel === "whatsapp_group" && (!formData.action_instance_id || !formData.action_target_id)) {
      toast({ title: "Selecione a instância e o grupo", variant: "destructive" });
      return;
    }

    if (formData.action_channel === "whatsapp_user" && !formData.action_instance_id) {
      toast({ title: "Selecione a instância WhatsApp", variant: "destructive" });
      return;
    }

    if ((formData.action_channel === "whatsapp_user" || formData.action_channel === "whatsapp_client") && !testPhone) {
      toast({ title: "Digite um número de telefone para teste", variant: "destructive" });
      return;
    }

    setIsTesting(true);
    try {
      // Buscar instância
      const instance = instances?.find((i) => i.id === formData.action_instance_id);
      if (!instance) throw new Error("Instância não encontrada");

      // Buscar dados da instância para API
      const { data: instanceData } = await (supabase as any)
        .from("whatsapp_instances")
        .select("name, api_key, api_url")
        .eq("id", formData.action_instance_id)
        .single();

      if (!instanceData?.api_key) throw new Error("API key não configurada");
      if (!instanceData?.api_url) throw new Error("URL da API não configurada");

      // Mensagem de teste com variáveis substituídas
      const testMessage = formData.message_template
        .replace(/\{\{tarefa\}\}/g, "Tarefa de Exemplo")
        .replace(/\{\{cliente\}\}/g, "Cliente Teste")
        .replace(/\{\{data\}\}/g, new Date().toLocaleDateString("pt-BR"))
        .replace(/\{\{hora\}\}/g, new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }))
        .replace(/\{\{responsavel\}\}/g, "Responsável Teste")
        .replace(/\{\{tipo\}\}/g, "Reunião")
        .replace(/\{\{prioridade\}\}/g, "🟡 Média")
        .replace(/\{\{notas\}\}/g, "Essas são as notas de exemplo da tarefa")
        .replace(/\{\{link_meet\}\}/g, "https://meet.google.com/xxx-xxxx-xxx")
        .replace(/\{\{lista_tarefas\}\}/g, "• 10:00 - Cliente A (Onboarding)\n• 14:00 - Cliente B (Follow-up)");

      // Determinar número de destino
      let targetNumber = formData.action_target_id || "";
      if (formData.action_channel === "whatsapp_user" || formData.action_channel === "whatsapp_client") {
        // Formatar número de telefone
        targetNumber = testPhone.replace(/\D/g, "");
        if (!targetNumber.startsWith("55") && targetNumber.length <= 11) {
          targetNumber = "55" + targetNumber;
        }
      }

      // Enviar via UAZAPI - formato correto
      const apiUrl = `${instanceData.api_url}/send/text`;
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "token": instanceData.api_key,
        },
        body: JSON.stringify({
          number: targetNumber,
          text: `🧪 *TESTE DE AUTOMAÇÃO*\n\n${testMessage}`,
        }),
      });

      const result = await response.json();
      
      if (response.ok) {
        toast({ title: "✅ Mensagem de teste enviada!", description: "Verifique o grupo no WhatsApp" });
      } else {
        throw new Error(result.message || "Erro ao enviar");
      }
    } catch (error: any) {
      toast({ title: "Erro ao enviar teste", description: error.message, variant: "destructive" });
    } finally {
      setIsTesting(false);
    }
  };

  const handleOpenModal = (rule?: NotificationRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormData(rule);
    } else {
      setEditingRule(null);
      setFormData({
        name: "",
        trigger_type: "before_event",
        trigger_event: "onboarding_scheduled",
        trigger_minutes: 60,
        action_channel: "whatsapp_group",
        message_template: "",
        enabled: true,
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRule(null);
  };

  const handleSave = () => {
    if (!formData.name || !formData.message_template) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    saveMutation.mutate(formData);
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      message_template: (prev.message_template || "") + variable,
    }));
  };

  const getTriggerLabel = (rule: NotificationRule) => {
    const type = TRIGGER_TYPES.find(t => t.value === rule.trigger_type);
    const event = TRIGGER_EVENTS.find(e => e.value === rule.trigger_event);

    const eventLabels: Record<string, string> = {
      task_created: "Tarefa criada",
      task_completed: "Tarefa concluída",
      task_due: "Tarefa com prazo",
      onboarding_scheduled: "Onboarding agendado",
      onboarding_completed: "Onboarding concluído",
    };

    if (rule.trigger_type === "on_event") {
      return `Quando: ${eventLabels[rule.trigger_event || ''] || rule.trigger_event}`;
    }
    if (rule.trigger_type === "before_event" || rule.trigger_type === "after_event") {
      const time = TIME_OPTIONS.find(t => t.value === rule.trigger_minutes);
      return `${time?.label || rule.trigger_minutes + "min"} ${rule.trigger_type === "before_event" ? "antes" : "depois"} de ${event?.label || rule.trigger_event}`;
    }
    if (rule.trigger_type === "daily_schedule") {
      return `Todo dia às ${rule.trigger_time}`;
    }
    return type?.label || rule.trigger_type;
  };

  const getChannelLabel = (channel: string) => {
    return ACTION_CHANNELS.find(c => c.value === channel)?.label || channel;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/10">
            <Zap className="h-5 w-5 text-purple-500" />
          </div>
          <div>
            <CardTitle>Automações de Notificação</CardTitle>
            <p className="text-sm text-muted-foreground">Configure quando e como enviar lembretes</p>
          </div>
        </div>
        <Button onClick={() => handleOpenModal()} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova Automação
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Carregando...</div>
        ) : rules && rules.length > 0 ? (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div
                key={rule.id}
                className={cn(
                  "p-4 rounded-lg border transition-all",
                  rule.enabled ? "bg-card" : "bg-muted/50 opacity-60"
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <Bell className={cn("h-4 w-4", rule.enabled ? "text-purple-500" : "text-muted-foreground")} />
                      <span className="font-medium">{rule.name}</span>
                      {!rule.enabled && <Badge variant="secondary">Desativado</Badge>}
                    </div>
                    
                    {/* Visual Flow */}
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="outline" className="gap-1">
                        <Clock className="h-3 w-3" />
                        {getTriggerLabel(rule)}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline" className="gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {getChannelLabel(rule.action_channel)}
                      </Badge>
                    </div>
                    
                    <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded font-mono">
                      {rule.message_template.substring(0, 100)}
                      {rule.message_template.length > 100 && "..."}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={(enabled) => toggleMutation.mutate({ id: rule.id, enabled })}
                    />
                    <Button variant="ghost" size="icon" onClick={() => handleOpenModal(rule)}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Zap className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhuma automação configurada</p>
            <p className="text-sm">Crie sua primeira regra de notificação</p>
          </div>
        )}
      </CardContent>

      {/* Modal de Criação/Edição */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-500" />
              {editingRule ? "Editar Automação" : "Nova Automação"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Nome */}
            <div className="space-y-2">
              <Label>Nome da Automação</Label>
              <Input
                placeholder="Ex: Lembrete de Onboarding"
                value={formData.name || ""}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* QUANDO - Trigger */}
            <div className="space-y-4 p-4 rounded-lg border bg-blue-50/50 dark:bg-blue-950/20">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-medium">
                <Clock className="h-4 w-4" />
                QUANDO
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo de Gatilho</Label>
                  <Select
                    value={formData.trigger_type}
                    onValueChange={(v) => setFormData({ ...formData, trigger_type: v })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Evento instantâneo (on_event) */}
                {formData.trigger_type === "on_event" && (
                  <div className="space-y-2">
                    <Label>Evento</Label>
                    <Select
                      value={formData.trigger_event}
                      onValueChange={(v) => setFormData({ ...formData, trigger_event: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Tarefas</div>
                        <SelectItem value="task_created">Tarefa criada</SelectItem>
                        <SelectItem value="task_completed">Tarefa concluída</SelectItem>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Onboarding</div>
                        <SelectItem value="onboarding_completed">Onboarding concluído</SelectItem>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Comercial - Deals</div>
                        <SelectItem value="deal_created">Deal criado</SelectItem>
                        <SelectItem value="deal_won">Deal ganho (fechado)</SelectItem>
                        <SelectItem value="deal_lost">Deal perdido</SelectItem>
                        <SelectItem value="deal_proposal_sent">Proposta enviada</SelectItem>
                        <SelectItem value="deal_stage_changed">Deal mudou de etapa</SelectItem>
                        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Comercial - Leads</div>
                        <SelectItem value="lead_created">Lead criado</SelectItem>
                        <SelectItem value="lead_qualified">Lead qualificado</SelectItem>
                        <SelectItem value="lead_hot">Lead quente detectado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Antes/Depois do evento */}
                {(formData.trigger_type === "before_event" || formData.trigger_type === "after_event") && (
                  <>
                    <div className="space-y-2">
                      <Label>Evento</Label>
                      <Select
                        value={formData.trigger_event}
                        onValueChange={(v) => setFormData({ ...formData, trigger_event: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Tarefas</div>
                          <SelectItem value="task_due">Tarefa com prazo</SelectItem>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Onboarding</div>
                          <SelectItem value="onboarding_scheduled">Onboarding agendado</SelectItem>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1 pt-2">Comercial</div>
                          <SelectItem value="deal_expected_close">Deal previsão de fechamento</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label>Tempo</Label>
                      <Select
                        value={formData.trigger_minutes?.toString()}
                        onValueChange={(v) => setFormData({ ...formData, trigger_minutes: parseInt(v) })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TIME_OPTIONS.map((t) => (
                            <SelectItem key={t.value} value={t.value.toString()}>
                              {t.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </>
                )}

                {formData.trigger_type === "daily_schedule" && (
                  <div className="space-y-2">
                    <Label>Horário</Label>
                    <Input
                      type="time"
                      value={formData.trigger_time || "08:00"}
                      onChange={(e) => setFormData({ ...formData, trigger_time: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* ENTÃO - Action */}
            <div className="space-y-4 p-4 rounded-lg border bg-green-50/50 dark:bg-green-950/20">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
                <Send className="h-4 w-4" />
                ENTÃO ENVIAR PARA
              </div>
              
              <div className="space-y-2">
                <Label>Canal</Label>
                <Select
                  value={formData.action_channel}
                  onValueChange={(v) => setFormData({ ...formData, action_channel: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_CHANNELS.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div className="flex items-center gap-2">
                          <c.icon className="h-4 w-4" />
                          {c.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Instância para Grupo ou Usuário */}
              {(formData.action_channel === "whatsapp_group" || formData.action_channel === "whatsapp_user") && (
                <div className="space-y-2">
                  <Label>Instância WhatsApp</Label>
                  <Select
                    value={formData.action_instance_id || ""}
                    onValueChange={(v) => setFormData({ ...formData, action_instance_id: v, action_target_id: "" })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a instância..." />
                    </SelectTrigger>
                    <SelectContent>
                      {instances?.map((inst) => (
                        <SelectItem key={inst.id} value={inst.id}>
                          <div className="flex items-center gap-2">
                            <span className={cn(
                              "w-2 h-2 rounded-full",
                              inst.status === "connected" ? "bg-green-500" : "bg-red-500"
                            )} />
                            {inst.name}
                            {inst.status !== "connected" && (
                              <span className="text-xs text-muted-foreground">(desconectado)</span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Info para WhatsApp Usuário */}
              {formData.action_channel === "whatsapp_user" && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
                  <p className="text-sm text-blue-700 dark:text-blue-300">
                    <strong>WhatsApp Responsável:</strong> A mensagem será enviada automaticamente para o telefone cadastrado no responsável de cada tarefa.
                  </p>
                </div>
              )}

              {/* Grupo para WhatsApp Grupo */}
              {formData.action_channel === "whatsapp_group" && (
                <>
                  <div className="space-y-2">
                    <Label>Grupo</Label>
                    <Select
                      value={formData.action_target_id || ""}
                      onValueChange={(v) => setFormData({ ...formData, action_target_id: v })}
                      disabled={!formData.action_instance_id}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={formData.action_instance_id ? "Selecione o grupo..." : "Selecione uma instância primeiro"} />
                      </SelectTrigger>
                      <SelectContent>
                        {groups
                          ?.filter((g) => g.instance_id === formData.action_instance_id)
                          .map((group) => (
                            <SelectItem key={group.id} value={group.group_jid}>
                              {group.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {formData.action_instance_id && groups?.filter((g) => g.instance_id === formData.action_instance_id).length === 0 && (
                      <p className="text-xs text-amber-600">Nenhum grupo encontrado para esta instância</p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Mensagem */}
            <div className="space-y-4 p-4 rounded-lg border bg-purple-50/50 dark:bg-purple-950/20">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 font-medium">
                <MessageSquare className="h-4 w-4" />
                MENSAGEM
              </div>
              
              <div className="space-y-2">
                <Label>Template da Mensagem</Label>
                <Textarea
                  placeholder="Digite a mensagem..."
                  className="min-h-[120px] font-mono text-sm"
                  value={formData.message_template || ""}
                  onChange={(e) => setFormData({ ...formData, message_template: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Variáveis disponíveis (clique para inserir)</Label>
                <div className="flex flex-wrap gap-1">
                  {TEMPLATE_VARIABLES.map((v) => (
                    <Button
                      key={v.var}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-xs h-7"
                      onClick={() => insertVariable(v.var)}
                    >
                      {v.var}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row justify-between gap-3 sm:justify-between">
            <div className="flex items-center gap-2">
              {(formData.action_channel === "whatsapp_user" || formData.action_channel === "whatsapp_client") && (
                <Input
                  placeholder="Tel. teste (ex: 11999999999)"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="w-44"
                />
              )}
              <Button
                type="button"
                variant="outline"
                onClick={handleTestSend}
                disabled={isTesting || !formData.message_template}
                className="gap-2"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlayCircle className="h-4 w-4" />
                )}
                Testar
              </Button>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleCloseModal}>
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Salvando..." : editingRule ? "Salvar Alterações" : "Criar Automação"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
