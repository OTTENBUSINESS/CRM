import { useState } from 'react';
import { Bot, Pause, Play, History, AlertCircle, Power, Zap, RotateCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import {
  useAIAgentStatusForLead,
  useAIAgentConversation,
  useAIAgentLogs,
  useToggleAIAgentConversation,
  useTestAIAgent,
  useAIAgents,
} from '@/hooks/useAISalesAgent';
import { supabase } from '@/lib/supabase';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface AIAgentBadgeProps {
  leadId: string;
  showControls?: boolean;
  className?: string;
}

export function AIAgentBadge({ leadId, showControls = true, className }: AIAgentBadgeProps) {
  const queryClient = useQueryClient();
  const { data: status, isLoading, refetch: refetchStatus } = useAIAgentStatusForLead(leadId);
  const { data: agents } = useAIAgents();
  const toggleConversation = useToggleAIAgentConversation();
  const testAgent = useTestAIAgent();
  const [testMessage, setTestMessage] = useState('');
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);

  // Mutation para criar conversa do agente E processar imediatamente
  const activateAgent = useMutation({
    mutationFn: async (selectedAgentId?: string) => {
      // Se um agente específico foi selecionado, usar ele; senão pegar o primeiro
      const activeAgent = selectedAgentId
        ? agents?.find(a => a.id === selectedAgentId)
        : agents?.find(a => a.is_active);
      if (!activeAgent) {
        throw new Error('Nenhum agente ativo configurado');
      }

      // Pausar qualquer conversa ativa de OUTRO agente neste lead
      await supabase
        .from('ai_agent_conversations')
        .update({ status: 'paused_by_human', paused_by: null, pause_reason: 'Trocado para outro agente' })
        .eq('lead_id', leadId)
        .neq('agent_id', activeAgent.id)
        .eq('status', 'active');

      // Criar ou reativar conversa
      const { data: existing } = await supabase
        .from('ai_agent_conversations')
        .select('id, status')
        .eq('lead_id', leadId)
        .eq('agent_id', activeAgent.id)
        .maybeSingle();

      if (existing) {
        // Reativar conversa existente
        await supabase
          .from('ai_agent_conversations')
          .update({ status: 'active', paused_by: null, paused_at: null, pause_reason: null })
          .eq('id', existing.id);
      } else {
        // Criar nova conversa
        const { error } = await supabase
          .from('ai_agent_conversations')
          .insert({
            lead_id: leadId,
            agent_id: activeAgent.id,
            status: 'active',
            messages_history: [],
          });
        if (error) throw error;
      }

      // Reativar cadence enrollment se existir pausado/cancelado (para enviar primeira mensagem)
      const { data: reactivated } = await supabase
        .from('ai_agent_cadence_enrollments')
        .update({ status: 'active', next_action_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('lead_id', leadId)
        .eq('agent_id', activeAgent.id)
        .in('status', ['paused', 'cancelled'])
        .select('id');

      // Se não reativou nenhum, verificar se precisa CRIAR enrollment
      if (!reactivated || reactivated.length === 0) {
        const { data: existingEnroll } = await supabase
          .from('ai_agent_cadence_enrollments')
          .select('id')
          .eq('lead_id', leadId)
          .eq('agent_id', activeAgent.id)
          .in('status', ['active', 'replied'])
          .maybeSingle();

        if (!existingEnroll) {
          // Buscar estágio do lead
          const { data: leadData } = await supabase
            .from('leads')
            .select('pipeline_stage_id')
            .eq('id', leadId)
            .single();

          // Checar se lead tem deal ativo — usar stage do deal
          const { data: activeDeal } = await supabase
            .from('deals')
            .select('pipeline_stage:sales_pipeline_stages(name)')
            .eq('lead_id', leadId)
            .in('status', ['open', 'negotiation'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let stageName = 'Novo';
          let hadActiveDeal = false;

          if (activeDeal?.pipeline_stage?.name) {
            stageName = activeDeal.pipeline_stage.name;
            hadActiveDeal = true;
          } else if (leadData?.pipeline_stage_id) {
            const { data: stageData } = await supabase
              .from('sales_pipeline_stages')
              .select('name')
              .eq('id', leadData.pipeline_stage_id)
              .single();
            stageName = stageData?.name || 'Novo';
          }

          // Criar enrollment na cadência
          await supabase
            .from('ai_agent_cadence_enrollments')
            .insert({
              lead_id: leadId,
              agent_id: activeAgent.id,
              stage: stageName,
              current_step: 0,
              status: 'active',
              next_action_at: new Date().toISOString(),
            });

          if (hadActiveDeal) {
            toast.info(`Lead tem deal ativo — cadência ajustada para etapa "${stageName}"`);
          }
        }
      }

      // Buscar última mensagem INBOUND do lead (não respondida)
      const { data: lastInbound } = await supabase
        .from('whatsapp_messages')
        .select('id, content, sent_at')
        .eq('lead_id', leadId)
        .eq('is_from_me', false)
        .is('group_id', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastInbound?.content) {
        // Chamar edge function para processar imediatamente
        // O agente vai ver TODO o histórico e responder à última msg do lead
        const { data: fnResult, error: fnError } = await supabase.functions.invoke('ai-sales-agent', {
          body: {
            action: 'process_direct',
            lead_id: leadId,
            message_content: lastInbound.content,
          },
        });

        if (fnError) {
          console.error('Erro ao processar mensagem inicial:', fnError);
        }

        return { conversation: existing || true, processed: true, response: fnResult };
      }

      return { conversation: existing || true, processed: false };
    },
    onSuccess: (result) => {
      const msg = result?.processed
        ? 'Agente ativado e respondendo!'
        : 'Agente ativado para este lead!';
      toast.success(msg);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['ai-agent-conversation', leadId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao ativar agente');
    },
  });

  // Forçar disparo: reprocessa msg pendente OU força cadência a enviar primeira msg
  const reprocessAgent = useMutation({
    mutationFn: async () => {
      // Buscar última msg do agente
      const { data: lastAgentMsg } = await supabase
        .from('whatsapp_messages')
        .select('sent_at')
        .eq('lead_id', leadId)
        .eq('is_from_me', true)
        .is('group_id', null)
        .order('sent_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Buscar msgs do lead depois da última do agente
      let query = supabase
        .from('whatsapp_messages')
        .select('content, sent_at')
        .eq('lead_id', leadId)
        .eq('is_from_me', false)
        .is('group_id', null)
        .order('sent_at', { ascending: true });

      if (lastAgentMsg?.sent_at) {
        query = query.gt('sent_at', lastAgentMsg.sent_at);
      }

      const { data: pendingMsgs } = await query;

      // Liberar lock se existir
      await supabase.rpc('release_agent_lock', { p_lead_id: leadId });

      if (pendingMsgs && pendingMsgs.length > 0) {
        // Caso 1: Tem msg do lead sem resposta → reprocessar
        const combinedContent = pendingMsgs
          .map(m => m.content)
          .filter(c => c)
          .join('\n');

        const { data, error } = await supabase.functions.invoke('ai-sales-agent', {
          body: {
            action: 'process_direct',
            lead_id: leadId,
            message_content: combinedContent,
          },
        });
        if (error) throw error;
        return { type: 'reprocess', data };
      } else {
        // Caso 2: Sem msgs pendentes → forçar cadência (enviar primeira msg)
        // Buscar qualquer enrollment (incluindo cancelled) para reativar
        const { data: enrollment } = await supabase
          .from('ai_agent_cadence_enrollments')
          .select('id, agent_id, status')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (enrollment) {
          // Reativar enrollment (mesmo se cancelled/completed)
          await supabase
            .from('ai_agent_cadence_enrollments')
            .update({
              next_action_at: new Date().toISOString(),
              status: 'active',
              current_step: 0,
              enrolled_at: new Date().toISOString(),
              last_step_at: null,
              completed_at: null,
            })
            .eq('id', enrollment.id);
        } else {
          // Criar enrollment se realmente não existe nenhum
          const activeAgent = agents?.find(a => a.is_active);
          if (!activeAgent) throw new Error('Nenhum agente ativo');

          const { data: leadData } = await supabase
            .from('leads')
            .select('pipeline_stage_id')
            .eq('id', leadId)
            .single();

          // Checar se lead tem deal ativo — usar stage do deal
          const { data: activeDealReprocess } = await supabase
            .from('deals')
            .select('pipeline_stage:sales_pipeline_stages(name)')
            .eq('lead_id', leadId)
            .in('status', ['open', 'negotiation'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          let reprocessStage = 'Novo';
          if (activeDealReprocess?.pipeline_stage?.name) {
            reprocessStage = activeDealReprocess.pipeline_stage.name;
          } else {
            const { data: stageData } = await supabase
              .from('sales_pipeline_stages')
              .select('name')
              .eq('id', leadData?.pipeline_stage_id || '')
              .single();
            reprocessStage = stageData?.name || 'Novo';
          }

          await supabase
            .from('ai_agent_cadence_enrollments')
            .insert({
              lead_id: leadId,
              agent_id: activeAgent.id,
              stage: reprocessStage,
              current_step: 0,
              status: 'active',
              next_action_at: new Date().toISOString(),
            });
        }

        // Disparar cadência imediatamente
        const { data, error } = await supabase.functions.invoke('ai-sales-agent', {
          body: { action: 'process_cadence' },
        });
        if (error) throw error;
        return { type: 'cadence', data };
      }
    },
    onSuccess: (result) => {
      const msg = result?.type === 'reprocess'
        ? 'Mensagem reprocessada! Agente respondendo...'
        : 'Cadência disparada! Primeira mensagem sendo enviada...';
      toast.success(msg);
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ['ai-agent-conversation', leadId] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
    },
    onError: (error: any) => {
      toast.error(error.message || 'Erro ao disparar agente');
    },
  });

  const handleToggle = async () => {
    try {
      await toggleConversation.mutateAsync({
        leadId,
        pause: !status?.is_paused,
        reason: status?.is_paused ? 'Retomado manualmente' : 'Pausado manualmente',
      });
      toast.success(status?.is_paused ? 'Agente retomado!' : 'Agente pausado!');
    } catch (error) {
      toast.error('Erro ao alterar status do agente');
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) {
      toast.error('Digite uma mensagem para testar');
      return;
    }

    try {
      const result = await testAgent.mutateAsync({
        leadId,
        message: testMessage,
      });

      if (result.success) {
        toast.success('Resposta enviada!');
        setTestMessage('');
        setIsTestDialogOpen(false);
        refetchStatus();
      } else {
        toast.error(result.error || 'Erro ao processar');
      }
    } catch (error: any) {
      toast.error(error.message || 'Erro ao testar agente');
    }
  };

  // Se não tem conversa ativa com agente, mostra botão para ativar
  if (!isLoading && !status?.has_agent) {
    const hasActiveAgent = agents && agents.length > 0 && agents.some(a => a.is_active);
    const isLoadingAgents = !agents;

    return (
      <Popover>
        <PopoverTrigger className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:bg-muted ${className}`}>
          <Bot className="h-3 w-3" />
          <span className="h-2 w-2 rounded-full bg-gray-400" />
          Inativo
        </PopoverTrigger>
        <PopoverContent className="w-72 z-[100]" align="end">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="font-medium">Agente IA</span>
            </div>

            {isLoadingAgents ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : !hasActiveAgent ? (
              <p className="text-sm text-muted-foreground">
                Nenhum agente configurado. Configure em /comercial/configuracoes?tab=ai-agent
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Escolha um agente para ativar neste lead:
                </p>

                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {agents?.filter(a => a.is_active && a.name?.trim()).map(agent => (
                    <Button
                      key={agent.id}
                      variant="outline"
                      size="sm"
                      className="w-full justify-start text-left h-auto py-2"
                      onClick={() => activateAgent.mutate(agent.id)}
                      disabled={activateAgent.isPending}
                    >
                      <Bot className="h-3.5 w-3.5 mr-2 shrink-0" />
                      <span className="truncate">{agent.name}</span>
                    </Button>
                  ))}
                </div>

                {activateAgent.isPending && (
                  <p className="text-xs text-muted-foreground text-center">Ativando agente...</p>
                )}
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  if (isLoading) {
    return (
      <Badge variant="outline" className={`gap-1 ${className}`}>
        <Bot className="h-3 w-3 animate-pulse" />
        ...
      </Badge>
    );
  }

  const getStatusColor = () => {
    if (status?.conversation_status === 'transferred') return 'bg-yellow-500';
    if (status?.is_paused) return 'bg-orange-500';
    return 'bg-green-500';
  };

  const getStatusText = () => {
    if (status?.conversation_status === 'transferred') return 'Transferido';
    if (status?.is_paused) return 'Pausado';
    return 'Ativo';
  };

  if (!showControls) {
    return (
      <Badge variant="outline" className={`gap-1 ${className}`}>
        <Bot className="h-3 w-3" />
        <span className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
        {status?.agent_name?.split(' - ')[0] || 'Agente IA'}
      </Badge>
    );
  }

  return (
    <Popover>
      <PopoverTrigger className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold cursor-pointer hover:bg-muted ${className}`}>
        <Bot className="h-3 w-3" />
        <span className={`h-2 w-2 rounded-full ${getStatusColor()}`} />
        {getStatusText()}
      </PopoverTrigger>
      <PopoverContent className="w-80 z-[100]" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <span className="font-medium">{status?.agent_name || 'Agente IA'}</span>
            </div>
            <Badge variant={status?.is_paused ? 'secondary' : 'default'}>
              {getStatusText()}
            </Badge>
          </div>

          <Separator />

          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mensagens enviadas:</span>
              <span>{status?.messages_sent || 0}</span>
            </div>
            {status?.last_processed_at && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Ultima acao:</span>
                <span>
                  {formatDistanceToNow(new Date(status.last_processed_at), {
                    addSuffix: true,
                    locale: ptBR,
                  })}
                </span>
              </div>
            )}
            {status?.is_paused && status?.paused_by_name && (
              <div className="flex justify-between text-orange-600">
                <span>Pausado por:</span>
                <span>{status.paused_by_name}</span>
              </div>
            )}
            {status?.is_paused && status?.pause_reason && (
              <div className="text-orange-600 text-xs bg-orange-50 p-2 rounded mt-1">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                {status.pause_reason}
              </div>
            )}
          </div>

          <Separator />

          {/* Botoes de controle */}
          <div className="flex gap-2">
            <Button
              variant={status?.is_paused ? 'default' : 'secondary'}
              size="sm"
              className="flex-1"
              onClick={handleToggle}
              disabled={toggleConversation.isPending}
            >
              {status?.is_paused ? (
                <>
                  <Play className="h-4 w-4 mr-1" />
                  Retomar
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4 mr-1" />
                  Pausar
                </>
              )}
            </Button>

            <AIAgentLogsDialog leadId={leadId} />
          </div>

          {/* Botão Disparar/Reprocessar - força envio */}
          {!status?.is_paused && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
              onClick={() => reprocessAgent.mutate()}
              disabled={reprocessAgent.isPending}
            >
              <RotateCw className={`h-4 w-4 mr-1 ${reprocessAgent.isPending ? 'animate-spin' : ''}`} />
              {reprocessAgent.isPending ? 'Disparando...' : 'Disparar agente'}
            </Button>
          )}

          {/* Trocar agente */}
          {agents && agents.filter(a => a.is_active && a.name?.trim()).length > 1 && (
            <>
              <Separator />
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground font-medium">Trocar agente:</span>
                {agents.filter(a => a.is_active && a.name?.trim() && a.name !== status?.agent_name).map(agent => (
                  <Button
                    key={agent.id}
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-left h-auto py-1.5 text-xs"
                    onClick={() => activateAgent.mutate(agent.id)}
                    disabled={activateAgent.isPending}
                  >
                    <Bot className="h-3 w-3 mr-1.5 shrink-0" />
                    <span className="truncate">{agent.name}</span>
                  </Button>
                ))}
              </div>
            </>
          )}

          <Separator />

          {/* Testar agente */}
          <Dialog open={isTestDialogOpen} onOpenChange={setIsTestDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-full">
                <Zap className="h-4 w-4 mr-2" />
                Testar Resposta
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Testar Agente IA</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Simular mensagem do cliente:</Label>
                  <Input
                    value={testMessage}
                    onChange={(e) => setTestMessage(e.target.value)}
                    placeholder="Ex: Oi, quero saber mais sobre o produto"
                    onKeyDown={(e) => e.key === 'Enter' && handleTest()}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  O agente vai processar esta mensagem e enviar a resposta via WhatsApp para o lead.
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setIsTestDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancelar
                  </Button>
                  <Button
                    onClick={handleTest}
                    disabled={testAgent.isPending || !testMessage.trim()}
                    className="flex-1"
                  >
                    {testAgent.isPending ? 'Processando...' : 'Enviar'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ==================== LOGS DIALOG ====================

function AIAgentLogsDialog({ leadId }: { leadId: string }) {
  const [open, setOpen] = useState(false);
  const { data: conversation } = useAIAgentConversation(leadId);
  const { data: logs } = useAIAgentLogs(conversation?.id || null);

  const getLogIcon = (type: string) => {
    switch (type) {
      case 'message_received':
        return '📨';
      case 'message_sent':
        return '📤';
      case 'tool_called':
        return '🔧';
      case 'tool_result':
        return '✅';
      case 'error':
        return '❌';
      case 'paused':
        return '⏸️';
      case 'resumed':
        return '▶️';
      case 'transferred':
        return '🔄';
      default:
        return '📋';
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <History className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Historico do Agente
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          {!logs || logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nenhum log encontrado
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 border rounded-lg text-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span>{getLogIcon(log.log_type)}</span>
                      <Badge variant="outline">{log.log_type}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(log.created_at), {
                        addSuffix: true,
                        locale: ptBR,
                      })}
                    </span>
                  </div>

                  {log.data && (
                    <div className="mt-2">
                      {log.log_type === 'message_received' && (
                        <p className="bg-muted p-2 rounded">
                          {log.data.content}
                        </p>
                      )}
                      {log.log_type === 'message_sent' && (
                        <p className="bg-primary/10 p-2 rounded">
                          {log.data.content}
                        </p>
                      )}
                      {log.log_type === 'tool_called' && (
                        <div className="bg-muted/50 p-2 rounded font-mono text-xs">
                          <div className="font-semibold">{log.data.tool}</div>
                          <pre className="overflow-auto">
                            {JSON.stringify(log.data.args, null, 2)}
                          </pre>
                        </div>
                      )}
                      {log.log_type === 'error' && (
                        <div className="bg-destructive/10 p-2 rounded text-destructive flex items-center gap-2">
                          <AlertCircle className="h-4 w-4" />
                          {log.data.error}
                        </div>
                      )}
                    </div>
                  )}

                  {(log.tokens_input || log.tokens_output) && (
                    <div className="mt-2 text-xs text-muted-foreground">
                      Tokens: {log.tokens_input} in / {log.tokens_output} out
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export default AIAgentBadge;
